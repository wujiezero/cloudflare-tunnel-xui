<template>
  <el-dialog v-model="visible" title="运行时监控" width="800px" destroy-on-close class="panel-dialog runtime-dialog">
    <template v-if="cfState.selectedRuntimeTunnelId">
      <!-- Process selection tabs -->
      <div class="process-tabs">
        <button
          v-for="p in cfState.cloudflared.processes"
          :key="p.tunnelId"
          type="button"
          class="process-tab"
          :class="{ active: p.tunnelId === cfState.selectedRuntimeTunnelId }"
          @click="selectProcess(p.tunnelId)"
        >
          <span class="status-dot" :class="p.running ? 'ok' : 'idle'"></span>
          {{ p.name || p.tunnelId?.slice(0, 8) }}
        </button>
      </div>

      <!-- Mode switch -->
      <div class="viewer-controls">
        <el-radio-group v-model="cfState.runtimeViewerMode" size="small">
          <el-radio-button value="logs"><el-icon><Document /></el-icon>日志</el-radio-button>
          <el-radio-button value="metrics"><el-icon><TrendCharts /></el-icon>指标</el-radio-button>
        </el-radio-group>
        <div class="viewer-actions">
          <el-select
            v-if="cfState.runtimeViewerMode === 'logs'"
            v-model="logRefreshInterval"
            size="small"
            class="runtime-refresh-select"
            @change="handleLogRefreshIntervalChange"
          >
            <el-option
              v-for="option in LOG_REFRESH_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-switch
            v-if="cfState.runtimeViewerMode === 'logs'"
            v-model="logAutoScroll"
            size="small"
            class="runtime-log-autoscroll"
            active-text="跟随底部"
            inactive-text="暂停滚动"
            @change="handleLogAutoScrollChange"
          />
          <el-select
            v-if="cfState.runtimeViewerMode === 'metrics'"
            v-model="metricsRefreshInterval"
            size="small"
            class="runtime-refresh-select"
            @change="handleMetricsRefreshIntervalChange"
          >
            <el-option
              v-for="option in METRICS_REFRESH_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-button size="small" :icon="Refresh" @click="handleRefresh">刷新</el-button>
          <el-button size="small" :icon="Delete" @click="handleClearLogs">清除日志</el-button>
          <el-button size="small" type="danger" plain :icon="VideoPause" @click="handleStop">停止</el-button>
        </div>
      </div>

      <!-- Content area -->
      <div v-if="cfState.runtimeViewerMode === 'logs'" class="log-viewer scroll-thin" ref="logViewerRef" @scroll="handleLogScroll">
        <template v-if="cfState.runtimeLogLines.length">
          <div v-for="(line, i) in parsedLogLines" :key="i" class="log-line">
            <span v-if="line.time" class="log-time">{{ line.time }}</span>
            <span class="log-level" :class="line.level.toLowerCase()">{{ line.level }}</span>
            <span class="log-text">{{ line.text }}</span>
          </div>
        </template>
        <div v-else class="log-fallback">{{ cfState.runtimeLogDisplay }}</div>
      </div>

      <div v-else class="metrics-grid">
        <div class="metric-card" v-for="m in metricsCards" :key="m.label">
          <span class="metric-icon"><el-icon><component :is="m.icon" /></el-icon></span>
          <div class="metric-value mono">{{ m.value }}</div>
          <div class="metric-label">{{ m.label }}</div>
        </div>
        <div class="metric-chart-section" v-if="cfState.runtimeMetricsHistory.length > 1">
          <h4 class="metric-chart-title"><el-icon><Share /></el-icon>活动连接</h4>
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="activeConnections" label="连接数" color="--accent" />
          <h4 class="metric-chart-title"><el-icon><Upload /></el-icon>流量</h4>
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="bytesUp" label="上行(B)" color="--success" />
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="bytesDown" label="下行(B)" color="--warning" />
        </div>
      </div>
    </template>
    <div v-else class="empty-state">
      <span class="empty-icon"><el-icon><VideoPause /></el-icon></span>
      <div class="empty-title">无运行中进程</div>
      <div class="empty-desc">在 Tunnel 列表点击「启动」后，这里会显示实时日志与指标。</div>
    </div>

    <template #footer>
      <div class="runtime-dialog-footer">
        <span class="auto-refresh-label">
          {{ cfState.runtimeViewerMode === 'metrics' ? `指标刷新: ${selectedMetricsRefreshLabel}` : `日志刷新: ${selectedLogRefreshLabel} · ${logAutoScroll ? '跟随底部' : '滚动暂停'}` }}
        </span>
        <el-button class="runtime-close-button" @click="visible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { Refresh, Delete, VideoPause, Document, TrendCharts, Share, Upload } from "@element-plus/icons-vue";
