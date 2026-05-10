<template>
  <aside class="sidebar surface-card">
    <div class="sidebar-brand">
      <div class="brand-mark">CF</div>
      <div class="brand-copy">
        <span class="brand-kicker">Cloudflare</span>
        <strong class="brand-text">Tunnel XUI</strong>
      </div>
    </div>
    <nav class="sidebar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.key"
        :to="item.to"
        class="nav-item"
        :class="{ active: isActive(item.to) }"
      >
        <span class="nav-indicator"></span>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </nav>
    <div class="sidebar-footer">
      <el-button class="theme-toggle" size="small" @click="toggleTheme" text>
        {{ darkMode ? '浅色模式' : '深色模式' }}
      </el-button>
      <el-button class="logout-button" size="small" @click="handleLogout" text type="danger">
        退出
      </el-button>
    </div>
  </aside>
</template>

<script setup>
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useTheme } from "../../composables/useTheme.js";
import { useAuth } from "../../composables/useAuth.js";

const router = useRouter();
const route = useRoute();
const { state: themeState, toggleDarkMode } = useTheme();
const { logout } = useAuth();

const darkMode = computed(() => themeState.darkMode);

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
  position: relative;
  z-index: 1;
  min-height: calc(100vh - 36px);
  display: flex;
  flex-direction: column;
  padding: 18px;
  overflow: hidden;
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 2px 18px;
  border-bottom: 1px solid var(--glass-border, rgba(255,255,255,0.08));
  margin-bottom: 16px;
}
.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: linear-gradient(145deg, var(--primary), var(--primary-strong));
  box-shadow: 0 10px 22px rgba(42, 109, 246, 0.28);
}
.brand-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.brand-kicker {
  color: var(--text-secondary, #647693);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.brand-text {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}
.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  text-decoration: none;
  color: var(--text-secondary, #647693);
  font-size: 14px;
  transition:
    background-color var(--motion-normal) var(--motion-ease),
    border-color var(--motion-normal) var(--motion-ease),
    color var(--motion-normal) var(--motion-ease),
    transform var(--motion-fast) var(--motion-pop);
  cursor: pointer;
}
.nav-item:hover {
  background: var(--glass-bg-hover, rgba(255,255,255,0.74));
  border-color: var(--line, rgba(92,126,178,0.18));
  color: var(--text, #1b2b44);
  transform: translateX(2px);
}
.nav-item.active {
  background: var(--glass-bg-active, rgba(255,255,255,0.84));
  border-color: rgba(42, 109, 246, 0.24);
  color: var(--primary, #2a6df6);
  font-weight: 700;
  box-shadow: var(--shadow-soft, 0 10px 28px rgba(50, 80, 130, 0.10));
  transform: none;
}
.nav-indicator {
  width: 5px;
  height: 18px;
  border-radius: 999px;
  background: transparent;
  transition:
    background-color var(--motion-normal) var(--motion-ease),
    box-shadow var(--motion-normal) var(--motion-ease),
    transform var(--motion-normal) var(--motion-pop);
}
.nav-item.active .nav-indicator {
  background: var(--primary, #2a6df6);
  box-shadow: 0 0 12px rgba(42, 109, 246, 0.32);
}
.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--glass-border, rgba(255,255,255,0.08));
}
.theme-toggle,
.logout-button {
  width: 100%;
  justify-content: flex-start;
  border-radius: 10px;
}
@media (prefers-reduced-motion: reduce) {
  .nav-item,
  .nav-indicator {
    transition: none;
  }
  .nav-item:hover {
    transform: none;
  }
}
@media (max-width: 900px) {
  .sidebar {
    min-height: auto;
  }
  .sidebar-nav {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  }
  .sidebar-footer {
    flex-direction: row;
  }
}
</style>
