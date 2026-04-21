"use strict";

const API_BASE_URL = "https://api.cloudflare.com/client/v4";
const API_TIMEOUT_MS = 10000;

const TUNNEL_REQUIRED_PERMISSION_NAMES = [
  "Cloudflare Tunnel Read",
  "Cloudflare Tunnel Write",
  "Cloudflare One Connectors Read",
  "Cloudflare One Connectors Write",
  "Cloudflare One Connector: cloudflared Read",
  "Cloudflare One Connector: cloudflared Write"
];

const DNS_REQUIRED_PERMISSION_NAMES = [
  "Zone Read",
  "DNS Read",
  "DNS Write"
];

const OPTIONAL_PERMISSION_NAMES = [
  "API Tokens Read"
];

function createCloudflareError(message, extras = {}) {
  const error = new Error(message);
  Object.assign(error, extras);
  return error;
}

function stripUrlPath(address) {
  try {
    const parsed = new URL(address);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_error) {
    return address.replace(/\/+$/, "");
  }
}

function translateCloudflareMessage(upstreamMessage) {
  const raw = String(upstreamMessage || "").trim();
  const invalidOriginWithPath = raw.match(
    /^Validation failed:\s+(\S+)\s+is an invalid address, ingress rules don't support proxying to a different path on the origin service\./i
  );

  if (invalidOriginWithPath) {
    const invalidAddress = invalidOriginWithPath[1];
    const suggestedAddress = stripUrlPath(invalidAddress);
    return [
      "保存映射失败：源站地址不能包含路径。",
      `请把 service 从「${invalidAddress}」改成「${suggestedAddress}」。`,
      "Cloudflare Tunnel 会保留用户原始请求路径，不能在这里把请求转发到源站的另一个路径。"
    ].join("");
  }

  return raw;
}

function extractCloudflareMessage(data, response) {
  return (
    data?.errors?.map((error) => error.message).join("; ") ||
    data?.messages?.map?.((item) => item.message || item).join("; ") ||
    data?.result?.message ||
    data?.message ||
    `Cloudflare API request failed with status ${response.status}`
  );
}

function classifyCloudflareResponseError(response, data) {
  const status = Number(response.status || 500);
  const upstreamMessage = extractCloudflareMessage(data, response);
  const friendlyMessage = translateCloudflareMessage(upstreamMessage);
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfter = retryAfterHeader ? Number(retryAfterHeader) || retryAfterHeader : null;

  if (status === 401 || status === 403) {
    return createCloudflareError(`Cloudflare 认证失败：${friendlyMessage}`, {
      status,
      details: {
        ...data,
        upstreamMessage
      },
      code: "cf_auth",
      category: "auth",
      retryable: false,
      retryAfter
    });
  }

  if (status === 429) {
    return createCloudflareError(`Cloudflare API 触发限流：${friendlyMessage}`, {
      status,
      details: {
        ...data,
        upstreamMessage
      },
      code: "cf_rate_limit",
      category: "rate_limit",
      retryable: true,
      retryAfter
    });
  }

  if (status >= 500) {
    return createCloudflareError(`Cloudflare 服务暂时不可用：${friendlyMessage}`, {
      status,
      details: {
        ...data,
        upstreamMessage
      },
      code: "cf_upstream",
      category: "upstream",
      retryable: true,
      retryAfter
    });
  }

  return createCloudflareError(friendlyMessage, {
    status,
    details: {
      ...data,
      upstreamMessage
    },
    code: "cf_request",
    category: "request",
    retryable: false,
    retryAfter
  });
}

async function requestCloudflare(path, { method = "GET", token, body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timeout);

    if (error?.name === "AbortError") {
      throw createCloudflareError("Cloudflare API 请求超时，请检查网络或稍后重试。", {
        status: 504,
        details: { path, method },
        code: "cf_timeout",
        category: "timeout",
        retryable: true
      });
    }

    throw createCloudflareError(`Cloudflare API 网络请求失败：${error.message}`, {
      status: 502,
      details: { path, method },
      code: "cf_network",
      category: "network",
      retryable: true
    });
  }
  clearTimeout(timeout);

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : { message: await response.text().catch(() => "") };

  if (!response.ok || data.success === false) {
    throw classifyCloudflareResponseError(response, data);
  }

  return data;
}