import { useCloudflared } from "../../composables/useCloudflared.js";
import { useApi } from "../../composables/useApi.js";
import MetricsChart from "./MetricsChart.vue";

const METRICS_REFRESH_OPTIONS = [
  { value: 0, label: "手动" },
  { value: 1000, label: "1s" },
  { value: 3000, label: "3s" },
  { value: 5000, label: "5s" },
  { value: 10000, label: "10s" },
  { value: 30000, label: "30s" },
  { value: 60000, label: "60s" }
];
const LOG_REFRESH_OPTIONS = [
  { value: 0, label: "手动" },
  { value: 1000, label: "1s" },
  { value: 3000, label: "3s" },
  { value: 5000, label: "5s" },
  { value: 10000, label: "10s" },
  { value: 30000, label: "30s" },
  { value: 60000, label: "60s" }
];

const props = defineProps({
  modelValue: Boolean
});
const emit = defineEmits(["update:modelValue"]);

const { state: cfState, refreshCurrentRuntimeViewer, refreshSelectedLogs, refreshSelectedMetrics,
        stopTunnel, resetRuntimeViewer } = useCloudflared();
const { api } = useApi();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val)
});

const metricsRefreshInterval = ref(0);
const metricsRefreshTimer = ref(null);
const logRefreshInterval = ref(5000);
const logRefreshTimer = ref(null);
const logAutoScroll = ref(true);
const logViewerRef = ref(null);
const selectedMetricsRefreshLabel = computed(() => (
  METRICS_REFRESH_OPTIONS.find((option) => option.value === metricsRefreshInterval.value)?.label || "手动"
));
const selectedLogRefreshLabel = computed(() => (
  LOG_REFRESH_OPTIONS.find((option) => option.value === logRefreshInterval.value)?.label || "手动"
));

const LOG_LINE_RE = /^(\S+)\s+(INF|WRN|ERR|DBG|WARN|ERROR|INFO|DEBUG)\s+(.*)$/;
function parseLogLine(line) {
  const m = LOG_LINE_RE.exec(line);
  if (!m) return { time: "", level: "INF", text: line };
  const raw = m[2].toUpperCase();
  let level = "INF";
  if (raw.startsWith("W")) level = "WRN";
  else if (raw.startsWith("E")) level = "ERR";
  else if (raw.startsWith("D")) level = "DBG";
  return { time: m[1], level, text: m[3] };
}
const parsedLogLines = computed(() => cfState.runtimeLogLines.map(parseLogLine));

const METRIC_META = [
  { key: "activeConnections", label: "活动连接", icon: "Share" },
  { key: "bytesUp", label: "上行流量", icon: "Top" },
  { key: "bytesDown", label: "下行流量", icon: "Bottom" },
  { key: "totalRequests", label: "总请求", icon: "DataLine" },
  { key: "errors", label: "错误", icon: "WarningFilled" },
  { key: "uptime", label: "运行时长", icon: "Timer" }
];

