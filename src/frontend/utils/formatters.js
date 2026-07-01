export function formatJson(data) {
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function parseMetricsText(text) {
  if (!text || typeof text !== "string") {
    return { activeConnections: "—", bytesUp: "—", bytesDown: "—", totalRequests: "—", errors: "—", uptime: "—" };
  }
  const samples = text.split("\n").flatMap((line) => {
    if (line.startsWith("#") || !line.trim()) return [];
    const match = line.trim().match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{[^}]*\})?\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[-+]?Inf|NaN)\b/);
    if (!match) return [];
    const value = Number(match[2]);
    return Number.isFinite(value) ? [{ name: match[1], value }] : [];
  });

  const sumMetric = (names) => {
    const allowed = new Set(names);
    let total = 0;
    let found = false;
    for (const sample of samples) {
      if (!allowed.has(sample.name)) continue;
      total += sample.value;
      found = true;
    }
    return found ? total : null;
  };

  const firstMetric = (names) => {
    const allowed = new Set(names);
    return samples.find((sample) => allowed.has(sample.name))?.value ?? null;
  };

  const activeConnections = sumMetric([
    "cloudflared_tunnel_active_connections",
    "cloudflared_tunnel_concurrent_requests_per_tunnel",
    "cloudflared_tunnel_ha_connections",
    "tunnel_cloudflared_ha_connections"
  ]);
  const bytesUp = sumMetric([
    "cloudflared_tunnel_total_bytes",
    "cloudflared_tunnel_bytes_sent",
    "cloudflared_tunnel_packets_sent"
  ]);
  const bytesDown = sumMetric([
    "cloudflared_tunnel_received_bytes",
    "cloudflared_tunnel_bytes_received",
    "cloudflared_tunnel_packets_received"
  ]);
  const totalRequests = sumMetric([
    "cloudflared_tunnel_requests",
    "cloudflared_tunnel_total_requests",
    "cloudflared_http_requests_total"
  ]);
  const errors = sumMetric([
    "cloudflared_tunnel_request_errors",
    "cloudflared_tunnel_total_errors",
    "cloudflared_tunnel_errors"
  ]);

  let uptimeSeconds = firstMetric(["cloudflared_tunnel_uptime_secs", "process_uptime_seconds"]);
  const processStartSeconds = firstMetric(["process_start_time_seconds"]);
  if (uptimeSeconds === null && processStartSeconds !== null) {
    uptimeSeconds = Math.max(0, Date.now() / 1000 - processStartSeconds);
  }

  return {
    activeConnections: activeConnections === null ? "—" : String(activeConnections),
    bytesUp: bytesUp === null ? "—" : formatBytes(bytesUp),
    bytesDown: bytesDown === null ? "—" : formatBytes(bytesDown),
    totalRequests: totalRequests === null ? "—" : String(totalRequests),
    errors: errors === null ? "—" : String(errors),
    uptime: uptimeSeconds === null ? "—" : formatUptime(uptimeSeconds)
  };
}

export function formatBytes(bytes) {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  return `${(bytes / Math.pow(1024, idx)).toFixed(1)} ${units[idx]}`;
}

export function formatUptime(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function normalizeMappings(mappings) {
  return (mappings || []).map((m) => ({
    ...m,
    originRequest: {
      noTLSVerify: Boolean(m?.originRequest?.noTLSVerify),
      disableChunkedEncoding: Boolean(m?.originRequest?.disableChunkedEncoding),
      http2Origin: Boolean(m?.originRequest?.http2Origin)
    }
  }));
}

export function getMappingsSignature(mappings) {
  return JSON.stringify(normalizeMappings(mappings));
}

export function getDomainChips(domains, maxShown, expanded) {
  const list = (domains || []).filter(Boolean);
  const shown = expanded ? list : list.slice(0, maxShown);
  const hasMore = list.length > maxShown;
  return { shown, hasMore, label: expanded ? "收起" : `+${list.length - maxShown} 个` };
}

export function mergeLineSnapshots(prev, next, maxLines = 1000) {
  if (!prev.length || !next.length) return next;
  const maxOverlap = Math.min(prev.length, next.length);

  for (let size = maxOverlap; size > 0; size -= 1) {
    const prevTail = prev.slice(-size).join("\n");
    const nextHead = next.slice(0, size).join("\n");
    if (prevTail === nextHead) {
      return prev.concat(next.slice(size)).slice(-maxLines);
    }
  }

  return prev.concat(next).slice(-maxLines);
}

export function isLikelyIpHttpsService(service) {
  if (!service || typeof service !== "string") return false;
  if (!service.startsWith("https://")) return false;
  const host = service.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return dateStr;
  }
}

export function canStartTunnel(tunnel) {
  if (!tunnel) return false;
  return !tunnel.connections || Number(tunnel.connections) === 0;
}

export function canStopTunnel(tunnel) {
  if (!tunnel) return false;
  return tunnel.connections && Number(tunnel.connections) > 0;
}
