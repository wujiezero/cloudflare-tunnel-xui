import { reactive, computed } from "vue";
import { useApi } from "./useApi.js";
import { normalizeMappings, getMappingsSignature } from "../utils/formatters.js";

const state = reactive({
  tunnels: [],
  tunnelsLoading: false,
  tunnelSearch: "",
  tunnelSort: "name",
  tunnelSortOrder: "asc",
  tunnelSelection: [],
  batchActionLoading: false
});

const filteredTunnels = computed(() => {
  let list = [...state.tunnels];

  // Search filter
  const q = state.tunnelSearch.trim().toLowerCase();
  if (q) {
    list = list.filter((t) => {
      const name = (t.name || "").toLowerCase();
      const id = (t.id || "").toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }

  // Sort
  const field = state.tunnelSort;
  const dir = state.tunnelSortOrder === "asc" ? 1 : -1;
  list.sort((a, b) => {
    let va, vb;
    if (field === "name") {
      va = (a.name || "").toLowerCase();
      vb = (b.name || "").toLowerCase();
    } else if (field === "connections") {
      va = Number(a.connections || 0);
      vb = Number(b.connections || 0);
    } else if (field === "mappings") {
      va = (a.configuration?.mappings?.length || 0);
      vb = (b.configuration?.mappings?.length || 0);
    } else if (field === "createdAt") {
      va = a.createdAt || "";
      vb = b.createdAt || "";
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  return list;
});

export function useTunnels() {
  const { api, notify } = useApi();

  function ensureTunnelUi(tunnel) {
    if (!tunnel.ui) {
      tunnel.ui = {
        mappingDirty: false,
        originTests: {},
        mappingSignature: "",
        publishStatus: null,
        publishStatusLoading: false,
        publishStatusError: ""
      };
    }
    if (!tunnel.ui.originTests) tunnel.ui.originTests = {};
    if (typeof tunnel.ui.mappingSignature !== "string") tunnel.ui.mappingSignature = "";
    if (typeof tunnel.ui.publishStatusLoading !== "boolean") tunnel.ui.publishStatusLoading = false;
    if (typeof tunnel.ui.publishStatusError !== "string") tunnel.ui.publishStatusError = "";
    if (!("publishStatus" in tunnel.ui)) tunnel.ui.publishStatus = null;

    if (Array.isArray(tunnel.configuration?.mappings)) {
      tunnel.configuration.mappings = tunnel.configuration.mappings.map((m) => ({
        ...m,
        originRequest: {
          noTLSVerify: Boolean(m?.originRequest?.noTLSVerify),
          disableChunkedEncoding: Boolean(m?.originRequest?.disableChunkedEncoding),
          http2Origin: Boolean(m?.originRequest?.http2Origin)
        }
      }));
    }
    return tunnel;
  }

  async function loadTunnels() {
    state.tunnelsLoading = true;
    try {
      const payload = await api("/api/tunnels");
      state.tunnels = (payload.items || []).map((item) => ensureTunnelUi(item));
    } finally {
      state.tunnelsLoading = false;
    }
  }

  async function createTunnel(form) {
    const payload = await api("/api/tunnels", {
      method: "POST",
      body: JSON.stringify({ name: form.name, tunnelSecret: form.tunnelSecret || undefined })
    });
    await loadTunnels();
    notify("Tunnel 创建成功");
    return payload;
  }

  async function renameTunnel(tunnelId, name) {
    const payload = await api(`/api/tunnels/${encodeURIComponent(tunnelId)}`, {
      method: "PUT",
      body: JSON.stringify({ name })
    });
    notify("Tunnel 已重命名");
    return payload;
  }

  async function deleteTunnel(tunnelId) {
    await api(`/api/tunnels/${encodeURIComponent(tunnelId)}`, {
      method: "DELETE"
    });
    const idx = state.tunnels.findIndex((t) => t.id === tunnelId);
    if (idx !== -1) state.tunnels.splice(idx, 1);
    const selIdx = state.tunnelSelection.indexOf(tunnelId);
    if (selIdx !== -1) state.tunnelSelection.splice(selIdx, 1);
    notify("Tunnel 已删除", "info");
  }

  async function exportTunnels() {
    const response = await fetch("/api/tunnels/export", {
      credentials: "same-origin"
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: "Export failed" }));
      throw new Error(err.message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cloudflare-tunnels-export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify("Tunnel 配置已导出");
  }

  async function importTunnels(jsonStr) {
    if (!jsonStr.trim()) {
      notify("请粘贴要导入的 JSON 数据。", "warning");
      return null;
    }
    let importData;
    try {
      importData = JSON.parse(jsonStr);
    } catch (_) {
      notify("JSON 格式无效，请检查后再试。", "error");
      return null;
    }
    const result = await api("/api/tunnels/import", {
      method: "POST",
      body: JSON.stringify(importData)
    });
    const msg = `导入完成：新建 ${result.created || 0} 个，更新 ${result.updated || 0} 个` +
      (result.errors?.length ? `，${result.errors.length} 个失败` : "");
    notify(msg, result.errors?.length ? "warning" : "success");
    await loadTunnels();
    return result;
  }

  async function batchAction(action) {
    const ids = [...state.tunnelSelection];
    if (!ids.length) return;
    state.batchActionLoading = true;
    try {
      const result = await api("/api/tunnels/batch", {
        method: "POST",
        body: JSON.stringify({ action, tunnelIds: ids })
      });
      notify(`批量操作完成：${result.success || 0} 个成功${result.failed > 0 ? `，${result.failed} 个失败` : ""}`);
      await loadTunnels();
      state.tunnelSelection = [];
      return result;
    } finally {
      state.batchActionLoading = false;
    }
  }

  function toggleTunnelSelection(tunnelId) {
    const idx = state.tunnelSelection.indexOf(tunnelId);
    if (idx === -1) {
      state.tunnelSelection.push(tunnelId);
    } else {
      state.tunnelSelection.splice(idx, 1);
    }
  }

  function toggleAllFiltered() {
    const allIds = filteredTunnels.value.map((t) => t.id);
    const allSelected = allIds.every((id) => state.tunnelSelection.includes(id));
    if (allSelected) {
      state.tunnelSelection = state.tunnelSelection.filter((id) => !allIds.includes(id));
    } else {
      const existing = new Set(state.tunnelSelection);
      for (const id of allIds) {
        if (!existing.has(id)) state.tunnelSelection.push(id);
      }
    }
  }

  function clearTunnelSelection() {
    state.tunnelSelection = [];
  }

  async function saveMappings(tunnel, mappings) {
    const payload = await api(`/api/tunnels/${tunnel.id}/configuration`, {
      method: "PUT",
      body: JSON.stringify({ mappings })
    });
    const configuration = payload.configuration || payload;
    tunnel.configuration = configuration;
    tunnel.ui.mappingDirty = false;
    tunnel.ui.originTests = {};
    tunnel.ui.mappingSignature = getMappingsSignature(configuration.mappings || []);
    return payload.dnsSync || null;
  }

  async function checkPublishStatus(tunnelId) {
    const payload = await api(`/api/tunnels/${tunnelId}/publish-status`);
    return payload;
  }

  async function syncDns(tunnelId) {
    const payload = await api(`/api/tunnels/${tunnelId}/dns-sync`, { method: "POST" });
    return payload;
  }

  async function testOrigin(tunnelId, service, originRequest) {
    const payload = await api(`/api/tunnels/${tunnelId}/origin-test`, {
      method: "POST",
      body: JSON.stringify({ service, originRequest })
    });
    return payload;
  }

  return {
    state,
    filteredTunnels,
    loadTunnels,
    createTunnel,
    renameTunnel,
    deleteTunnel,
    exportTunnels,
    importTunnels,
    batchAction,
    toggleTunnelSelection,
    toggleAllFiltered,
    clearTunnelSelection,
    ensureTunnelUi,
    saveMappings,
    checkPublishStatus,
    syncDns,
    testOrigin
  };
}
