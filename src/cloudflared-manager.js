"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const os = require("node:os");
const { spawn, execFile } = require("node:child_process");

class CloudflaredManager {
  constructor(configStore) {
    this.configStore = configStore;
    this.binaryVersion = "";
    this.runtimeRoot = path.resolve(process.cwd(), ".cloudflared");
    this.defaultMetricsPortStart = 49312;
    this.externalStatusesCache = {
      expiresAt: 0,
      items: []
    };
    this.externalStatusTtlMs = 10 * 1000;
  }

  async getRuntimeConfig() {
    const config = await this.configStore.readConfig();
    return {
      binaryPath: path.resolve(process.cwd(), config.cloudflared?.binaryPath || "./bin/cloudflared"),
      metricsHost: config.cloudflared?.metricsHost || "127.0.0.1",
      logLevel: config.cloudflared?.logLevel || "info",
      protocol: config.cloudflared?.protocol || "http2",
      extraArgs: Array.isArray(config.cloudflared?.extraArgs) ? config.cloudflared.extraArgs : []
    };
  }

  getTunnelDir(tunnelId) {
    return path.join(this.runtimeRoot, tunnelId);
  }

  getTunnelPaths(tunnelId) {
    const dir = this.getTunnelDir(tunnelId);
    return {
      dir,
      pid: path.join(dir, "cloudflared.pid"),
      log: path.join(dir, "cloudflared.log"),
      token: path.join(dir, "cloudflared.token"),
      config: path.join(dir, "cloudflared-config.yml"),
      meta: path.join(dir, "meta.json")
    };
  }

  async ensureRuntimeRoot() {
    await fsp.mkdir(this.runtimeRoot, { recursive: true });
  }

  async probeVersion() {
    const runtime = await this.getRuntimeConfig();
    if (!fs.existsSync(runtime.binaryPath)) {
      this.binaryVersion = "binary-not-found";
      return this.binaryVersion;
    }

    return new Promise((resolve) => {
      const child = spawn(runtime.binaryPath, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      let closed = false;

      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.on("close", (code) => {
        closed = true;
        this.binaryVersion = code === 0 ? (output.trim() || "unknown") : `error: ${output.trim() || `exit-${code}`}`;
        resolve(this.binaryVersion);
      });
      child.on("error", (error) => {
        if (closed) {
          return;
        }
        this.binaryVersion = `error: ${error.message}`;
        resolve(this.binaryVersion);
      });
    });
  }

  getDownloadAssetInfo() {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === "darwin" && arch === "arm64") {
      return {
        assetName: "cloudflared-darwin-arm64.tgz",
        archive: true,
        extractedName: "cloudflared"
      };
    }

    if (platform === "darwin" && arch === "x64") {
      return {
        assetName: "cloudflared-darwin-amd64.tgz",
        archive: true,
        extractedName: "cloudflared"
      };
    }

    if (platform === "linux" && arch === "x64") {
      return {
        assetName: "cloudflared-linux-amd64",
        archive: false
      };
    }

    if (platform === "linux" && arch === "arm64") {
      return {
        assetName: "cloudflared-linux-arm64",
        archive: false
      };
    }

    throw new Error(`当前系统暂不支持自动下载 cloudflared：${platform}-${arch}`);
  }

