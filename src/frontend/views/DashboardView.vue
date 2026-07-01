<template>
  <div class="dashboard-page page-shell">
    <div class="page-kicker">控制台</div>
    <h1 class="page-title">首页</h1>
    <p class="page-subtitle">Tunnel 与连接器运行总览</p>

    <template v-if="showSkeleton">
      <div class="dashboard-skeleton">
        <div class="status-grid">
          <div v-for="item in skeletonCards" :key="item" class="stat-tile surface-card skeleton-card">
            <div class="skeleton-icon"></div>
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
        <div
          v-for="signal in signals"
          :key="signal.label"
          class="stat-tile surface-card"
          :class="{ 'interactive-surface': signal.to }"
          @click="signal.to && router.push(signal.to)"
        >
          <div class="stat-head">
            <span class="stat-icon"><el-icon><component :is="signal.icon" /></el-icon></span>
            <span class="status-dot" :class="signal.ok ? 'ok' : 'warn'"></span>
          </div>
          <div class="stat-label">{{ signal.label }}</div>
          <div class="stat-value mono">{{ signal.value }}</div>
        </div>
      </transition-group>

      <section v-if="cfState.runtimeMetricsHistory.length > 1" class="chart-section surface-card">
        <h3 class="section-title"><el-icon><TrendCharts /></el-icon>实时指标</h3>
        <div class="chart-row">
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="activeConnections" label="连接数" color="--accent" />
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="bytesUp" label="上行(B)" color="--success" />
        </div>
      </section>

      <section class="dashboard-section">
        <div class="section-head">
          <h3 class="section-title"><el-icon><Connection /></el-icon>Tunnel 快速概览</h3>
          <el-button v-if="tunnels.length" text type="primary" @click="router.push('/tunnels')">
            管理全部<el-icon class="el-icon--right"><ArrowRight /></el-icon>
          </el-button>
        </div>
        <div v-if="tunnels.length" class="tunnel-overview">
          <div
            v-for="t in tunnels.slice(0, 6)"
            :key="t.id"
            class="overview-card surface-card interactive-surface"
            @click="router.push({ path: '/tunnels', query: { edit: t.id } })"
          >
            <div class="overview-header">
              <span class="overview-name">{{ t.name }}</span>
              <el-tag :type="runningTunnels.has(t.id) ? 'success' : 'info'" size="small" round>
                {{ runningTunnels.has(t.id) ? '运行中' : '已停止' }}
              </el-tag>
            </div>
            <div class="overview-mappings">
              <span v-for="d in chipsFor(t).shown" :key="d" class="mapping-chip mono">
                <el-icon><Link /></el-icon>{{ d }}
              </span>
              <span v-if="!mappingCount(t)" class="mapping-empty">未配置路由</span>
              <button v-if="chipsFor(t).hasMore" class="mapping-toggle" type="button" @click.stop="toggleDomains(t.id)">
                {{ chipsFor(t).label }}
              </button>
            </div>
            <div class="overview-footer">
              <div class="overview-meta-group mono">
                <span>{{ t.connections || 0 }} 连接</span>
                <span>{{ mappingCount(t) }} 路由</span>
              </div>
              <span class="overview-edit">编辑<el-icon><ArrowRight /></el-icon></span>
            </div>
          </div>
        </div>
        <div v-else-if="!tunnelsLoading" class="empty-state surface-card">
          <span class="empty-icon"><el-icon><Connection /></el-icon></span>
          <div class="empty-title">还没有 Tunnel</div>
          <div class="empty-desc">先在 Cloudflare 配置中填写凭据，然后创建第一个 Tunnel。</div>
          <el-button type="primary" @click="router.push('/tunnels')">
            <el-icon class="el-icon--left"><Plus /></el-icon>新建 Tunnel
          </el-button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useTunnels } from "../composables/useTunnels.js";
import { useCloudflared } from "../composables/useCloudflared.js";
import { getDomainChips } from "../utils/formatters.js";
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
  { label: "cloudflared", icon: "Cpu", ok: cfState.cloudflared.binaryExists, value: cfState.cloudflared.binaryVersion || (cfState.cloudflared.binaryExists ? '已就绪' : '未安装') },
  { label: "API 凭据", icon: "Key", ok: !!tunnelsState.tunnels.length, value: tunnelsState.tunnels.length ? '已配置' : '未配置', to: "/settings" },
  { label: "运行中进程", icon: "VideoPlay", ok: cfState.cloudflared.runningCount > 0, value: `${cfState.cloudflared.runningCount} / ${cfState.cloudflared.processCount}` },
  { label: "Tunnels", icon: "Connection", ok: tunnelsState.tunnels.length > 0, value: `${tunnelsState.tunnels.length} 个`, to: "/tunnels" }
]);

