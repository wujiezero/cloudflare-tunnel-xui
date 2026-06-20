<template>
  <el-drawer
    v-model="visible"
    :title="drawerTitle"
    direction="rtl"
    :size="drawerSize"
    :before-close="handleBeforeClose"
    class="glass-drawer"
    destroy-on-close
  >
    <div class="editor-drawer-body scroll-thin" v-loading="loadingTunnel">
      <div v-if="!tunnel" class="editor-loading surface-card">
        <span class="inline-spinner"></span><span>加载 Tunnel 配置中…</span>
      </div>
      <template v-else>
        <div class="editor-head surface-card">
          <div class="editor-title-row">
            <div class="name-field">
              <label class="field-label">Tunnel 名称</label>
              <div class="name-input-row">
                <el-input v-model="tunnel.name" class="name-input" size="large" @keyup.enter="handleSaveName" />
                <el-button type="primary" @click="handleSaveName" :loading="savingName" :disabled="!nameDirty" :icon="Check">保存</el-button>
              </div>
            </div>
            <div class="editor-meta">
              <el-tag v-if="tunnel.status === 'healthy'" type="success" round>在线</el-tag>
              <el-tag v-else type="info" round>离线</el-tag>
              <span class="meta-line"><el-icon><Share /></el-icon>{{ tunnel.connections || 0 }} 连接</span>
              <span class="meta-line"><el-icon><Calendar /></el-icon>{{ tunnel.createdAt ? formatDateTime(tunnel.createdAt) : '—' }}</span>
              <button
                v-if="tunnel.id"
                type="button"
                class="meta-line id-chip"
                :title="`点击复制 Tunnel ID：${tunnel.id}`"
                @click="copyText(tunnel.id, 'Tunnel ID')"
              >
                <el-icon><Tickets /></el-icon>
                <span class="id-text">{{ tunnel.id }}</span>
                <el-icon class="copy-icon"><CopyDocument /></el-icon>
              </button>
            </div>
          </div>
        </div>

        <div class="editor-section surface-card">
          <div class="section-header">
            <h3 class="section-title"><el-icon><Guide /></el-icon>路由映射</h3>
            <el-button size="small" @click="addMapping" :icon="Plus">添加路由</el-button>
          </div>

          <div class="mappings-list">
            <div v-for="(mapping, idx) in tunnel.configuration?.mappings" :key="idx" class="mapping-row">
              <div class="mapping-index">{{ idx + 1 }}</div>
              <div class="mapping-body">
                <div class="mapping-fields">
                  <el-input v-model="mapping.hostname" placeholder="域名 (如 app.example.com)" size="default">
                    <template #prefix><el-icon><Link /></el-icon></template>
                  </el-input>
                  <el-icon class="mapping-arrow"><Right /></el-icon>
                  <el-input v-model="mapping.service" placeholder="服务地址 (如 http://localhost:3000)" size="default">
                    <template #prefix><el-icon><Monitor /></el-icon></template>
                  </el-input>
                  <el-input v-model="mapping.path" placeholder="路径 (可选, 如 /api/*)" size="default" class="path-input" />
                  <el-tooltip content="删除此路由" placement="top">
                    <el-button size="default" :icon="Delete" @click="removeMapping(idx)" :disabled="tunnel.configuration.mappings.length <= 1" />
                  </el-tooltip>
                </div>
                <div class="mapping-advanced">
                  <button
                    type="button"
                    class="advanced-toggle"
                    :aria-expanded="Boolean(mapping._showAdvanced)"
                    @click="toggleAdvanced(idx)"
                  >
                    <el-icon><component :is="mapping._showAdvanced ? 'ArrowUp' : 'ArrowDown'" /></el-icon>
                    {{ mapping._showAdvanced ? '收起高级选项' : '高级选项' }}
                  </button>
                  <el-button size="small" text type="primary" @click="handleTestOrigin(idx)">
                    <el-icon class="el-icon--left"><Aim /></el-icon>测试源站
                  </el-button>
                </div>
                <transition name="collapse-fade">
                  <div v-if="mapping._showAdvanced" class="advanced-options">
                    <el-checkbox v-model="mapping.originRequest.noTLSVerify">noTLSVerify</el-checkbox>
                    <el-checkbox v-model="mapping.originRequest.disableChunkedEncoding">disableChunkedEncoding</el-checkbox>
                    <el-checkbox v-model="mapping.originRequest.http2Origin">http2Origin</el-checkbox>
                  </div>
                </transition>
                <div v-if="tunnel.ui.originTests?.[idx]" class="origin-result" :class="tunnel.ui.originTests[idx].ok ? 'ok' : 'err'">
                  <el-icon><component :is="tunnel.ui.originTests[idx].ok ? 'CircleCheck' : 'CircleClose'" /></el-icon>
                  {{ tunnel.ui.originTests[idx].message || (tunnel.ui.originTests[idx].ok ? '源站可达' : '源站不可达') }}
                </div>
              </div>
            </div>
          </div>

          <div class="editor-actions">
            <el-button type="primary" @click="handleSaveMappings" :loading="saving" :icon="Check">保存路由</el-button>
            <el-button @click="handleCheckPublish" :loading="checkingPublish" :icon="View">检查发布状态</el-button>
            <el-button @click="handleSyncDns" :loading="syncingDns" :icon="RefreshRight">同步 DNS</el-button>
            <transition name="collapse-fade">
              <span v-if="mappingsDirty" class="dirty-hint">
                <el-icon><WarningFilled /></el-icon>路由有未保存的改动
              </span>
            </transition>
          </div>
        </div>

        <div v-if="publishStatus" class="publish-section surface-card">
          <h3 class="section-title"><el-icon><Promotion /></el-icon>DNS 发布状态</h3>
          <div v-if="publishStatus.summary" class="publish-summary">
            <el-tag size="small" type="success" round>{{ publishStatus.summary.published }} 已发布</el-tag>
            <el-tag size="small" type="warning" round>{{ publishStatus.summary.warnings }} 警告</el-tag>
            <el-tag size="small" type="danger" round>{{ publishStatus.summary.unpublished }} 未发布</el-tag>
          </div>
          <div class="publish-list">
            <div v-for="item in (publishStatus.items || [])" :key="item.hostname" class="publish-item">
              <span class="publish-host"><el-icon><Link /></el-icon>{{ item.hostname }}</span>
              <el-tag :type="item.status === 'published' ? 'success' : 'warning'" size="small" round>
                {{ item.status }}
              </el-tag>
            </div>
          </div>
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, watch } from "vue";
import { ElMessageBox } from "element-plus";
import {
  Check, Plus, Delete, Link, Monitor, Right, Aim,
  View, RefreshRight, Promotion, Guide, Calendar, Share,
  CopyDocument, Tickets, WarningFilled
} from "@element-plus/icons-vue";
import { useTunnels } from "../../composables/useTunnels.js";
import { useApi } from "../../composables/useApi.js";
import { useClipboard } from "../../composables/useClipboard.js";
import { formatDateTime } from "../../utils/formatters.js";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  tunnelId: { type: String, default: "" }
});
const emit = defineEmits(["update:modelValue", "saved"]);