function normalizeTunnel(tunnel) {
  return {
    id: tunnel.id,
    name: tunnel.name,
    createdAt: tunnel.created_at,
    deletedAt: tunnel.deleted_at,
    status: tunnel.status,
    connections: Array.isArray(tunnel.connections) ? tunnel.connections.length : 0,
    metadata: tunnel.metadata || {},
    remoteConfig: Boolean(tunnel.remote_config),
    tunnelSecret: tunnel.tunnel_secret || "",
    connsActiveAt: tunnel.conns_active_at || null
  };
}

function normalizeTunnelConfiguration(result) {
  const config = result?.config || {};
  const ingressRules = Array.isArray(config.ingress) ? config.ingress : [];
  const mappings = ingressRules
    .filter((rule) => rule && rule.hostname && rule.service)
    .map((rule) => ({
      hostname: rule.hostname,
      service: rule.service,
      path: rule.path || "",
      originRequest: rule.originRequest || null
    }));
  const catchAll = ingressRules.find(
    (rule) => rule && !rule.hostname && typeof rule.service === "string"
  ) || { service: "http_status:404" };

  return {
    version: result?.version || 1,
    source: result?.source || "",
    createdAt: result?.created_at || null,
    config,
    mappings,
    catchAll
  };
}

function normalizeHostname(value) {
  return String(value || "")
    .trim()
    .replace(/\.+$/, "")
    .toLowerCase();
}

function createDefaultTunnelConfiguration() {
  return normalizeTunnelConfiguration({
    config: {
      ingress: [{ service: "http_status:404" }]
    }
  });
}

function isMissingTunnelConfigurationError(error) {
  return (
    error?.status === 404 &&
    /Configuration for tunnel not found/i.test(String(error.message || ""))
  );
}

async function listTunnels(accountId, token) {
  const data = await requestCloudflare(
    `/accounts/${accountId}/cfd_tunnel?per_page=100`,
    { token }
  );
  return (data.result || []).map(normalizeTunnel);
}

async function getTunnel(accountId, token, tunnelId) {
  const data = await requestCloudflare(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}`,
    { token }
  );
  return normalizeTunnel(data.result);
}

async function createTunnel(accountId, token, payload) {
  const data = await requestCloudflare(`/accounts/${accountId}/cfd_tunnel`, {
    method: "POST",
    token,
    body: payload
  });
  return normalizeTunnel(data.result);
}

async function updateTunnel(accountId, token, tunnelId, payload) {
  const data = await requestCloudflare(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}`,
    {
      method: "PATCH",
      token,
      body: payload
    }
  );
  return normalizeTunnel(data.result);
}

async function deleteTunnel(accountId, token, tunnelId) {
  const data = await requestCloudflare(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}`,
    {
      method: "DELETE",
      token
    }
  );
  return data.result;
}

async function getTunnelToken(accountId, token, tunnelId) {
  const data = await requestCloudflare(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`,
    { token }
  );
  return data.result;
}

