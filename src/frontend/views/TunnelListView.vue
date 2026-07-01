<template>
  <div class="tunnels-page page-shell">
    <div class="page-header">
      <div>
        <div class="page-kicker">控制台</div>
        <h1 class="page-title">Tunnel 清单</h1>
        <p class="page-subtitle">创建、配置并运行 Cloudflare Tunnel</p>
      </div>
      <el-button type="primary" @click="showCreateModal = true">
        <el-icon class="el-icon--left"><Plus /></el-icon>新建 Tunnel
      </el-button>
    </div>

    <div class="toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="tunnelsState.tunnelSearch"
          placeholder="搜索名称或域名"
          clearable
          :prefix-icon="Search"
          class="search-input"
        />
        <div class="filter-segment">
          <button
            v-for="f in statusFilters"
            :key="f.value"
            type="button"
            class="segment-btn"
            :class="{ active: tunnelsState.tunnelStatusFilter === f.value }"
            @click="tunnelsState.tunnelStatusFilter = f.value"
          >
            {{ f.label }}
          </button>
        </div>
        <el-select v-model="tunnelsState.tunnelSort" class="sort-select">
          <el-option label="按名称" value="name" />
          <el-option label="按状态" value="status" />
          <el-option label="按连接数" value="connections" />
          <el-option label="按路由数" value="mappings" />
          <el-option label="按创建时间" value="createdAt" />
        </el-select>
        <el-tooltip :content="tunnelsState.tunnelSortOrder === 'asc' ? '升序' : '降序'" placement="top">
          <el-button @click="toggleSortOrder" :icon="tunnelsState.tunnelSortOrder === 'asc' ? SortUp : SortDown" />
        </el-tooltip>
      </div>
      <div class="toolbar-right">
        <el-tooltip :content="allFilteredSelected ? '取消全选' : '全选当前列表'" placement="top">
          <el-checkbox
            class="select-all-check"
            :model-value="allFilteredSelected"
            :indeterminate="someFilteredSelected"
            :disabled="!filteredTunnels.length"
            @change="toggleAllFiltered"
          >全选</el-checkbox>
        </el-tooltip>
        <el-button text @click="handleExport" :loading="exporting" :icon="Download">导出</el-button>
        <el-button text @click="showImport = true" :icon="Upload">导入</el-button>
      </div>
    </div>

    <transition name="batch-bar">
      <div v-if="tunnelsState.tunnelSelection.length" class="batch-bar">
        <span class="batch-count">已选择 {{ tunnelsState.tunnelSelection.length }} 项</span>
        <div class="batch-spacer"></div>
        <el-button size="small" @click="batchStart" :loading="tunnelsState.batchActionLoading">启动</el-button>
        <el-button size="small" @click="batchStop" :loading="tunnelsState.batchActionLoading">停止</el-button>
        <el-button size="small" type="danger" plain :loading="tunnelsState.batchActionLoading" @click="batchDelete">删除</el-button>
        <el-button size="small" text @click="tunnelsState.tunnelSelection = []">取消选择</el-button>
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

    <div v-else-if="noResultsAfterFilter" class="empty-state surface-card">
      <span class="empty-icon"><el-icon><Search /></el-icon></span>
      <div class="empty-title">没有找到匹配的 Tunnel</div>
      <div class="empty-desc">换个关键词或筛选条件试试。</div>
      <el-button @click="clearFilters">清除筛选</el-button>
    </div>

    <transition-group v-else-if="filteredTunnels.length" name="list" tag="div" class="tunnel-list">
      <div
        v-for="t in filteredTunnels"
        :key="t.id"
        class="tunnel-row surface-card"
        :class="{
          selected: tunnelsState.tunnelSelection.includes(t.id),
          'is-action-running': isTunnelActionPending(t.id)
        }"
      >
        <input
          type="checkbox"
          class="row-check"
          :checked="tunnelsState.tunnelSelection.includes(t.id)"
          @change="toggleTunnelSelection(t.id)"
        />

        <div class="row-identity">
          <div class="row-name-line">
            <span class="status-dot" :class="isOnline(t) ? 'ok' : 'idle'"></span>
            <span class="row-name" :title="t.name">{{ t.name }}</span>
            <el-tag :type="isOnline(t) ? 'success' : 'info'" size="small" round>{{ isOnline(t) ? '在线' : '离线' }}</el-tag>
          </div>
          <div class="row-meta mono">{{ t.connections || 0 }} 连接 · {{ mappingCount(t) }} 路由</div>
        </div>

        <div class="row-chips">
          <button
            v-for="d in chipsFor(t).shown"
            :key="d"
            type="button"
            class="mapping-chip mono"
            title="点击复制"
            @click="copyText(d, '域名')"
          >{{ d }}</button>
          <span v-if="!mappingCount(t)" class="mapping-empty">未配置路由</span>
          <button v-if="chipsFor(t).hasMore" type="button" class="mapping-toggle" @click="toggleDomains(t.id)">
            {{ chipsFor(t).label }}
          </button>
        </div>

        <div class="row-actions">
          <el-button
            size="small"
            :type="isOnline(t) ? 'danger' : 'success'"
            class="tunnel-action-button"
            :class="{
              'is-starting': actionState.type === 'start' && actionState.tunnelId === t.id,
              'is-stopping': actionState.type === 'stop' && actionState.tunnelId === t.id
            }"
            :icon="isOnline(t) ? VideoPause : VideoPlay"
            :loading="isTunnelActionPending(t.id)"
            :disabled="isTunnelActionPending(t.id)"
            @click="handleTunnelAction(t)"
          >
            <span class="tunnel-action-label">{{ getTunnelActionLabel(t) }}</span>
          </el-button>
          <el-button size="small" :icon="Document" title="日志" @click="handleOpenLogs(t)" />
          <el-button size="small" :icon="Edit" title="编辑" @click="handleEdit(t.id)" />
          <el-tooltip :content="t.connections > 0 ? '存在活动连接，无法删除' : '删除'" placement="top">
            <el-button size="small" type="danger" plain :icon="Delete" :disabled="t.connections > 0" @click="requestDeleteTunnel(t)" />
          </el-tooltip>
        </div>
      </div>
    </transition-group>

    <div v-else-if="!tunnelsState.tunnelsLoading" class="empty-state surface-card">
      <span class="empty-icon"><el-icon><Connection /></el-icon></span>
      <div class="empty-title">还没有 Tunnel</div>
      <div class="empty-desc">创建第一个 Tunnel，开始把本地服务安全地暴露到公网。</div>
      <el-button type="primary" @click="showCreateModal = true">
        <el-icon class="el-icon--left"><Plus /></el-icon>新建 Tunnel
      </el-button>
    </div>

    <!-- Import Dialog -->
    <el-dialog v-model="showImport" title="导入 Tunnel 配置" width="600px" class="panel-dialog">
      <p class="dialog-hint">粘贴此前导出的 JSON 数据，将按名称匹配并写入路由配置。</p>
      <el-input v-model="importJson" type="textarea" :rows="10" placeholder='{ "tunnels": [ ... ] }' />
      <template #footer>
        <el-button @click="showImport = false">取消</el-button>
        <el-button type="primary" @click="handleImport" :loading="importing" :icon="Upload">导入</el-button>
      </template>
    </el-dialog>

    <!-- Runtime Viewer Dialog -->
    <RuntimeViewer v-model="showRuntime" />

    <!-- Tunnel Editor Drawer (in-context editing) -->
    <TunnelEditorDrawer v-model="showEditor" :tunnel-id="editTunnelId" @saved="onEditorSaved" />

    <!-- Create Tunnel Modal -->
    <TunnelCreateModal v-model="showCreateModal" @created="onTunnelCreated" />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { ElMessageBox } from "element-plus";
