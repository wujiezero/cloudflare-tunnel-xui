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
          <el-button size="small" @click="handleStop">停止</el-button>
          <el-button size="small" @click="handleClearLogs">清除日志</el-button>
          <el-button size="small" @click="handleRefresh">刷新</el-button>
        </div>
      </div>

      <!-- Content area -->
      <div v-if="cfState.runtimeViewerMode === 'logs'" class="runtime-textarea-wrapper">
        <el-input
          :model-value="cfState.runtimeLogDisplay"
          type="textarea"
          :rows="15"
          readonly
          class="runtime-textarea"
        />
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
      <span class="auto-refresh-label">
        自动刷新: {{ cfState.statusPollTimer ? '5秒轮询' : '已暂停' }}
      </span>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, watch } from "vue";
import { useCloudflared } from "../../composables/useCloudflared.js";
import { useApi } from "../../composables/useApi.js";
import MetricsChart from "./MetricsChart.vue";
import { parseMetricsText, formatJson } from "../../utils/formatters.js";

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
  await stopTunnel(cfState.selectedRuntimeTunnelId);
}

async function handleClearLogs() {
  if (!cfState.selectedRuntimeTunnelId) return;
  await api(`/api/tunnels/${encodeURIComponent(cfState.selectedRuntimeTunnelId)}/logs/clear`, {
    method: "POST"
  });
  cfState.runtimeLogLines = [];
  cfState.runtimeLogDisplay = "日志已清除。";
}

async function handleRefresh() {
  if (cfState.runtimeViewerMode === "metrics") {
    await refreshSelectedMetrics();
  } else {
    await refreshSelectedLogs();
  }
}

// Auto-refresh when dialog opens
watch(visible, (val) => {
  if (val && cfState.selectedRuntimeTunnelId) {
    refreshCurrentRuntimeViewer();
  }
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
.viewer-actions { display: flex; gap: 6px; }
.runtime-textarea-wrapper {
  max-height: 400px;
  overflow-y: auto;
}
.runtime-textarea :deep(textarea) {
  font-family: "Fira Code", "Menlo", monospace;
  font-size: 12px;
  line-height: 1.6;
  background: rgba(0,0,0,0.15);
  color: #e0e0e0;
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
.auto-refresh-label { font-size: 12px; color: var(--text-secondary, #999); }
</style>
