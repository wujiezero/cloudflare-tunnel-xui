<template>
  <header class="mobile-topbar">
    <button class="icon-btn" type="button" aria-label="打开导航" @click="mobileNav.open()">
      <el-icon><Menu /></el-icon>
    </button>
    <BrandMark :size="26" :radius="7" />
    <span class="brand-text">Tunnel XUI</span>
    <div class="spacer"></div>
    <button class="icon-btn" type="button" aria-label="切换主题" @click="toggleDarkMode()">
      <el-icon><component :is="darkMode ? 'Sunny' : 'Moon'" /></el-icon>
    </button>
  </header>
</template>

<script setup>
import { computed } from "vue";
import { useTheme } from "../../composables/useTheme.js";
import { useMobileNav } from "../../composables/useMobileNav.js";
import BrandMark from "../common/BrandMark.vue";

const { state: themeState, toggleDarkMode } = useTheme();
const mobileNav = useMobileNav();

const darkMode = computed(() => themeState.darkMode);
</script>

<style scoped>
.mobile-topbar {
  display: none;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--sidebar);
  position: sticky;
  top: 0;
  z-index: 40;
  flex-shrink: 0;
}
.brand-text { font-size: 14px; font-weight: 700; color: var(--text); }
.spacer { flex: 1; }
.icon-btn {
  display: flex;
  padding: 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.icon-btn:hover { border-color: var(--accent); color: var(--accent); }

@media (max-width: 880px) {
  .mobile-topbar { display: flex; }
}
</style>