const metricsCards = computed(() => {
  const last = cfState.runtimeMetricsHistory?.[cfState.runtimeMetricsHistory.length - 1]?.parsed;
  return METRIC_META.map((m) => ({
    label: m.label,
    icon: m.icon,
    value: last ? last[m.key] : "—"
  }));
});

function selectProcess(tunnelId) {
  cfState.selectedRuntimeTunnelId = tunnelId;
  cfState.runtimeViewerTunnelId = tunnelId;
  refreshCurrentRuntimeViewer({ silent: false });
}

async function handleStop() {
  if (!cfState.selectedRuntimeTunnelId) return;
  try {
    await ElMessageBox.confirm("将停止当前 Tunnel 的本机 cloudflared 进程。", "确认停止 Tunnel", {
      confirmButtonText: "确认停止",
      cancelButtonText: "取消",
      type: "warning",
      customClass: "panel-confirm"
    });
  } catch (_) {
    return;
  }
  await stopTunnel(cfState.selectedRuntimeTunnelId);
}

async function handleClearLogs() {
  if (!cfState.selectedRuntimeTunnelId) return;
  await api(`/api/tunnels/${encodeURIComponent(cfState.selectedRuntimeTunnelId)}/logs/clear`, {
    method: "POST"
  });
  cfState.runtimeLogLines = [];
  cfState.runtimeLogDisplay = "日志已清除。";
  await scrollLogToBottom();
}

async function handleRefresh() {
  if (cfState.runtimeViewerMode === "metrics") {
    await refreshSelectedMetrics();
  } else {
    await refreshSelectedLogs();
  }
}

function clearMetricsRefreshTimer() {
  if (metricsRefreshTimer.value) {
    clearInterval(metricsRefreshTimer.value);
    metricsRefreshTimer.value = null;
  }
}

function clearLogRefreshTimer() {
  if (logRefreshTimer.value) {
    clearInterval(logRefreshTimer.value);
    logRefreshTimer.value = null;
  }
}

function shouldAutoRefreshMetrics() {
  return visible.value &&
    cfState.runtimeViewerMode === "metrics" &&
    Boolean(cfState.selectedRuntimeTunnelId) &&
    metricsRefreshInterval.value > 0;
}

function shouldAutoRefreshLogs() {
  return visible.value &&
    cfState.runtimeViewerMode === "logs" &&
    Boolean(cfState.selectedRuntimeTunnelId) &&
    logRefreshInterval.value > 0;
}

function startMetricsRefreshTimer() {
  clearMetricsRefreshTimer();
  if (!shouldAutoRefreshMetrics()) return;
  metricsRefreshTimer.value = setInterval(() => {
    refreshSelectedMetrics({ silent: true });
  }, metricsRefreshInterval.value);
}

function startLogRefreshTimer() {
  clearLogRefreshTimer();
  if (!shouldAutoRefreshLogs()) return;
  logRefreshTimer.value = setInterval(() => {
    refreshSelectedLogs({ silent: true });
  }, logRefreshInterval.value);
}

function handleMetricsRefreshIntervalChange() {
  startMetricsRefreshTimer();
  if (shouldAutoRefreshMetrics()) {
    refreshSelectedMetrics({ silent: true });
  }
}

function handleLogRefreshIntervalChange() {
  startLogRefreshTimer();
  if (shouldAutoRefreshLogs()) {
    refreshSelectedLogs({ silent: true });
  }
}