const { state: tunnelsState, loadTunnels, saveMappings, checkPublishStatus, syncDns, testOrigin } = useTunnels();
const { api, notify } = useApi();
const { copyText } = useClipboard();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val)
});

const tunnel = ref(null);
const saving = ref(false);
const savingName = ref(false);
const checkingPublish = ref(false);
const syncingDns = ref(false);
const loadingTunnel = ref(false);
const publishStatus = ref(null);

const drawerSize = ref(typeof window !== "undefined" && window.innerWidth <= 720 ? "100%" : "62%");
const drawerTitle = computed(() => (tunnel.value?.name ? `编辑 Tunnel · ${tunnel.value.name}` : "编辑 Tunnel"));

// Baseline snapshot of the last saved name + mappings, used to detect unsaved edits.
const savedState = ref({ name: "", mappings: "[]" });

function snapshotMappings() {
  const mappings = tunnel.value?.configuration?.mappings || [];
  return JSON.stringify(
    mappings.map((m) => ({
      hostname: m.hostname || "",
      service: m.service || "",
      path: m.path || "",
      originRequest: {
        noTLSVerify: Boolean(m.originRequest?.noTLSVerify),
        disableChunkedEncoding: Boolean(m.originRequest?.disableChunkedEncoding),
        http2Origin: Boolean(m.originRequest?.http2Origin)
      }
    }))
  );
}

const nameDirty = computed(() => Boolean(tunnel.value) && (tunnel.value.name || "") !== savedState.value.name);
const mappingsDirty = computed(() => Boolean(tunnel.value) && snapshotMappings() !== savedState.value.mappings);
const isDirty = computed(() => nameDirty.value || mappingsDirty.value);

async function openTunnel(id) {
  publishStatus.value = null;
  tunnel.value = null;
  if (!id) return;
  loadingTunnel.value = true;
  try {
    let t = tunnelsState.tunnels.find((item) => item.id === id);
    if (!t) {
      await loadTunnels();
      t = tunnelsState.tunnels.find((item) => item.id === id);
    }
    if (!t) {
      notify("未找到该 Tunnel，可能已被删除", "warning");
      visible.value = false;
      return;
    }
    if (t.configuration?.mappings) {
      t.configuration.mappings.forEach((m) => {
        if (m._showAdvanced === undefined) m._showAdvanced = false;
        if (!m.originRequest) m.originRequest = { noTLSVerify: false, disableChunkedEncoding: false, http2Origin: false };
      });
    }
    tunnel.value = t;
    savedState.value = { name: t.name || "", mappings: snapshotMappings() };
  } finally {
    loadingTunnel.value = false;
  }
}

