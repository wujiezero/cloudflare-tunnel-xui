<template>
  <el-drawer
    v-model="visible"
    direction="rtl"
    :size="drawerSize"
    :show-close="false"
    :before-close="handleBeforeClose"
    aria-label="编辑 Tunnel"
    class="panel-drawer"
    destroy-on-close
  >
    <div v-if="!tunnel" class="editor-loading" v-loading="true" element-loading-text="加载 Tunnel 配置中…"></div>

    <template v-else>
      <div class="drawer-header">
        <div class="header-main">
          <div class="header-kicker">编辑 TUNNEL</div>
          <div v-if="!nameEditing" class="name-display">
            <h1 class="drawer-title" :title="tunnel.name">{{ tunnel.name }}</h1>
            <button type="button" class="icon-btn-plain" @click="startRename"><el-icon><Edit /></el-icon></button>
            <el-tag :type="isOnline ? 'success' : 'info'" size="small" round>{{ isOnline ? '运行中' : '已停止' }}</el-tag>
          </div>
          <div v-else class="name-edit-row">
            <el-input v-model="nameDraft" class="name-draft-input" size="large" @keyup.enter="commitRename" />
            <button type="button" class="icon-btn-solid" @click="commitRename"><el-icon><Check /></el-icon></button>
            <button type="button" class="icon-btn-plain" @click="cancelRename"><el-icon><Close /></el-icon></button>
          </div>
          <div class="header-meta mono">
            <span>{{ tunnel.connections || 0 }} 连接</span>
            <span>{{ mappingCount }} 路由</span>
            <span>{{ tunnel.createdAt ? formatDateTime(tunnel.createdAt) : '—' }}</span>
          </div>
        </div>
        <div class="header-trailing">
          <button
            type="button"
            class="status-toggle-btn"
            :class="isOnline ? 'danger' : 'success'"
            :disabled="togglingStatus"
            @click="toggleTunnelStatus"
          >
            <el-icon v-if="togglingStatus" class="spin-icon"><Loading /></el-icon>
            <el-icon v-else><component :is="isOnline ? 'VideoPause' : 'VideoPlay'" /></el-icon>
            {{ isOnline ? '停止' : '启动' }}
          </button>
          <button type="button" class="icon-btn" @click="requestClose"><el-icon><Close /></el-icon></button>
        </div>
      </div>

      <div class="drawer-body scroll-thin">
        <div class="body-section-head">
          <h3 class="section-title"><el-icon><Guide /></el-icon>路由映射</h3>
          <el-button size="small" @click="addMapping" :icon="Plus">添加路由</el-button>
        </div>

        <div v-if="mappingCount" class="mappings-list">
          <div v-for="(mapping, idx) in tunnel.configuration?.mappings" :key="idx" class="mapping-row surface-card">
            <div class="mapping-source-row">
              <div class="mapping-index">{{ idx + 1 }}</div>
              <div class="input-group">
                <el-icon class="input-group-icon"><Link /></el-icon>
                <input v-model="mapping.hostname" class="bare-input mono" placeholder="sub.example.com" />
              </div>
            </div>

            <div class="mapping-target-row">
              <div class="target-arrow"><el-icon><Right /></el-icon></div>
              <div v-if="isSplittableService(mapping.service)" class="proto-host-group">
                <button
                  type="button"
                  class="proto-btn"
                  :class="{ active: splitService(mapping.service).proto === 'http' }"
                  @click="setProto(mapping, 'http')"
                >http</button>
                <button
                  type="button"
                  class="proto-btn"
                  :class="{ active: splitService(mapping.service).proto === 'https' }"
                  @click="setProto(mapping, 'https')"
                >https</button>
                <span class="proto-sep">://</span>
                <input
                  class="bare-input mono flex-1"
                  :value="splitService(mapping.service).host"
                  placeholder="192.168.1.10:8080"
                  @input="setHost(mapping, $event.target.value)"
                />
              </div>
              <div v-else class="input-group flex-1">
                <el-icon class="input-group-icon"><Monitor /></el-icon>
                <input v-model="mapping.service" class="bare-input mono" placeholder="tcp://localhost:2222" />
              </div>
            </div>

            <div class="mapping-path-row">
              <input v-model="mapping.path" class="bare-input path-input mono" placeholder="路径 (可选, 如 /api/*)" />
              <div class="mapping-icon-actions">
                <el-icon v-if="testingOrigin[idx]" class="spin-icon"><Loading /></el-icon>
                <span
                  v-else-if="tunnel.ui.originTests?.[idx]"
                  class="origin-badge mono"
                  :class="tunnel.ui.originTests[idx].ok ? 'ok' : 'err'"
                >{{ tunnel.ui.originTests[idx].ok ? '可达' : '不可达' }}</span>
                <button type="button" class="icon-btn" title="测试路由" @click="handleTestOrigin(idx)">
                  <el-icon><Aim /></el-icon>
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  :class="{ 'has-flags': hasAdvFlags(mapping) }"
                  title="高级选项"
                  @click="toggleAdvanced(idx)"
                >
                  <el-icon><Setting /></el-icon>
                </button>
                <button type="button" class="icon-btn" title="删除路由" @click="removeMapping(idx)">
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </div>

            <transition name="collapse-fade">
              <div v-if="mapping._showAdvanced" class="advanced-options">
                <label class="adv-check">
                  <input type="checkbox" v-model="mapping.originRequest.noTLSVerify" class="adv-checkbox" />
                  <span><div class="adv-title">跳过源站 TLS 校验</div><div class="adv-desc">noTLSVerify · 用于自签名证书的源站</div></span>
                </label>
                <label class="adv-check">
                  <input type="checkbox" v-model="mapping.originRequest.disableChunkedEncoding" class="adv-checkbox" />
                  <span><div class="adv-title">禁用分块传输编码</div><div class="adv-desc">disableChunkedEncoding · 兼容旧版 Web 服务器</div></span>
                </label>
                <label class="adv-check">
                  <input type="checkbox" v-model="mapping.originRequest.http2Origin" class="adv-checkbox" />
                  <span><div class="adv-title">使用 HTTP/2 连接源站</div><div class="adv-desc">http2Origin · 源站需支持 H2</div></span>
                </label>
              </div>
            </transition>
          </div>
        </div>
        <div v-else class="mappings-empty">
          <div class="mappings-empty-text">还没有路由映射，点击「添加路由」开始配置</div>
          <el-button type="primary" size="small" @click="addMapping">+ 添加路由</el-button>
        </div>

        <transition name="collapse-fade">
          <span v-if="mappingsDirty" class="dirty-hint">
            <el-icon><WarningFilled /></el-icon>路由有未保存的改动
          </span>
        </transition>

        <div v-if="publishStatus" class="publish-section surface-card">
          <h3 class="section-title"><el-icon><Promotion /></el-icon>DNS 发布状态</h3>
          <div v-if="publishStatus.summary" class="publish-summary">
            <el-tag size="small" type="success" round>{{ publishStatus.summary.published }} 已发布</el-tag>
            <el-tag size="small" type="warning" round>{{ publishStatus.summary.warnings }} 警告</el-tag>
            <el-tag size="small" type="danger" round>{{ publishStatus.summary.unpublished }} 未发布</el-tag>
          </div>
          <div class="publish-list">
            <div v-for="item in (publishStatus.items || [])" :key="item.hostname" class="publish-item">
              <span class="publish-host mono">{{ item.hostname }}</span>
              <el-tag :type="item.status === 'published' ? 'success' : 'warning'" size="small" round>
                {{ item.status }}
              </el-tag>
            </div>
          </div>
        </div>
      </div>

      <div class="drawer-footer">
        <button
          v-if="tunnel.id"
          type="button"
          class="id-chip mono"
          :title="`点击复制 Tunnel ID：${tunnel.id}`"
          @click="copyText(tunnel.id, 'Tunnel ID')"
        >{{ tunnel.id }}</button>
        <div class="footer-spacer"></div>
        <el-button @click="handleSyncDns" :loading="syncingDns">同步 DNS</el-button>
        <el-button @click="handleCheckPublish" :loading="checkingPublish">检查发布状态</el-button>
        <el-button type="primary" @click="handleSaveMappings" :loading="saving">保存路由</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { ref, reactive, computed, onBeforeUnmount, watch } from "vue";