const expandedDomains = reactive({});
function toggleDomains(tunnelId) {
  expandedDomains[tunnelId] = !expandedDomains[tunnelId];
}
function mappingCount(t) {
  return (t.configuration?.mappings || []).length;
}
function chipsFor(t) {
  const domains = (t.configuration?.mappings || []).map((m) => m.hostname || m.service).filter(Boolean);
  return getDomainChips(domains, 2, !!expandedDomains[t.id]);
}

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
.dashboard-page { gap: 14px; padding-bottom: var(--space-6); }
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin: 22px 0 22px;
}
.dashboard-skeleton { display: grid; gap: 14px; animation: fade-in 180ms ease-out; margin-top: 22px; }

/* Stat tiles */
.stat-tile {
  display: grid;
  gap: 4px;
  padding: 18px;
}
.stat-tile.interactive-surface { cursor: pointer; }
.stat-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.stat-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 16px;
}
.stat-label { font-size: 11.5px; color: var(--text-2); }
.stat-value {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Chart section */
.chart-section { display: grid; gap: 16px; padding: var(--space-5); margin-bottom: 22px; }
.chart-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }

/* Section */
.dashboard-section { display: grid; gap: 16px; min-width: 0; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: 14px; }

/* Overview cards */
.tunnel-overview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}
.overview-card {
  display: grid;
  gap: var(--space-3);
  padding: 20px;
  cursor: pointer;
}
.overview-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: 12px; }
.overview-name { font-weight: 600; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.overview-mappings { display: flex; flex-wrap: wrap; gap: 6px; min-height: 26px; margin-bottom: 14px; }
.mapping-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: var(--radius-xs);
  background: var(--card-2);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-2);
}
.mapping-chip .el-icon { font-size: 10px; color: var(--text-3); }
.mapping-empty { font-size: var(--fs-xs); color: var(--text-3); font-style: italic; }
.mapping-toggle {
  padding: 4px 9px;
  border-radius: var(--radius-xs);
  background: transparent;
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--accent);
  cursor: pointer;
  font-family: inherit;
}
.overview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.overview-meta-group { display: flex; gap: 14px; font-size: 12px; color: var(--text-2); }
.overview-edit {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: var(--fs-xs); font-weight: 600; color: var(--accent);
  opacity: 0; transform: translateX(-4px);
  transition: opacity var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease);
}
.overview-card:hover .overview-edit { opacity: 1; transform: translateX(0); }

/* Skeletons */
.skeleton-card, .skeleton-overview { pointer-events: none; overflow: hidden; position: relative; }
.skeleton-card::after, .skeleton-overview::after, .skeleton-heading::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent);
  animation: skeleton-shimmer 1.15s ease-in-out infinite;
}
.skeleton-icon { width: 32px; height: 32px; border-radius: var(--radius-md); background: var(--card-2); flex-shrink: 0; }
.skeleton-copy { flex: 1; }
.skeleton-line, .skeleton-heading, .skeleton-pill {
  position: relative; overflow: hidden; border-radius: var(--radius-pill); background: var(--card-2);
}
.skeleton-line { width: 72%; height: 12px; margin-top: 8px; }
.skeleton-line.short { width: 38%; height: 10px; margin-top: 0; }
.skeleton-line.wide { width: 68%; }
.skeleton-heading { width: 160px; height: 18px; margin: 0; }
.skeleton-overview { min-height: 96px; }
.skeleton-pill-row { display: flex; gap: 8px; margin-top: 20px; }
.skeleton-pill { display: inline-block; width: 98px; height: 22px; }
.skeleton-pill.narrow { width: 56px; }

.card-stagger-enter-active, .card-stagger-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.card-stagger-enter-from, .card-stagger-leave-to { opacity: 0; transform: translateY(6px); }

@keyframes skeleton-shimmer { 100% { transform: translateX(100%); } }

@media (max-width: 900px) { .chart-row { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) {
  .card-stagger-enter-active, .card-stagger-leave-active,
  .dashboard-skeleton, .skeleton-card::after, .skeleton-overview::after, .skeleton-heading::after,
  .overview-edit { animation: none; transition: none; }
  .card-stagger-enter-from, .card-stagger-leave-to { transform: none; }
}
</style>
