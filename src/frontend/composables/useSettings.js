import { reactive } from "vue";
import { useApi } from "./useApi.js";

const state = reactive({
  settingsForm: {
    accountId: "",
    apiToken: ""
  },
  maskedApiToken: "",
  settingsLoading: false,
  configTestResult: "等待测试...",
  configTestData: null,
  passwordForm: {
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  },
  passwordResult: "尚未修改密码。"
});

export function useSettings() {
  const { api, notify } = useApi();

  async function loadSettings() {
    state.settingsLoading = true;
    try {
      const payload = await api("/api/settings");
      state.settingsForm.accountId = payload.config.cloudflare.accountId || "";
      const masked = payload.config.cloudflare.tokenConfigured
        ? (payload.config.cloudflare.maskedToken || "••••••••")
        : "";
      state.maskedApiToken = masked;
      state.settingsForm.apiToken = masked;
    } finally {
      state.settingsLoading = false;
    }
    return true;
  }

  async function saveSettings() {
    const apiToken =
      state.settingsForm.apiToken === state.maskedApiToken ? "" : state.settingsForm.apiToken;
    await api("/api/settings/cloudflare", {
      method: "POST",
      body: JSON.stringify({
        accountId: state.settingsForm.accountId,
        apiToken
      })
    });
    state.configTestResult = "配置已保存。";
    state.configTestData = null;
    notify("Cloudflare 配置已保存");
  }

  async function testSettings() {
    const apiToken =
      state.settingsForm.apiToken === state.maskedApiToken ? "" : state.settingsForm.apiToken;
    const payload = await api("/api/settings/cloudflare/test", {
      method: "POST",
      body: JSON.stringify({
        accountId: state.settingsForm.accountId,
        apiToken
      })
    });
    state.configTestData = payload;
    state.configTestResult = JSON.stringify(payload, null, 2);
    notify("Token 检测完成");
    return payload;
  }

  async function changePassword() {
    if (!state.passwordForm.currentPassword || !state.passwordForm.newPassword) {
      state.passwordResult = "请完整填写当前密码和新密码。";
      notify(state.passwordResult, "warning");
      return;
    }
    if (state.passwordForm.newPassword !== state.passwordForm.confirmPassword) {
      state.passwordResult = "两次输入的新密码不一致。";
      notify(state.passwordResult, "warning");
      return;
    }
    const payload = await api("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: state.passwordForm.currentPassword,
        newPassword: state.passwordForm.newPassword
      })
    });
    state.passwordResult = payload.message || "密码已修改。";
    state.passwordForm.currentPassword = "";
    state.passwordForm.newPassword = "";
    state.passwordForm.confirmPassword = "";
    notify("密码已修改，请重新登录。", "success");
    return payload;
  }

  return {
    state,
    loadSettings,
    saveSettings,
    testSettings,
    changePassword
  };
}