import {
  Search, SortUp, SortDown, Download, Upload,
  VideoPlay, VideoPause, Delete, Document, Edit, Plus, Connection
} from "@element-plus/icons-vue";
import { useTunnels } from "../composables/useTunnels.js";
import { useCloudflared } from "../composables/useCloudflared.js";
import { useApi } from "../composables/useApi.js";
import { useClipboard } from "../composables/useClipboard.js";
import { getDomainChips } from "../utils/formatters.js";
import RuntimeViewer from "../components/monitoring/RuntimeViewer.vue";
import TunnelEditorDrawer from "../components/tunnels/TunnelEditorDrawer.vue";
import TunnelCreateModal from "../components/tunnels/TunnelCreateModal.vue";

const router = useRouter();
const route = useRoute();
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

const statusFilters = [
  { value: "all", label: "全部" },
  { value: "online", label: "在线" },
  { value: "offline", label: "离线" }
];
const noResultsAfterFilter = computed(
  () => !tunnelsState.tunnelsLoading && tunnelsState.tunnels.length > 0 && filteredTunnels.value.length === 0
);
function clearFilters() {
  tunnelsState.tunnelSearch = "";
  tunnelsState.tunnelStatusFilter = "all";
}

const showImport = ref(false);
const importJson = ref("");
const importing = ref(false);
const exporting = ref(false);
const showRuntime = ref(false);
const showEditor = ref(false);
const showCreateModal = ref(false);
const editTunnelId = ref("");
const actionState = ref({ tunnelId: null, type: "" });
const showSkeleton = computed(() => tunnelsState.tunnelsLoading && !tunnelsState.tunnels.length);

