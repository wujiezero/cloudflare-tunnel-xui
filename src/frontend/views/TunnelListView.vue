<template>
  <div class="tunnels-page page-shell">
    <teleport to="#topbar-actions">
      <el-button type="primary" @click="router.push('/tunnels/create')">
        <el-icon class="el-icon--left"><Plus /></el-icon>新建 Tunnel
      </el-button>
    </teleport>

    <div class="toolbar toolbar-surface">
      <div class="toolbar-left">
        <el-tooltip :content="allFilteredSelected ? '取消全选' : '全选当前列表'" placement="top">
          <el-checkbox
            class="select-all-check"
            :model-value="allFilteredSelected"
            :indeterminate="someFilteredSelected"
            :disabled="!filteredTunnels.length"
            @change="toggleAllFiltered"
          >全选</el-checkbox>
        </el-tooltip>
        <el-input
          v-model="tunnelsState.tunnelSearch"
          placeholder="搜索名称或 ID"
          clearable
          :prefix-icon="Search"
          class="search-input"
          size="default"
        />
        <el-select v-model="tunnelsState.tunnelSort" class="sort-select" size="default">
          <template #prefix><el-icon><Sort /></el-icon></template>
          <el-option label="名称" value="name" />
          <el-option label="创建时间" value="createdAt" />
          <el-option label="连接数" value="connections" />
          <el-option label="路由数" value="mappings" />
        </el-select>
        <el-tooltip :content="tunnelsState.tunnelSortOrder === 'asc' ? '升序' : '降序'" placement="top">
          <el-button @click="toggleSortOrder" size="default" :icon="tunnelsState.tunnelSortOrder === 'asc' ? SortUp : SortDown" />
        </el-tooltip>
      </div>
      <div class="toolbar-right">
        <el-button @click="handleExport" :loading="exporting" :icon="Download">导出</el-button>
        <el-button @click="showImport = true" :icon="Upload">导入</el-button>
      </div>
    </div>

    <transition name="batch-bar">
      <div v-if="tunnelsState.tunnelSelection.length" class="batch-bar surface-card">
        <span class="batch-count"><el-icon><Select /></el-icon>已选择 {{ tunnelsState.tunnelSelection.length }} 个</span>
        <div class="batch-actions">
          <el-button size="small" @click="batchStart" :loading="tunnelsState.batchActionLoading" :icon="VideoPlay">批量启动</el-button>
          <el-button size="small" @click="batchStop" :loading="tunnelsState.batchActionLoading" :icon="VideoPause">批量停止</el-button>
          <el-popconfirm title="确认批量删除选中的 Tunnel?" width="220" @confirm="batchDelete">
            <template #reference>
              <el-button size="small" type="danger" plain :loading="tunnelsState.batchActionLoading" :icon="Delete">批量删除</el-button>
            </template>
          </el-popconfirm>
          <el-button size="small" text @click="tunnelsState.tunnelSelection = []">取消选择</el-button>
        </div>
      </div>
    </transition>

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
        <div class="tunnel-card-main">
          <el-checkbox
            class="tunnel-check"
            :model-value="tunnelsState.tunnelSelection.includes(t.id)"
            @change="toggleTunnelSelection(t.id)"
          />
          <div class="tunnel-info">
            <div class="tunnel-card-header">
              <span class="status-led" :class="(t.status === 'healthy' || runningTunnels.has(t.id)) ? 'online' : 'offline'"></span>
              <div class="tunnel-name" :title="t.name">{{ t.name }}</div>
              <el-tag v-if="t.status === 'healthy' || runningTunnels.has(t.id)" type="success" size="small" round>在线</el-tag>
              <el-tag v-else type="info" size="small" round>离线</el-tag>
            </div>
            <div class="tunnel-card-meta">
              <span class="meta-item"><el-icon><Share /></el-icon>{{ t.connections || 0 }} 连接</span>
              <span class="meta-item"><el-icon><Link /></el-icon>{{ (t.configuration?.mappings || []).length }} 路由</span>
            </div>
            <div class="tunnel-card-mappings" v-if="(t.configuration?.mappings || []).length">
              <button
                v-for="m in (t.configuration?.mappings || []).slice(0, 3)"
                :key="m.hostname || m.service"
                type="button"
                class="mapping-tag"
                title="点击复制"
                @click="copyText(m.hostname || m.service, '域名')"
              >
                {{ m.hostname || m.service }}
              </button>
              <span v-if="(t.configuration?.mappings || []).length > 3" class="mapping-more">
                +{{ (t.configuration?.mappings || []).length - 3 }}
              </span>
            </div>
          </div>
        </div>
        <div class="tunnel-card-actions">
          <el-button size="small" :type="runningTunnels.has(t.id) ? 'danger' : 'success'"
                     class="tunnel-action-button"
                     :class="{
                       'is-starting': actionState.type === 'start' && actionState.tunnelId === t.id,
                       'is-stopping': actionState.type === 'stop' && actionState.tunnelId === t.id
                     }"
                     :icon="runningTunnels.has(t.id) ? VideoPause : VideoPlay"
                     :loading="isTunnelActionPending(t.id)"
                     :disabled="isTunnelActionPending(t.id)"
                     @click="handleTunnelAction(t)">
            <span class="tunnel-action-label">{{ getTunnelActionLabel(t) }}</span>
          </el-button>
          <el-button size="small" :icon="Document" @click="handleOpenLogs(t)">日志</el-button>
          <el-button size="small" :icon="Edit" @click="handleEdit(t.id)">编辑</el-button>
          <el-popconfirm title="确认删除此 Tunnel?" width="200" @confirm="deleteTunnel(t.id)">
            <template #reference>
              <el-tooltip :content="t.connections > 0 ? '存在活动连接，无法删除' : '删除'" placement="top">
                <el-button size="small" type="danger" plain :icon="Delete" :disabled="t.connections > 0" />
              </el-tooltip>
            </template>
          </el-popconfirm>
        </div>
      </div>
    </transition-group>

    <div v-else-if="!tunnelsState.tunnelsLoading" class="empty-state surface-card">
      <span class="empty-icon">
        <el-icon><component :is="tunnelsState.tunnelSearch ? 'Search' : 'Connection'" /></el-icon>
      </span>
      <div class="empty-title">{{ tunnelsState.tunnelSearch ? '没有匹配的 Tunnel' : '还没有 Tunnel' }}</div>
      <div class="empty-desc">
        {{ tunnelsState.tunnelSearch ? '换个关键词试试，或清除搜索条件。' : '创建第一个 Tunnel，开始把本地服务安全地暴露到公网。' }}
      </div>
      <el-button v-if="!tunnelsState.tunnelSearch" type="primary" @click="router.push('/tunnels/create')">
        <el-icon class="el-icon--left"><Plus /></el-icon>新建 Tunnel
      </el-button>
      <el-button v-else @click="tunnelsState.tunnelSearch = ''">清除搜索</el-button>
    </div>

    <!-- Import Dialog -->
    <el-dialog v-model="showImport" title="导入 Tunnel 配置" width="600px" class="glass-dialog">
      <p class="dialog-hint">粘贴此前导出的 JSON 数据，将按名称匹配并写入路由配置。</p>
      <el-input v-model="importJson" type="textarea" :rows="10" placeholder='{ "tunnels": [ ... ] }' />
      <template #footer>
        <el-button @click="showImport = false">取消</el-button>
        <el-button type="primary" @click="handleImport" :loading="importing" :icon="Upload">导入</el-button>
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
import {
  Search, Sort, SortUp, SortDown, Download, Upload, Select,
  VideoPlay, VideoPause, Delete, Document, Edit, Share, Link, Plus
} from "@element-plus/icons-vue";
import { useTunnels } from "../composables/useTunnels.js";
import { useCloudflared } from "../composables/useCloudflared.js";
import { useApi } from "../composables/useApi.js";
import { useClipboard } from "../composables/useClipboard.js";

