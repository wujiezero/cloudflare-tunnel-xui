<template>
  <header class="topbar surface-card">
    <div class="topbar-copy">
      <span class="topbar-kicker">控制台</span>
      <h2 class="page-title">{{ title }}</h2>
    </div>
    <div class="topbar-status">
      <el-tag v-if="cloudflared.runningCount > 0" size="small" type="success">
        {{ cloudflared.runningCount }}/{{ cloudflared.processCount }} 运行
      </el-tag>
      <el-tag v-else size="small" type="info">无运行中进程</el-tag>
      <el-tag v-if="tunnelCount > 0" size="small" effect="plain">
        {{ tunnelCount }} 个 Tunnel
      </el-tag>
    </div>
  </header>
</template>

<script setup>
defineProps({
  title: { type: String, default: "" },
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
  gap: 12px;
  padding: 15px 18px;
  overflow: hidden;
}
.topbar-copy {
  display: grid;
  gap: 2px;
}
.topbar-kicker {
  color: var(--text-secondary, #647693);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}
.topbar-status {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
@media (max-width: 680px) {
  .topbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .topbar-status {
    justify-content: flex-start;
  }
}
</style>