// The drawer mutates the shared tunnel object directly, so discarding must
// restore the last saved snapshot to avoid leaking edits back into the list.
function revertToBaseline() {
  if (!tunnel.value) return;
  tunnel.value.name = savedState.value.name;
  try {
    const baseMappings = JSON.parse(savedState.value.mappings);
    tunnel.value.configuration = tunnel.value.configuration || {};
    tunnel.value.configuration.mappings = baseMappings.map((m) => ({
      hostname: m.hostname,
      service: m.service,
      path: m.path,
      _showAdvanced: false,
      originRequest: { ...m.originRequest }
    }));
  } catch (_) { /* keep current mappings if the snapshot can't be parsed */ }
}

async function handleBeforeClose(done) {
  if (!isDirty.value) {
    done();
    return;
  }
  try {
    await ElMessageBox.confirm("当前 Tunnel 有未保存的改动，确定要关闭吗？", "未保存的改动", {
      confirmButtonText: "放弃改动并关闭",
      cancelButtonText: "继续编辑",
      type: "warning"
    });
    revertToBaseline();
    done();
  } catch (_) { /* stay open */ }
}

function handleBeforeUnload(event) {
  if (!visible.value || !isDirty.value) return;
  event.preventDefault();
  event.returnValue = "";
}

watch(
  () => [props.modelValue, props.tunnelId],
  ([open, id], oldValue) => {
    const wasOpen = oldValue?.[0];
    const oldId = oldValue?.[1];
    if (open && (!wasOpen || id !== oldId)) {
      openTunnel(id);
    }
  },
  { immediate: true }
);

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", handleBeforeUnload);
}
onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeunload", handleBeforeUnload);
  }
});

function addMapping() {
  if (!tunnel.value) return;
  if (!tunnel.value.configuration) {
    tunnel.value.configuration = { mappings: [], catchAll: { service: "http_status:404" } };
  }
  tunnel.value.configuration.mappings.push({
    hostname: "", service: "", path: "",
    _showAdvanced: false,
    originRequest: { noTLSVerify: false, disableChunkedEncoding: false, http2Origin: false }
  });
}

function removeMapping(idx) {
  if (!tunnel.value?.configuration?.mappings?.length) return;
  if (tunnel.value.configuration.mappings.length <= 1) return;
  tunnel.value.configuration.mappings.splice(idx, 1);
}

function toggleAdvanced(idx) {
  const m = tunnel.value?.configuration?.mappings?.[idx];
  if (m) m._showAdvanced = !m._showAdvanced;
}

async function handleSaveName() {
  if (!nameDirty.value) return;
  savingName.value = true;
  try {
    await api(`/api/tunnels/${encodeURIComponent(tunnel.value.id)}`, {
      method: "PUT",
      body: JSON.stringify({ name: tunnel.value.name })
    });
    savedState.value = { ...savedState.value, name: tunnel.value.name || "" };
    notify("名称已更新");
    emit("saved");
  } catch (e) {
    notify(e.message, "error");
  } finally {
    savingName.value = false;
  }
}

async function handleSaveMappings() {
  saving.value = true;
  try {
    const mappings = tunnel.value.configuration.mappings.map((m) => ({
      hostname: m.hostname, service: m.service, path: m.path,
      originRequest: m.originRequest
    }));
    await saveMappings(tunnel.value, mappings);
    savedState.value = { ...savedState.value, mappings: snapshotMappings() };
    notify("路由已保存");
    emit("saved");
  } catch (e) {
    notify(e.message, "error");
  } finally {
    saving.value = false;
  }
}

async function handleCheckPublish() {
  checkingPublish.value = true;
  try {
    publishStatus.value = await checkPublishStatus(tunnel.value.id);
  } catch (e) {
    notify(e.message, "error");
  } finally {
    checkingPublish.value = false;
  }
}

async function handleSyncDns() {
  syncingDns.value = true;
  try {
    await syncDns(tunnel.value.id);
    notify("DNS 同步完成");
    await handleCheckPublish();
  } catch (e) {
    notify(e.message, "error");
  } finally {
    syncingDns.value = false;
  }
}

async function handleTestOrigin(idx) {
  const mapping = tunnel.value?.configuration?.mappings?.[idx];
  if (!mapping?.service) {
    notify("请先填写 service 地址", "warning");
    return;
  }
  try {
    const result = await testOrigin(
      tunnel.value.id, mapping.service,
      mapping.originRequest || { noTLSVerify: false, disableChunkedEncoding: false, http2Origin: false }
    );
    tunnel.value.ui.originTests[idx] = result;
  } catch (e) {
    notify(e.message, "error");
  }
}
</script>

