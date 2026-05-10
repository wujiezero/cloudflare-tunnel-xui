<template>
  <div class="login-page">
    <div class="login-glass" v-loading="loading">
      <div class="login-brand">CF</div>
      <h1>Cloudflare Tunnel XUI</h1>
      <p class="login-subtitle">管理控制台</p>
      <el-form @submit.prevent="handleLogin" label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="authState.loginForm.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="authState.loginForm.password" type="password" placeholder="请输入密码" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" class="login-btn">
            登录
          </el-button>
        </el-form-item>
      </el-form>
      <div class="login-features">
        <span>🔒 加密凭据存储</span>
        <span>🚀 一键隧道管理</span>
        <span>📊 实时状态监控</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useApi } from "../composables/useApi.js";
import { useAuth } from "../composables/useAuth.js";

const emit = defineEmits(["login-success"]);
const { notify } = useApi();
const { state: authState, login } = useAuth();

const loading = ref(false);

async function handleLogin() {
  loading.value = true;
  try {
    const payload = await login();
    emit("login-success", payload);
  } catch (error) {
    notify(error.message, "error");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}
.login-glass {
  width: 100%;
  max-width: 420px;
  padding: 40px;
  border-radius: 20px;
  background: var(--glass-bg, rgba(255,255,255,0.12));
  backdrop-filter: blur(26px) saturate(175%);
  -webkit-backdrop-filter: blur(26px) saturate(175%);
  border: 1px solid var(--glass-border, rgba(255,255,255,0.15));
  box-shadow: var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.12));
  animation: login-enter 260ms var(--ease-out, ease-out);
}
.login-brand {
  width: 64px; height: 64px;
  margin: 0 auto 16px;
  background: linear-gradient(135deg, #f38020, #f68c22);
  border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 700; color: #fff;
}
h1 { text-align: center; margin: 0 0 4px; font-size: 22px; }
.login-subtitle { text-align: center; color: var(--text-secondary, #999); margin: 0 0 28px; font-size: 14px; }
.login-btn { width: 100%; }
.login-features {
  display: flex; justify-content: center; gap: 16px; margin-top: 24px;
  font-size: 12px; color: var(--text-secondary, #999); flex-wrap: wrap;
}
@keyframes login-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .login-glass { animation: none; }
}
</style>