import { ElMessageBox } from "element-plus";
import {
  Check, Plus, Delete, Link, Monitor, Right, Aim, Edit, Close,
  VideoPlay, VideoPause, Loading, Setting, Promotion, Guide, WarningFilled
} from "@element-plus/icons-vue";
import { useTunnels } from "../../composables/useTunnels.js";
import { useCloudflared } from "../../composables/useCloudflared.js";
import { useApi } from "../../composables/useApi.js";
import { useToast } from "../../composables/useToast.js";
import { useClipboard } from "../../composables/useClipboard.js";
import { formatDateTime } from "../../utils/formatters.js";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  tunnelId: { type: String, default: "" }
});
const emit = defineEmits(["update:modelValue", "saved"]);

const { state: tunnelsState, loadTunnels, saveMappings, checkPublishStatus, syncDns, testOrigin } = useTunnels();
const { state: cfState, startTunnel, stopTunnel } = useCloudflared();
const { api, notify } = useApi();
const { pushToast } = useToast();
const { copyText } = useClipboard();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val)
});

const tunnel = ref(null);
const saving = ref(false);
const checkingPublish = ref(false);
const syncingDns = ref(false);
const publishStatus = ref(null);
const testingOrigin = reactive({});
const togglingStatus = ref(false);

const nameEditing = ref(false);
const nameDraft = ref("");

