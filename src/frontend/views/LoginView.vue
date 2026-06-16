<template>
  <div class="login-page">
    <div class="login-glass surface-card" v-loading="loading">
      <div class="login-brand">CF</div>
      <h1>Cloudflare Tunnel XUI</h1>
      <p class="login-subtitle">管理控制台</p>
      <el-form @submit.prevent="handleLogin" label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="authState.loginForm.username" placeholder="请输入用户名" size="large">
            <template #prefix><el-icon><User /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="authState.loginForm.password" type="password" placeholder="请输入密码" show-password size="large">
            <template #prefix><el-icon><Lock /></el-icon></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading" size="large" class="login-btn">
            <el-icon class="el-icon--left"><Right /></el-icon>登录
          </el-button>
        </el-form-item>
      </el-form>
      <div class="login-features">
        <span><el-icon><Lock /></el-icon>加密凭据存储</span>
        <span><el-icon><Connection /></el-icon>一键隧道管理</span>
        <span><el-icon><TrendCharts /></el-icon>实时状态监控</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { User, Lock, Right, Connection, TrendCharts } from "@element-plus/icons-vue";
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
  padding: var(--space-6);
}
.login-glass {
  width: 100%;
  max-width: 420px;
  padding: var(--space-8);
  border-radius: var(--radius-xl);
  backdrop-filter: var(--blur-heavy);
  -webkit-backdrop-filter: var(--blur-heavy);
  box-shadow: var(--shadow), var(--inset-highlight), var(--inset-depth);
  animation: login-enter 320ms var(--ease-out);
}
.login-brand {
  position: relative;
  width: 66px; height: 66px;
  margin: 0 auto var(--space-4);
  /* Cloudflare orange reserved for the logo */
  background: linear-gradient(135deg, var(--brand-orange), var(--brand-orange-2));
  border-radius: var(--radius-lg);
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 800; color: #fff;
  box-shadow: 0 12px 28px rgba(243, 128, 32, 0.36), inset 0 1px 0 rgba(255,255,255,0.3);
}
h1 { text-align: center; margin: 0 0 4px; font-size: var(--fs-lg); font-weight: 700; }
.login-subtitle { text-align: center; color: var(--text-secondary); margin: 0 0 var(--space-6); font-size: var(--fs-base); }
.login-btn { width: 100%; }
.login-features {
  display: flex;
  justify-content: center;
  gap: var(--space-4);
  margin-top: var(--space-6);
  padding-top: var(--space-5);
  border-top: 1px solid var(--line);
  font-size: var(--fs-xs);
  color: var(--text-secondary);
  flex-wrap: wrap;
}
.login-features span { display: inline-flex; align-items: center; gap: 5px; }
.login-features .el-icon { color: var(--primary); font-size: 14px; }
@keyframes login-enter {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .login-glass { animation: none; }
}
</style>
