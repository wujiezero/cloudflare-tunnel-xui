<template>
  <header class="topbar">
    <h2 class="page-title">{{ title }}</h2>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--glass-border, rgba(255,255,255,0.08));
}
.page-title { margin: 0; font-size: 20px; font-weight: 600; }
.topbar-status { display: flex; gap: 8px; }
</style>
