import { reactive } from "vue";

const state = reactive({
  darkMode: false
});

function applyTheme(dark) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  try { localStorage.setItem("cf_tunnel_xui.theme", dark ? "dark" : "light"); } catch (_) {}
}

export function useTheme() {
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("cf_tunnel_xui.theme"); } catch (_) {}
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    state.darkMode = saved === "dark" || (!saved && prefersDark);
    applyTheme(state.darkMode);
  }

  function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    applyTheme(state.darkMode);
  }

  function setDarkMode(dark) {
    state.darkMode = dark;
    applyTheme(state.darkMode);
  }

  // Auto-init on first import
  if (typeof window !== "undefined") {
    initTheme();
  }

  return { state, toggleDarkMode, setDarkMode, initTheme };
}
