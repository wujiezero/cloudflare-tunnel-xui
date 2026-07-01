<template>
  <div class="settings-page page-shell">
    <div class="page-kicker">控制台</div>
    <h1 class="page-title">Cloudflare 配置</h1>
    <p class="page-subtitle">API 凭据、权限校验与账户安全</p>

    <div class="settings-grid" v-loading="sState.settingsLoading">
      <!-- Cloudflare Credentials Card -->
      <div class="surface-card settings-panel" v-loading="saving || testing">
        <div class="panel-head">
          <span class="panel-icon"><el-icon><Key /></el-icon></span>
          <h3 class="section-title">Cloudflare API 凭据</h3>
          <el-tag v-if="tokenTested" type="success" size="small" round>已验证</el-tag>
          <el-tag v-else type="warning" size="small" round>未验证</el-tag>
        </div>
        <p class="panel-desc">凭据将以 AES-256-GCM 加密后写回 config.json，不保存明文。</p>

        <el-form label-position="top">
          <el-form-item label="Account ID">
            <el-input v-model="sState.settingsForm.accountId" placeholder="输入 Cloudflare Account ID" class="mono-input" />
          </el-form-item>
          <el-form-item label="API Token">
            <el-input v-model="sState.settingsForm.apiToken" type="password" show-password placeholder="输入 API Token" class="mono-input" />
          </el-form-item>
          <div class="form-actions">
            <el-button @click="handleTest" :loading="testing">测试 Token 权限</el-button>
            <el-button type="primary" @click="handleSave" :loading="saving">保存配置</el-button>
          </div>
        </el-form>

        <transition name="collapse-fade">
          <div v-if="sState.configTestData" class="test-result">
            <div class="test-result-head">Token 检测结果</div>
            <div class="permission-grid">
              <div class="perm-item" v-for="(ready, key) in sState.configTestData.ready || {}" :key="key">
                <el-icon class="perm-mark" :class="ready ? 'ok' : 'err'">
                  <component :is="ready ? 'CircleCheck' : 'CircleClose'" />
                </el-icon>
                <span>{{ capabilityLabel(key) }}</span>
              </div>
            </div>
            <div v-if="sState.configTestData.permissions?.granted?.length" class="perm-section">
              <span class="perm-section-label">已授予权限</span>
              <div class="perm-tags">
                <span v-for="p in sState.configTestData.permissions.granted" :key="p" class="perm-tag granted mono">{{ p }}</span>
              </div>
            </div>
            <div v-if="sState.configTestData.permissions?.missing?.length" class="perm-section">
              <span class="perm-section-label">缺失权限</span>
              <div class="perm-tags">
                <span v-for="p in sState.configTestData.permissions.missing" :key="p" class="perm-tag missing mono">{{ p }}</span>
              </div>
            </div>
            <div v-if="sState.configTestData.issues?.length" class="perm-section">
              <div v-for="issue in sState.configTestData.issues" :key="issue" class="issue-item">
                <el-icon><WarningFilled /></el-icon>{{ issue }}
              </div>
            </div>
          </div>
        </transition>
      </div>

      <!-- Password Change Card -->
      <div class="surface-card settings-panel" v-loading="changingPassword">
        <div class="panel-head">
          <span class="panel-icon"><el-icon><Lock /></el-icon></span>
          <h3 class="section-title">账户安全</h3>
        </div>
        <p class="panel-desc">修改后需要使用新密码重新登录。</p>

        <el-form label-position="top">
          <el-form-item label="当前密码">
            <el-input v-model="sState.passwordForm.currentPassword" :type="pwShow ? 'text' : 'password'" />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="sState.passwordForm.newPassword" :type="pwShow ? 'text' : 'password'" />
          </el-form-item>
          <el-form-item label="确认新密码">
            <el-input
              v-model="sState.passwordForm.confirmPassword"
              :type="pwShow ? 'text' : 'password'"
              @keyup.enter="handleChangePassword"
            />
            <transition name="collapse-fade">
              <span v-if="passwordMismatch" class="field-error">
                <el-icon><WarningFilled /></el-icon>两次输入的新密码不一致
              </span>
            </transition>
          </el-form-item>
          <div class="password-footer">
            <el-checkbox v-model="pwShow">显示密码</el-checkbox>
            <el-button type="primary" @click="handleChangePassword" :loading="changingPassword" :disabled="!canChangePassword">
              修改密码
            </el-button>
          </div>
        </el-form>
        <div v-if="sState.passwordResult" class="password-result">
          <el-icon><InfoFilled /></el-icon>{{ sState.passwordResult }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from "vue";
import { Key, Lock, InfoFilled, WarningFilled } from "@element-plus/icons-vue";
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
const pwShow = ref(false);

const tokenTested = computed(() => !!sState.configTestData);
const passwordMismatch = computed(() =>
  Boolean(sState.passwordForm.confirmPassword) &&
  sState.passwordForm.newPassword !== sState.passwordForm.confirmPassword
);
const canChangePassword = computed(() =>
  Boolean(sState.passwordForm.currentPassword) &&
  Boolean(sState.passwordForm.newPassword) &&
  !passwordMismatch.value
);

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
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 20px;
  align-items: start;
  margin-top: 26px;
}
.settings-panel { position: relative; padding: 24px; }

.panel-head { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.panel-icon {
  flex-shrink: 0;
  display: grid; place-items: center;
  width: 36px; height: 36px; border-radius: var(--radius-md);
  background: var(--accent-soft); color: var(--accent); font-size: 17px;
}
.panel-desc { margin: 0 0 20px; font-size: 12.5px; color: var(--text-2); line-height: var(--lh-base); }

.mono-input :deep(input) { font-family: var(--font-mono); }

.form-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.password-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

.test-result {
  margin-top: var(--space-5); padding-top: var(--space-4);
  border-top: 1px solid var(--border);
  display: grid; gap: var(--space-3);
}
.test-result-head { font-weight: 700; font-size: var(--fs-sm); }
.permission-grid { display: flex; gap: var(--space-4); flex-wrap: wrap; }
.perm-item { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); font-weight: 600; }
.perm-mark { font-size: 16px; }
.perm-mark.ok { color: var(--success); }
.perm-mark.err { color: var(--danger); }
.perm-section { display: grid; gap: 6px; }
.perm-section-label { font-size: var(--fs-xs); font-weight: 700; color: var(--text-2); letter-spacing: 0.04em; }
.perm-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.perm-tag {
  display: inline-block; padding: 3px 10px;
  border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 600;
}
.perm-tag.granted { background: var(--success-soft); color: var(--success); }
.perm-tag.missing { background: var(--danger-soft); color: var(--danger); }
.issue-item { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--warning); }
.password-result {
  display: flex; align-items: center; gap: 6px;
  margin-top: var(--space-3); padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm); background: var(--accent-soft);
  font-size: var(--fs-sm); color: var(--accent);
}
.field-error {
  display: inline-flex; align-items: center; gap: 5px;
  margin-top: 6px; font-size: var(--fs-xs); font-weight: 600; color: var(--danger);
}
.field-error .el-icon { font-size: 14px; }
.collapse-fade-enter-active, .collapse-fade-leave-active { transition: opacity 200ms ease, transform 200ms ease; }
.collapse-fade-enter-from, .collapse-fade-leave-to { opacity: 0; transform: translateY(-6px); }
@media (prefers-reduced-motion: reduce) {
  .collapse-fade-enter-active, .collapse-fade-leave-active { transition: none; }
  .collapse-fade-enter-from, .collapse-fade-leave-to { transform: none; }
}
</style>
