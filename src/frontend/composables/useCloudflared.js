import { reactive } from "vue";
import { ElMessageBox } from "element-plus";
import { useApi } from "./useApi.js";
import { parseMetricsText, mergeLineSnapshots } from "../utils/formatters.js";

const state = reactive({
  cloudflared: {
    binaryPath: "",
    binaryExists: false,
    binaryVersion: "",
    processCount: 0,
    runningCount: 0,
    processes: [],
    statusHint: ""
  },
  selectedRuntimeTunnelId: null,
  runtimeLogDisplay: "等待状态刷新...",
  runtimeViewerMode: "logs",
  runtimeViewerTunnelId: null,
  runtimeLogLines: [],
  runtimeMetricsHistory: [],
  runtimeMetricsLastPayload: "",
  runtimeLogVisible: false,
  lastRuntimeRefreshAt: null,
  pollFailCount: 0,
  statusPollTimer: null,
  hoveredStopTunnelId: null
});

export function useCloudflared() {
  const { api, notify } = useApi();

  function ensureSelectedProcess() {
    if (!state.cloudflared.processes.length) {
      state.selectedRuntimeTunnelId = null;
      state.runtimeLogDisplay = state.cloudflared.statusHint || "等待状态刷新...";
      return;
    }
    const exists = state.cloudflared.processes.find(
      (p) => p.tunnelId === state.selectedRuntimeTunnelId
    );
    if (!exists) {
      const running = state.cloudflared.processes.find((p) => p.running);
      state.selectedRuntimeTunnelId = running?.tunnelId || state.cloudflared.processes[0].tunnelId;
    }
    syncRuntimeLogDisplay();
  }

  function syncRuntimeLogDisplay() {
    const proc = state.cloudflared.processes.find(
      (p) => p.tunnelId === state.selectedRuntimeTunnelId
    );
    if (proc?.running) {
      state.runtimeLogDisplay = state.runtimeLogLines.length
        ? state.runtimeLogLines.join("\n")
        : "等待日志输出...";
    } else if (proc && !proc.running) {
      state.runtimeLogDisplay = state.runtimeLogLines.length
        ? state.runtimeLogLines.join("\n")
        : "当前进程已停止，历史日志已清除。";
    } else {
      state.runtimeLogDisplay = state.cloudflared.statusHint || "等待状态刷新...";
    }
  }

  function resetRuntimeViewer({ tunnelId, mode } = {}) {
    state.runtimeViewerTunnelId = tunnelId || null;
    state.runtimeViewerMode = mode || "logs";
    state.runtimeLogLines = [];
    state.runtimeMetricsHistory = [];
    state.runtimeMetricsLastPayload = "";
    state.runtimeLogDisplay = "等待状态刷新...";
  }

  async function refreshRuntimeStatus() {
    try {
      state.cloudflared = await api("/api/cloudflared/status");
      state.lastRuntimeRefreshAt = new Date().toISOString();
      state.pollFailCount = 0;
      ensureSelectedProcess();
    } catch (_error) {
      state.pollFailCount += 1;
      if (state.pollFailCount === 3) {
        notify("状态轮询连续失败，请检查服务连接是否正常", "warning");
      }
    }
  }

  function startPolling() {
    if (!state.statusPollTimer) {
      state.statusPollTimer = setInterval(refreshRuntimeStatus, 5000);
    }
  }

  function stopPolling() {
    if (state.statusPollTimer) {
      clearInterval(state.statusPollTimer);
      state.statusPollTimer = null;
    }
  }

  async function refreshCurrentRuntimeViewer(options = {}) {
    if (state.runtimeViewerMode === "metrics") {
      return refreshSelectedMetrics(options);
    }
    return refreshSelectedLogs(options);
  }

  async function refreshSelectedLogs(options = {}) {
    const activeTunnelId = state.selectedRuntimeTunnelId;
    if (!activeTunnelId) {
      state.runtimeLogDisplay = state.cloudflared.statusHint || "等待状态刷新...";
      return;
    }

    if (!options.silent) syncRuntimeLogDisplay();

    try {
      const payload = await api(`/api/tunnels/${encodeURIComponent(activeTunnelId)}/logs`);
      if (state.selectedRuntimeTunnelId !== activeTunnelId || state.runtimeViewerMode !== "logs") return;

      const nextLines = Array.isArray(payload.recentLogs) ? payload.recentLogs : [];
      state.runtimeLogLines = mergeLineSnapshots(state.runtimeLogLines, nextLines);
      state.runtimeLogDisplay = state.runtimeLogLines.length
        ? state.runtimeLogLines.join("\n")
        : "当前进程暂时没有日志输出。";
    } catch (error) {
      if (state.selectedRuntimeTunnelId === activeTunnelId && state.runtimeViewerMode === "logs") {
        state.runtimeLogDisplay = error.message;
      }
    }
  }

  async function refreshSelectedMetrics(options = {}) {
    const activeTunnelId = state.selectedRuntimeTunnelId;
    if (!activeTunnelId) return;

    try {
      const payload = await api(`/api/tunnels/${encodeURIComponent(activeTunnelId)}/metrics`);
      if (state.selectedRuntimeTunnelId !== activeTunnelId || state.runtimeViewerMode !== "metrics") return;

      const metricsText = typeof payload === "string" ? payload : JSON.stringify(payload);
      if (metricsText && metricsText !== state.runtimeMetricsLastPayload) {
        state.runtimeMetricsLastPayload = metricsText;
        state.runtimeMetricsHistory.push({ time: Date.now(), text: metricsText, parsed: parseMetricsText(metricsText) });
        if (state.runtimeMetricsHistory.length > 20) {
          state.runtimeMetricsHistory = state.runtimeMetricsHistory.slice(-20);
        }
      }
      const parsed = parseMetricsText(metricsText);
      state.runtimeLogDisplay = `活动连接: ${parsed.activeConnections}  上行: ${parsed.bytesUp}  下行: ${parsed.bytesDown}  总请求: ${parsed.totalRequests}  错误: ${parsed.errors}  运行时长: ${parsed.uptime}`;
    } catch (error) {
      if (state.selectedRuntimeTunnelId === activeTunnelId && state.runtimeViewerMode === "metrics") {
        state.runtimeLogDisplay = `无法获取 Metrics: ${error.message}`;
      }
    }
  }

  async function startTunnel(tunnelId, { force = false } = {}) {
    try {
      await api(`/api/tunnels/${encodeURIComponent(tunnelId)}/start${force ? "?force=true" : ""}`, {
        method: "POST"
      });
      state.selectedRuntimeTunnelId = tunnelId;
      await refreshRuntimeStatus();
      notify("Tunnel 已启动");
    } catch (error) {
      if (error.status === 409) {
        try {
          await ElMessageBox.confirm(error.message, "确认接管 Tunnel", {
            confirmButtonText: "确认接管",
            cancelButtonText: "取消",
            type: "warning"
          });
          await startTunnel(tunnelId, { force: true });
        } catch (_) { /* user cancelled */ }
        return;
      }
      notify(error.message, "error");
    }
  }

  async function stopTunnel(tunnelId) {
    await api(`/api/tunnels/${encodeURIComponent(tunnelId)}/stop`, { method: "POST" });
    if (state.selectedRuntimeTunnelId === tunnelId) {
      state.runtimeLogVisible = false;
      state.selectedRuntimeTunnelId = null;
    }
    state.hoveredStopTunnelId = null;
    await refreshRuntimeStatus();
    notify("Tunnel 已停止", "info");
  }

  function openTunnelLogs(tunnel) {
    if (state.runtimeViewerTunnelId !== tunnel.id) {
      resetRuntimeViewer({ tunnelId: tunnel.id, mode: "logs" });
    } else {
      state.runtimeViewerMode = "logs";
    }
    state.selectedRuntimeTunnelId = tunnel.id;
    state.runtimeLogVisible = true;
    syncRuntimeLogDisplay();
  }

  return {
    state,
    refreshRuntimeStatus,
    startPolling,
    stopPolling,
    refreshCurrentRuntimeViewer,
    refreshSelectedLogs,
    refreshSelectedMetrics,
    startTunnel,
    stopTunnel,
    openTunnelLogs,
    resetRuntimeViewer
  };
}