async function getTunnelConfiguration(accountId, token, tunnelId) {
  try {
    const data = await requestCloudflare(
      `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
      { token }
    );
    return normalizeTunnelConfiguration(data.result);
  } catch (error) {
    if (isMissingTunnelConfigurationError(error)) {
      return createDefaultTunnelConfiguration();
    }
    throw error;
  }
}

async function updateTunnelConfiguration(accountId, token, tunnelId, payload) {
  const current = await getTunnelConfiguration(accountId, token, tunnelId);
  const mappings = Array.isArray(payload?.mappings) ? payload.mappings : [];
  const ingress = mappings.map((mapping) => {
    const rule = {
      hostname: String(mapping.hostname || "").trim(),
      service: String(mapping.service || "").trim()
    };

    if (mapping.path) {
      rule.path = String(mapping.path).trim();
    }
    if (mapping.originRequest && typeof mapping.originRequest === "object") {
      rule.originRequest = mapping.originRequest;
    }

    return rule;
  });

  ingress.push(payload?.catchAll?.service ? payload.catchAll : current.catchAll || { service: "http_status:404" });

  const nextConfig = {
    ...current.config,
    ingress
  };

  const data = await requestCloudflare(
    `/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`,
    {
      method: "PUT",
      token,
      body: { config: nextConfig }
    }
  );
  return normalizeTunnelConfiguration(data.result);
}

async function listZones(accountId, token) {
  const zones = [];
  let page = 1;

  while (page <= 20) {
    const data = await requestCloudflare(
      `/zones?account.id=${encodeURIComponent(accountId)}&per_page=100&page=${page}`,
      { token }
    );
    const pageItems = Array.isArray(data.result) ? data.result : [];
    zones.push(
      ...pageItems.map((zone) => ({
        id: zone.id,
        name: normalizeHostname(zone.name),
        status: zone.status || ""
      }))
    );

    const totalPages = Number(data?.result_info?.total_pages || 1);
    if (!pageItems.length || page >= totalPages) {
      break;
    }
    page += 1;
  }

  return zones;
}

async function listDnsRecords(zoneId, token, hostname) {
  const data = await requestCloudflare(
    `/zones/${zoneId}/dns_records?per_page=100&name=${encodeURIComponent(hostname)}`,
    { token }
  );
  return Array.isArray(data.result) ? data.result : [];
}

async function createDnsRecord(zoneId, token, payload) {
  const data = await requestCloudflare(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    token,
    body: payload
  });
  return data.result || {};
}

async function updateDnsRecord(zoneId, token, recordId, payload) {
  const data = await requestCloudflare(`/zones/${zoneId}/dns_records/${recordId}`, {
    method: "PUT",
    token,
    body: payload
  });
  return data.result || {};
}

async function probeTunnelWriteCapability(accountId, token) {
  try {
    await requestCloudflare(
      `/accounts/${accountId}/cfd_tunnel/00000000-0000-0000-0000-000000000000`,
      {
        method: "PATCH",
        token,
        body: {
          name: "write-probe"
        }
      }
    );
    return true;
  } catch (error) {
    if (error?.status === 403) {
      return false;
    }
    if ([400, 404, 409, 422].includes(Number(error?.status))) {
      return true;
    }
    return null;
  }
}

async function probeDnsWriteCapability(zoneId, zoneName, token) {
  try {
    await requestCloudflare(
      `/zones/${zoneId}/dns_records/00000000000000000000000000000000`,
      {
        method: "PUT",
        token,
        body: {
          type: "CNAME",
          name: `_cf_probe.${zoneName}`,
          content: "invalid.cfargotunnel.com",
          proxied: true,
          ttl: 1
        }
      }
    );
    return true;
  } catch (error) {
    if (error?.status === 403) {
      return false;
    }
    if ([400, 404, 409, 422].includes(Number(error?.status))) {
      return true;
    }
    return null;
  }
}

function findBestZoneForHostname(hostname, zones) {
  const normalizedHostname = normalizeHostname(hostname);
  return zones
    .filter(
      (zone) =>
        normalizedHostname === zone.name ||
        normalizedHostname.endsWith(`.${zone.name}`)
    )
    .sort((left, right) => right.name.length - left.name.length)[0] || null;
}

function buildPublishStatusSummary(items) {
  return items.reduce(
    (summary, item) => {
      summary.total += 1;

      if (item.status === "published") {
        summary.published += 1;
      } else if (item.status === "published_warning") {
        summary.warnings += 1;
      } else {
        summary.unpublished += 1;
      }

      return summary;
    },
    {
      total: 0,
      published: 0,
      warnings: 0,
      unpublished: 0
    }
  );
}

function normalizeDnsRecords(records, hostname) {
  const normalizedHostname = normalizeHostname(hostname);
  return (Array.isArray(records) ? records : [])
    .filter((record) => normalizeHostname(record.name) === normalizedHostname)
    .map((record) => ({
      id: record.id,
      type: String(record.type || "").toUpperCase(),
      name: normalizeHostname(record.name),
      content: normalizeHostname(record.content),
      proxied: Boolean(record.proxied),
      ttl: Number(record.ttl || 1) || 1
    }));
}

function inspectHostnameDnsState(hostname, service, zone, records, expectedTarget) {
  const normalizedRecords = normalizeDnsRecords(records, hostname);

  if (!normalizedRecords.length) {
    return {
      hostname,
      service,
      status: "missing_record",
      zoneName: zone.name,
      dnsRecords: [],
      message: `Cloudflare DNS 里还没有「${hostname}」这条记录，请先把它发布到当前 Tunnel。`
    };
  }

  const nonCnameRecords = normalizedRecords.filter((record) => record.type !== "CNAME");
  if (nonCnameRecords.length) {
    return {
      hostname,
      service,
      status: "record_conflict",
      zoneName: zone.name,
      dnsRecords: normalizedRecords,
      message: `「${hostname}」已经存在 ${nonCnameRecords.map((record) => record.type).join(" / ")} 记录，无法自动改成 Tunnel CNAME，请先手动清理冲突记录。`
    };
  }

  const cnameRecord = normalizedRecords[0];
  if (normalizedRecords.length > 1) {
    return {
      hostname,
      service,
      status: "record_conflict",
      zoneName: zone.name,
      dnsRecords: normalizedRecords,
      message: `「${hostname}」存在多条 CNAME 记录，无法自动判断应保留哪一条，请先在 Cloudflare DNS 中清理。`
    };
  }

  if (cnameRecord.content !== expectedTarget) {
    return {
      hostname,
      service,
      status: "record_mismatch",
      zoneName: zone.name,
      dnsRecords: normalizedRecords,
      message: `「${hostname}」当前指向「${cnameRecord.content}」，而不是当前 Tunnel 的「${expectedTarget}」。`
    };
  }

  if (!cnameRecord.proxied) {
    return {
      hostname,
      service,
      status: "published_warning",
      zoneName: zone.name,
      dnsRecords: normalizedRecords,
      message: `「${hostname}」已经指向当前 Tunnel，但代理状态未开启，建议在 Cloudflare DNS 中保持 Proxied。`
    };
  }

  return {
    hostname,
    service,
    status: "published",
    zoneName: zone.name,
    dnsRecords: normalizedRecords,
    message: `「${hostname}」已经正确发布到当前 Tunnel。`
  };
}

function translatePublishStatusCheckError(error) {
  if (error?.code === "cf_auth") {
    return createCloudflareError(
      "无法检查或同步域名发布状态：当前 API Token 可能缺少 Zone Read、DNS Read、DNS Write 权限，或者无权访问对应 Zone。",
      {
        status: error.status || 403,
        details: error.details || null,
        code: "cf_publish_status_auth",
        category: "auth",
        retryable: false
      }
    );
  }

  return error;
}

async function getTunnelPublishStatus(accountId, token, tunnelId, mappings) {
  const expectedTarget = normalizeHostname(`${tunnelId}.cfargotunnel.com`);
  const zones = await listZones(accountId, token).catch((error) => {
    throw translatePublishStatusCheckError(error);
  });

  const items = await Promise.all(
    (Array.isArray(mappings) ? mappings : []).map(async (mapping) => {
      const hostname = normalizeHostname(mapping?.hostname);
      const service = String(mapping?.service || "").trim();

      if (!hostname) {
        return {
          hostname: "",
          service,
          status: "missing_hostname",
          zoneName: "",
          dnsRecords: [],
          message: "这条映射还没有填写 hostname，暂时无法检查发布状态。"
        };
      }

      const zone = findBestZoneForHostname(hostname, zones);
      if (!zone) {
        return {
          hostname,
          service,
          status: "zone_not_found",
          zoneName: "",
          dnsRecords: [],
          message: `当前 API Token 可访问的 Zone 里没有找到「${hostname}」所属域名，暂时无法检查它是否已发布。`
        };
      }

      const records = await listDnsRecords(zone.id, token, hostname).catch((error) => {
        throw translatePublishStatusCheckError(error);
      });
      return inspectHostnameDnsState(hostname, service, zone, records, expectedTarget);
    })
  );

  return {
    tunnelId,
    expectedTarget,
    checkedAt: new Date().toISOString(),
    items,
    summary: buildPublishStatusSummary(items)
  };
}

async function ensureTunnelDnsRecords(accountId, token, tunnelId, mappings) {
  const expectedTarget = normalizeHostname(`${tunnelId}.cfargotunnel.com`);
  const zones = await listZones(accountId, token).catch((error) => {
    throw translatePublishStatusCheckError(error);
  });

  const items = await Promise.all(
    (Array.isArray(mappings) ? mappings : []).map(async (mapping) => {
      const hostname = normalizeHostname(mapping?.hostname);
      const service = String(mapping?.service || "").trim();

      if (!hostname) {
        return {
          hostname: "",
          service,
          status: "missing_hostname",
          action: "skipped",
          zoneName: "",
          dnsRecords: [],
          message: "这条映射还没有填写 hostname，已跳过 DNS 同步。"
        };
      }

      const zone = findBestZoneForHostname(hostname, zones);
      if (!zone) {
        return {
          hostname,
          service,
          status: "zone_not_found",
          action: "skipped",
          zoneName: "",
          dnsRecords: [],
          message: `当前 API Token 可访问的 Zone 里没有找到「${hostname}」所属域名，无法自动创建 DNS 记录。`
        };
      }

      const records = await listDnsRecords(zone.id, token, hostname).catch((error) => {
        throw translatePublishStatusCheckError(error);
      });
      const currentState = inspectHostnameDnsState(hostname, service, zone, records, expectedTarget);

      if (currentState.status === "published") {
        return {
          ...currentState,
          action: "unchanged"
        };
      }

      if (currentState.status === "published_warning") {
        const currentRecord = currentState.dnsRecords[0];
        const updatedRecord = await updateDnsRecord(zone.id, token, currentRecord.id, {
          type: "CNAME",
          name: hostname,
          content: expectedTarget,
          proxied: true,
          ttl: 1
        }).catch((error) => {
          throw translatePublishStatusCheckError(error);
        });

        return {
          hostname,
          service,
          status: "published",
          action: "updated",
          zoneName: zone.name,
          dnsRecords: normalizeDnsRecords([updatedRecord], hostname),
          message: `「${hostname}」已更新为指向当前 Tunnel，并启用 Proxied。`
        };
      }

      if (currentState.status === "missing_record") {
        const createdRecord = await createDnsRecord(zone.id, token, {
          type: "CNAME",
          name: hostname,
          content: expectedTarget,
          proxied: true,
          ttl: 1
        }).catch((error) => {
          throw translatePublishStatusCheckError(error);
        });

        return {
          hostname,
          service,
          status: "published",
          action: "created",
          zoneName: zone.name,
          dnsRecords: normalizeDnsRecords([createdRecord], hostname),
          message: `已为「${hostname}」创建 CNAME，当前指向这个 Tunnel。`
        };
      }

      if (currentState.status === "record_mismatch" && currentState.dnsRecords.length === 1 && currentState.dnsRecords[0].type === "CNAME") {
        const currentRecord = currentState.dnsRecords[0];
        const updatedRecord = await updateDnsRecord(zone.id, token, currentRecord.id, {
          type: "CNAME",
          name: hostname,
          content: expectedTarget,
          proxied: true,
          ttl: 1
        }).catch((error) => {
          throw translatePublishStatusCheckError(error);
        });

        return {
          hostname,
          service,
          status: "published",
          action: "updated",
          zoneName: zone.name,
          dnsRecords: normalizeDnsRecords([updatedRecord], hostname),
          message: `「${hostname}」原本指向了别的目标，现已更新为当前 Tunnel。`
        };
      }

      return {
        ...currentState,
        action: "skipped"
      };
    })
  );

  return {
    tunnelId,
    expectedTarget,
    syncedAt: new Date().toISOString(),
    items,
    summary: buildPublishStatusSummary(items)
  };
}

async function verifyApiToken(token) {
  return requestCloudflare("/user/tokens/verify", { token });
}

async function getApiTokenDetails(token, tokenId) {
  return requestCloudflare(`/user/tokens/${tokenId}`, { token });
}

function extractPermissionNames(tokenDetails) {
  const policies = tokenDetails?.result?.policies || [];
  return policies.flatMap((policy) =>
    (policy.permission_groups || []).map((group) => group.name)
  );
}

async function testCloudflareCredentials({ accountId, apiToken }) {
  const issues = [];
  const permissions = {
    readable: false,
    writable: null,
    inspectable: false,
    dnsReady: null,
    granted: [],
    required: {
      tunnel: TUNNEL_REQUIRED_PERMISSION_NAMES,
      dns: DNS_REQUIRED_PERMISSION_NAMES,
      optional: OPTIONAL_PERMISSION_NAMES,
      all: [...TUNNEL_REQUIRED_PERMISSION_NAMES, ...DNS_REQUIRED_PERMISSION_NAMES]
    },
    missing: {
      tunnel: [],
      dns: [],
      optional: [],
      all: []
    },
    capabilities: {
      tunnelRead: false,
      tunnelWrite: null,
      zoneRead: false,
      dnsRead: false,
      dnsWrite: null
    }
  };

  const verification = await verifyApiToken(apiToken);
  const verifyResult = verification.result || {};
  let readableZones = [];

  if (verifyResult.status !== "active") {
    issues.push(`API Token status is ${verifyResult.status || "unknown"}.`);
  }

  try {
    await requestCloudflare(`/accounts/${accountId}/cfd_tunnel?per_page=1`, {
      token: apiToken
    });
    permissions.readable = true;
    permissions.capabilities.tunnelRead = true;
  } catch (error) {
    issues.push(`无法读取 Tunnel 列表：${error.message}`);
  }

  try {
    readableZones = await listZones(accountId, apiToken);
    permissions.capabilities.zoneRead = true;
    if (readableZones.length > 0) {
      await listDnsRecords(readableZones[0].id, apiToken, readableZones[0].name);
      permissions.capabilities.dnsRead = true;
    }
  } catch (error) {
    issues.push(`无法读取 Zone / DNS 信息：${error.message}`);
  }

  permissions.capabilities.tunnelWrite = await probeTunnelWriteCapability(accountId, apiToken);
  if (permissions.capabilities.zoneRead && permissions.capabilities.dnsRead && readableZones.length > 0) {
    permissions.capabilities.dnsWrite = await probeDnsWriteCapability(
      readableZones[0].id,
      readableZones[0].name,
      apiToken
    );
  }

  try {
    const tokenDetails = await getApiTokenDetails(apiToken, verifyResult.id);
    permissions.inspectable = true;
    permissions.granted = extractPermissionNames(tokenDetails);
    permissions.missing.tunnel = TUNNEL_REQUIRED_PERMISSION_NAMES.filter(
      (name) => !permissions.granted.includes(name)
    );
    permissions.missing.dns = DNS_REQUIRED_PERMISSION_NAMES.filter(
      (name) => !permissions.granted.includes(name)
    );
    permissions.missing.optional = OPTIONAL_PERMISSION_NAMES.filter(
      (name) => !permissions.granted.includes(name)
    );
    permissions.missing.all = [
      ...permissions.missing.tunnel,
      ...permissions.missing.dns
    ];
    permissions.writable = permissions.capabilities.tunnelWrite;
    permissions.dnsReady =
      permissions.capabilities.zoneRead &&
      permissions.capabilities.dnsRead &&
      permissions.capabilities.dnsWrite;
  } catch (error) {
    permissions.missing.tunnel = null;
    permissions.missing.dns = null;
    permissions.missing.optional = OPTIONAL_PERMISSION_NAMES;
    permissions.missing.all = null;
    issues.push(
      `无法读取 Token 详细权限，当前无法展示完整权限名；通常说明缺少或受限于 API Tokens Read：${error.message}`
    );
  }

  if (permissions.capabilities.tunnelWrite === false) {
    issues.push("缺少 Tunnel 写权限，无法通过页面创建、修改或删除 Tunnel。");
  }
  if (!permissions.capabilities.zoneRead) {
    issues.push("缺少 Zone Read 权限，无法检查 hostname 属于哪个域名托管区。");
  }
  if (!permissions.capabilities.dnsRead) {
    issues.push("缺少 DNS Read 权限，无法检查当前 hostname 是否已经发布到 Cloudflare DNS。");
  }
  if (permissions.capabilities.dnsWrite === false) {
    issues.push("缺少 DNS Write 权限，无法自动创建或更新 Tunnel 对应的 CNAME。");
  }
  if (permissions.capabilities.tunnelWrite === null) {
    issues.push("暂时无法确认 Tunnel 写权限，建议稍后重试；如果功能实测正常，可忽略此提示。");
  }
  if (
    permissions.capabilities.zoneRead &&
    permissions.capabilities.dnsRead &&
    readableZones.length > 0 &&
    permissions.capabilities.dnsWrite === null
  ) {
    issues.push("暂时无法确认 DNS Write 权限，建议稍后重试；如果自动同步 CNAME 正常，可忽略此提示。");
  }

  const readyForTunnelManagement =
    permissions.capabilities.tunnelRead && permissions.capabilities.tunnelWrite === true;
  const readyForDnsPublish =
    permissions.capabilities.zoneRead &&
    permissions.capabilities.dnsRead &&
    permissions.capabilities.dnsWrite === true;
  permissions.writable = permissions.capabilities.tunnelWrite;
  permissions.dnsReady = readyForDnsPublish;

  let message = "Token 检测完成。";
  if (readyForTunnelManagement && readyForDnsPublish && !permissions.inspectable) {
    message = "功能实测已具备 Tunnel 管理和 DNS 自动发布能力，但由于缺少或受限于 API Tokens Read，无法展示完整权限名。";
  } else if (!permissions.inspectable) {
    message = "Token 可用，但由于缺少或受限于 API Tokens Read，无法展示完整权限名；功能可用性已尽量按真实接口探测。";
  } else if (!readyForTunnelManagement && !readyForDnsPublish) {
    message = "Token 当前既不满足 Tunnel 管理，也不满足 DNS 自动发布所需权限。";
  } else if (!readyForTunnelManagement) {
    message = "Token 可读取部分配置，但还不满足 Tunnel 管理所需权限。";
  } else if (!readyForDnsPublish) {
    message = "Tunnel 管理权限已具备，但 DNS 自动发布相关权限仍不完整。";
  } else {
    message = "Tunnel 管理和 DNS 自动发布所需权限都已具备。";
  }

  return {
    // "valid" should reflect real functional readiness.
    // When API Tokens Read is missing, we may not be able to list granted/missing permission names,
    // but Tunnel/DNS capabilities can still be verified via real API calls.
    valid: verifyResult.status === "active" && readyForTunnelManagement && readyForDnsPublish,
    message,
    tokenId: verifyResult.id || "",
    tokenStatus: verifyResult.status || "",
    expiresOn: verifyResult.expires_on || null,
    notBefore: verifyResult.not_before || null,
    ready: {
      tunnelManagement: permissions.capabilities.tunnelWrite === null ? null : readyForTunnelManagement,
      dnsPublish: permissions.capabilities.dnsWrite === null ? null : readyForDnsPublish
    },
    permissions,
    issues
  };
}

module.exports = {
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
};
