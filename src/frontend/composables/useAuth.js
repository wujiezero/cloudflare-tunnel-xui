import { reactive } from "vue";
import { useApi } from "./useApi.js";

const state = reactive({
  authenticated: false,
  user: "",
  loginForm: { username: "", password: "" }
});

let pollTimer = null;

export function useAuth() {
  const { api, notify } = useApi();

  function clearPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function setAuthenticated(authenticated, user = "") {
    state.authenticated = authenticated;
    state.user = user;
    if (!authenticated) {
      clearPolling();
    }
  }

  async function checkSession() {
    try {
      const me = await api("/api/auth/me");
      if (me?.config?.auth?.username) {
        state.loginForm.username = me.config.auth.username;
      }
      if (me.authenticated) {
        setAuthenticated(true, me.user);
        return true;
      }
    } catch (_) {
      // not authenticated
    }
    setAuthenticated(false);
    return false;
  }

  async function login() {
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(state.loginForm)
    });
    setAuthenticated(true, payload.user);
    notify("登录成功");
    return payload;
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    notify("已退出登录", "info");
  }

  async function changePassword(currentPassword, newPassword) {
    return api("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  return {
    state,
    checkSession,
    login,
    logout,
    changePassword,
    setAuthenticated,
    clearPolling
  };
}