async function scrollLogToBottom() {
  if (!logAutoScroll.value || cfState.runtimeViewerMode !== "logs") return;
  await nextTick();
  const el = logViewerRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

function handleLogScroll() {
  const el = logViewerRef.value;
  if (!el || !logAutoScroll.value) return;
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (distanceToBottom > 48) {
    logAutoScroll.value = false;
  }
}

function handleLogAutoScrollChange(value) {
  if (value) {
    scrollLogToBottom();
  }
}

// Auto-refresh when dialog opens
watch(visible, (val) => {
  if (val && cfState.selectedRuntimeTunnelId) {
    refreshCurrentRuntimeViewer();
  }
  if (!val) {
    clearMetricsRefreshTimer();
    clearLogRefreshTimer();
    return;
  }
  startMetricsRefreshTimer();
  startLogRefreshTimer();
});

watch(() => cfState.runtimeViewerMode, () => {
  if (visible.value && cfState.selectedRuntimeTunnelId) {
    refreshCurrentRuntimeViewer();
  }
  startMetricsRefreshTimer();
  startLogRefreshTimer();
});

watch(() => cfState.selectedRuntimeTunnelId, () => {
  if (visible.value && cfState.selectedRuntimeTunnelId) {
    refreshCurrentRuntimeViewer();
  }
  startMetricsRefreshTimer();
  startLogRefreshTimer();
});

watch(() => cfState.runtimeLogDisplay, scrollLogToBottom, { flush: "post" });

onBeforeUnmount(() => {
  clearMetricsRefreshTimer();
  clearLogRefreshTimer();
});
</script>

<style scoped>
.process-tabs { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-3); }
.process-tab {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 var(--space-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-strong);
  background: var(--card-2);
  color: var(--text-2);
  font-size: var(--fs-xs); font-weight: 600;
  cursor: pointer;
  transition: all var(--motion-fast) var(--motion-ease);
}
.process-tab:hover { border-color: var(--accent); color: var(--accent); }
.process-tab.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.process-tab.active .status-dot.ok { background: #fff; }
.process-tab.active .status-dot.idle { background: rgba(255,255,255,0.6); }

.viewer-controls {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
  margin-bottom: var(--space-3); flex-wrap: wrap;
}
.viewer-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; justify-content: flex-end; align-items: center; }
.runtime-refresh-select { width: 98px; }
.runtime-log-autoscroll { min-height: 24px; }

.log-viewer {
  max-height: 400px;
  min-height: 320px;
  overflow-y: auto;
  background: #05070a;
  border-radius: var(--radius-md);
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.7;
}
.log-line { display: flex; gap: 10px; color: #8892a0; white-space: nowrap; }
.log-time { flex-shrink: 0; color: #5b6472; }
.log-level { flex-shrink: 0; font-weight: 600; }
.log-level.inf { color: #4f9bff; }
.log-level.wrn { color: #e0b23e; }
.log-level.err { color: #e5676a; }
.log-level.dbg { color: #8892a0; }
.log-text { white-space: normal; color: #c4cad4; }
.log-fallback { color: #8892a0; font-size: 13px; white-space: pre-wrap; }

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}
.metric-card {
  position: relative;
  padding: var(--space-4);
  text-align: center;
  border-radius: var(--radius-md);
  background: var(--card-2);
  border: 1px solid var(--border);
}
.metric-icon {
  display: inline-grid; place-items: center;
  width: 32px; height: 32px; margin-bottom: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--accent-soft); color: var(--accent); font-size: 16px;
}
.metric-value { font-size: var(--fs-xl); font-weight: 700; color: var(--text); line-height: 1.1; word-break: break-word; }
.metric-label { font-size: var(--fs-xs); color: var(--text-2); margin-top: 4px; font-weight: 600; }
.metric-chart-section {
  grid-column: 1 / -1;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--card-2);
  border: 1px solid var(--border);
}
.metric-chart-title { display: flex; align-items: center; gap: 6px; margin: 0 0 var(--space-2); font-size: var(--fs-sm); font-weight: 700; }
.metric-chart-title .el-icon { color: var(--accent); }
.metric-chart-title:not(:first-child) { margin-top: var(--space-4); }
.runtime-dialog-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  width: 100%;
  min-height: 44px;
}
.auto-refresh-label {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
}
.runtime-close-button { flex: 0 0 auto; }
@media (max-width: 520px) {
  .runtime-dialog-footer { justify-content: space-between; }
  .auto-refresh-label { white-space: normal; }
}
</style>
