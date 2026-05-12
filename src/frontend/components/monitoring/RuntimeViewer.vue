<template>
  <el-dialog v-model="visible" title="运行时监控" width="800px" destroy-on-close class="glass-dialog runtime-dialog">
    <template v-if="cfState.selectedRuntimeTunnelId">
      <!-- Process selection tabs -->
      <div class="process-tabs">
        <el-tag
          v-for="p in cfState.cloudflared.processes"
          :key="p.tunnelId"
          :type="p.tunnelId === cfState.selectedRuntimeTunnelId ? 'primary' : 'info'"
          class="process-tab"
          @click="selectProcess(p.tunnelId)"
        >
          {{ p.name || p.tunnelId?.slice(0, 8) }}
          <span :class="p.running ? 'dot-online' : 'dot-offline'"></span>
        </el-tag>
      </div>

      <!-- Mode switch -->
      <div class="viewer-controls">
        <el-radio-group v-model="cfState.runtimeViewerMode" size="small">
          <el-radio-button value="logs">日志</el-radio-button>
          <el-radio-button value="metrics">指标</el-radio-button>
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
          <el-button size="small" @click="handleStop">停止</el-button>
          <el-button size="small" @click="handleClearLogs">清除日志</el-button>
          <el-button size="small" @click="handleRefresh">刷新</el-button>
        </div>
      </div>

      <!-- Content area -->
      <div v-if="cfState.runtimeViewerMode === 'logs'" class="runtime-textarea-wrapper">
        <textarea
          ref="logTextareaRef"
          :value="cfState.runtimeLogDisplay"
          readonly
          class="runtime-textarea runtime-log-textarea"
          @scroll="handleLogScroll"
        ></textarea>
      </div>

      <div v-else class="metrics-grid">
        <div class="metric-card" v-for="m in metricsCards" :key="m.label">
          <div class="metric-value">{{ m.value }}</div>
          <div class="metric-label">{{ m.label }}</div>
        </div>
        <div class="metric-chart-section" v-if="cfState.runtimeMetricsHistory.length > 1">
          <h4>活动连接</h4>
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="activeConnections" label="连接数" color="#67c23a" />
          <h4>流量</h4>
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="bytesUp" label="上行(B)" color="#409eff" />
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="bytesDown" label="下行(B)" color="#f38020" />
        </div>
      </div>
    </template>
    <el-empty v-else description="无运行中进程" />

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
import { useCloudflared } from "../../composables/useCloudflared.js";
import { useApi } from "../../composables/useApi.js";
import MetricsChart from "./MetricsChart.vue";
import { parseMetricsText, formatJson } from "../../utils/formatters.js";

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
const logTextareaRef = ref(null);
const selectedMetricsRefreshLabel = computed(() => (
  METRICS_REFRESH_OPTIONS.find((option) => option.value === metricsRefreshInterval.value)?.label || "手动"
));
const selectedLogRefreshLabel = computed(() => (
  LOG_REFRESH_OPTIONS.find((option) => option.value === logRefreshInterval.value)?.label || "手动"
));

const metricsCards = computed(() => {
  const last = cfState.runtimeMetricsHistory?.[cfState.runtimeMetricsHistory.length - 1]?.parsed;
  if (!last) return [
    { label: "活动连接", value: "—" },
    { label: "上行流量", value: "—" },
    { label: "下行流量", value: "—" },
    { label: "总请求", value: "—" },
    { label: "错误", value: "—" },
    { label: "运行时长", value: "—" }
  ];
  return [
    { label: "活动连接", value: last.activeConnections },
    { label: "上行流量", value: last.bytesUp },
    { label: "下行流量", value: last.bytesDown },
    { label: "总请求", value: last.totalRequests },
    { label: "错误", value: last.errors },
    { label: "运行时长", value: last.uptime }
  ];
});

const metricsHistoryPreview = computed(() => {
  return cfState.runtimeMetricsHistory.map((h) => {
    const p = h.parsed;
    return `${new Date(h.time).toLocaleTimeString()} | 连接:${p.activeConnections} 上行:${p.bytesUp}`;
  }).join("\n");
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
      type: "warning"
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
  const textarea = logTextareaRef.value;
  if (!textarea) return;
  textarea.scrollTop = textarea.scrollHeight;
}

function handleLogScroll() {
  const textarea = logTextareaRef.value;
  if (!textarea || !logAutoScroll.value) return;
  const distanceToBottom = textarea.scrollHeight - textarea.scrollTop - textarea.clientHeight;
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
.process-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.process-tab { cursor: pointer; display: flex; align-items: center; gap: 4px; }
.dot-online, .dot-offline {
  display: inline-block; width: 6px; height: 6px; border-radius: 50%;
}
.dot-online { background: #67c23a; }
.dot-offline { background: #909399; }
.viewer-controls {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
}
.viewer-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.runtime-refresh-select {
  width: 98px;
}
.runtime-log-autoscroll {
  min-height: 24px;
}
.runtime-textarea-wrapper {
  max-height: 400px;
  overflow-y: auto;
}
.runtime-log-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 400px;
  resize: vertical;
  border: 1px solid rgba(92, 126, 178, 0.28);
  border-radius: 8px;
  padding: 12px 14px;
  font-family: "Fira Code", "Menlo", monospace;
  font-size: 12px;
  line-height: 1.6;
  background: rgba(0,0,0,0.15);
  color: #e0e0e0;
  outline: none;
  scrollbar-width: thin;
  scrollbar-color: rgba(92, 126, 178, 0.20) transparent;
}
.runtime-log-textarea::-webkit-scrollbar {
  width: 8px;
}
.runtime-log-textarea::-webkit-scrollbar-track {
  background: transparent;
}
.runtime-log-textarea::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(92, 126, 178, 0.22);
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.metric-card {
  padding: 16px;
  text-align: center;
  border-radius: 12px;
  background: var(--glass-bg, rgba(255,255,255,0.04));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
}
.metric-value { font-size: 22px; font-weight: 700; color: var(--el-color-primary, #f38020); }
.metric-label { font-size: 12px; color: var(--text-secondary, #999); margin-top: 4px; }
.metric-chart-section {
  grid-column: 1 / -1;
  padding: 16px;
  border-radius: 12px;
  background: var(--glass-bg, rgba(255,255,255,0.04));
}
.metric-chart-section h4 { margin: 0 0 8px; }
.mini-preview { font-size: 11px; font-family: "Fira Code", monospace; white-space: pre-wrap; }
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
  color: var(--text-secondary, #999);
  white-space: nowrap;
}
.runtime-close-button {
  flex: 0 0 auto;
}
@media (max-width: 520px) {
  .runtime-dialog-footer {
    justify-content: space-between;
  }
  .auto-refresh-label {
    white-space: normal;
  }
}
</style>
