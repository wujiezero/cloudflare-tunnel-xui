<template>
  <div class="tunnels-page page-shell">
    <div class="toolbar toolbar-surface">
      <div class="toolbar-left">
        <el-input
          v-model="tunnelsState.tunnelSearch"
          placeholder="搜索 Tunnel 名称或 ID"
          clearable
          prefix-icon="Search"
          class="search-input"
          size="default"
        />
        <el-select v-model="tunnelsState.tunnelSort" class="sort-select" size="default">
          <el-option label="名称" value="name" />
          <el-option label="创建时间" value="createdAt" />
          <el-option label="连接数" value="connections" />
          <el-option label="路由数" value="mappings" />
        </el-select>
        <el-button @click="toggleSortOrder" size="default">
          {{ tunnelsState.tunnelSortOrder === 'asc' ? '↑ 升序' : '↓ 降序' }}
        </el-button>
      </div>
      <div class="toolbar-right">
        <el-button type="primary" @click="router.push('/tunnels/create')">
          新建 Tunnel
        </el-button>
        <el-button @click="handleExport" :loading="exporting">导出</el-button>
        <el-button @click="showImport = true">导入</el-button>
      </div>
    </div>

    <div v-if="exporting" class="inline-status surface-card">
      <span class="inline-spinner"></span>
      <span>正在导出 Tunnel 配置...</span>
    </div>

    <div v-if="tunnelsState.tunnelSelection.length" class="batch-bar surface-card">
      <span>已选择 {{ tunnelsState.tunnelSelection.length }} 个</span>
      <el-button size="small" @click="batchStart" :loading="tunnelsState.batchActionLoading">批量启动</el-button>
      <el-button size="small" @click="batchStop" :loading="tunnelsState.batchActionLoading">批量停止</el-button>
      <el-popconfirm title="确认批量删除?" @confirm="batchDelete">
        <template #reference>
          <el-button size="small" type="danger" :loading="tunnelsState.batchActionLoading">批量删除</el-button>
        </template>
      </el-popconfirm>
      <el-button size="small" text @click="tunnelsState.tunnelSelection = []">取消选择</el-button>
    </div>

    <div v-if="showSkeleton" class="tunnel-list-skeleton">
      <div v-for="index in 4" :key="index" class="skeleton-tunnel-card surface-card">
        <div class="skeleton-row">
          <span class="skeleton-checkbox"></span>
          <span class="skeleton-line title"></span>
          <span class="skeleton-pill"></span>
          <span class="skeleton-line count"></span>
        </div>
        <div class="skeleton-tags">
          <span class="skeleton-tag"></span>
          <span class="skeleton-tag wide"></span>
          <span class="skeleton-tag short"></span>
        </div>
        <div class="skeleton-actions">
          <span class="skeleton-button"></span>
          <span class="skeleton-button"></span>
          <span class="skeleton-button"></span>
        </div>
      </div>
    </div>

    <transition-group v-else-if="filteredTunnels.length" name="list" tag="div" class="tunnel-list">
      <div v-for="t in filteredTunnels" :key="t.id" class="tunnel-card surface-card interactive-surface"
           :class="{
             selected: tunnelsState.tunnelSelection.includes(t.id),
             'is-action-running': isTunnelActionPending(t.id)
           }">
        <div class="tunnel-card-header">
          <el-checkbox
            :model-value="tunnelsState.tunnelSelection.includes(t.id)"
            @change="toggleTunnelSelection(t.id)"
          />
          <div class="tunnel-name">{{ t.name }}</div>
          <el-tag v-if="t.status === 'healthy' || runningTunnels.has(t.id)" type="success" size="small">在线</el-tag>
          <el-tag v-else type="info" size="small">离线</el-tag>
          <span class="tunnel-connections">{{ t.connections || 0 }} 连接</span>
        </div>
        <div class="tunnel-card-mappings">
          <span v-for="m in (t.configuration?.mappings || []).slice(0, 3)" :key="m.hostname || m.service" class="mapping-tag">
            {{ m.hostname || m.service }}
          </span>
          <span v-if="(t.configuration?.mappings || []).length > 3" class="mapping-more">
            +{{ (t.configuration?.mappings || []).length - 3 }}
          </span>
        </div>
        <div class="tunnel-card-actions">
          <el-button size="small" :type="runningTunnels.has(t.id) ? 'danger' : 'success'"
                     class="tunnel-action-button"
                     :class="{
                       'is-starting': actionState.type === 'start' && actionState.tunnelId === t.id,
                       'is-stopping': actionState.type === 'stop' && actionState.tunnelId === t.id
                     }"
                     :loading="isTunnelActionPending(t.id)"
                     :disabled="isTunnelActionPending(t.id)"
                     @click="handleTunnelAction(t)">
            <span class="tunnel-action-label">
              {{ getTunnelActionLabel(t) }}
            </span>
          </el-button>
          <el-button size="small" @click="handleOpenLogs(t)">日志</el-button>
          <el-button size="small" @click="handleEdit(t.id)">编辑</el-button>
          <el-popconfirm title="确认删除此 Tunnel?" @confirm="deleteTunnel(t.id)">
            <template #reference>
              <el-button size="small" type="danger" plain :disabled="t.connections > 0">
                删除
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>
    </transition-group>

    <el-empty v-else-if="!tunnelsState.tunnelsLoading" description="暂无 Tunnel" />

    <!-- Import Dialog -->
    <el-dialog v-model="showImport" title="导入 Tunnel 配置" width="600px" class="glass-dialog">
      <el-input v-model="importJson" type="textarea" rows="10" placeholder="粘贴导入的 JSON 数据..." />
      <template #footer>
        <el-button @click="showImport = false">取消</el-button>
        <el-button type="primary" @click="handleImport" :loading="importing">导入</el-button>
      </template>
    </el-dialog>

    <!-- Runtime Viewer Dialog -->
    <RuntimeViewer v-model="showRuntime" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import { ElMessageBox } from "element-plus";