const router = useRouter();
const { state: tunnelsState, filteredTunnels, loadTunnels, deleteTunnel,
        toggleTunnelSelection, toggleAllFiltered, exportTunnels, importTunnels, batchAction } = useTunnels();
const { state: cfState, startTunnel, stopTunnel, openTunnelLogs, refreshRuntimeStatus } = useCloudflared();
const { notify } = useApi();
const { copyText } = useClipboard();

const allFilteredSelected = computed(() =>
  filteredTunnels.value.length > 0 &&
  filteredTunnels.value.every((t) => tunnelsState.tunnelSelection.includes(t.id))
);
const someFilteredSelected = computed(() =>
  !allFilteredSelected.value &&
  filteredTunnels.value.some((t) => tunnelsState.tunnelSelection.includes(t.id))
);

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
.toolbar { margin-bottom: var(--space-4); }
.toolbar-left { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.toolbar-right { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.search-input { width: 260px; }
.sort-select { width: 150px; }

/* Batch bar */
.batch-bar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
  flex-wrap: wrap; padding: var(--space-2) var(--space-4); margin-bottom: var(--space-3);
  border-radius: var(--radius-md);
}
.batch-count { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); font-weight: 600; color: var(--primary); }
.batch-actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.batch-bar-enter-active, .batch-bar-leave-active { transition: opacity var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease); }
.batch-bar-enter-from, .batch-bar-leave-to { opacity: 0; transform: translateY(-6px); }

