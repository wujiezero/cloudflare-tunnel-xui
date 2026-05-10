<template>
  <div class="editor-page" v-loading="loadingTunnel">
    <div v-if="!tunnel" class="editor-loading">
      <p>加载中...</p>
    </div>
    <template v-else>
      <div class="editor-head">
        <div class="editor-title-row">
          <el-input v-model="tunnel.name" class="name-input" size="large" />
          <el-button type="primary" @click="handleSaveName" :loading="savingName">保存名称</el-button>
          <el-tag v-if="tunnel.status === 'healthy'" type="success">在线</el-tag>
          <el-tag v-else type="info">离线</el-tag>
          <span style="font-size:12px;color:var(--text-secondary,#999);margin-left:8px">
            {{ tunnel.connections || 0 }} 连接 · {{ tunnel.createdAt ? formatDateTime(tunnel.createdAt) : '—' }}
          </span>
        </div>
      </div>

      <el-divider />

      <div class="editor-section">
        <div class="section-header">
          <h4>路由映射</h4>
          <el-button size="small" @click="addMapping">添加路由</el-button>
        </div>

        <div class="mappings-list">
          <div v-for="(mapping, idx) in tunnel.configuration?.mappings" :key="idx" class="mapping-row glass-card">
            <div class="mapping-fields">
              <el-input v-model="mapping.hostname" placeholder="域名 (如 app.example.com)" size="small" />
              <el-input v-model="mapping.service" placeholder="服务地址 (如 http://localhost:3000)" size="small" />
              <el-input v-model="mapping.path" placeholder="路径 (如 /api/*，可选)" size="small" />
              <el-button size="small" @click="removeMapping(idx)" :disabled="tunnel.configuration.mappings.length <= 1">
                删除
              </el-button>
            </div>
            <div class="mapping-advanced">
              <span class="advanced-toggle" @click="toggleAdvanced(idx)">
                {{ mapping._showAdvanced ? '收起' : '高级选项' }}
              </span>
              <transition name="collapse-fade">
                <div v-if="mapping._showAdvanced" class="advanced-options">
                  <el-checkbox v-model="mapping.originRequest.noTLSVerify">noTLSVerify</el-checkbox>
                  <el-checkbox v-model="mapping.originRequest.disableChunkedEncoding">disableChunkedEncoding</el-checkbox>
                  <el-checkbox v-model="mapping.originRequest.http2Origin">http2Origin</el-checkbox>
                </div>
              </transition>
              <el-button size="small" text type="primary" @click="handleTestOrigin(idx)">测试源站</el-button>
            </div>
            <div v-if="tunnel.ui.originTests?.[idx]" class="origin-result" :class="tunnel.ui.originTests[idx].ok ? 'ok' : 'err'">
              {{ tunnel.ui.originTests[idx].message || (tunnel.ui.originTests[idx].ok ? '源站可达' : '源站不可达') }}
            </div>
          </div>
        </div>
      </div>

      <div class="editor-actions">
        <el-button type="primary" @click="handleSaveMappings" :loading="saving">保存路由</el-button>
        <el-button @click="handleCheckPublish" :loading="checkingPublish">检查发布状态</el-button>
        <el-button @click="handleSyncDns" :loading="syncingDns">同步 DNS</el-button>
        <el-button @click="router.push('/tunnels')">返回列表</el-button>
      </div>

      <div v-if="publishStatus" class="publish-section glass-card">
        <h4>DNS 发布状态</h4>
        <div v-if="publishStatus.summary">
          <el-tag size="small" type="success">{{ publishStatus.summary.published }} 已发布</el-tag>
          <el-tag size="small" type="warning">{{ publishStatus.summary.warnings }} 警告</el-tag>
          <el-tag size="small" type="danger">{{ publishStatus.summary.unpublished }} 未发布</el-tag>
        </div>
        <div v-for="item in (publishStatus.items || [])" :key="item.hostname" class="publish-item">
          <span>{{ item.hostname }}</span>
          <el-tag :type="item.status === 'published' ? 'success' : 'warning'" size="small">
            {{ item.status }}
          </el-tag>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTunnels } from "../composables/useTunnels.js";
