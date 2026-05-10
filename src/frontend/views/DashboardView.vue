<template>
  <div class="dashboard-page page-shell">
    <template v-if="showSkeleton">
      <div class="dashboard-skeleton">
        <div class="status-grid">
          <div v-for="item in skeletonCards" :key="item" class="signal-card surface-card skeleton-card">
            <div class="skeleton-dot"></div>
            <div class="skeleton-copy">
              <div class="skeleton-line short"></div>
              <div class="skeleton-line"></div>
            </div>
          </div>
        </div>
        <div class="skeleton-heading"></div>
        <div class="tunnel-overview">
          <div v-for="index in 3" :key="index" class="overview-card surface-card skeleton-overview">
            <div class="skeleton-line wide"></div>
            <div class="skeleton-pill-row">
              <span class="skeleton-pill"></span>
              <span class="skeleton-pill narrow"></span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <transition-group name="card-stagger" tag="div" class="status-grid">
        <div class="signal-card surface-card interactive-surface" v-for="signal in signals" :key="signal.label">
          <div class="signal-dot" :class="signal.ok ? 'ok' : 'warn'"></div>
          <div>
            <div class="signal-label">{{ signal.label }}</div>
            <div class="signal-value">{{ signal.value }}</div>
          </div>
        </div>
      </transition-group>

      <div v-if="cfState.runtimeMetricsHistory.length > 1" class="chart-section surface-card">
        <h3>实时指标</h3>
        <div class="chart-row">
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="activeConnections" label="连接数" color="#67c23a" />
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="bytesUp" label="上行(B)" color="#409eff" />
        </div>
      </div>

      <el-divider />
      <h3>Tunnel 快速概览</h3>
      <div v-if="tunnels.length" class="tunnel-overview">
        <div
          v-for="t in tunnels.slice(0, 6)"
          :key="t.id"
          class="overview-card surface-card interactive-surface clickable"
          @click="router.push(`/tunnels/${t.id}/edit`)"
        >
          <div class="overview-header">
            <span class="overview-name">{{ t.name }}</span>
            <div class="overview-badges">
              <el-tag :type="runningTunnels.has(t.id) ? 'success' : 'info'" size="small">
                {{ runningTunnels.has(t.id) ? '运行中' : '已停止' }}
              </el-tag>
              <span class="conn-count">{{ t.connections || 0 }} 连接</span>
            </div>
          </div>
          <div class="overview-mappings">
            <span v-for="m in (t.configuration?.mappings || []).slice(0, 2)" :key="m.hostname || m.service" class="mapping-chip">
              {{ m.hostname || m.service || '(默认)' }}
            </span>
            <span v-if="(t.configuration?.mappings || []).length > 2" class="mapping-more">
              +{{ (t.configuration?.mappings || []).length - 2 }}
            </span>
          </div>
        </div>
        <div v-if="tunnels.length > 6" class="view-all-card surface-card interactive-surface" @click="router.push('/tunnels')">
          查看全部 {{ tunnels.length }} 个 Tunnel →
        </div>
      </div>
      <el-empty v-else-if="!tunnelsLoading" description="暂无 Tunnel" />
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useTunnels } from "../composables/useTunnels.js";
import { useCloudflared } from "../composables/useCloudflared.js";
import MetricsChart from "../components/monitoring/MetricsChart.vue";

const router = useRouter();
const { state: tunnelsState, loadTunnels } = useTunnels();
const { state: cfState, refreshRuntimeStatus } = useCloudflared();

const tunnels = computed(() => tunnelsState.tunnels);
const tunnelsLoading = computed(() => tunnelsState.tunnelsLoading);
const dashboardLoading = ref(false);
const skeletonCards = ["cloudflared", "credentials", "runtime", "tunnels"];
const showSkeleton = computed(() => dashboardLoading.value && !tunnels.value.length);

const runningTunnels = computed(() => {
  const set = new Set();
  for (const p of cfState.cloudflared.processes || []) {
    if (p.running) set.add(p.tunnelId);
  }
  return set;
});

const signals = computed(() => [
  { label: "cloudflared", ok: cfState.cloudflared.binaryExists, value: cfState.cloudflared.binaryVersion || (cfState.cloudflared.binaryExists ? '已就绪' : '未安装') },
  { label: "API 凭据", ok: !!tunnelsState.tunnels.length, value: tunnelsState.tunnels.length ? '已配置' : '未配置' },
  { label: "运行中", ok: cfState.cloudflared.runningCount > 0, value: `${cfState.cloudflared.runningCount} / ${cfState.cloudflared.processCount}` },
  { label: "Tunnels", ok: tunnelsState.tunnels.length > 0, value: `${tunnelsState.tunnels.length} 个` }
]);