const runningTunnels = computed(() => {
  const set = new Set();
  for (const p of cfState.cloudflared.processes || []) {
    if (p.running) set.add(p.tunnelId);
  }
  return set;
});

function isOnline(t) {
  return t.status === "healthy" || runningTunnels.value.has(t.id);
}
function mappingCount(t) {
  return (t.configuration?.mappings || []).length;
}
const expandedDomains = reactive({});
function toggleDomains(tunnelId) {
  expandedDomains[tunnelId] = !expandedDomains[tunnelId];
}
function chipsFor(t) {
  const domains = (t.configuration?.mappings || []).map((m) => m.hostname || m.service).filter(Boolean);
  return getDomainChips(domains, 3, !!expandedDomains[t.id]);
}

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
  const confirmed = await confirmAction({
    title: "确认批量停止",
    message: `将停止已选择的 ${tunnelsState.tunnelSelection.length} 个 Tunnel 进程。`,
    confirmButtonText: "确认停止"
  });
  if (!confirmed) return;
  await batchAction("stop");
  await refreshRuntimeStatus();
}

async function batchDelete() {
  const confirmed = await confirmAction({
    title: "批量删除 Tunnel",
    message: `确定要删除选中的 ${tunnelsState.tunnelSelection.length} 个 Tunnel 吗？此操作不可撤销。`,
    confirmButtonText: "删除",
    danger: true
  });
  if (!confirmed) return;
  await batchAction("delete");
}

async function requestDeleteTunnel(tunnel) {
  const confirmed = await confirmAction({
    title: "删除 Tunnel",
    message: `确定要删除 "${tunnel.name}" 吗？其 ${mappingCount(tunnel)} 条路由配置将一并移除，此操作不可撤销。`,
    confirmButtonText: "删除",
    danger: true
  });
  if (!confirmed) return;
  await deleteTunnel(tunnel.id);
}

function isTunnelActionPending(tunnelId) {
  return actionState.value.tunnelId === tunnelId;
}

function getTunnelActionLabel(tunnel) {
  if (actionState.value.tunnelId === tunnel.id) {
    return actionState.value.type === "start" ? "启动中" : "停止中";
  }
  return isOnline(tunnel) ? "停止" : "启动";
}