  async isBinaryUsable(binaryPath) {
    if (!fs.existsSync(binaryPath)) {
      return false;
    }

    return new Promise((resolve) => {
      const child = spawn(binaryPath, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      let settled = false;

      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        output += chunk.toString();
      });
      child.on("close", (code) => {
        settled = true;
        resolve(code === 0 && /cloudflared/i.test(output));
      });
      child.on("error", () => {
        if (!settled) {
          resolve(false);
        }
      });
    });
  }

  async downloadToFile(url, targetPath) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载 cloudflared 失败：${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await fsp.writeFile(targetPath, Buffer.from(arrayBuffer));
  }

  async installBinary(binaryPath) {
    const asset = this.getDownloadAssetInfo();
    const binaryDir = path.dirname(binaryPath);
    const tmpPath = path.join(binaryDir, asset.assetName);
    const downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset.assetName}`;

    await fsp.mkdir(binaryDir, { recursive: true });
    console.log(`cloudflared binary unavailable, downloading ${asset.assetName} from ${downloadUrl}`);
    await this.downloadToFile(downloadUrl, tmpPath);

    try {
      if (asset.archive) {
        await this.execFileText("tar", ["-xzf", tmpPath, "-C", binaryDir]);
        const extractedPath = path.join(binaryDir, asset.extractedName);
        if (path.resolve(extractedPath) !== path.resolve(binaryPath)) {
          await fsp.rm(binaryPath, { force: true }).catch(() => null);
          await fsp.rename(extractedPath, binaryPath);
        }
      } else {
        await fsp.rm(binaryPath, { force: true }).catch(() => null);
        await fsp.rename(tmpPath, binaryPath);
      }
      await fsp.chmod(binaryPath, 0o755);
    } finally {
      await fsp.rm(tmpPath, { force: true }).catch(() => null);
    }
  }

  async ensureBinaryReady() {
    const runtime = await this.getRuntimeConfig();
    const binaryPath = runtime.binaryPath;
    const usable = await this.isBinaryUsable(binaryPath);

    if (usable) {
      await this.probeVersion();
      return {
        binaryPath,
        downloaded: false
      };
    }

    console.log(`cloudflared binary missing or unusable at ${binaryPath}, attempting auto-repair...`);
    await fsp.rm(binaryPath, { force: true }).catch(() => null);
    await this.installBinary(binaryPath);

    const repaired = await this.isBinaryUsable(binaryPath);
    if (!repaired) {
      throw new Error(`cloudflared 自动修复失败：${binaryPath}`);
    }

    await this.probeVersion();
    return {
      binaryPath,
      downloaded: true
    };
  }

  async execFileText(command, args = []) {
    return new Promise((resolve, reject) => {
      execFile(command, args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 4 }, (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve(stdout);
      });
    });
  }

  toYamlScalar(value) {
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
    }

    return JSON.stringify(String(value ?? ""));
  }

  async writeConfigFile(configPath, mappings = [], catchAllService = "http_status:404") {
    const ingressRules = mappings
      .filter((mapping) => mapping && mapping.hostname && mapping.service)
      .map((mapping) => {
        const lines = [`  - hostname: ${this.toYamlScalar(mapping.hostname)}`];
        if (mapping.path) {
          lines.push(`    path: ${this.toYamlScalar(mapping.path)}`);
        }
        lines.push(`    service: ${this.toYamlScalar(mapping.service)}`);
        if (mapping.originRequest && typeof mapping.originRequest === "object") {
          const originRequestEntries = Object.entries(mapping.originRequest)
            .filter(([, value]) => value !== undefined && value !== null && value !== "");
          if (originRequestEntries.length) {
            lines.push("    originRequest:");
            originRequestEntries.forEach(([key, value]) => {
              lines.push(`      ${key}: ${this.toYamlScalar(value)}`);
            });
          }
        }
        return lines.join("\n");
      });

    ingressRules.push(`  - service: ${this.toYamlScalar(catchAllService)}`);
    const yaml = `ingress:\n${ingressRules.join("\n")}\n`;
    await fsp.writeFile(configPath, yaml, "utf8");
  }

  async getPid(pidPath) {
    try {
      const pid = Number((await fsp.readFile(pidPath, "utf8")).trim());
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    } catch (_error) {
      return null;
    }
  }

  async isPidRunning(pid) {
    if (!pid) {
      return false;
    }

    try {
      process.kill(pid, 0);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async waitForPidExit(pid, timeoutMs = 4000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      // eslint-disable-next-line no-await-in-loop
      const running = await this.isPidRunning(pid);
      if (!running) {
        return true;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return !(await this.isPidRunning(pid));
  }

  async readJson(filePath, fallback = null) {
    try {
      const raw = await fsp.readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch (_error) {
      return fallback;
    }
  }

  async writeJson(filePath, payload) {
    await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  invalidateExternalStatusCache() {
    this.externalStatusesCache = {
      expiresAt: 0,
      items: []
    };
  }

  async readRecentLogs(logPath, { maxLines = 80, maxBytes = 64 * 1024 } = {}) {
    try {
      const handle = await fsp.open(logPath, "r");

      try {
        const stats = await handle.stat();
        const readBytes = Math.min(stats.size, maxBytes);
        const start = Math.max(0, stats.size - readBytes);
        const buffer = Buffer.alloc(readBytes);

        if (!readBytes) {
          return [];
        }

        await handle.read(buffer, 0, readBytes, start);

        const raw = buffer.toString("utf8");
        const lines = raw.split(/\r?\n/);
        if (start > 0 && lines.length > 1) {
          lines.shift();
        }

        return lines
          .filter(Boolean)
          .slice(-maxLines)
          .map((line) => `[log] ${line}`);
      } finally {
        await handle.close();
      }
    } catch (_error) {
      return [];
    }
  }

  parseCliOption(commandLine, optionName) {
    const inlinePattern = new RegExp(`${optionName}=([^\\s]+)`);
    const inlineMatch = commandLine.match(inlinePattern);
    if (inlineMatch?.[1]) {
      return inlineMatch[1].replace(/^['"]|['"]$/g, "");
    }

    const spacedPattern = new RegExp(`${optionName}\\s+([^\\s]+)`);
    const spacedMatch = commandLine.match(spacedPattern);
    if (spacedMatch?.[1]) {
      return spacedMatch[1].replace(/^['"]|['"]$/g, "");
    }

    return "";
  }

  async findProcessLogPath(pid) {
    try {
      const output = await this.execFileText("lsof", ["-p", String(pid), "-Fn"]);
      const names = output
        .split(/\r?\n/)
        .filter((line) => line.startsWith("n"))
        .map((line) => line.slice(1))
        .filter((name) => name && !name.startsWith("/dev/"));

      return names.find((name) => /\.log(\.\d+)?$/i.test(name)) || "";
    } catch (_error) {
      return "";
    }
  }

  async readHostnamesFromConfig(configPath) {
    if (!configPath) {
      return [];
    }

    try {
      const raw = await fsp.readFile(configPath, "utf8");
      return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith("hostname:"))
        .map((line) => line.replace("hostname:", "").trim())
        .filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  async readRuntimeMetaIndex() {
    const tunnelIds = await this.listTunnelIds();
    const index = new Map();

    await Promise.all(
      tunnelIds.map(async (tunnelId) => {
        const paths = this.getTunnelPaths(tunnelId);
        const meta = await this.readJson(paths.meta, null);
        if (!meta) {
          return;
        }

        index.set(tunnelId, {
          tunnelId,
          tunnelName: meta.tunnelName || tunnelId,
          metricsPort: meta.metricsPort || null,
          mappings: Array.isArray(meta.mappings) ? meta.mappings : [],
          catchAllService: meta.catchAllService || "http_status:404",
          startedAt: meta.startedAt || null,
          dir: paths.dir,
          logPath: paths.log,
          configPath: paths.config
        });
      })
    );

    return index;
  }

  resolveExternalTunnelMeta(commandLine, configPath, logPath, runtimeMetaIndex) {
    const normalizedConfigPath = configPath ? path.resolve(configPath) : "";
    const normalizedLogPath = logPath ? path.resolve(logPath) : "";

    for (const meta of runtimeMetaIndex.values()) {
      const metaConfig = path.resolve(meta.configPath);
      const metaLog = path.resolve(meta.logPath);
      const commandHasTunnelId = commandLine.includes(meta.tunnelId);

      if (
        (normalizedConfigPath && normalizedConfigPath === metaConfig) ||
        (normalizedLogPath && normalizedLogPath === metaLog) ||
        commandHasTunnelId
      ) {
        return meta;
      }
    }

    return null;
  }

  async discoverExternalProcesses({ includeLogs = false } = {}) {
    const runtime = await this.getRuntimeConfig();
    const runtimeMetaIndex = await this.readRuntimeMetaIndex();
    const now = Date.now();

    if (
      !includeLogs &&
      this.externalStatusesCache.expiresAt > now &&
      Array.isArray(this.externalStatusesCache.items)
    ) {
      return this.externalStatusesCache.items;
    }

    let output = "";

    try {
      output = await this.execFileText("ps", ["-axo", "pid=,args="]);
    } catch (_error) {
      return [];
    }

    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line.includes("cloudflared"))
      .filter((line) => !line.includes("--version"));

    const statuses = [];

    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(.+)$/);
      if (!match) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const pid = Number(match[1]);
      const commandLine = match[2];
      if (!pid) {
        // eslint-disable-next-line no-continue
        continue;
      }

      // Ignore our own helper process records when they are already represented by managed entries.
      const configPath = this.parseCliOption(commandLine, "--config");
      const metricsAddress = this.parseCliOption(commandLine, "--metrics");
      const logFile = this.parseCliOption(commandLine, "--logfile");
      // eslint-disable-next-line no-await-in-loop
      const discoveredLogPath = logFile || (await this.findProcessLogPath(pid));
      const linkedMeta = this.resolveExternalTunnelMeta(
        commandLine,
        configPath,
        discoveredLogPath,
        runtimeMetaIndex
      );
      // eslint-disable-next-line no-await-in-loop
      const hostnames = linkedMeta
        ? linkedMeta.mappings.map((item) => item.hostname).filter(Boolean)
        : await this.readHostnamesFromConfig(configPath);
      // eslint-disable-next-line no-await-in-loop
      const recentLogs = includeLogs
        ? discoveredLogPath
          ? await this.readRecentLogs(discoveredLogPath)
          : ["[log] 已发现本机运行的外部 cloudflared 进程，但暂未找到可读取的日志文件。"]
        : [];

      statuses.push({
        tunnelId: linkedMeta?.tunnelId || `external:${pid}`,
        tunnelName: linkedMeta?.tunnelName || hostnames[0] || `外部 cloudflared (${pid})`,
        pid,
        running: true,
        metricsUrl: metricsAddress
          ? `http://${metricsAddress}/metrics`
          : linkedMeta?.metricsPort
            ? `http://${runtime.metricsHost}:${linkedMeta.metricsPort}/metrics`
            : null,
        metricsPort: metricsAddress
          ? Number(metricsAddress.split(":").pop()) || null
          : linkedMeta?.metricsPort || null,
        startedAt: linkedMeta?.startedAt || null,
        binaryPath: runtime.binaryPath,
        binaryExists: fs.existsSync(runtime.binaryPath),
        binaryVersion: this.binaryVersion,
        recentLogs,
        mappingCount: linkedMeta?.mappings?.length || hostnames.length,
        hostnames,
        source: linkedMeta ? "external-linked" : "external",
        manageable: false,
        logPath: discoveredLogPath || linkedMeta?.logPath || null,
        commandLine
      });
    }

    if (!includeLogs) {
      this.externalStatusesCache = {
        expiresAt: now + this.externalStatusTtlMs,
        items: statuses
      };
    }

    return statuses;
  }

  async findAvailablePort(startPort) {
    for (let port = startPort; port < startPort + 300; port += 1) {
      // eslint-disable-next-line no-await-in-loop
      const available = await new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => {
          server.close(() => resolve(true));
        });
        server.listen(port, "127.0.0.1");
      });
      if (available) {
        return port;
      }
    }

    throw new Error("无法找到可用的 metrics 端口。");
  }

  async listTunnelIds() {
    await this.ensureRuntimeRoot();
    const entries = await fsp.readdir(this.runtimeRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  }

  async getManagedTunnelStatus(tunnelId, { includeLogs = false } = {}) {
    const runtime = await this.getRuntimeConfig();
    const paths = this.getTunnelPaths(tunnelId);
    const meta = await this.readJson(paths.meta, {});
    const pid = await this.getPid(paths.pid);
    const running = await this.isPidRunning(pid);
    const recentLogs = includeLogs ? await this.readRecentLogs(paths.log) : [];

    if (!running && pid) {
      await fsp.rm(paths.pid, { force: true }).catch(() => null);
    }

    return {
      tunnelId,
      tunnelName: meta.tunnelName || tunnelId,
      pid: running ? pid : null,
      running,
      metricsUrl: meta.metricsPort
        ? `http://${runtime.metricsHost}:${meta.metricsPort}/metrics`
        : null,
      metricsPort: meta.metricsPort || null,
      startedAt: meta.startedAt || null,
      binaryPath: runtime.binaryPath,
      binaryExists: fs.existsSync(runtime.binaryPath),
      binaryVersion: this.binaryVersion,
      recentLogs,
      mappingCount: meta.mappings?.length || 0,
      hostnames: Array.isArray(meta.mappings) ? meta.mappings.map((item) => item.hostname) : [],
      source: "managed",
      manageable: true,
      logPath: paths.log
    };
  }

  async getTunnelStatus(tunnelId, { includeLogs = false } = {}) {
    const statuses = await this.listStatuses({ includeLogs });
    return statuses.find((item) => item.tunnelId === tunnelId) || null;
  }

  async listStatuses({ includeLogs = false, includeExternal = true } = {}) {
    const tunnelIds = await this.listTunnelIds();
    const managedStatuses = await Promise.all(
      tunnelIds.map((tunnelId) => this.getManagedTunnelStatus(tunnelId, { includeLogs }))
    );
    const managedPids = new Set(managedStatuses.map((item) => item.pid).filter(Boolean));
    const externalStatuses = includeExternal
      ? (await this.discoverExternalProcesses({ includeLogs }))
        .filter((item) => !managedPids.has(item.pid))
      : [];
    const mergedByTunnelId = new Map(managedStatuses.map((item) => [item.tunnelId, item]));

    externalStatuses.forEach((externalStatus) => {
      const existing = mergedByTunnelId.get(externalStatus.tunnelId);
      if (!existing) {
        mergedByTunnelId.set(externalStatus.tunnelId, externalStatus);
        return;
      }

      if (externalStatus.running) {
        mergedByTunnelId.set(externalStatus.tunnelId, {
          ...existing,
          ...externalStatus,
          tunnelId: existing.tunnelId,
          tunnelName: existing.tunnelName || externalStatus.tunnelName,
          hostnames: externalStatus.hostnames?.length ? externalStatus.hostnames : existing.hostnames,
          mappingCount: Math.max(existing.mappingCount || 0, externalStatus.mappingCount || 0)
        });
      }
    });

    return [...mergedByTunnelId.values()].sort((a, b) => {
      if (a.running !== b.running) {
        return a.running ? -1 : 1;
      }
      return a.tunnelName.localeCompare(b.tunnelName);
    });
  }

  async start(options = {}) {
    const runtime = await this.getRuntimeConfig();
    const runToken = options.runToken || "";
    const tunnelId = options.tunnelId;
    const tunnelName = options.tunnelName || tunnelId;
    const mappings = Array.isArray(options.mappings) ? options.mappings : [];
    const catchAllService = options.catchAllService || "http_status:404";

    if (!tunnelId) {
      throw new Error("缺少 tunnelId。");
    }
    if (!fs.existsSync(runtime.binaryPath)) {
      throw new Error(`cloudflared binary not found at ${runtime.binaryPath}`);
    }
    if (!runToken) {
      throw new Error("未配置有效的 Tunnel Run Token。");
    }

    this.invalidateExternalStatusCache();
    await this.stop(tunnelId);
    const paths = this.getTunnelPaths(tunnelId);
    await fsp.mkdir(paths.dir, { recursive: true });

    const metricsPort = await this.findAvailablePort(this.defaultMetricsPortStart);
    await fsp.writeFile(paths.token, `${runToken}\n`, "utf8");
    await this.writeConfigFile(paths.config, mappings, catchAllService);
    await this.writeJson(paths.meta, {
      tunnelId,
      tunnelName,
      metricsPort,
      mappings,
      catchAllService,
      startedAt: new Date().toISOString()
    });
    await fsp.rm(paths.log, { force: true }).catch(() => null);

    const args = [
      "tunnel",
      "--config",
      paths.config,
      "--protocol",
      runtime.protocol,
      "--metrics",
      `${runtime.metricsHost}:${metricsPort}`,
      "--no-autoupdate",
      "--loglevel",
      runtime.logLevel,
      "run",
      "--token-file",
      paths.token,
      ...runtime.extraArgs
    ];

    const pid = await new Promise((resolve, reject) => {
      const logFd = fs.openSync(paths.log, "a");
      let settled = false;
      const child = spawn("nohup", [runtime.binaryPath, ...args], {
        cwd: process.cwd(),
        detached: true,
        stdio: ["ignore", logFd, logFd]
      });
      child.on("spawn", () => {
        settled = true;
        resolve(child.pid);
      });
      child.on("error", (error) => {
        if (!settled) {
          fs.closeSync(logFd);
          settled = true;
        }
        reject(error);
      });
      child.unref();
    });

    if (!pid) {
      throw new Error("cloudflared 启动失败，未获取到 PID。");
    }

    await fsp.writeFile(paths.pid, `${pid}\n`, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const running = await this.isPidRunning(pid);
    if (!running) {
      const earlyLogs = await this.readRecentLogs(paths.log, { maxLines: 20 });
      const logSnippet = earlyLogs.length ? earlyLogs.join("\n") : "(no log output)";
      throw new Error(`cloudflared exited immediately after start (PID ${pid}). Recent logs:\n${logSnippet}`);
    }

    return this.getManagedTunnelStatus(tunnelId);
  }

  async stop(tunnelId) {
    if (String(tunnelId).startsWith("external:")) {
      throw new Error("自动发现的外部 cloudflared 进程当前仅支持查看，不支持在此页面直接停止。");
    }
    const paths = this.getTunnelPaths(tunnelId);
    const pid = await this.getPid(paths.pid);
    this.invalidateExternalStatusCache();

    if (pid) {
      try {
        process.kill(pid, "SIGTERM");
      } catch (_error) {
        // Process may already be gone.
      }

      // Give cloudflared a short moment to exit gracefully before cleaning runtime files.
      // If it still does not exit, keep the directory so we do not hide a stuck process.
      // eslint-disable-next-line no-await-in-loop
      const exited = await this.waitForPidExit(pid);
      if (!exited) {
        return this.getManagedTunnelStatus(tunnelId);
      }
    }

    await fsp.rm(paths.dir, { recursive: true, force: true }).catch(() => null);
    return {
      tunnelId,
      tunnelName: tunnelId,
      pid: null,
      running: false,
      metricsUrl: null,
      metricsPort: null,
      startedAt: null,
      binaryPath: (await this.getRuntimeConfig()).binaryPath,
      binaryExists: fs.existsSync((await this.getRuntimeConfig()).binaryPath),
      binaryVersion: this.binaryVersion,
      recentLogs: [],
      mappingCount: 0,
      hostnames: [],
      source: "managed",
      manageable: true,
      logPath: null
    };
  }

  async clearLogs(tunnelId) {
    if (String(tunnelId).startsWith("external:")) {
      throw new Error("自动发现的外部 cloudflared 进程当前不支持在此页面清空日志。");
    }
    const paths = this.getTunnelPaths(tunnelId);
    await fsp.writeFile(paths.log, "", "utf8").catch(() => null);
    return this.getManagedTunnelStatus(tunnelId);
  }

  async stopAll() {
    const tunnelIds = await this.listTunnelIds();
    await Promise.all(tunnelIds.map((tunnelId) => this.stop(tunnelId)));
  }

  async getStatus({ includeLogs = false } = {}) {
    const runtime = await this.getRuntimeConfig();
    const processes = await this.listStatuses({ includeLogs });
    return {
      binaryPath: runtime.binaryPath,
      binaryExists: fs.existsSync(runtime.binaryPath),
      binaryVersion: this.binaryVersion,
      processCount: processes.length,
      runningCount: processes.filter((item) => item.running).length,
      processes,
      statusHint: processes.length
        ? "可同时管理多个 Tunnel 连接器进程。"
        : "请从 Tunnel 列表点击“连接”启动指定 Tunnel。"
    };
  }

  async getMetrics(tunnelId) {
    const status = await this.getTunnelStatus(tunnelId);
    if (!status?.metricsUrl) {
      throw new Error("该 Tunnel 尚未分配 metrics 地址。");
    }
    const response = await fetch(status.metricsUrl);
    if (!response.ok) {
      throw new Error(`读取 cloudflared metrics 失败，状态码 ${response.status}`);
    }
    return response.text();
  }

  async getLogs(tunnelId) {
    const status = await this.getTunnelStatus(tunnelId, { includeLogs: true });
    if (!status) {
      throw new Error("未找到对应的 Tunnel 运行状态。");
    }

    return {
      tunnelId: status.tunnelId,
      tunnelName: status.tunnelName,
      running: status.running,
      recentLogs: status.recentLogs || [],
      source: status.source,
      manageable: status.manageable,
      logPath: status.logPath || null
    };
  }
}

module.exports = {
  CloudflaredManager
};
