<template>
  <div class="settings-page page-shell">
    <div class="settings-grid" v-loading="sState.settingsLoading">
      <!-- Cloudflare Credentials Card -->
      <div class="glass-card surface-card interactive-surface settings-panel" v-loading="saving || testing">
        <h3>Cloudflare API 凭据</h3>
        <el-form label-position="top">
          <el-form-item label="Account ID">
            <el-input v-model="sState.settingsForm.accountId" placeholder="输入 Cloudflare Account ID" />
          </el-form-item>
          <el-form-item label="API Token">
            <el-input v-model="sState.settingsForm.apiToken" type="password" show-password placeholder="输入 API Token" />
          </el-form-item>
          <div class="form-actions">
            <el-button type="primary" @click="handleSave" :loading="saving">保存配置</el-button>
            <el-button @click="handleTest" :loading="testing">测试 Token 权限</el-button>
          </div>
        </el-form>

        <div v-if="sState.configTestData" class="test-result">
          <h4>Token 检测结果</h4>
          <div class="permission-grid">
            <div class="perm-item" v-for="(ready, key) in sState.configTestData.ready || {}" :key="key">
              <span class="perm-dot" :class="ready ? 'ok' : 'err'"></span>
              <span>{{ capabilityLabel(key) }}</span>
            </div>
          </div>
          <div v-if="sState.configTestData.permissions?.granted?.length" class="perm-section">
            <strong>已授予权限：</strong>
            <span v-for="p in sState.configTestData.permissions.granted" :key="p" class="perm-tag granted">{{ p }}</span>
          </div>
          <div v-if="sState.configTestData.permissions?.missing?.length" class="perm-section">
            <strong>缺失权限：</strong>
            <span v-for="p in sState.configTestData.permissions.missing" :key="p" class="perm-tag missing">{{ p }}</span>
          </div>
          <div v-if="sState.configTestData.issues?.length" class="perm-section">
            <div v-for="issue in sState.configTestData.issues" :key="issue" class="issue-item">{{ issue }}</div>
          </div>
        </div>
      </div>

      <!-- Password Change Card -->
      <div class="glass-card surface-card interactive-surface settings-panel" v-loading="changingPassword">
        <h3>修改密码</h3>
        <el-form label-position="top">
          <el-form-item label="当前密码">
            <el-input v-model="sState.passwordForm.currentPassword" type="password" show-password />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="sState.passwordForm.newPassword" type="password" show-password />
          </el-form-item>
          <el-form-item label="确认新密码">
            <el-input v-model="sState.passwordForm.confirmPassword" type="password" show-password />
          </el-form-item>
          <el-button type="primary" @click="handleChangePassword" :loading="changingPassword">修改密码</el-button>
        </el-form>
        <div v-if="sState.passwordResult" class="password-result">
          {{ sState.passwordResult }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useSettings } from "../composables/useSettings.js";
import { useAuth } from "../composables/useAuth.js";
import { useRouter } from "vue-router";
import { useApi } from "../composables/useApi.js";

const router = useRouter();
const { state: sState, loadSettings, saveSettings, testSettings, changePassword } = useSettings();
const { logout } = useAuth();
const { notify } = useApi();

const saving = ref(false);
const testing = ref(false);
const changingPassword = ref(false);

function capabilityLabel(key) {
  const labels = {
    tunnelManagement: "Tunnel 管理",
    dnsPublish: "DNS 发布"
  };
  return labels[key] || key;
}

async function handleSave() {
  saving.value = true;
  try {
    await saveSettings();
    await loadSettings();
  } catch (e) {
    notify(e.message, "error");
  } finally {
    saving.value = false;
  }
}

async function handleTest() {
  testing.value = true;
  try {
    await testSettings();
  } catch (e) {
    notify(e.message, "error");
  } finally {
    testing.value = false;
  }
}

async function handleChangePassword() {
  changingPassword.value = true;
  try {
    await changePassword();
    await logout();
    router.push("/");
  } catch (e) {
    notify(e.message, "error");
  } finally {
    changingPassword.value = false;
  }
}

onMounted(loadSettings);
</script>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 20px;
}
.glass-card {
  position: relative;
  padding: 24px;
  border-radius: 16px;
  border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}
.settings-panel:hover {
  transform: translateY(-1px);
  border-color: var(--line-strong, rgba(92, 126, 178, 0.30));
  box-shadow: var(--shadow-soft, 0 10px 28px rgba(50, 80, 130, 0.10));
}
h3 { margin: 0 0 20px; font-size: 16px; }
.form-actions { display: flex; gap: 8px; }
.test-result { margin-top: 20px; }
.permission-grid { display: flex; gap: 12px; margin-bottom: 12px; }
.perm-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.perm-dot { width: 8px; height: 8px; border-radius: 50%; }
.perm-dot.ok { background: #67c23a; }
.perm-dot.err { background: #f56c6c; }
.perm-section { margin-top: 8px; }
.perm-tag {
  display: inline-block; padding: 2px 8px; margin: 2px;
  border-radius: 6px; font-size: 12px;
}
.perm-tag.granted { background: rgba(103,194,58,0.1); color: #67c23a; }
.perm-tag.missing { background: rgba(245,108,108,0.1); color: #f56c6c; }
.issue-item { font-size: 13px; color: #e6a23c; padding: 4px 0; }
.password-result { margin-top: 12px; font-size: 13px; color: var(--text-secondary, #999); }
@media (prefers-reduced-motion: reduce) {
  .glass-card { transition: none; }
  .settings-panel:hover { transform: none; }
}
</style>