import { useTunnels } from "../composables/useTunnels.js";
import { useCloudflared } from "../composables/useCloudflared.js";
import { useApi } from "../composables/useApi.js";

const router = useRouter();
const { state: tunnelsState, filteredTunnels, loadTunnels, deleteTunnel,
        toggleTunnelSelection, exportTunnels, importTunnels, batchAction } = useTunnels();
const { state: cfState, startTunnel, stopTunnel, openTunnelLogs, refreshRuntimeStatus } = useCloudflared();
const { notify } = useApi();

import RuntimeViewer from "../components/monitoring/RuntimeViewer.vue";

const showImport = ref(false);
const importJson = ref("");
const importing = ref(false);
const exporting = ref(false);
const showRuntime = ref(false);
const actionState = ref({ tunnelId: null, type: "" });
const showSkeleton = computed(() => tunnelsState.tunnelsLoading && !tunnelsState.tunnels.length);

const runningTunnels = computed(() => {
  const set = new Set();
  for (const p of cfState.cloudflared.processes || []) {
    if (p.running) set.add(p.tunnelId);
  }
  return set;
});

function toggleSortOrder() {
  tunnelsState.tunnelSortOrder = tunnelsState.tunnelSortOrder === "asc" ? "desc" : "asc";
}

async function handleExport() {
  exporting.value = true;
  try {
    await exportTunnels();
  } catch (e) {
    notify(e.message, "error");
  } finally {
    exporting.value = false;
  }
}

async function handleImport() {
  importing.value = true;
  try {
    await importTunnels(importJson.value);
    showImport.value = false;
    importJson.value = "";
  } finally {
    importing.value = false;
  }
}

async function batchStart() {
  await batchAction("start");
  await refreshRuntimeStatus();
}

async function batchStop() {
  const confirmed = await confirmStopAction({
    title: "确认批量停止",
    message: `将停止已选择的 ${tunnelsState.tunnelSelection.length} 个 Tunnel 进程。`
  });
  if (!confirmed) return;
  await batchAction("stop");
  await refreshRuntimeStatus();
}

async function batchDelete() {
  await batchAction("delete");
}

function isTunnelActionPending(tunnelId) {
  return actionState.value.tunnelId === tunnelId;
}

function getTunnelActionLabel(tunnel) {
  if (actionState.value.tunnelId === tunnel.id) {
    return actionState.value.type === "start" ? "启动中" : "停止中";
  }
  return runningTunnels.value.has(tunnel.id) ? "停止" : "启动";
}