const mappingCount = computed(() => tunnel.value?.configuration?.mappings?.length || 0);
const isOnline = computed(() => {
  if (!tunnel.value) return false;
  if (tunnel.value.status === "healthy") return true;
  return (cfState.cloudflared.processes || []).some((p) => p.running && p.tunnelId === tunnel.value.id);
});

const HTTP_SERVICE_RE = /^(https?):\/\/(.*)$/i;
function isSplittableService(service) {
  return !service || HTTP_SERVICE_RE.test(service);
}
function splitService(service) {
  const m = HTTP_SERVICE_RE.exec(service || "");
  if (m) return { proto: m[1].toLowerCase(), host: m[2] };
  return { proto: "http", host: "" };
}
function setProto(mapping, proto) {
  const { host } = splitService(mapping.service);
  mapping.service = `${proto}://${host}`;
}
function setHost(mapping, host) {
  const { proto } = splitService(mapping.service);
  mapping.service = `${proto}://${host}`;
}
function hasAdvFlags(mapping) {
  return !!(mapping.originRequest?.noTLSVerify || mapping.originRequest?.disableChunkedEncoding || mapping.originRequest?.http2Origin);
}

const windowWidth = ref(typeof window !== "undefined" ? window.innerWidth : 1280);
const drawerSize = computed(() => {
  const w = windowWidth.value;
  if (w <= 720) return "100%";
  if (w <= 1024) return "78%";
  // Cap the width on large/ultrawide screens for a readable editing column.
  return `${Math.min(Math.round(w * 0.6), 720)}px`;
});

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
  nameEditing.value = false;
  if (!id) return;
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
      type: "warning",
      customClass: "panel-confirm"
    });
    revertToBaseline();
    done();
  } catch (_) { /* stay open */ }
}

function requestClose() {
  handleBeforeClose(() => { visible.value = false; });
}

function handleBeforeUnload(event) {
  if (!visible.value || !isDirty.value) return;
  event.preventDefault();
  event.returnValue = "";
}

function handleResize() {
  windowWidth.value = window.innerWidth;
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
  window.addEventListener("resize", handleResize);
}
onBeforeUnmount(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("resize", handleResize);
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
  const mappings = tunnel.value?.configuration?.mappings;
  if (!mappings?.length) return;
  const [removed] = mappings.splice(idx, 1);
  pushToast(`已删除路由 ${removed.hostname || "(未命名)"}`, "warning", {
    actionLabel: "撤销",
    sticky: true,
    onAction: () => {
      if (tunnel.value?.configuration?.mappings && !tunnel.value.configuration.mappings.includes(removed)) {
        tunnel.value.configuration.mappings.splice(idx, 0, removed);
      }
    }
  });
}

function toggleAdvanced(idx) {
  const m = tunnel.value?.configuration?.mappings?.[idx];
  if (m) m._showAdvanced = !m._showAdvanced;
}

