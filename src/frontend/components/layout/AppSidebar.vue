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
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </nav>

    <div class="sidebar-footer">
      <button class="footer-btn theme-toggle" type="button" @click="toggleTheme">
        <el-icon><component :is="darkMode ? 'Sunny' : 'Moon'" /></el-icon>
        <span>{{ darkMode ? '浅色模式' : '深色模式' }}</span>
      </button>
      <button class="footer-btn logout" type="button" @click="handleLogout">
        <el-icon><SwitchButton /></el-icon>
        <span>退出登录</span>
      </button>
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
  { key: "dashboard", label: "首页", to: "/dashboard", icon: "Odometer" },
  { key: "tunnels", label: "Tunnels", to: "/tunnels", icon: "Connection" },
  { key: "settings", label: "Cloudflare 配置", to: "/settings", icon: "Setting" },
  { key: "about", label: "运行说明", to: "/about", icon: "InfoFilled" }
];

function isActive(to) {
  if (to === "/dashboard") return route.path === "/" || route.path.startsWith("/dashboard");
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
  padding: var(--space-4);
  overflow: hidden;
}
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-1) var(--space-1) var(--space-4);
  border-bottom: 1px solid var(--line);
  margin-bottom: var(--space-4);
}
.brand-mark {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
  /* Cloudflare orange reserved for the logo mark only */
  background: linear-gradient(145deg, var(--brand-orange), var(--brand-orange-2));
  box-shadow: 0 8px 18px rgba(243, 128, 32, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.3);
}
.brand-copy { display: grid; gap: 2px; min-width: 0; }
.brand-kicker {
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.brand-text { font-size: var(--fs-md); font-weight: 700; line-height: 1.2; }

.sidebar-nav { flex: 1; display: flex; flex-direction: column; gap: var(--space-1); }
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  padding: 0 var(--space-3) 0 var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-secondary);
  font-size: var(--fs-base);
  font-weight: 500;
  transition:
    background-color var(--motion-normal) var(--motion-ease),
    border-color var(--motion-normal) var(--motion-ease),
    color var(--motion-normal) var(--motion-ease),
    transform var(--motion-fast) var(--motion-pop);
}
.nav-item:hover {
  background: var(--glass-bg-hover);
  border-color: var(--line);
  color: var(--text);
  transform: translateX(2px);
  text-decoration: none;
}
.nav-item.active {
  background: var(--primary-soft);
  border-color: var(--primary-ring);
  color: var(--primary);
  font-weight: 700;
  transform: none;
}
.nav-icon { font-size: 18px; flex-shrink: 0; }
.nav-indicator {
  position: absolute;
  left: 5px;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 3px;
  height: 20px;
  border-radius: var(--radius-pill);
  background: var(--primary);
  box-shadow: 0 0 10px var(--primary-ring);
  transition: transform var(--motion-normal) var(--motion-pop);
}
.nav-item.active .nav-indicator { transform: translateY(-50%) scaleY(1); }
.nav-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
}
.footer-btn {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 40px;
  padding: 0 var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--fs-sm);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition:
    background-color var(--motion-fast) var(--motion-ease),
    color var(--motion-fast) var(--motion-ease);
}
.footer-btn .el-icon { font-size: 16px; }
.footer-btn.theme-toggle:hover { background: var(--primary-soft); color: var(--primary); }
.footer-btn.logout:hover { background: var(--danger-soft); color: var(--danger); }

@media (prefers-reduced-motion: reduce) {
  .nav-item, .nav-indicator { transition: none; }
  .nav-item:hover { transform: none; }
}
@media (max-width: 900px) {
  .sidebar { min-height: auto; }
  .sidebar-nav { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
  .sidebar-footer { flex-direction: row; }
}
</style>
