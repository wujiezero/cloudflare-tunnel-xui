<template>
  <aside class="sidebar" :class="{ 'nav-open': mobileNav.state.isOpen }">
    <div class="sidebar-brand">
      <BrandMark :size="36" :radius="10" />
      <div class="brand-copy">
        <strong class="brand-text">Tunnel XUI</strong>
        <span class="brand-subtitle">隧道管理控制台</span>
      </div>
    </div>

    <nav class="sidebar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.key"
        :to="item.to"
        class="nav-item"
        :class="{ active: isActive(item.to) }"
        @click="mobileNav.close()"
      >
        <span v-if="isActive(item.to)" class="nav-active-bg"></span>
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </nav>

    <div class="sidebar-spacer"></div>

    <div class="status-widget">
      <div class="status-kicker">系统状态</div>
      <div class="status-row">
        <span class="status-dot" :class="hasRunning ? 'ok pulse' : 'idle'"></span>
        <span class="status-text">{{ hasRunning ? "cloudflared 运行中" : "cloudflared 未运行" }}</span>
      </div>
      <div class="status-counts mono">{{ totalTunnels }} 个 Tunnel · {{ onlineTunnels }} 个在线</div>
    </div>

    <div class="sidebar-footer">
      <div class="theme-switch">
        <button type="button" class="theme-btn" :class="{ active: darkMode }" @click="setDarkMode(true)">
          <span v-if="darkMode" class="theme-btn-bg"></span>
          <el-icon><Moon /></el-icon>
          <span>深色</span>
        </button>
        <button type="button" class="theme-btn" :class="{ active: !darkMode }" @click="setDarkMode(false)">
          <span v-if="!darkMode" class="theme-btn-bg"></span>
          <el-icon><Sunny /></el-icon>
          <span>浅色</span>
        </button>
      </div>
      <button class="logout-btn" type="button" @click="handleLogout">
        <el-icon><SwitchButton /></el-icon>
        <span>退出登录</span>
      </button>
    </div>
  </aside>

  <div v-if="mobileNav.state.isOpen" class="nav-scrim" @click="mobileNav.close()"></div>
</template>

<script setup>
import { computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useTheme } from "../../composables/useTheme.js";
import { useAuth } from "../../composables/useAuth.js";
import { useCloudflared } from "../../composables/useCloudflared.js";
import { useTunnels } from "../../composables/useTunnels.js";
import { useMobileNav } from "../../composables/useMobileNav.js";
import BrandMark from "../common/BrandMark.vue";

const router = useRouter();
const route = useRoute();
const { state: themeState, setDarkMode } = useTheme();
const { logout } = useAuth();
const { state: cfState } = useCloudflared();
const { state: tunnelsState } = useTunnels();
const mobileNav = useMobileNav();

const darkMode = computed(() => themeState.darkMode);
const totalTunnels = computed(() => tunnelsState.tunnels.length);
const runningTunnelIds = computed(() => new Set(cfState.cloudflared.processes.filter((p) => p.running).map((p) => p.tunnelId)));
const onlineTunnels = computed(
  () => tunnelsState.tunnels.filter((t) => t.status === "healthy" || runningTunnelIds.value.has(t.id)).length
);
const hasRunning = computed(() => cfState.cloudflared.runningCount > 0);

const navItems = [
  { key: "dashboard", label: "首页", to: "/dashboard", icon: "HomeFilled" },
  { key: "tunnels", label: "Tunnels", to: "/tunnels", icon: "Connection" },
  { key: "settings", label: "Cloudflare 配置", to: "/settings", icon: "Setting" },
  { key: "about", label: "运行说明", to: "/about", icon: "InfoFilled" }
];

function isActive(to) {
  if (to === "/dashboard") return route.path === "/" || route.path.startsWith("/dashboard");
  return route.path.startsWith(to);
}

async function handleLogout() {
  await logout();
  router.push("/");
}
</script>

<style scoped>
.sidebar {
  position: relative;
  z-index: 70;
  width: 264px;
  flex-shrink: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  transition: transform var(--motion-slow) var(--ease-standard);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 22px 20px 18px;
  flex-shrink: 0;
}
.brand-copy { display: grid; gap: 1px; min-width: 0; }
.brand-text { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; color: var(--text); }
.brand-subtitle { font-size: var(--fs-xs); color: var(--text-3); }

.sidebar-nav { padding: 4px 12px; display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 12px;
  border-radius: 9px;
  text-decoration: none;
  color: var(--text);
  font-size: 13.5px;
  font-weight: 500;
}
.nav-item:hover { text-decoration: none; }
.nav-active-bg {
  position: absolute;
  inset: 0;
  background: var(--accent-soft);
  border-radius: 9px;
  border-left: 2.5px solid var(--accent);
}
.nav-item.active { font-weight: 700; color: var(--text); }
.nav-icon { position: relative; z-index: 1; font-size: 17px; flex-shrink: 0; color: var(--text-2); }
.nav-item.active .nav-icon { color: var(--accent); }
.nav-label { position: relative; z-index: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.sidebar-spacer { flex: 1; }

.status-widget {
  margin: 0 16px 14px;
  padding: 13px 14px;
  border-radius: var(--radius-md);
  background: var(--card-2);
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.status-kicker {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
  font-weight: 600;
  margin-bottom: 8px;
}
.status-row { display: flex; align-items: center; gap: 7px; margin-bottom: 5px; }
.status-text { font-size: 12.5px; color: var(--text); }
.status-counts { font-size: 12px; color: var(--text-2); }

.sidebar-footer { flex-shrink: 0; margin: 0 16px 16px; display: grid; gap: 10px; }
.theme-switch {
  display: flex;
  background: var(--card-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 3px;
  gap: 2px;
}
.theme-btn {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 0;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-2);
  font-size: 12px;
  font-family: inherit;
}
.theme-btn .el-icon, .theme-btn span:last-child { position: relative; z-index: 1; }
.theme-btn-bg {
  position: absolute;
  inset: 0;
  background: var(--card);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-card);
}
.theme-btn.active { color: var(--text); }

.logout-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  cursor: pointer;
  font-family: inherit;
  transition: color var(--motion-fast) var(--motion-ease), border-color var(--motion-fast) var(--motion-ease);
}
.logout-btn:hover { color: var(--danger); border-color: var(--danger); }

.nav-scrim {
  display: none;
  position: fixed;
  inset: 0;
  background: var(--overlay);
  z-index: 60;
}

@media (max-width: 880px) {
  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    transform: translateX(-100%);
  }
  .sidebar.nav-open { transform: translateX(0); }
  .nav-scrim { display: block; }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar { transition: none; }
}
</style>
