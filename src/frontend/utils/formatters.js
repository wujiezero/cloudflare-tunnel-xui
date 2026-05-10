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
  const lines = text.split("\n");
  const metrics = {};

  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue;
    const parts = line.split(/\s+/);
    const key = parts[0];
    const value = parts[1];
    if (!key || value === undefined) continue;

    if (key.includes("tunnel_cloudflared_ha_connections")) metrics.activeConnections = value;
    else if (key.includes("cloudflared_tunnel_packets_sent")) metrics.bytesUp = formatBytes(Number(value));
    else if (key.includes("cloudflared_tunnel_packets_received")) metrics.bytesDown = formatBytes(Number(value));
    else if (key.includes("cloudflared_http_requests_total")) metrics.totalRequests = value;
    else if (key.includes("cloudflared_tunnel_total_errors")) metrics.errors = value;
    else if (key.includes("cloudflared_build_info")) {
      const uptimeMatch = text.match(/process_cpu_seconds_total\s+([\d.]+)/);
      if (uptimeMatch) metrics.uptime = formatUptime(Number(uptimeMatch[1]));
    }
  }

  return {
    activeConnections: metrics.activeConnections || "—",
    bytesUp: metrics.bytesUp || "—",
    bytesDown: metrics.bytesDown || "—",
    totalRequests: metrics.totalRequests || "—",
    errors: metrics.errors || "—",
    uptime: metrics.uptime || "—"
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

export function mergeLineSnapshots(prev, next) {
  if (!prev.length || !next.length) return next;
  const prevTail = prev.slice(-100).join("\n");
  const overlapStart = next.findIndex((line) => prevTail.endsWith(line));
  if (overlapStart > 0) return next.slice(overlapStart);
  return next;
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