<style scoped>
.editor-drawer-body {
  display: grid;
  gap: var(--space-4);
  align-content: start;
  min-height: 100%;
}

.editor-loading {
  display: flex; align-items: center; justify-content: center; gap: var(--space-2);
  padding: var(--space-8); color: var(--text-secondary); font-size: var(--fs-sm);
}
.inline-spinner {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid var(--primary-soft); border-top-color: var(--primary);
  animation: spin 0.8s linear infinite;
}

/* Header */
.editor-head { padding: var(--space-5); }
.editor-title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.name-field { display: grid; gap: 6px; flex: 1; min-width: 240px; }
.field-label { font-size: var(--fs-xs); font-weight: 700; color: var(--text-secondary); letter-spacing: 0.04em; }
.name-input-row { display: flex; gap: var(--space-2); }
.name-input { max-width: 380px; }
.editor-meta { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.meta-line { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--text-secondary); }
.meta-line .el-icon { font-size: 13px; }

/* Copyable Tunnel ID chip */
.id-chip {
  max-width: 100%;
  min-width: 0;
  padding: 3px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--panel-soft);
  font-family: "Fira Code", monospace;
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--motion-ease), color var(--motion-fast) var(--motion-ease);
}
.id-chip .id-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.id-chip .copy-icon { font-size: 12px; opacity: 0.55; flex-shrink: 0; }
.id-chip:hover { border-color: var(--primary-ring); color: var(--primary); }
.id-chip:hover .copy-icon { opacity: 1; }

/* Unsaved-changes hint */
.dirty-hint {
  display: inline-flex; align-items: center; gap: 5px;
  align-self: center;
  font-size: var(--fs-xs); font-weight: 600; color: var(--warn);
}
.dirty-hint .el-icon { font-size: 14px; }

/* Section */
.editor-section { padding: var(--space-5); }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-4); }

.mappings-list { display: flex; flex-direction: column; gap: var(--space-3); }
.mapping-row {
  display: flex; gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background: var(--panel-soft);
  transition: border-color var(--motion-fast) var(--motion-ease), box-shadow var(--motion-fast) var(--motion-ease);
}
.mapping-row:hover { border-color: var(--line-strong); box-shadow: var(--shadow-xs); }
.mapping-index {
  flex-shrink: 0;
  width: 24px; height: 24px;
  display: grid; place-items: center;
  border-radius: 50%;
  background: var(--primary-soft); color: var(--primary);
  font-size: var(--fs-xs); font-weight: 700;
}
.mapping-body { flex: 1; min-width: 0; }
.mapping-fields { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.mapping-fields .el-input { flex: 1; min-width: 150px; }
.mapping-fields .path-input { flex: 0 1 200px; }
.mapping-arrow { color: var(--text-faint); flex-shrink: 0; }
.mapping-advanced { margin-top: var(--space-2); display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.advanced-toggle {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 0; border: none; background: none;
  font-size: var(--fs-xs); cursor: pointer; color: var(--primary); font-weight: 600;
  user-select: none;
}
.advanced-toggle:hover { color: var(--primary-strong); }
.advanced-options {
  display: flex; gap: var(--space-4); flex-wrap: wrap;
  margin-top: var(--space-2); padding: var(--space-3);
  border-radius: var(--radius-sm); background: var(--panel-strong);
  border: 1px solid var(--line);
}
.origin-result {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: var(--space-2); padding: 6px 12px; border-radius: var(--radius-sm);
  font-size: var(--fs-xs); font-weight: 600;
}
.origin-result .el-icon { font-size: 14px; }
.origin-result.ok { background: var(--success-soft); color: var(--success); }
.origin-result.err { background: var(--danger-soft); color: var(--danger); }

.editor-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--line); }

/* Publish */
.publish-section { padding: var(--space-5); display: grid; gap: var(--space-3); }
.publish-summary { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.publish-list { display: grid; gap: var(--space-1); }
.publish-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
  background: var(--panel-soft); font-size: var(--fs-sm);
}
.publish-host { display: inline-flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.publish-host .el-icon { font-size: 13px; color: var(--primary); flex-shrink: 0; }

.collapse-fade-enter-active, .collapse-fade-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.collapse-fade-enter-from, .collapse-fade-leave-to { opacity: 0; transform: translateY(-4px); }

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 720px) {
  .mapping-arrow { display: none; }
  .mapping-fields .el-input, .mapping-fields .path-input { flex: 1 1 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .mapping-row, .collapse-fade-enter-active, .collapse-fade-leave-active, .inline-spinner { transition: none; animation: none; }
  .collapse-fade-enter-from, .collapse-fade-leave-to { transform: none; }
}
</style>