async function confirmStopAction({ title, message }) {
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText: "确认停止",
      cancelButtonText: "取消",
      type: "warning"
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function handleTunnelAction(tunnel) {
  if (isTunnelActionPending(tunnel.id)) return;
  const type = runningTunnels.value.has(tunnel.id) ? "stop" : "start";
  if (type === "stop") {
    const confirmed = await confirmStopAction({
      title: "确认停止 Tunnel",
      message: `将停止 Tunnel「${tunnel.name || tunnel.id}」的本机 cloudflared 进程。`
    });
    if (!confirmed) return;
  }
  actionState.value = { tunnelId: tunnel.id, type };
  try {
    if (type === "stop") {
      await stopTunnel(tunnel.id);
    } else {
      await startTunnel(tunnel.id);
    }
  } finally {
    actionState.value = { tunnelId: null, type: "" };
  }
}

function handleOpenLogs(tunnel) {
  openTunnelLogs(tunnel);
  showRuntime.value = true;
}

function handleEdit(tunnelId) {
  router.push(`/tunnels/${tunnelId}/edit`);
}

onMounted(loadTunnels);
</script>

<style scoped>
.toolbar {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px;
}
.toolbar-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.search-input { width: 280px; }
.sort-select { width: 130px; }
.batch-bar {
  display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  margin-bottom: 12px; border-radius: 10px;
  background: var(--glass-bg, rgba(255,255,255,0.06));
}
.inline-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  border-radius: 10px;
  background: var(--glass-bg, rgba(255,255,255,0.06));
  color: var(--text-secondary, #999);
  font-size: 12px;
}
.inline-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(42, 109, 246, 0.18);
  border-top-color: var(--el-color-primary, #f38020);
  border-radius: 50%;
  animation: inline-spin 0.8s linear infinite;
}
.tunnel-list { display: flex; flex-direction: column; gap: 12px; }
.tunnel-list-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.skeleton-tunnel-card {
  position: relative;
  overflow: hidden;
  padding: 16px;
  border-radius: 14px;
  background: var(--glass-bg, rgba(255,255,255,0.04));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
}
.skeleton-tunnel-card::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
  animation: skeleton-shimmer 1.15s ease-in-out infinite;
}
.skeleton-row,
.skeleton-tags,
.skeleton-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.skeleton-row {
  margin-bottom: 12px;
}
.skeleton-tags {
  margin-bottom: 12px;
}
.skeleton-checkbox,
.skeleton-line,
.skeleton-pill,
.skeleton-tag,
.skeleton-button {
  display: inline-block;
  border-radius: 999px;
  background: rgba(126, 158, 208, 0.22);
}
.skeleton-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 5px;
}
.skeleton-line.title {
  width: 180px;
  height: 16px;
}
.skeleton-line.count {
  width: 54px;
  height: 12px;
}
.skeleton-pill {
  width: 46px;
  height: 22px;
}
.skeleton-tag {
  width: 96px;
  height: 22px;
}
.skeleton-tag.wide {
  width: 140px;
}
.skeleton-tag.short {
  width: 64px;
}
.skeleton-button {
  width: 56px;
  height: 28px;
  border-radius: 8px;
}
.tunnel-card {
  padding: 16px; border-radius: 14px;
  background: var(--glass-bg, rgba(255,255,255,0.04));
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}
.tunnel-card:hover {
  background: var(--glass-bg-hover, rgba(255,255,255,0.07));
  transform: translateY(-1px);
  box-shadow: var(--shadow-soft, 0 10px 28px rgba(50, 80, 130, 0.10));
}
.tunnel-card.is-action-running {
  border-color: rgba(64, 158, 255, 0.38);
  background:
    radial-gradient(circle at 18px 18px, rgba(64, 158, 255, 0.16), transparent 28px),
    var(--glass-bg-hover, rgba(255,255,255,0.07));
  box-shadow: var(--shadow-soft, 0 10px 28px rgba(50, 80, 130, 0.10)), 0 0 0 1px rgba(64, 158, 255, 0.10);
}
.tunnel-card.selected { border-color: var(--el-color-primary, #f38020); }
.tunnel-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.tunnel-name { font-weight: 600; font-size: 15px; flex: 1; }
.tunnel-connections { font-size: 12px; color: var(--text-secondary, #999); }
.tunnel-card-mappings { margin-bottom: 10px; }
.mapping-tag {
  display: inline-block; padding: 2px 8px; margin: 2px;
  border-radius: 6px; background: var(--glass-bg, rgba(255,255,255,0.06));
  font-size: 12px;
}
.mapping-more { font-size: 12px; color: var(--text-secondary, #999); }
.tunnel-card-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.tunnel-action-button {
  position: relative;
  overflow: hidden;
  min-width: 68px;
  transition: transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
}
.tunnel-action-button:not(.is-disabled):active {
  transform: scale(0.96);
}
.tunnel-action-button.is-starting::after,
.tunnel-action-button.is-stopping::after {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.32), transparent);
  transform: translateX(-110%);
  animation: tunnel-action-sweep 1.05s ease-in-out infinite;
}
.tunnel-action-label {
  position: relative;
  z-index: 1;
}
.list-enter-active,
.list-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
@keyframes inline-spin {
  to { transform: rotate(360deg); }
}
@keyframes skeleton-shimmer {
  100% { transform: translateX(100%); }
}
@keyframes tunnel-action-sweep {
  100% { transform: translateX(110%); }
}
@media (prefers-reduced-motion: reduce) {
  .tunnel-card,
  .tunnel-action-button,
  .tunnel-action-button::after,
  .list-enter-active,
  .list-leave-active,
  .inline-spinner,
  .skeleton-tunnel-card::after {
    animation: none;
    transition: none;
  }
  .tunnel-card:hover,
  .list-enter-from,
  .list-leave-to {
    transform: none;
  }
}
</style>