/* Skeleton */
.tunnel-list { display: flex; flex-direction: column; gap: var(--space-3); }
.tunnel-list-skeleton { display: flex; flex-direction: column; gap: var(--space-3); }
.skeleton-tunnel-card { position: relative; overflow: hidden; padding: var(--space-4); border-radius: var(--radius-md); }
.skeleton-tunnel-card::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
  animation: skeleton-shimmer 1.15s ease-in-out infinite;
}
.skeleton-row, .skeleton-tags, .skeleton-actions { display: flex; align-items: center; gap: 10px; }
.skeleton-row { margin-bottom: 12px; }
.skeleton-tags { margin-bottom: 12px; }
.skeleton-checkbox, .skeleton-line, .skeleton-pill, .skeleton-tag, .skeleton-button {
  display: inline-block; border-radius: 999px; background: rgba(126, 158, 208, 0.22);
}
.skeleton-checkbox { width: 16px; height: 16px; border-radius: 5px; }
.skeleton-line.title { width: 180px; height: 16px; }
.skeleton-line.count { width: 54px; height: 12px; }
.skeleton-pill { width: 46px; height: 22px; }
.skeleton-tag { width: 96px; height: 22px; }
.skeleton-tag.wide { width: 140px; }
.skeleton-tag.short { width: 64px; }
.skeleton-button { width: 56px; height: 28px; border-radius: 8px; }

/* Tunnel card */
.tunnel-card {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);
  padding: var(--space-4); border-radius: var(--radius-md);
}
.tunnel-card.is-action-running {
  border-color: var(--primary-ring);
  box-shadow: var(--shadow-soft), 0 0 0 1px var(--primary-soft);
}
.tunnel-card.selected { border-color: var(--primary); box-shadow: var(--shadow-soft), 0 0 0 1px var(--primary-soft); }

.tunnel-card-main { display: flex; align-items: flex-start; gap: var(--space-3); min-width: 0; flex: 1; }
.tunnel-check { margin-top: 2px; }
.tunnel-info { min-width: 0; display: grid; gap: 6px; }
.tunnel-card-header { display: flex; align-items: center; gap: var(--space-2); }
.status-led { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.status-led.online { background: var(--success); box-shadow: 0 0 0 3px var(--success-soft); }
.status-led.offline { background: var(--text-faint); }
.tunnel-name { font-weight: 700; font-size: var(--fs-md); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tunnel-card-meta { display: flex; gap: var(--space-4); }
.meta-item { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--text-secondary); }
.meta-item .el-icon { font-size: 12px; }
.tunnel-card-mappings { display: flex; flex-wrap: wrap; gap: 6px; }
.mapping-tag {
  display: inline-block; padding: 2px 10px; border-radius: var(--radius-pill);
  background: var(--panel-soft); border: 1px solid var(--line);
  font-size: var(--fs-xs); color: var(--text-secondary);
  max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease), color var(--motion-fast) var(--motion-ease);
}
.mapping-tag:hover { border-color: var(--primary-ring); color: var(--primary); }
.select-all-check { margin-right: 2px; flex-shrink: 0; }
.mapping-more { font-size: var(--fs-xs); color: var(--text-secondary); align-self: center; }

.tunnel-card-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; flex-shrink: 0; }
.tunnel-action-button { position: relative; overflow: hidden; min-width: 84px; }
.tunnel-action-button.is-starting::after,
.tunnel-action-button.is-stopping::after {
  content: ""; position: absolute; inset: -1px; border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.32), transparent);
  transform: translateX(-110%); animation: tunnel-action-sweep 1.05s ease-in-out infinite;
}
.tunnel-action-label { position: relative; z-index: 1; }

.dialog-hint { margin: 0 0 var(--space-3); font-size: var(--fs-sm); color: var(--text-secondary); }

.list-enter-active, .list-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(6px); }

@keyframes skeleton-shimmer { 100% { transform: translateX(100%); } }
@keyframes tunnel-action-sweep { 100% { transform: translateX(110%); } }

@media (max-width: 720px) {
  .tunnel-card { flex-direction: column; align-items: stretch; }
  .tunnel-card-actions { justify-content: flex-end; }
  .search-input { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .tunnel-action-button::after, .list-enter-active, .list-leave-active,
  .skeleton-tunnel-card::after, .batch-bar-enter-active, .batch-bar-leave-active { animation: none; transition: none; }
  .list-enter-from, .list-leave-to, .batch-bar-enter-from, .batch-bar-leave-to { transform: none; }
}
</style>
