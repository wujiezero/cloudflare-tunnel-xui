"use strict";

const express = require("express");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const session = require("express-session");
const crypto = require("node:crypto");
const {
  ensureConfig,
  getCloudflareCredentials,
  getPublicConfig,
  readConfig,
  updateAuthPassword,
  updateCloudflareCredentials,
} = require("./config-store");
const { verifyPassword } = require("./crypto-utils");
const {
  createTunnel,
  deleteTunnel,
  ensureTunnelDnsRecords,
  getTunnel,
  getTunnelPublishStatus,
  getTunnelConfiguration,
  getTunnelToken,
  listTunnels,
  testCloudflareCredentials,
  updateTunnel,
  updateTunnelConfiguration
} = require("./cloudflare-service");
const { CloudflaredManager } = require("./cloudflared-manager");

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPTS = new Map();

function createCsrfToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getClientAddress(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function pruneLoginAttempts(now = Date.now()) {
  for (const [key, entry] of LOGIN_ATTEMPTS.entries()) {
    const stale =
      entry.blockedUntil <= now &&
      (!entry.lastFailureAt || now - entry.lastFailureAt > LOGIN_WINDOW_MS);
    if (stale) {
      LOGIN_ATTEMPTS.delete(key);
    }
  }
}

function getLoginAttemptEntry(req) {
  pruneLoginAttempts();
  const key = getClientAddress(req);
  const existing = LOGIN_ATTEMPTS.get(key);
  if (existing) {
    return existing;
  }

  const created = {
    key,
    count: 0,
    blockedUntil: 0,
    lastFailureAt: 0
  };
  LOGIN_ATTEMPTS.set(key, created);
  return created;
}

function getLoginThrottleState(req) {
  const now = Date.now();
  const entry = getLoginAttemptEntry(req);

  if (entry.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterMs: entry.blockedUntil - now
    };
  }

  if (entry.lastFailureAt && now - entry.lastFailureAt > LOGIN_WINDOW_MS) {
    entry.count = 0;
    entry.lastFailureAt = 0;
    entry.blockedUntil = 0;
  }

  return {
    blocked: false,
    retryAfterMs: 0
  };
}

function recordFailedLogin(req) {
  const now = Date.now();
  const entry = getLoginAttemptEntry(req);

  if (entry.lastFailureAt && now - entry.lastFailureAt > LOGIN_WINDOW_MS) {
    entry.count = 0;
  }

  entry.count += 1;
  entry.lastFailureAt = now;

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.blockedUntil = now + LOGIN_BLOCK_MS;
  }
}

function clearFailedLogin(req) {
  LOGIN_ATTEMPTS.delete(getClientAddress(req));
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(req.session);
    });
  });
}

function isSameOriginRequest(req) {
  const expectedOrigin = `${req.protocol}://${req.get("host")}`;
  const origin = String(req.get("origin") || "").trim();
  const referer = String(req.get("referer") || "").trim();

  if (origin) {
    return origin === expectedOrigin;
  }

  if (referer) {
    return referer === expectedOrigin || referer.startsWith(`${expectedOrigin}/`);
  }

  return true;
}

function normalizeMappingInput(mapping) {
  const hostname = String(mapping?.hostname || "").trim();
  const service = String(mapping?.service || "").trim();
  const pathValue = String(mapping?.path || "").trim();
  const noTLSVerify = Boolean(mapping?.originRequest?.noTLSVerify);
  const disableChunkedEncoding = Boolean(mapping?.originRequest?.disableChunkedEncoding);
  const http2Origin = Boolean(mapping?.originRequest?.http2Origin);
  const normalized = {
    hostname,
    service,
    path: pathValue
  };

  if (noTLSVerify || disableChunkedEncoding || http2Origin) {
    normalized.originRequest = {
      noTLSVerify,
      disableChunkedEncoding,
      http2Origin
    };
  }

  return normalized;
}