async function confirmAction({ title, message, confirmButtonText, danger = false }) {
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText,
      cancelButtonText: "取消",
      type: "warning",
      customClass: "panel-confirm",
      confirmButtonClass: danger ? "el-button--danger" : "el-button--primary"
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function handleTunnelAction(tunnel) {
  if (isTunnelActionPending(tunnel.id)) return;
  const type = isOnline(tunnel) ? "stop" : "start";
  if (type === "stop") {
    const confirmed = await confirmAction({
      title: "确认停止 Tunnel",
      message: `将停止 Tunnel「${tunnel.name || tunnel.id}」的本机 cloudflared 进程。`,
      confirmButtonText: "确认停止"
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
  editTunnelId.value = tunnelId;
  showEditor.value = true;
}

function onTunnelCreated(tunnel) {
  if (tunnel?.id) {
    editTunnelId.value = tunnel.id;
    showEditor.value = true;
  }
}

function onEditorSaved() {
  // Drawer mutates the shared tunnel object, so the list already reflects the
  // change; refresh runtime status to keep connection/health counters current.
  refreshRuntimeStatus();
}

// Keep the URL clean when the drawer closes; reload to pick up server-side
// normalization of the just-edited tunnel.
watch(showEditor, (open, wasOpen) => {
  if (!open && wasOpen) {
    editTunnelId.value = "";
    if (route.query.edit) {
      router.replace({ path: "/tunnels", query: {} });
    }
    loadTunnels();
  }
});

onMounted(async () => {
  await loadTunnels();
  const deepLinkId = route.query.edit;
  if (deepLinkId) {
    editTunnelId.value = String(deepLinkId);
    showEditor.value = true;
  } else if (route.query.create) {
    showCreateModal.value = true;
    router.replace({ path: "/tunnels", query: {} });
  }
});
</script>

<style scoped>
.page-header { margin-bottom: 26px; }
.toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; justify-content: space-between; }
.toolbar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1; }
.toolbar-right { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.search-input { flex: 1; min-width: 200px; max-width: 320px; }
.sort-select { width: 150px; }

.filter-segment {
  display: flex;
  background: var(--card-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px;
  gap: 2px;
}
.segment-btn {
  padding: 6px 12px;
  border: none;
  background: transparent;
  border-radius: var(--radius-xs);
  cursor: pointer;
  color: var(--text-2);
  font-size: 12.5px;
  font-family: inherit;
}
.segment-btn.active { background: var(--card); box-shadow: var(--shadow-card); color: var(--text); }

/* Batch bar */
.batch-bar {
  display: flex; align-items: center; gap: var(--space-3);
  flex-wrap: wrap; padding: 10px 16px; margin-bottom: 14px;
  border-radius: var(--radius-md);
  background: var(--accent-soft);
  border: 1px solid var(--border);
}
.batch-count { font-size: 13px; font-weight: 600; color: var(--text); }
.batch-spacer { flex: 1; }
.batch-bar-enter-active, .batch-bar-leave-active { transition: opacity var(--motion-fast) var(--motion-ease), transform var(--motion-fast) var(--motion-ease); }
.batch-bar-enter-from, .batch-bar-leave-to { opacity: 0; transform: translateY(-6px); }

/* Skeleton */
.tunnel-list { display: flex; flex-direction: column; gap: 12px; }
.tunnel-list-skeleton { display: flex; flex-direction: column; gap: 12px; }
.skeleton-tunnel-card { position: relative; overflow: hidden; padding: var(--space-4); border-radius: var(--radius-lg); }
.skeleton-tunnel-card::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
  animation: skeleton-shimmer 1.15s ease-in-out infinite;
}
.skeleton-row, .skeleton-tags, .skeleton-actions { display: flex; align-items: center; gap: 10px; }
.skeleton-row { margin-bottom: 12px; }
.skeleton-tags { margin-bottom: 12px; }
.skeleton-checkbox, .skeleton-line, .skeleton-pill, .skeleton-tag, .skeleton-button {
  display: inline-block; border-radius: 999px; background: var(--card-2);
}
.skeleton-checkbox { width: 16px; height: 16px; border-radius: 5px; }
.skeleton-line.title { width: 180px; height: 16px; }
.skeleton-line.count { width: 54px; height: 12px; }
.skeleton-pill { width: 46px; height: 22px; }
.skeleton-tag { width: 96px; height: 22px; }
.skeleton-tag.wide { width: 140px; }
.skeleton-tag.short { width: 64px; }
.skeleton-button { width: 56px; height: 28px; border-radius: 8px; }

/* Tunnel row */
.tunnel-row {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 18px; border-radius: var(--radius-lg);
}
.tunnel-row.is-action-running { border-color: var(--accent-ring, var(--accent)); }
.tunnel-row.selected { border-color: var(--accent); }

.row-check { width: 16px; height: 16px; accent-color: var(--accent); flex-shrink: 0; cursor: pointer; }

.row-identity { min-width: 170px; flex: 1 1 170px; display: grid; gap: 4px; }
.row-name-line { display: flex; align-items: center; gap: 8px; }
.row-name { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.row-meta { font-size: 12px; color: var(--text-2); }

.row-chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 2 1 240px; }
.mapping-chip {
  padding: 4px 9px; border-radius: var(--radius-xs);
  background: var(--card-2); border: 1px solid var(--border);
  font-size: 11.5px; color: var(--text-2);
  max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease), color var(--motion-fast) var(--motion-ease);
}
.mapping-chip:hover { border-color: var(--accent); color: var(--accent); }
.mapping-empty { font-size: var(--fs-xs); color: var(--text-3); font-style: italic; align-self: center; }
.mapping-toggle {
  padding: 4px 9px; border-radius: var(--radius-xs);
  background: transparent; border: 1px solid var(--border);
  font-size: 11.5px; color: var(--accent); cursor: pointer; font-family: inherit;
}
.select-all-check { margin-right: 2px; flex-shrink: 0; }

.row-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; margin-left: auto; }
.tunnel-action-button { position: relative; overflow: hidden; min-width: 84px; }
.tunnel-action-button.is-starting::after,
.tunnel-action-button.is-stopping::after {
  content: ""; position: absolute; inset: -1px; border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.32), transparent);
  transform: translateX(-110%); animation: tunnel-action-sweep 1.05s ease-in-out infinite;
}
.tunnel-action-label { position: relative; z-index: 1; }

.dialog-hint { margin: 0 0 var(--space-3); font-size: var(--fs-sm); color: var(--text-2); }

.list-enter-active, .list-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(6px); }

@keyframes skeleton-shimmer { 100% { transform: translateX(100%); } }
@keyframes tunnel-action-sweep { 100% { transform: translateX(110%); } }

@media (max-width: 720px) {
  .search-input { max-width: none; }
  .row-actions { justify-content: flex-end; width: 100%; margin-left: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .tunnel-action-button::after, .list-enter-active, .list-leave-active,
  .skeleton-tunnel-card::after, .batch-bar-enter-active, .batch-bar-leave-active { animation: none; transition: none; }
  .list-enter-from, .list-leave-to, .batch-bar-enter-from, .batch-bar-leave-to { transform: none; }
}
</style>