function startRename() {
  nameDraft.value = tunnel.value.name;
  nameEditing.value = true;
}
function cancelRename() {
  nameEditing.value = false;
}
async function commitRename() {
  const val = (nameDraft.value || "").trim();
  nameEditing.value = false;
  if (!val || val === tunnel.value.name) return;
  tunnel.value.name = val;
  await handleSaveName();
}

async function handleSaveName() {
  if (!nameDirty.value) return;
  try {
    await api(`/api/tunnels/${encodeURIComponent(tunnel.value.id)}`, {
      method: "PUT",
      body: JSON.stringify({ name: tunnel.value.name })
    });
    savedState.value = { ...savedState.value, name: tunnel.value.name || "" };
    notify("已更新 Tunnel 名称");
    emit("saved");
  } catch (e) {
    notify(e.message, "error");
  }
}

async function toggleTunnelStatus() {
  if (!tunnel.value || togglingStatus.value) return;
  if (isOnline.value) {
    try {
      await ElMessageBox.confirm(
        `将停止 Tunnel「${tunnel.value.name}」的本机 cloudflared 进程。`,
        "确认停止 Tunnel",
        { confirmButtonText: "确认停止", cancelButtonText: "取消", type: "warning", customClass: "panel-confirm" }
      );
    } catch (_) {
      return;
    }
  }
  togglingStatus.value = true;
  try {
    if (isOnline.value) {
      await stopTunnel(tunnel.value.id);
    } else {
      await startTunnel(tunnel.value.id);
    }
  } finally {
    togglingStatus.value = false;
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
    notify("请先填写服务地址", "warning");
    return;
  }
  testingOrigin[idx] = true;
  try {
    const result = await testOrigin(
      tunnel.value.id, mapping.service,
      mapping.originRequest || { noTLSVerify: false, disableChunkedEncoding: false, http2Origin: false }
    );
    tunnel.value.ui.originTests[idx] = result;
  } catch (e) {
    notify(e.message, "error");
  } finally {
    testingOrigin[idx] = false;
  }
}
</script>

<style scoped>
.editor-loading { min-height: 320px; }