async function testOriginService(service, options = {}) {
  const url = String(service || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      service: url,
      message: "当前仅支持直接测试 http/https 类型的源站地址。"
    };
  }

  const requestUrl = new URL(url);
  const transport = requestUrl.protocol === "https:" ? https : http;
  const noTLSVerify = Boolean(options.noTLSVerify);

  return new Promise((resolve) => {
    const request = transport.request(requestUrl, {
      method: "GET",
      rejectUnauthorized: requestUrl.protocol === "https:" ? !noTLSVerify : undefined
    }, (response) => {
      response.resume();
      clearTimeout(timeout);
      resolve({
        ok: response.statusCode < 500,
        service: url,
        status: response.statusCode,
        statusText: response.statusMessage
      });
    });

    const timeout = setTimeout(() => {
      request.destroy(new Error("连接超时"));
    }, 3000);

    request.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        service: url,
        message: error.message
      });
    });

    request.end();
  });
}

async function bootstrap() {
  const config = await ensureConfig();
  const host = process.env.HOST || config.server.host;
  const port = Number(process.env.PORT || config.server.port);
  const publicRoot = path.resolve(process.cwd(), "public");
  const app = express();
  const cloudflaredManager = new CloudflaredManager({
    readConfig
  });

  if (process.env.TRUST_PROXY) {
    const parsed = Number(process.env.TRUST_PROXY);
    app.set("trust proxy", Number.isFinite(parsed) ? parsed : process.env.TRUST_PROXY);
  }

  await cloudflaredManager.ensureBinaryReady();

  // Auto restart managed tunnels (only if autoStart is enabled in config)
  if (config.cloudflared?.autoStart !== false) {
    try {
      const tunnelIds = await cloudflaredManager.listTunnelIds();
      if (tunnelIds.length > 0) {
        console.log(`Found ${tunnelIds.length} managed tunnels, checking for auto-restart...`);
        const credentials = await getCloudflareCredentials();
        for (const tunnelId of tunnelIds) {
          const status = await cloudflaredManager.getManagedTunnelStatus(tunnelId);
          if (!status.running) {
            console.log(`Auto-restarting tunnel ${tunnelId}...`);
            try {
              const runToken = await getTunnelToken(credentials.accountId, credentials.apiToken, tunnelId);
              const tunnel = await getTunnel(credentials.accountId, credentials.apiToken, tunnelId);
              if (Number(tunnel.connections || 0) > 0) {
                console.log(
                  `Skip auto-restart for tunnel ${tunnelId}: already has ${tunnel.connections} active connection(s) on Cloudflare side.`
                );
                continue;
              }
              const configuration = await getTunnelConfiguration(credentials.accountId, credentials.apiToken, tunnelId);
              await cloudflaredManager.start({
                tunnelId,
                tunnelName: tunnel.name,
                runToken,
                mappings: configuration.mappings,
                catchAllService: configuration.catchAll.service
              });
              console.log(`Tunnel ${tunnelId} restarted successfully.`);
            } catch (error) {
              console.error(`Failed to auto-restart tunnel ${tunnelId}:`, error.message);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error during auto-restart check:', error.message);
    }
  } else {
    console.log('Auto-start disabled (cloudflared.autoStart = false), skipping tunnel auto-restart.');
  }

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self'; font-src 'self' data: https://fonts.gstatic.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    next();
  });

  [
    [
      "/vendor/vue.global.prod.js",
      path.resolve(process.cwd(), "node_modules/vue/dist/vue.global.prod.js"),
      "application/javascript; charset=utf-8"
    ],
    [
      "/vendor/element-plus.css",
      path.resolve(process.cwd(), "node_modules/element-plus/dist/index.css"),
      "text/css; charset=utf-8"
    ],
    [
      "/vendor/element-plus.full.js",
      path.resolve(process.cwd(), "node_modules/element-plus/dist/index.full.js"),
      "application/javascript; charset=utf-8"
    ],
    [
      "/vendor/element-plus-icons.js",
      path.resolve(process.cwd(), "node_modules/@element-plus/icons-vue/dist/index.iife.min.js"),
      "application/javascript; charset=utf-8"
    ]
  ].forEach(([routePath, filePath, type]) => {
    app.get(routePath, (_req, res) => {
      res.type(type).sendFile(filePath);
    });
  });

  app.use(express.static(publicRoot));
  app.use(express.json({ limit: "1mb" }));
  app.use(
    session({
      name: "cf_tunnel_xui.sid",
      secret: config.auth.sessionSecret,
      resave: false,
      rolling: true,
      saveUninitialized: false,
      unset: "destroy",
      cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: "auto",
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );

  app.use("/api", (req, res, next) => {
    if (!req.session.csrfToken) {
      req.session.csrfToken = createCsrfToken();
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-CSRF-Token", req.session.csrfToken);

    if (!MUTATING_METHODS.has(req.method)) {
      return next();
    }

    if (!isSameOriginRequest(req)) {
      return res.status(403).json({ message: "请求来源校验失败。" });
    }

    const csrfToken = String(req.get("x-csrf-token") || "").trim();
    if (!csrfToken || csrfToken !== req.session.csrfToken) {
      return res.status(403).json({ message: "CSRF 校验失败，请刷新页面后重试。" });
    }

    return next();
  });

  function requireAuth(req, res, next) {
    if (req.session?.isAuthenticated) {
      return next();
    }

    return res.status(401).json({ message: "请先登录。" });
  }

  async function resolveCredentials(req) {
    const saved = await getCloudflareCredentials();
    return {
      accountId: req.body?.accountId || saved.accountId,
      apiToken: req.body?.apiToken || saved.apiToken
    };
  }

  app.post("/api/auth/login", async (req, res) => {
    const throttle = getLoginThrottleState(req);
    if (throttle.blocked) {
      res.setHeader("Retry-After", String(Math.ceil(throttle.retryAfterMs / 1000)));
      return res.status(429).json({
        message: "登录失败次数过多，请稍后再试。"
      });
    }

    const latestConfig = await readConfig();
    const { username = "", password = "" } = req.body || {};

    const validUsername = username === latestConfig.auth.username;
    const validPassword = verifyPassword(
      password,
      latestConfig.auth.passwordSalt,
      latestConfig.auth.passwordHash
    );

    if (!validUsername || !validPassword) {
      recordFailedLogin(req);
      return res.status(401).json({ message: "用户名或密码错误。" });
    }

    await regenerateSession(req);
    req.session.isAuthenticated = true;
    req.session.user = username;
    req.session.csrfToken = createCsrfToken();
    res.setHeader("X-CSRF-Token", req.session.csrfToken);
    clearFailedLogin(req);

    return res.json({
      success: true,
      user: username
    });
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    await regenerateSession(req);
    req.session.csrfToken = createCsrfToken();
    res.setHeader("X-CSRF-Token", req.session.csrfToken);
    res.json({ success: true });
  });

  app.post("/api/auth/password", requireAuth, async (req, res) => {
    const latestConfig = await readConfig();
    const { currentPassword = "", newPassword = "" } = req.body || {};

    const validPassword = verifyPassword(
      currentPassword,
      latestConfig.auth.passwordSalt,
      latestConfig.auth.passwordHash
    );

    if (!validPassword) {
      return res.status(400).json({ message: "当前密码不正确。" });
    }

    if (String(newPassword).trim().length < 8) {
      return res.status(400).json({ message: "新密码至少需要 8 位。" });
    }

    await updateAuthPassword(String(newPassword).trim());
    await regenerateSession(req);
    req.session.csrfToken = createCsrfToken();
    res.setHeader("X-CSRF-Token", req.session.csrfToken);

    return res.json({ success: true });
  });

  app.get("/api/auth/me", async (req, res) => {
    const publicConfig = await getPublicConfig();
    if (!req.session?.isAuthenticated) {
      return res.json({ authenticated: false, config: publicConfig });
    }
    return res.json({
      authenticated: true,
      user: req.session.user,
      config: publicConfig
    });
  });

  app.get("/api/settings", requireAuth, async (_req, res) => {
    const publicConfig = await getPublicConfig();
    const runtimeStatus = await cloudflaredManager.getStatus({
      includeLogs: false
    });

    return res.json({
      config: publicConfig,
      cloudflared: runtimeStatus
    });
  });

  app.post("/api/settings/cloudflare", requireAuth, async (req, res) => {
    const { accountId = "", apiToken = "" } = req.body || {};

    await updateCloudflareCredentials({ accountId, apiToken });
    await cloudflaredManager.probeVersion();

    return res.json({
      success: true,
      config: await getPublicConfig(),
      cloudflared: await cloudflaredManager.getStatus({
        includeLogs: false
      })
    });
  });

  app.post("/api/settings/cloudflare/test", requireAuth, async (req, res) => {
    try {
      const credentials = await resolveCredentials(req);
      if (!credentials.accountId || !credentials.apiToken) {
        return res.status(400).json({ message: "请先提供 Account ID 和 API Token。" });
      }

      const result = await testCloudflareCredentials(credentials);
      return res.json(result);
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.get("/api/tunnels", requireAuth, async (_req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const tunnels = await listTunnels(credentials.accountId, credentials.apiToken);
      const tunnelDetails = await Promise.all(
        tunnels.map((tunnel) =>
          getTunnelConfiguration(
            credentials.accountId,
            credentials.apiToken,
            tunnel.id
          ).catch(() => ({ mappings: [], catchAll: { service: "http_status:404" } }))
            .then((configuration) => [tunnel.id, { configuration }])
        )
      );
      const detailMap = Object.fromEntries(tunnelDetails);

      return res.json({
        items: tunnels.map((tunnel) => ({
          ...tunnel,
          configuration: detailMap[tunnel.id]?.configuration || {
            mappings: [],
            catchAll: { service: "http_status:404" }
          }
        }))
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.post("/api/tunnels", requireAuth, async (req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const tunnelSecret = req.body?.tunnelSecret
        ? Buffer.from(req.body.tunnelSecret, "utf8").toString("base64")
        : crypto.randomBytes(32).toString("base64");
      const payload = {
        name: String(req.body?.name || "").trim(),
        tunnel_secret: tunnelSecret
      };
      const tunnel = await createTunnel(
        credentials.accountId,
        credentials.apiToken,
        payload
      );
      return res.status(201).json(tunnel);
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.put("/api/tunnels/:id", requireAuth, async (req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const tunnel = await updateTunnel(
        credentials.accountId,
        credentials.apiToken,
        req.params.id,
        {
          name: String(req.body?.name || "").trim()
        }
      );
      return res.json(tunnel);
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.delete("/api/tunnels/:id", requireAuth, async (req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const result = await deleteTunnel(
        credentials.accountId,
        credentials.apiToken,
        req.params.id
      );
      return res.json({ success: true, result });
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.get("/api/tunnels/:id", requireAuth, async (req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const tunnel = await getTunnel(
        credentials.accountId,
        credentials.apiToken,
        req.params.id
      );
      const configuration = await getTunnelConfiguration(
        credentials.accountId,
        credentials.apiToken,
        req.params.id
      ).catch(() => ({
        mappings: [],
        catchAll: { service: "http_status:404" }
      }));
      return res.json({ ...tunnel, configuration });
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.put("/api/tunnels/:id/configuration", requireAuth, async (req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : [];
      const cleanedMappings = mappings
        .map(normalizeMappingInput)
        .filter((mapping) => mapping.hostname && mapping.service);

      const configuration = await updateTunnelConfiguration(
        credentials.accountId,
        credentials.apiToken,
        req.params.id,
        {
          mappings: cleanedMappings,
          catchAll: { service: "http_status:404" }
        }
      );
      const dnsSync = await ensureTunnelDnsRecords(
        credentials.accountId,
        credentials.apiToken,
        req.params.id,
        configuration.mappings
      );
      return res.json({
        configuration,
        dnsSync
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.get("/api/tunnels/:id/publish-status", requireAuth, async (req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const configuration = await getTunnelConfiguration(
        credentials.accountId,
        credentials.apiToken,
        req.params.id
      );
      const status = await getTunnelPublishStatus(
        credentials.accountId,
        credentials.apiToken,
        req.params.id,
        configuration.mappings
      );
      return res.json(status);
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.post("/api/tunnels/:id/dns-sync", requireAuth, async (req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const configuration = await getTunnelConfiguration(
        credentials.accountId,
        credentials.apiToken,
        req.params.id
      );
      const dnsSync = await ensureTunnelDnsRecords(
        credentials.accountId,
        credentials.apiToken,
        req.params.id,
        configuration.mappings
      );
      return res.json(dnsSync);
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.post("/api/tunnels/:id/origin-test", requireAuth, async (req, res) => {
    try {
      const service = String(req.body?.service || "").trim();
      if (!service) {
        return res.status(400).json({ message: "缺少要测试的源站 service 地址。" });
      }

      const result = await testOriginService(service, {
        noTLSVerify: Boolean(req.body?.originRequest?.noTLSVerify)
      });
      return res.json(result);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tunnels/:id/start", requireAuth, async (req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const tunnel = await getTunnel(
        credentials.accountId,
        credentials.apiToken,
        req.params.id
      );
      // Guard against accidentally kicking off a remote tunnel connection
      const remoteConnections = Number(tunnel.connections || 0);
      const force = req.query?.force === "true" || req.body?.force === true;
      if (remoteConnections > 0 && !force) {
        return res.status(409).json({
          message: `该 Tunnel 已有 ${remoteConnections} 个活跃连接（可能在其他服务器运行中），在此启动会将其断开。确认要接管请添加 ?force=true。`
        });
      }
      const runToken = await getTunnelToken(
        credentials.accountId,
        credentials.apiToken,
        req.params.id
      );
      const configuration = await getTunnelConfiguration(
        credentials.accountId,
        credentials.apiToken,
        req.params.id
      );
      const status = await cloudflaredManager.start({
        runToken,
        tunnelId: tunnel.id,
        tunnelName: tunnel.name,
        mappings: configuration.mappings,
        catchAllService: configuration.catchAll?.service || "http_status:404"
      });
      return res.json(status);
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.get("/api/cloudflared/status", requireAuth, async (_req, res) => {
    return res.json(
      await cloudflaredManager.getStatus({
        includeLogs: false
      })
    );
  });

  app.get("/api/tunnels/:id/logs", requireAuth, async (req, res) => {
    try {
      return res.json(await cloudflaredManager.getLogs(req.params.id));
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tunnels/:id/stop", requireAuth, async (req, res) => {
    return res.json(await cloudflaredManager.stop(req.params.id));
  });

  app.post("/api/tunnels/:id/logs/clear", requireAuth, async (req, res) => {
    return res.json(await cloudflaredManager.clearLogs(req.params.id));
  });

  app.get("/api/tunnels/:id/metrics", requireAuth, async (req, res) => {
    try {
      const metrics = await cloudflaredManager.getMetrics(req.params.id);
      res.type("text/plain").send(metrics);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/tunnels/batch", requireAuth, async (req, res) => {
    const { action, tunnelIds } = req.body || {};
    const ids = Array.isArray(tunnelIds) ? tunnelIds.filter(Boolean) : [];
    const validActions = new Set(["start", "stop", "delete"]);
    if (!action || !validActions.has(action)) {
      return res.status(400).json({ message: "action must be one of: start, stop, delete" });
    }
    if (!ids.length) {
      return res.status(400).json({ message: "tunnelIds must be a non-empty array" });
    }

    const results = [];
    const credentials = await getCloudflareCredentials();
    const force = req.body?.force === true;

    for (const tunnelId of ids) {
      try {
        if (action === "start") {
          const tunnel = await getTunnel(credentials.accountId, credentials.apiToken, tunnelId);
          const remoteConnections = Number(tunnel.connections || 0);
          if (remoteConnections > 0 && !force) {
            results.push({ tunnelId, success: false, error: `已有 ${remoteConnections} 个活跃连接，可能在其他服务器运行中` });
            continue;
          }
          const runToken = await getTunnelToken(credentials.accountId, credentials.apiToken, tunnelId);
          const configuration = await getTunnelConfiguration(credentials.accountId, credentials.apiToken, tunnelId);
          await cloudflaredManager.start({
            runToken,
            tunnelId: tunnel.id,
            tunnelName: tunnel.name,
            mappings: configuration.mappings,
            catchAllService: configuration.catchAll?.service || "http_status:404"
          });
          results.push({ tunnelId, success: true });
        } else if (action === "stop") {
          await cloudflaredManager.stop(tunnelId);
          results.push({ tunnelId, success: true });
        } else if (action === "delete") {
          // Only delete if tunnel is not currently running locally
          const managedStatus = await cloudflaredManager.getManagedTunnelStatus(tunnelId).catch(() => ({ running: false }));
          if (managedStatus.running) {
            results.push({ tunnelId, success: false, error: "Tunnel is currently running locally, stop it first" });
          } else {
            await deleteTunnel(credentials.accountId, credentials.apiToken, tunnelId);
            results.push({ tunnelId, success: true });
          }
        }
      } catch (error) {
        results.push({ tunnelId, success: false, error: error.message });
      }
    }

    return res.json({ results });
  });

  app.get("/api/health", async (_req, res) => {
    const binaryReady = await cloudflaredManager.isBinaryUsable(
      (await cloudflaredManager.getRuntimeConfig()).binaryPath
    );
    const runtimeStatus = await cloudflaredManager.getStatus({ includeLogs: false });
    return res.json({
      status: "ok",
      uptime: process.uptime(),
      cloudflared: {
        binaryReady,
        version: cloudflaredManager.binaryVersion,
        managedProcesses: runtimeStatus.processCount,
        runningProcesses: runtimeStatus.runningCount
      }
    });
  });

  app.get("/api/tunnels/export", requireAuth, async (_req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const tunnels = await listTunnels(credentials.accountId, credentials.apiToken);
      const exportData = await Promise.all(
        tunnels.map(async (tunnel) => {
          const configuration = await getTunnelConfiguration(
            credentials.accountId, credentials.apiToken, tunnel.id
          ).catch(() => ({ mappings: [], catchAll: { service: "http_status:404" } }));
          return {
            id: tunnel.id,
            name: tunnel.name,
            createdAt: tunnel.createdAt,
            configuration: {
              mappings: configuration.mappings || [],
              catchAll: configuration.catchAll || { service: "http_status:404" }
            }
          };
        })
      );
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="cloudflare-tunnels-${timestamp}.json"`);
      return res.json({
        exportedAt: new Date().toISOString(),
        version: "1.0",
        tunnels: exportData
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.post("/api/tunnels/import", requireAuth, async (req, res) => {
    try {
      const credentials = await getCloudflareCredentials();
      const importData = req.body;
      const tunnels = Array.isArray(importData?.tunnels) ? importData.tunnels : [];
      if (!tunnels.length) {
        return res.status(400).json({ message: "导入数据中没有找到 Tunnel 配置。" });
      }

      const existingTunnels = await listTunnels(credentials.accountId, credentials.apiToken);
      const existingMap = new Map(existingTunnels.map(t => [t.id, t]));

      const results = { created: 0, updated: 0, errors: [] };

      for (const item of tunnels) {
        try {
          let targetId = item.id;
          if (existingMap.has(targetId)) {
            const mappings = Array.isArray(item.configuration?.mappings) ? item.configuration.mappings : [];
            await updateTunnelConfiguration(credentials.accountId, credentials.apiToken, targetId, { mappings });
            results.updated += 1;
          } else {
            const newTunnel = await createTunnel(credentials.accountId, credentials.apiToken, {
              name: item.name || "Imported Tunnel",
              tunnel_secret: crypto.randomBytes(32).toString("base64")
            });
            targetId = newTunnel.id;
            const mappings = Array.isArray(item.configuration?.mappings) ? item.configuration.mappings : [];
            await updateTunnelConfiguration(credentials.accountId, credentials.apiToken, targetId, { mappings });
            results.created += 1;
          }
        } catch (error) {
          results.errors.push({
            tunnelId: item.id || "unknown",
            name: item.name || "unknown",
            message: error.message
          });
        }
      }

      return res.json(results);
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message,
        details: error.details || null
      });
    }
  });

  app.use((_req, res) => {
    res.sendFile(path.resolve(publicRoot, "index.html"));
  });

  const sslConfig = config.server.ssl || {};
  let httpsServer = null;
  if (sslConfig.enabled && sslConfig.certPath && sslConfig.keyPath) {
    const certPath = path.resolve(process.cwd(), sslConfig.certPath);
    const keyPath = path.resolve(process.cwd(), sslConfig.keyPath);
    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
      console.warn("SSL is enabled but cert/key files are missing, falling back to HTTP only.");
    } else {
      const tlsOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      };
      httpsServer = https.createServer(tlsOptions, app);
      httpsServer.listen(port, host, () => {
        console.log(
          `Cloudflare Tunnel XUI listening on https://${host}:${port}`
        );
      });
    }
  }

  let server = null;
  if (!httpsServer) {
    server = app.listen(port, host, () => {
      console.log(
        `Cloudflare Tunnel XUI listening on http://${host}:${port}`
      );
    });
  } else {
    server = httpsServer;
  }

  async function shutdown(signal) {
    console.log(`Received ${signal}, stopping managed cloudflared processes...`);
    await cloudflaredManager.stopAll().catch(() => null);
    if (server) {
      server.close(() => process.exit(0));
    }
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
