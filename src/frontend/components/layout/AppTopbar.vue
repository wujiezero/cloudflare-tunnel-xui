<template>
  <header class="topbar surface-card">
    <div class="topbar-copy">
      <span class="kicker">控制台</span>
      <h2 class="page-title">{{ title }}</h2>
      <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
    </div>

    <div class="topbar-trailing">
      <div class="topbar-status">
        <span class="status-pill" :class="cloudflared.runningCount > 0 ? 'is-ok' : 'is-idle'">
          <span class="status-led"></span>
          <el-icon><VideoPlay /></el-icon>
          <span class="status-text">
            {{ cloudflared.runningCount }}/{{ cloudflared.processCount }} 运行
          </span>
        </span>
        <span class="status-pill is-neutral">
          <el-icon><Connection /></el-icon>
          <span class="status-text">{{ tunnelCount }} 个 Tunnel</span>
        </span>
      </div>
      <!-- Per-view primary actions teleport here -->
      <div id="topbar-actions" class="topbar-actions"></div>
    </div>
  </header>
</template>

<script setup>
defineProps({
  title: { type: String, default: "" },
  subtitle: { type: String, default: "" },
  cloudflared: { type: Object, default: () => ({ processCount: 0, runningCount: 0 }) },
  tunnelCount: { type: Number, default: 0 }
});
</script>

<style scoped>
.topbar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  overflow: hidden;
}
.topbar-copy { display: grid; gap: 2px; min-width: 0; }
.page-title {
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.01em;
}
.page-subtitle {
  margin: 2px 0 0;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
}

.topbar-trailing {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}
.topbar-status { display: flex; gap: var(--space-2); flex-wrap: wrap; justify-content: flex-end; }
.topbar-actions { display: flex; gap: var(--space-2); align-items: center; }
.topbar-actions:empty { display: none; }

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line-strong);
  background: var(--panel-strong);
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-secondary);
}
.status-pill .el-icon { font-size: 13px; }
.status-led {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-faint);
}
.status-pill.is-ok {
  color: var(--success);
  border-color: var(--success-soft);
  background: var(--success-soft);
}
.status-pill.is-ok .status-led {
  background: var(--success);
  box-shadow: 0 0 0 3px var(--success-soft);
  animation: led-pulse 2.4s ease-in-out infinite;
}
.status-pill.is-idle .status-led { background: var(--text-faint); }
.status-pill.is-neutral { color: var(--primary); border-color: var(--primary-soft); background: var(--primary-soft); }

@keyframes led-pulse {
  0%, 100% { box-shadow: 0 0 0 2px var(--success-soft); }
  50%      { box-shadow: 0 0 0 5px transparent; }
}

@media (max-width: 720px) {
  .topbar { align-items: flex-start; flex-direction: column; }
  .topbar-trailing { width: 100%; flex-wrap: wrap; }
  .topbar-status { justify-content: flex-start; }
}
@media (prefers-reduced-motion: reduce) {
  .status-pill.is-ok .status-led { animation: none; }
}
</style>