import { useApi } from "../composables/useApi.js";
import { formatDateTime } from "../utils/formatters.js";

const route = useRoute();
const router = useRouter();
const { state: tunnelsState, loadTunnels, saveMappings, checkPublishStatus, syncDns, testOrigin } = useTunnels();
const { api, notify } = useApi();

const tunnelId = route.params.id;
const tunnel = ref(null);
const saving = ref(false);
const savingName = ref(false);
const checkingPublish = ref(false);
const syncingDns = ref(false);
const loadingTunnel = ref(false);
const publishStatus = ref(null);

function loadTunnelData() {
  const t = tunnelsState.tunnels.find((t) => t.id === tunnelId);
  if (t) {
    tunnel.value = t;
    if (t.configuration?.mappings) {
      t.configuration.mappings.forEach((m) => {
        if (m._showAdvanced === undefined) m._showAdvanced = false;
        if (!m.originRequest) m.originRequest = { noTLSVerify: false, disableChunkedEncoding: false, http2Origin: false };
      });
    }
  }
}

onMounted(async () => {
  loadingTunnel.value = true;
  try {
    await loadTunnels();
    loadTunnelData();
  } finally {
    loadingTunnel.value = false;
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
  savingName.value = true;
  try {
    await api(`/api/tunnels/${encodeURIComponent(tunnelId)}`, {
      method: "PUT",
      body: JSON.stringify({ name: tunnel.value.name })
    });
    notify("名称已更新");
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
    notify("路由已保存");
  } catch (e) {
    notify(e.message, "error");
  } finally {
    saving.value = false;
  }
}

async function handleCheckPublish() {
  checkingPublish.value = true;
  try {
    const result = await checkPublishStatus(tunnelId);
    publishStatus.value = result;
  } catch (e) {
    notify(e.message, "error");
  } finally {
    checkingPublish.value = false;
  }
}

async function handleSyncDns() {
  syncingDns.value = true;
  try {
    await syncDns(tunnelId);
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
      tunnelId, mapping.service,
      mapping.originRequest || { noTLSVerify: false, disableChunkedEncoding: false, http2Origin: false }
    );
    tunnel.value.ui.originTests[idx] = result;
  } catch (e) {
    notify(e.message, "error");
  }
}
</script>

<style scoped>
.editor-title-row { display: flex; align-items: center; gap: 12px; }
.name-input { max-width: 360px; }
.editor-section { margin-bottom: 24px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-header h4 { margin: 0; }
.mappings-list { display: flex; flex-direction: column; gap: 12px; }
.mapping-row {
  padding: 14px;
  border-radius: 12px;
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}
.mapping-row:hover {
  transform: translateY(-1px);
  border-color: var(--line-strong, rgba(92, 126, 178, 0.30));
  box-shadow: var(--shadow-soft, 0 10px 28px rgba(50, 80, 130, 0.10));
}
.mapping-fields { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.mapping-fields .el-input { flex: 1; min-width: 140px; }
.mapping-advanced { margin-top: 8px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.advanced-toggle { font-size: 12px; cursor: pointer; color: var(--el-color-primary, #f38020); }
.advanced-options { display: flex; gap: 12px; flex-wrap: wrap; }
.origin-result { margin-top: 6px; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
.origin-result.ok { background: rgba(103,194,58,0.1); color: #67c23a; }
.origin-result.err { background: rgba(245,108,108,0.1); color: #f56c6c; }
.editor-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
.publish-section { padding: 16px; border-radius: 12px; }
.publish-section h4 { margin: 0 0 12px; }
.publish-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; }
.collapse-fade-enter-active,
.collapse-fade-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.collapse-fade-enter-from,
.collapse-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: reduce) {
  .mapping-row,
  .collapse-fade-enter-active,
  .collapse-fade-leave-active {
    transition: none;
  }
  .mapping-row:hover,
  .collapse-fade-enter-from,
  .collapse-fade-leave-to {
    transform: none;
  }
}
</style>
