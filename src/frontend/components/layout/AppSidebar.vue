<template>
  <aside class="sidebar">
    <div class="sidebar-brand">
      <div class="brand-orb">CF</div>
      <span class="brand-text">Tunnel XUI</span>
    </div>
    <nav class="sidebar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.key"
        :to="item.to"
        class="nav-item"
        :class="{ active: isActive(item.to) }"
      >
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="sidebar-footer">
      <el-button size="small" @click="toggleTheme" text>
        {{ darkMode ? '☀️ 浅色' : '🌙 深色' }}
      </el-button>
      <el-button size="small" @click="handleLogout" text type="danger">
        退出
      </el-button>
    </div>
  </aside>
</template>

<script setup>
import { useRouter, useRoute } from "vue-router";
import { NAV_ITEMS } from "../../utils/constants.js";
import { useTheme } from "../../composables/useTheme.js";
import { useAuth } from "../../composables/useAuth.js";
import { useApi } from "../../composables/useApi.js";

const router = useRouter();
const route = useRoute();
const { state: themeState, toggleDarkMode } = useTheme();
const { logout } = useAuth();
const { api } = useApi();

const darkMode = themeState.darkMode;

const navItems = [
  { key: "dashboard", label: "首页", to: "/dashboard" },
  { key: "tunnels", label: "Tunnels", to: "/tunnels" },
  { key: "settings", label: "Cloudflare 配置", to: "/settings" },
  { key: "about", label: "运行说明", to: "/about" }
];

function isActive(to) {
  return route.path.startsWith(to);
}

function toggleTheme() {
  toggleDarkMode();
}

async function handleLogout() {
  await logout();
  router.push("/");
}
</script>

<style scoped>
.sidebar {
  width: 220px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 20px 12px;
  border-right: 1px solid var(--glass-border, rgba(255,255,255,0.08));
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px 24px;
  border-bottom: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  margin-bottom: 16px;
}
.brand-orb {
  width: 36px; height: 36px;
  background: linear-gradient(135deg, #f38020, #f68c22);
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: #fff;
}
.brand-text { font-size: 16px; font-weight: 600; }
.sidebar-nav { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.nav-item {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 10px;
  text-decoration: none;
  color: var(--text-secondary, #999);
  font-size: 14px;
  transition: all 0.2s;
  cursor: pointer;
}
.nav-item:hover {
  background: var(--glass-bg-hover, rgba(255,255,255,0.06));
  color: inherit;
}
.nav-item.active {
  background: var(--glass-bg-active, rgba(255,255,255,0.1));
  color: var(--el-color-primary, #f38020);
  font-weight: 600;
}
.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--glass-border, rgba(255,255,255,0.08));
}
</style>
