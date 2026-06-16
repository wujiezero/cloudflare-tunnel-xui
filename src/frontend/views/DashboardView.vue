<template>
  <div class="dashboard-page page-shell">
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
        <div class="stat-tile surface-card interactive-surface" v-for="signal in signals" :key="signal.label">
          <span class="stat-icon" :class="signal.ok ? 'ok' : 'warn'">
            <el-icon><component :is="signal.icon" /></el-icon>
          </span>
          <div class="stat-body">
            <div class="stat-label">{{ signal.label }}</div>
            <div class="stat-value">{{ signal.value }}</div>
          </div>
          <span class="stat-dot" :class="signal.ok ? 'ok' : 'warn'"></span>
        </div>
      </transition-group>

      <section v-if="cfState.runtimeMetricsHistory.length > 1" class="chart-section surface-card">
        <h3 class="section-title"><el-icon><TrendCharts /></el-icon>实时指标</h3>
        <div class="chart-row">
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="activeConnections" label="连接数" color="#2a6df6" />
          <MetricsChart :history="cfState.runtimeMetricsHistory" data-key="bytesUp" label="上行(B)" color="#1a9960" />
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
            @click="router.push(`/tunnels/${t.id}/edit`)"
          >
            <div class="overview-header">
              <span class="overview-name">{{ t.name }}</span>
              <el-tag :type="runningTunnels.has(t.id) ? 'success' : 'info'" size="small" round>
                {{ runningTunnels.has(t.id) ? '运行中' : '已停止' }}
              </el-tag>
            </div>
            <div class="overview-mappings">
              <span v-for="m in (t.configuration?.mappings || []).slice(0, 2)" :key="m.hostname || m.service" class="mapping-chip">
                <el-icon><Link /></el-icon>{{ m.hostname || m.service || '(默认)' }}
              </span>
              <span v-if="!(t.configuration?.mappings || []).length" class="mapping-empty">未配置路由</span>
              <span v-if="(t.configuration?.mappings || []).length > 2" class="mapping-more">
                +{{ (t.configuration?.mappings || []).length - 2 }}
              </span>
            </div>
            <div class="overview-footer">
              <span class="overview-meta"><el-icon><Share /></el-icon>{{ t.connections || 0 }} 连接</span>
              <span class="overview-edit">编辑<el-icon><ArrowRight /></el-icon></span>
            </div>
          </div>
        </div>
        <div v-else-if="!tunnelsLoading" class="empty-state surface-card">
          <span class="empty-icon"><el-icon><Connection /></el-icon></span>
          <div class="empty-title">还没有 Tunnel</div>
          <div class="empty-desc">先在 Cloudflare 配置中填写凭据，然后创建第一个 Tunnel。</div>
          <el-button type="primary" @click="router.push('/tunnels/create')">
            <el-icon class="el-icon--left"><Plus /></el-icon>新建 Tunnel
          </el-button>
        </div>
      </section>
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
  { label: "cloudflared", icon: "Cpu", ok: cfState.cloudflared.binaryExists, value: cfState.cloudflared.binaryVersion || (cfState.cloudflared.binaryExists ? '已就绪' : '未安装') },
  { label: "API 凭据", icon: "Key", ok: !!tunnelsState.tunnels.length, value: tunnelsState.tunnels.length ? '已配置' : '未配置' },
  { label: "运行中进程", icon: "VideoPlay", ok: cfState.cloudflared.runningCount > 0, value: `${cfState.cloudflared.runningCount} / ${cfState.cloudflared.processCount}` },
  { label: "Tunnels", icon: "Connection", ok: tunnelsState.tunnels.length > 0, value: `${tunnelsState.tunnels.length} 个` }
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
.dashboard-page {
  --dashboard-gap: 20px;
  --dashboard-card-gap: 16px;
  gap: var(--dashboard-gap);
  padding-bottom: var(--space-6);
}
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--dashboard-card-gap);
  margin: 0;
}
.dashboard-skeleton { display: grid; gap: var(--dashboard-gap); animation: skeleton-enter 180ms ease-out; }

/* Stat tiles */
.stat-tile {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.stat-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  font-size: 20px;
}
.stat-icon.ok   { background: var(--primary-soft); color: var(--primary); }
.stat-icon.warn { background: var(--warn-soft); color: var(--warn); }
.stat-body { flex: 1; min-width: 0; }
.stat-label { font-size: var(--fs-xs); color: var(--text-secondary); font-weight: 600; }
.stat-value {
  font-size: var(--fs-md);
  font-weight: 700;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.stat-dot.ok   { background: var(--success); box-shadow: 0 0 0 3px var(--success-soft); }
.stat-dot.warn { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); }

/* Chart section */
.chart-section { display: grid; gap: var(--dashboard-card-gap); padding: var(--space-5); border-radius: var(--radius-lg); margin: 0; }
.chart-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--dashboard-card-gap); }

/* Section */
.dashboard-section { display: grid; gap: var(--dashboard-card-gap); min-width: 0; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }

/* Overview cards */
.tunnel-overview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--dashboard-card-gap);
}
.overview-card {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.overview-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.overview-name { font-weight: 700; font-size: var(--fs-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.overview-mappings { display: flex; flex-wrap: wrap; gap: 6px; min-height: 24px; }
.mapping-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--panel-soft);
  border: 1px solid var(--line);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mapping-chip .el-icon { font-size: 11px; color: var(--primary); flex-shrink: 0; }
.mapping-empty { font-size: var(--fs-xs); color: var(--text-faint); font-style: italic; }
.mapping-more { font-size: var(--fs-xs); color: var(--text-secondary); align-self: center; }
.overview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-2);
  border-top: 1px solid var(--line);
}
.overview-meta { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--text-secondary); }
.overview-meta .el-icon { font-size: 12px; }
.overview-edit {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: var(--fs-xs); font-weight: 600; color: var(--primary);
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
.skeleton-icon { width: 40px; height: 40px; border-radius: var(--radius-sm); background: rgba(126,158,208,0.22); flex-shrink: 0; }
.skeleton-copy { flex: 1; }
.skeleton-line, .skeleton-heading, .skeleton-pill {
  position: relative; overflow: hidden; border-radius: var(--radius-pill); background: rgba(126,158,208,0.22);
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
@keyframes skeleton-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 900px) { .chart-row { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) {
  .stat-tile, .overview-card, .card-stagger-enter-active, .card-stagger-leave-active,
  .dashboard-skeleton, .skeleton-card::after, .skeleton-overview::after, .skeleton-heading::after,
  .overview-edit { animation: none; transition: none; }
  .card-stagger-enter-from, .card-stagger-leave-to { transform: none; }
  .overview-card:hover .overview-edit { transform: none; }
}
</style>
