<template>
  <div class="settings-page page-shell">
    <div class="settings-grid" v-loading="sState.settingsLoading">
      <!-- Cloudflare Credentials Card -->
      <div class="glass-card surface-card settings-panel" v-loading="saving || testing">
        <div class="panel-head">
          <span class="panel-icon"><el-icon><Key /></el-icon></span>
          <div>
            <h3 class="section-title">Cloudflare API 凭据</h3>
            <p class="panel-desc">凭据将以 AES-256-GCM 加密后写回 config.json，不保存明文。</p>
          </div>
        </div>
        <el-form label-position="top">
          <el-form-item label="Account ID">
            <el-input v-model="sState.settingsForm.accountId" placeholder="输入 Cloudflare Account ID" />
          </el-form-item>
          <el-form-item label="API Token">
            <el-input v-model="sState.settingsForm.apiToken" type="password" show-password placeholder="输入 API Token" />
          </el-form-item>
          <div class="form-actions">
            <el-button type="primary" @click="handleSave" :loading="saving" :icon="Lock">保存配置</el-button>
            <el-button @click="handleTest" :loading="testing" :icon="MagicStick">测试 Token 权限</el-button>
          </div>
        </el-form>

        <transition name="collapse-fade">
          <div v-if="sState.configTestData" class="test-result">
            <div class="test-result-head"><el-icon><Stamp /></el-icon>Token 检测结果</div>
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
                <span v-for="p in sState.configTestData.permissions.granted" :key="p" class="perm-tag granted">{{ p }}</span>
              </div>
            </div>
            <div v-if="sState.configTestData.permissions?.missing?.length" class="perm-section">
              <span class="perm-section-label">缺失权限</span>
              <div class="perm-tags">
                <span v-for="p in sState.configTestData.permissions.missing" :key="p" class="perm-tag missing">{{ p }}</span>
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
      <div class="glass-card surface-card settings-panel" v-loading="changingPassword">
        <div class="panel-head">
          <span class="panel-icon"><el-icon><Lock /></el-icon></span>
          <div>
            <h3 class="section-title">修改密码</h3>
            <p class="panel-desc">修改后需要使用新密码重新登录。</p>
          </div>
        </div>
        <el-form label-position="top">
          <el-form-item label="当前密码">
            <el-input v-model="sState.passwordForm.currentPassword" type="password" show-password />
          </el-form-item>
          <el-form-item label="新密码">
            <el-input v-model="sState.passwordForm.newPassword" type="password" show-password />
          </el-form-item>
          <el-form-item label="确认新密码">
            <el-input v-model="sState.passwordForm.confirmPassword" type="password" show-password @keyup.enter="handleChangePassword" />
            <transition name="collapse-fade">
              <span v-if="passwordMismatch" class="field-error">
                <el-icon><WarningFilled /></el-icon>两次输入的新密码不一致
              </span>
            </transition>
          </el-form-item>
          <el-button type="primary" @click="handleChangePassword" :loading="changingPassword" :disabled="!canChangePassword" :icon="Refresh">修改密码</el-button>
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
import { Key, Lock, MagicStick, Stamp, Refresh, InfoFilled, WarningFilled } from "@element-plus/icons-vue";
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
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: var(--space-5);
  align-items: start;
}
.glass-card { position: relative; padding: var(--space-6); }

.panel-head { display: flex; gap: var(--space-3); margin-bottom: var(--space-5); }
.panel-icon {
  flex-shrink: 0;
  display: grid; place-items: center;
  width: 40px; height: 40px; border-radius: var(--radius-sm);
  background: var(--primary-soft); color: var(--primary); font-size: 20px;
}
.panel-desc { margin: 4px 0 0; font-size: var(--fs-xs); color: var(--text-secondary); line-height: var(--lh-base); }

.form-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }

.test-result {
  margin-top: var(--space-5); padding-top: var(--space-4);
  border-top: 1px solid var(--line);
  display: grid; gap: var(--space-3);
}
.test-result-head { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: var(--fs-sm); }
.test-result-head .el-icon { color: var(--primary); }
.permission-grid { display: flex; gap: var(--space-4); flex-wrap: wrap; }
.perm-item { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); font-weight: 600; }
.perm-mark { font-size: 16px; }
.perm-mark.ok { color: var(--success); }
.perm-mark.err { color: var(--danger); }
.perm-section { display: grid; gap: 6px; }
.perm-section-label { font-size: var(--fs-xs); font-weight: 700; color: var(--text-secondary); letter-spacing: 0.04em; }
.perm-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.perm-tag {
  display: inline-block; padding: 3px 10px;
  border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 600;
  font-family: "Fira Code", monospace;
}
.perm-tag.granted { background: var(--success-soft); color: var(--success); }
.perm-tag.missing { background: var(--danger-soft); color: var(--danger); }
.issue-item { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--warn); }
.password-result {
  display: flex; align-items: center; gap: 6px;
  margin-top: var(--space-3); padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm); background: var(--primary-soft);
  font-size: var(--fs-sm); color: var(--primary);
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