onMounted(async () => {
  dashboardLoading.value = true;
  try {
    await Promise.all([loadTunnels(), refreshRuntimeStatus()]);
  } finally {
    dashboardLoading.value = false;
  }
});
</script>

<style scoped>
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
.dashboard-skeleton {
  animation: skeleton-enter 180ms ease-out;
}
.signal-card {
  display: flex; align-items: center; gap: 12px; padding: 16px;
  border-radius: 14px;
  background: var(--glass-bg, rgba(255,255,255,0.06));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}
.skeleton-card,
.skeleton-overview {
  pointer-events: none;
  overflow: hidden;
  position: relative;
}
.skeleton-card::after,
.skeleton-overview::after,
.skeleton-heading::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
  animation: skeleton-shimmer 1.15s ease-in-out infinite;
}
.skeleton-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgba(126, 158, 208, 0.30);
  flex-shrink: 0;
}
.skeleton-copy {
  flex: 1;
}
.skeleton-line,
.skeleton-heading,
.skeleton-pill {
  position: relative;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(126, 158, 208, 0.22);
}
.skeleton-line {
  width: 72%;
  height: 12px;
  margin-top: 8px;
}
.skeleton-line.short {
  width: 38%;
  height: 10px;
  margin-top: 0;
}
.skeleton-line.wide {
  width: 68%;
}
.skeleton-heading {
  width: 150px;
  height: 16px;
  margin: 28px 0 14px;
}
.skeleton-overview {
  min-height: 88px;
}
.skeleton-pill-row {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}
.skeleton-pill {
  display: inline-block;
  width: 98px;
  height: 22px;
}
.skeleton-pill.narrow {
  width: 56px;
}
.signal-card:hover {
  transform: translateY(-1px);
  border-color: var(--line-strong, rgba(92, 126, 178, 0.30));
  box-shadow: var(--shadow-soft, 0 10px 28px rgba(50, 80, 130, 0.10));
}
.signal-dot {
  width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
}
.signal-dot.ok { background: #67c23a; }
.signal-dot.warn { background: #e6a23c; }
.signal-label { font-size: 12px; color: var(--text-secondary, #999); }
.signal-value { font-size: 14px; font-weight: 500; margin-top: 2px; }
.chart-section { padding: 20px; border-radius: 16px; margin-bottom: 16px; }
.chart-section h3 { margin: 0 0 16px; font-size: 16px; }
.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
h3 { margin: 0 0 12px; font-size: 16px; }
.tunnel-overview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}
.overview-card {
  padding: 16px;
  border-radius: 12px;
  background: var(--glass-bg, rgba(255,255,255,0.04));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.06));
  cursor: pointer;
  transition: background 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}
.overview-card:hover {
  background: var(--glass-bg-hover, rgba(255,255,255,0.08));
  transform: translateY(-1px);
  box-shadow: var(--shadow-soft, 0 10px 28px rgba(50, 80, 130, 0.10));
}
.overview-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
}
.overview-name { font-weight: 600; font-size: 14px; }
.overview-badges { display: flex; align-items: center; gap: 8px; }
.conn-count { font-size: 12px; color: var(--text-secondary, #999); }
.mapping-chip {
  display: inline-block;
  padding: 2px 8px; margin: 2px;
  border-radius: 6px;
  background: var(--glass-bg, rgba(255,255,255,0.06));
  font-size: 12px;
}
.mapping-more { font-size: 12px; color: var(--text-secondary, #999); margin-left: 4px; }
.view-all-card {
  padding: 16px;
  border-radius: 12px;
  border: 1px dashed var(--glass-border, rgba(255,255,255,0.15));
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; font-size: 13px; color: var(--text-secondary, #999);
}
.view-all-card:hover { background: var(--glass-bg-hover, rgba(255,255,255,0.04)); }
.card-stagger-enter-active,
.card-stagger-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.card-stagger-enter-from,
.card-stagger-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
@keyframes skeleton-shimmer {
  100% { transform: translateX(100%); }
}
@keyframes skeleton-enter {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .signal-card,
  .overview-card,
  .card-stagger-enter-active,
  .card-stagger-leave-active,
  .dashboard-skeleton,
  .skeleton-card::after,
  .skeleton-overview::after,
  .skeleton-heading::after {
    animation: none;
    transition: none;
  }
  .signal-card:hover,
  .overview-card:hover,
  .card-stagger-enter-from,
  .card-stagger-leave-to {
    transform: none;
  }
}
</style>