/* Header */
.drawer-header {
  flex-shrink: 0;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.header-main { flex: 1; min-width: 0; }
.header-kicker { margin-bottom: 6px; font-size: var(--fs-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); font-weight: 600; }
.name-display { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.drawer-title { margin: 0; font-size: var(--fs-lg); font-weight: 700; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.name-edit-row { display: flex; align-items: center; gap: 8px; }
.name-draft-input { max-width: 320px; }
.header-meta { display: flex; gap: 14px; font-size: 12px; color: var(--text-2); margin-top: 10px; }

.icon-btn-plain, .icon-btn-solid, .icon-btn {
  display: flex; flex-shrink: 0; padding: 7px; border-radius: var(--radius-sm);
  border: 1px solid transparent; background: transparent; color: var(--text-2); cursor: pointer;
}
.icon-btn-plain:hover { color: var(--accent); }
.icon-btn-solid { background: var(--accent); color: #fff; }
.icon-btn-solid:hover { background: var(--accent-2); }
.icon-btn { border-color: var(--border); }
.icon-btn:hover { border-color: var(--accent); color: var(--accent); }
.icon-btn.has-flags { position: relative; }
.icon-btn.has-flags::after {
  content: ""; position: absolute; top: 2px; right: 2px; width: 6px; height: 6px;
  border-radius: 50%; background: var(--accent);
}

.header-trailing { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.status-toggle-btn {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 12px; border-radius: var(--radius-sm);
  background: transparent; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
  white-space: nowrap;
}
.status-toggle-btn.danger { border: 1px solid var(--danger); color: var(--danger); }
.status-toggle-btn.success { border: 1px solid var(--success); color: var(--success); }
.status-toggle-btn:disabled { opacity: 0.6; cursor: not-allowed; }

/* Body */
.drawer-body { flex: 1; overflow-y: auto; padding: 20px 24px; display: grid; gap: 16px; align-content: start; }
.body-section-head { display: flex; align-items: center; justify-content: space-between; }

.mappings-list { display: flex; flex-direction: column; gap: 12px; }
.mapping-row { padding: 16px; border-radius: var(--radius-lg); display: grid; gap: 8px; }

.mapping-source-row, .mapping-target-row { display: flex; align-items: center; gap: 10px; }
.mapping-index {
  flex-shrink: 0; width: 22px; height: 22px; display: grid; place-items: center;
  border-radius: 50%; background: var(--card-2); color: var(--text-2); font-size: 10.5px; font-weight: 700;
}
.target-arrow {
  flex-shrink: 0; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: var(--card-2); border: 1px solid var(--border); color: var(--text-2);
}
.input-group {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px;
  background: var(--input-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0 10px;
}
.input-group-icon { color: var(--text-3); font-size: 13px; flex-shrink: 0; }
.bare-input {
  flex: 1; min-width: 0; padding: 9px 0; border: none; background: transparent;
  color: var(--text); font-size: 13px; font-family: inherit; outline: none;
}
.flex-1 { flex: 1; min-width: 0; }
.proto-host-group {
  flex: 1; min-width: 0; display: flex; align-items: center;
  background: var(--input-bg); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden;
}
.proto-btn {
  position: relative; flex-shrink: 0; padding: 9px 10px; border: none; background: transparent;
  color: var(--text-2); font-size: 11.5px; font-weight: 600; cursor: pointer; font-family: var(--font-mono);
}
.proto-btn.active { background: var(--accent-soft); color: var(--text); }
.proto-btn:first-child { border-right: 1px solid var(--border); }
.proto-sep { padding-left: 8px; color: var(--text-3); font-size: 12px; flex-shrink: 0; }
.proto-host-group .bare-input { padding: 9px 10px; }

.mapping-path-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.path-input { flex: 1; min-width: 120px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 9px 10px; font-size: 12.5px; background: var(--input-bg); }
.mapping-icon-actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.origin-badge { padding: 5px 9px; border-radius: 7px; font-size: 11.5px; font-weight: 600; }
.origin-badge.ok { background: var(--success-soft); color: var(--success); }
.origin-badge.err { background: var(--danger-soft); color: var(--danger); }
.spin-icon { animation: spin 0.8s linear infinite; }

.advanced-options {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;
  margin-top: 6px; padding-top: 14px; border-top: 1px solid var(--border);
}
.adv-check { display: flex; gap: 9px; cursor: pointer; }
.adv-checkbox { margin-top: 2px; flex-shrink: 0; accent-color: var(--accent); cursor: pointer; }
.adv-title { font-size: 12.5px; font-weight: 500; color: var(--text); }
.adv-desc { font-size: 11.5px; color: var(--text-2); margin-top: 2px; }

.mappings-empty {
  text-align: center; padding: 44px 20px; color: var(--text-2);
  background: var(--card); border: 1px dashed var(--border-strong); border-radius: var(--radius-lg);
}
.mappings-empty-text { font-size: 13px; margin-bottom: 12px; }

.dirty-hint { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); font-weight: 600; color: var(--warning); }
.dirty-hint .el-icon { font-size: 14px; }

.publish-section { padding: var(--space-5); display: grid; gap: var(--space-3); }
.publish-summary { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.publish-list { display: grid; gap: var(--space-1); }
.publish-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-2);
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
  background: var(--card-2); font-size: var(--fs-sm);
}
.publish-host { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Footer */
.drawer-footer {
  flex-shrink: 0; padding: 14px 24px; border-top: 1px solid var(--border-strong);
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--card);
}
.footer-spacer { flex: 1; }
.id-chip {
  font-size: 11.5px; color: var(--text-2); background: transparent; border: none; cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; padding: 0;
}
.id-chip:hover { color: var(--accent); }

.collapse-fade-enter-active, .collapse-fade-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.collapse-fade-enter-from, .collapse-fade-leave-to { opacity: 0; transform: translateY(-4px); }

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 720px) {
  .drawer-header, .drawer-body, .drawer-footer { padding-left: var(--space-4); padding-right: var(--space-4); }
}
@media (prefers-reduced-motion: reduce) {
  .collapse-fade-enter-active, .collapse-fade-leave-active, .spin-icon { transition: none; animation: none; }
  .collapse-fade-enter-from, .collapse-fade-leave-to { transform: none; }
}
</style>
