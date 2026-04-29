(function bootstrapElementApp() {
  const { createApp, nextTick } = Vue;

  const viewMeta = {
    home: {
      title: "首页",
      description: ""
    },
    settings: {
      title: "Cloudflare 配置",
      description: ""
    },
    tunnels: {
      title: "Tunnel 清单",
      description: ""
    },
    about: {
      title: "运行说明",
      description: ""
    }
  };

  const app = createApp({
    data() {
      return {
        authenticated: false,
        user: "",
        currentView: "home",
        viewTransitionEnabled: true,
        loginForm: {
          username: "",
          password: ""
        },
        settingsForm: {
          accountId: "",
          apiToken: ""
        },
        maskedApiToken: "",
        pollFailCount: 0,
        importTunnelJson: "",
        showImportDialog: false,
        importResult: null,
        passwordForm: {
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        },
        createTunnelForm: {
          name: "",
          tunnelSecret: ""
        },
        tunnelSearch: "",
        tunnelSort: "name",
        tunnelSortOrder: "asc",
        tunnels: [],
        tunnelsLoading: false,
        settingsLoading: false,
        cloudflared: {
          binaryPath: "",
          binaryExists: false,
          binaryVersion: "",
          processCount: 0,
          runningCount: 0,
          processes: [],
          statusHint: ""
        },
        selectedRuntimeTunnelId: null,
        configTestResult: "等待测试...",
        configTestData: null,
        passwordResult: "尚未修改密码。",
        runtimeLogDisplay: "等待状态刷新...",
        runtimeViewerMode: "logs",
        runtimeViewerTunnelId: null,
        runtimeLogLines: [],
        runtimeMetricsHistory: [],
        runtimeMetricsLastPayload: "",
        statusPollTimer: null,
        tunnelEditorVisible: false,
        tunnelEditor: null,
        runtimeLogVisible: false,
        hoveredStopTunnelId: null,
        loadingCount: 0,
        loadingInstance: null,
        createTunnelVisible: false,
        csrfToken: "",
        tunnelSelection: [],
        batchActionLoading: false,
        lastRuntimeRefreshAt: null,
        globalLoadingVisible: false,
        globalLoadingText: "处理中...",
        globalLoadingShowTimer: null,
        darkMode: false
      };
    },
    computed: {
      pageMeta() {
        return viewMeta[this.currentView] || viewMeta.home;
      },
      navItems() {
        return Object.entries(viewMeta).map(([key, value]) => ({
          key,
          title: value.title,
          description: value.description
        }));
      },
      credentialsConfigured() {
        return Boolean(this.settingsForm.accountId);
      },
      runtimePollingLabel() {
        return this.statusPollTimer ? "5 秒轮询" : "未开启";
      },
      tunnelCoverageLabel() {
        if (!this.tunnelCount) {
          return "0 / 0";
        }
        return `${this.cloudflared.runningCount} / ${this.tunnelCount}`;
      },
      controlSignals() {
        return [
          {
            label: "cloudflared Binary",
            value: this.cloudflared.binaryExists
              ? (this.cloudflared.binaryVersion || "已检测到可执行文件")
              : "当前主机未检测到 cloudflared",
            badge: this.cloudflared.binaryExists ? "就绪" : "缺失",
            tone: this.cloudflared.binaryExists ? "success" : "warn"
          },
          {
            label: "Cloudflare 凭据",
            value: this.credentialsConfigured
              ? "Account ID 已录入，可继续检测 Token 权限"
              : "尚未填写 Account ID，部分能力无法完成",
            badge: this.credentialsConfigured ? "已配置" : "待配置",
            tone: this.credentialsConfigured ? "success" : "warn"
          },
          {
            label: "自动刷新",
            value: "控制台会每 5 秒刷新本机 cloudflared 进程状态",
            badge: this.runtimePollingLabel,
            tone: this.statusPollTimer ? "muted" : "warn"
          },
          {
            label: "本机托管进程",
            value: this.cloudflared.runningCount
              ? `当前托管 ${this.cloudflared.runningCount} 个 Tunnel 连接器`
              : "当前没有由控制台托管的 Tunnel 进程",
            badge: this.cloudflared.runningCount ? "活跃" : "空闲",
            tone: this.cloudflared.runningCount ? "success" : "muted"
          }
        ];
      },
      tunnelCount() {
        return this.tunnels.length;
      },
      filteredTunnels() {
        const keyword = String(this.tunnelSearch || "").trim().toLowerCase();
        const items = keyword
          ? this.tunnels.filter((tunnel) => {
              const haystack = `${tunnel.name || ""} ${tunnel.id || ""}`.toLowerCase();
              return haystack.includes(keyword);
            })
          : [...this.tunnels];

        const orderFactor = this.tunnelSortOrder === "desc" ? -1 : 1;
        const safeNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
        const compareText = (a, b) => String(a || "").localeCompare(String(b || ""), "zh-CN");

        items.sort((left, right) => {
          switch (this.tunnelSort) {
            case "createdAt":
              return (
                (new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime()) *
                orderFactor
              );
            case "connections":
              return (safeNumber(left.connections) - safeNumber(right.connections)) * orderFactor;
            case "mappings":
              return (
                (safeNumber(left.configuration?.mappings?.length) -
                  safeNumber(right.configuration?.mappings?.length)) *
                orderFactor
              );
            case "name":
            default:
              return compareText(left.name, right.name) * orderFactor;
          }
        });

        return items;
      },
      filteredTunnelCount() {
        return this.filteredTunnels.length;
      },
      selectedTunnelCount() {
        return this.tunnelSelection.length;
      },
      allFilteredSelected() {
        return this.filteredTunnels.length > 0 &&
          this.filteredTunnels.every(t => this.tunnelSelection.includes(t.id));
      },
      mappingCount() {
        return this.tunnels.reduce(
          (count, tunnel) => count + (tunnel.configuration?.mappings?.length || 0),
          0
        );
      },
      runtimeStateLabel() {
        return this.cloudflared.runningCount > 0
          ? `${this.cloudflared.runningCount} 个进程运行中`
          : "未启动";
      },
      runtimeBadgeLabel() {
        if (!this.cloudflared.binaryExists) {
          return "cloudflared 不可用";
        }
        if (this.cloudflared.runningCount > 0) {
          return `运行中 ${this.cloudflared.runningCount} / ${this.cloudflared.processCount}`;
        }
        return "cloudflared 未启动";
      },
      runningProcesses() {
        return this.cloudflared.processes.filter((item) => item.running);
      },
      missingPermissions() {
        return (
          this.configTestData?.permissions?.missing?.all ||
          (Array.isArray(this.configTestData?.permissions?.missing)
            ? this.configTestData.permissions.missing
            : []) ||
          this.configTestData?.missingPermissions ||
          this.configTestData?.details?.missingPermissions ||
          []
        );
      },
      tunnelMissingPermissions() {
        return Array.isArray(this.configTestData?.permissions?.missing?.tunnel)
          ? this.configTestData.permissions.missing.tunnel
          : null;
      },
      dnsMissingPermissions() {
        return Array.isArray(this.configTestData?.permissions?.missing?.dns)
          ? this.configTestData.permissions.missing.dns
          : null;
      },
      optionalPermissions() {
        return this.configTestData?.permissions?.required?.optional || [];
      },
      grantedPermissions() {
        return (
          this.configTestData?.permissions?.granted ||
          this.configTestData?.grantedPermissions ||
          this.configTestData?.details?.grantedPermissions ||
          []
        );
      },
      requiredPermissions() {
        return (
          this.configTestData?.permissions?.required?.all ||
          this.configTestData?.permissions?.required ||
          this.configTestData?.requiredPermissions ||
          this.configTestData?.details?.requiredPermissions ||
          []
        );
      },
      configIssues() {
        return this.configTestData?.issues || this.configTestData?.details?.issues || [];
      },
      selectedProcess() {
        return this.cloudflared.processes.find(
          (item) => item.tunnelId === this.selectedRuntimeTunnelId
        ) || null;
      },
      runtimeLogTitle() {
        const tunnel = this.tunnels.find((item) => item.id === this.selectedRuntimeTunnelId);
        return tunnel?.name || this.selectedProcess?.tunnelName || "Tunnel 运行日志";
      },
      runtimeViewerLabel() {
        return this.runtimeViewerMode === "metrics" ? "Metrics 追踪" : "Tunnel 日志";
      },
      parsedMetrics() {
        return this.parseMetricsText(this.runtimeLogDisplay);
      }
    },
    watch: {
      runtimeLogVisible(visible) {
        if (visible) {
          this.refreshCurrentRuntimeViewer();
        }
      }
    },
    methods: {
      async api(path, options = {}) {
        const headers = {
          "Content-Type": "application/json",
          ...(options.headers || {})
        };
        const method = String(options.method || "GET").toUpperCase();

        if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && this.csrfToken) {
          headers["X-CSRF-Token"] = this.csrfToken;
        }

        const response = await fetch(path, {
          headers,
          credentials: "same-origin",
          ...options
        });
        const nextCsrfToken = response.headers.get("x-csrf-token");
        if (nextCsrfToken) {
          this.csrfToken = nextCsrfToken;
        }

        const contentType = response.headers.get("content-type") || "";
        const payload = contentType.includes("application/json")
          ? await response.json()
          : await response.text();

        if (!response.ok) {
          const err = new Error(payload?.message || `Request failed: ${response.status}`);
          err.status = response.status;
          throw err;
        }

        return payload;
      },
      notify(message, type = "success") {
        ElementPlus.ElMessage({
          message,
          type,
          grouping: true
        });
      },
      toggleDarkMode() {
        this.darkMode = !this.darkMode;
        document.documentElement.setAttribute("data-theme", this.darkMode ? "dark" : "light");
        try { localStorage.setItem("cf_tunnel_xui.theme", this.darkMode ? "dark" : "light"); } catch (_) {}
      },
      cleanupDialogArtifacts() {
        if (this.tunnelEditorVisible || this.runtimeLogVisible || this.createTunnelVisible) {
          return;
        }

        requestAnimationFrame(() => {
          document.body.classList.remove("el-popup-parent--hidden");
          document.querySelectorAll(".el-overlay").forEach((overlay) => {
            if (
              overlay.querySelector(".el-overlay-dialog") &&
              !overlay.querySelector(".el-message-box") &&
              !overlay.querySelector(".el-loading-mask")
            ) {
              overlay.remove();
            }
          });
        });
      },
      getCapabilityStateLabel(value) {
        if (value === true) {
          return "已具备";
        }
        if (value === false) {
          return "权限不足";
        }
        return "待确认";
      },
      getCapabilityStateType(value) {
        if (value === true) {
          return "success";
        }
        if (value === false) {
          return "warning";
        }
        return "info";
      },
      getRuntimeViewerTextarea() {
        const viewer = this.$refs.runtimeViewer;
        return viewer?.textarea || viewer?.$refs?.textarea || null;
      },
      async updateRuntimeViewerDisplay(nextDisplay, options = {}) {
        const textarea = this.getRuntimeViewerTextarea();
        const previousScrollTop = textarea?.scrollTop || 0;
        const previousScrollHeight = textarea?.scrollHeight || 0;
        const previousClientHeight = textarea?.clientHeight || 0;
        const nearBottom = !textarea ||
          previousScrollHeight - (previousScrollTop + previousClientHeight) <= 24;

        this.runtimeLogDisplay = nextDisplay;
        await nextTick();

        const nextTextarea = this.getRuntimeViewerTextarea();
        if (!nextTextarea) {
          return;
        }

        if (options.reset || nearBottom) {
          nextTextarea.scrollTop = nextTextarea.scrollHeight;
          return;
        }

        nextTextarea.scrollTop = previousScrollTop;
      },
      mergeLineSnapshots(previousLines = [], nextLines = []) {
        if (!previousLines.length) {
          return [...nextLines];
        }
        if (!nextLines.length) {
          return [...previousLines];
        }

        // Cap overlap search to 200 lines to keep complexity O(k*n) not O(n²)
        const maxOverlap = Math.min(previousLines.length, nextLines.length, 200);
        for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
          let matches = true;
          for (let index = 0; index < overlap; index += 1) {
            if (previousLines[previousLines.length - overlap + index] !== nextLines[index]) {
              matches = false;
              break;
            }
          }
          if (matches) {
            return previousLines.concat(nextLines.slice(overlap));
          }
        }

        return [...nextLines];
      },
      resetRuntimeViewer(options = {}) {
        const mode = options.mode || "logs";
        const tunnelId = options.tunnelId || this.selectedRuntimeTunnelId || null;
        this.runtimeViewerMode = mode;
        this.runtimeViewerTunnelId = tunnelId;
        this.runtimeLogLines = [];
        this.runtimeMetricsHistory = [];
        this.runtimeMetricsLastPayload = "";
        this.runtimeLogDisplay = mode === "metrics"
          ? "等待 metrics 刷新..."
          : "等待状态刷新...";
      },
      openGlobalLoading(text = "处理中...") {
        this.loadingCount += 1;
        this.globalLoadingText = text;

        // Delay showing the overlay to avoid flicker for fast requests.
        if (!this.globalLoadingVisible && !this.globalLoadingShowTimer) {
          this.globalLoadingShowTimer = setTimeout(() => {
            this.globalLoadingVisible = this.loadingCount > 0;
            this.globalLoadingShowTimer = null;
          }, 160);
        }
      },
      closeGlobalLoading() {
        this.loadingCount = Math.max(0, this.loadingCount - 1);
        if (this.loadingCount === 0) {
          if (this.globalLoadingShowTimer) {
            clearTimeout(this.globalLoadingShowTimer);
            this.globalLoadingShowTimer = null;
          }
          this.globalLoadingVisible = false;
        }
      },
      async withGlobalLoading(action, text) {
        this.openGlobalLoading(text);
        try {
          return await action();
        } finally {
          this.closeGlobalLoading();
        }
      },
      formatJson(value) {
        return typeof value === "string" ? value : JSON.stringify(value, null, 2);
      },
      normalizeMappings(mappings = []) {
        return (Array.isArray(mappings) ? mappings : [])
          .map((mapping) => ({
            hostname: String(mapping?.hostname || "").trim(),
            service: String(mapping?.service || "").trim(),
            path: String(mapping?.path || "").trim(),
            originRequest: {
              noTLSVerify: Boolean(mapping?.originRequest?.noTLSVerify),
              disableChunkedEncoding: Boolean(mapping?.originRequest?.disableChunkedEncoding),
              http2Origin: Boolean(mapping?.originRequest?.http2Origin)
            }
          }))
          .filter((mapping) =>
            mapping.hostname ||
            mapping.service
          );
      },
      getMappingsSignature(mappings = []) {
        return JSON.stringify(this.normalizeMappings(mappings));
      },
      isLikelyIpHttpsService(service) {
        try {
          const parsed = new URL(String(service || "").trim());
          const hostname = parsed.hostname || "";
          const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
          const isIpv6 = hostname.includes(":");
          return parsed.protocol === "https:" && (isIpv4 || isIpv6 || hostname === "localhost");
        } catch (_error) {
          return false;
        }
      },
      getPublishStatusItem(index) {
        return this.tunnelEditor?.ui?.publishStatus?.items?.[index] || null;
      },
      getPublishStatusTone(item) {
        if (!item) {
          return "";
        }
        if (item.status === "published") {
          return "ok";
        }
        if (item.status === "published_warning") {
          return "warn";
        }
        return "fail";
      },
      getPublishStatusSummaryTone(report) {
        if (!report?.summary) {
          return "";
        }
        if (report.summary.unpublished > 0 || report.summary.warnings > 0) {
          return "warn";
        }
        return "ok";
      },
      getPublishStatusSummaryMessage(report) {
        if (!report?.summary) {
          return "尚未检查域名发布状态。";
        }

        const { total = 0, published = 0, warnings = 0, unpublished = 0 } = report.summary;
        if (!total) {
          return "当前没有可检查的 hostname 路由。";
        }

        const parts = [
          `已检查 ${total} 条路由`,
          `${published} 条已正确发布`
        ];
        if (warnings > 0) {
          parts.push(`${warnings} 条需关注`);
        }
        if (unpublished > 0) {
          parts.push(`${unpublished} 条未完成发布`);
        }
        return `${parts.join("，")}。`;
      },
      getDnsSyncActionSummary(report) {
        return (report?.items || []).reduce(
          (summary, item) => {
            const action = item?.action || "skipped";
            if (action === "created") {
              summary.created += 1;
            } else if (action === "updated") {
              summary.updated += 1;
            } else if (action === "unchanged") {
              summary.unchanged += 1;
            } else {
              summary.skipped += 1;
            }
            return summary;
          },
          { created: 0, updated: 0, unchanged: 0, skipped: 0 }
        );
      },
      getDnsSyncSummaryMessage(report) {
        if (!report?.syncedAt) {
          return "";
        }

        const summary = this.getDnsSyncActionSummary(report);
        const parts = [];
        if (summary.created > 0) {
          parts.push(`新建 ${summary.created} 条`);
        }
        if (summary.updated > 0) {
          parts.push(`更新 ${summary.updated} 条`);
        }
        if (summary.unchanged > 0) {
          parts.push(`已确认 ${summary.unchanged} 条无需变更`);
        }
        if (summary.skipped > 0) {
          parts.push(`跳过 ${summary.skipped} 条`);
        }
        return parts.length ? `最近一次 DNS 同步：${parts.join("，")}。` : "";
      },
      applyTunnelEditorPublishReport(report) {
        if (!this.tunnelEditor?.ui) {
          return;
        }
        this.tunnelEditor.ui.publishStatus = report;
        this.tunnelEditor.ui.publishStatusError = "";
      },
      setAuthenticated(authenticated, user = "") {
        this.authenticated = authenticated;
        this.user = user;
        if (!authenticated && this.statusPollTimer) {
          clearInterval(this.statusPollTimer);
          this.statusPollTimer = null;
        }
        if (!authenticated) {
          this.runtimeLogVisible = false;
          this.selectedRuntimeTunnelId = null;
          this.runtimeViewerMode = "logs";
          this.runtimeViewerTunnelId = null;
          this.runtimeLogLines = [];
          this.runtimeMetricsHistory = [];
          this.runtimeMetricsLastPayload = "";
          this.runtimeLogDisplay = "等待状态刷新...";
        }
      },
      ensureTunnelUi(tunnel) {
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
        if (!tunnel.ui.originTests) {
          tunnel.ui.originTests = {};
        }
        if (typeof tunnel.ui.mappingSignature !== "string") {
          tunnel.ui.mappingSignature = "";
        }
        if (typeof tunnel.ui.publishStatusLoading !== "boolean") {
          tunnel.ui.publishStatusLoading = false;
        }
        if (typeof tunnel.ui.publishStatusError !== "string") {
          tunnel.ui.publishStatusError = "";
        }
        if (!("publishStatus" in tunnel.ui)) {
          tunnel.ui.publishStatus = null;
        }
        if (Array.isArray(tunnel.configuration?.mappings)) {
          tunnel.configuration.mappings = tunnel.configuration.mappings.map((mapping) => ({
            ...mapping,
            originRequest: {
              noTLSVerify: Boolean(mapping?.originRequest?.noTLSVerify),
              disableChunkedEncoding: Boolean(mapping?.originRequest?.disableChunkedEncoding),
              http2Origin: Boolean(mapping?.originRequest?.http2Origin)
            }
          }));
        }
        return tunnel;
      },
      ensureSelectedProcess() {
        if (!this.cloudflared.processes.length) {
          this.selectedRuntimeTunnelId = null;
          this.runtimeLogDisplay = this.cloudflared.statusHint || "等待状态刷新...";
          return;
        }

        const exists = this.cloudflared.processes.find(
          (item) => item.tunnelId === this.selectedRuntimeTunnelId
        );

        if (!exists) {
          const running = this.cloudflared.processes.find((item) => item.running);
          this.selectedRuntimeTunnelId =
            running?.tunnelId || this.cloudflared.processes[0].tunnelId;
        }

        this.syncRuntimeLogDisplay();
      },
      syncRuntimeLogDisplay() {
        if (!this.selectedProcess) {
          this.runtimeLogDisplay = this.cloudflared.statusHint || "等待状态刷新...";
          return;
        }

        if (this.runtimeViewerMode === "metrics") {
          this.runtimeLogDisplay = this.selectedProcess.running
            ? "正在加载最新 metrics 快照..."
            : "当前进程未运行，正在读取最近 metrics 快照...";
          return;
        }

        this.runtimeLogDisplay = this.selectedProcess.running
          ? "正在加载最新日志..."
          : "当前进程未运行，正在读取最近日志...";
      },
      switchView(view) {
        this.currentView = view;
        // Close transient popups when switching pages to avoid "lost" modals.
        this.tunnelEditorVisible = false;
        this.runtimeLogVisible = false;
        this.createTunnelVisible = false;
      },
      toggleTunnelSortOrder() {
        this.tunnelSortOrder = this.tunnelSortOrder === "asc" ? "desc" : "asc";
      },
      getTunnelStatusLabel(tunnel) {
        if (tunnel.connections > 0) {
          return "Cloudflare 已连接";
        }
        if (tunnel.status === "inactive") {
          return "Cloudflare 未连接";
        }
        return tunnel.status || "状态未知";
      },
      getTunnelStatusType(tunnel) {
        if (tunnel.connections > 0) {
          return "success";
        }
        if (tunnel.status === "inactive") {
          return "info";
        }
        return "warning";
      },
      isTunnelRunning(tunnelId) {
        return this.cloudflared.processes.some(
          (item) => item.tunnelId === tunnelId && item.running
        );
      },
      getTunnelUptime(tunnelId) {
        const process = this.cloudflared.processes.find(
          (item) => item.tunnelId === tunnelId && item.running
        );
        return process?.startedAt ? this.formatUptime(process.startedAt) : null;
      },
      getTunnelProcess(tunnelId) {
        return this.cloudflared.processes.find(
          (item) => item.tunnelId === tunnelId && item.running
        ) || null;
      },
      canStopTunnel(tunnel) {
        return Boolean(this.getTunnelProcess(tunnel.id)?.manageable);
      },
      canStartTunnel(tunnel) {
        return !this.isTunnelRunning(tunnel.id) && Number(tunnel.connections || 0) === 0;
      },
      canOpenTunnelLogs(tunnelId) {
        return this.cloudflared.processes.some((item) => item.tunnelId === tunnelId);
      },
      canDeleteTunnel(tunnel) {
        return !this.isTunnelRunning(tunnel.id) && Number(tunnel.connections || 0) === 0;
      },
      isTunnelDisconnected(tunnel) {
        return Boolean(tunnel?.id) && Number(tunnel.connections || 0) === 0;
      },
      canEditTunnelEditor() {
        return Boolean(this.tunnelEditor?.id);
      },
      canTestTunnelEditorOrigin() {
        return Boolean(this.tunnelEditor?.id);
      },
      getTunnelPrimaryActionLabel(tunnel) {
        if (this.isTunnelRunning(tunnel.id) && !this.canStopTunnel(tunnel)) {
          return "运行中";
        }
        if (this.canStopTunnel(tunnel)) {
          return this.hoveredStopTunnelId === tunnel.id ? "停止" : "运行中";
        }
        if (this.canStartTunnel(tunnel)) {
          return "连接";
        }
        return "已连接";
      },
      getProcessSourceLabel(processInfo) {
        return processInfo.source === "managed" ? "页面托管" : "自动发现";
      },
      formatUptime(startedAt) {
        if (!startedAt) {
          return "-";
        }
        const diffMs = Date.now() - new Date(startedAt).getTime();
        if (diffMs < 0) {
          return "-";
        }
        const seconds = Math.floor(diffMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (days > 0) {
          return `${days}d ${hours % 24}h ${minutes % 60}m`;
        }
        if (hours > 0) {
          return `${hours}h ${minutes % 60}m`;
        }
        if (minutes > 0) {
          return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
      },
      formatDateTime(value) {
        if (!value) {
          return "-";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return String(value);
        }
        // Use browser locale timezone — no hardcoded region
        return new Intl.DateTimeFormat("zh-CN", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        }).format(date);
      },
      async bootstrap() {
        try {
          const me = await this.api("/api/auth/me");
          if (me?.config?.auth?.username) {
            this.loginForm.username = me.config.auth.username;
          }
          if (!me.authenticated) {
            this.setAuthenticated(false);
            return;
          }
          this.setAuthenticated(true, me.user);
          await this.hydrateDashboard();
          // Init theme
          let savedTheme = null;
          try { savedTheme = localStorage.getItem("cf_tunnel_xui.theme"); } catch (_) {}
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          this.darkMode = savedTheme === "dark" || (!savedTheme && prefersDark);
          document.documentElement.setAttribute("data-theme", this.darkMode ? "dark" : "light");
        } catch (_error) {
          this.setAuthenticated(false);
        }
      },
      async hydrateDashboard() {
        await this.withGlobalLoading(
          () => Promise.all([this.loadSettings(), this.loadTunnels(), this.refreshRuntimeStatus()]),
          "正在加载控制台..."
        );
        if (!this.statusPollTimer) {
          this.statusPollTimer = setInterval(() => {
            this.refreshRuntimeStatus();
          }, 5000);
        }
      },
      async loadSettings() {
        this.settingsLoading = true;
        try {
          const payload = await this.api("/api/settings");
          this.settingsForm.accountId = payload.config.cloudflare.accountId || "";
          // Derive the masked token from server response; never hardcode "********"
          const masked = payload.config.cloudflare.tokenConfigured
            ? (payload.config.cloudflare.maskedToken || "••••••••")
            : "";
          this.maskedApiToken = masked;
          this.settingsForm.apiToken = masked;
          this.cloudflared = payload.cloudflared;
          this.ensureSelectedProcess();
        } finally {
          this.settingsLoading = false;
        }
      },
      async loadTunnels() {
        this.tunnelsLoading = true;
        try {
          const payload = await this.api("/api/tunnels");
          this.tunnels = (payload.items || []).map((item) => this.ensureTunnelUi(item));
        } finally {
          this.tunnelsLoading = false;
        }
      },
      async reloadTunnelsManually() {
        try {
          await this.withGlobalLoading(() => this.loadTunnels(), "正在刷新 Tunnel 列表...");
          this.notify("Tunnel 列表已刷新", "info");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async exportTunnels() {
        try {
          const blob = await this.withGlobalLoading(async () => {
            const response = await fetch("/api/tunnels/export", {
              headers: this.csrfToken ? { "X-CSRF-Token": "" } : {},
              credentials: "same-origin"
            });
            if (!response.ok) {
              const err = await response.json().catch(() => ({ message: "Export failed" }));
              throw new Error(err.message);
            }
            return response.blob();
          }, "正在导出...");
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "cloudflare-tunnels-export.json";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.notify("Tunnel 配置已导出");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async importTunnels() {
        if (!this.importTunnelJson.trim()) {
          this.notify("请粘贴要导入的 JSON 数据。", "warning");
          return;
        }
        try {
          let importData;
          try {
            importData = JSON.parse(this.importTunnelJson);
          } catch (_) {
            this.notify("JSON 格式无效，请检查后再试。", "error");
            return;
          }
          const result = await this.withGlobalLoading(
            () => this.api("/api/tunnels/import", {
              method: "POST",
              body: JSON.stringify(importData)
            }),
            "正在导入..."
          );
          this.importResult = result;
          this.importTunnelJson = "";
          const msg = `导入完成：新建 ${result.created || 0} 个，更新 ${result.updated || 0} 个` +
            (result.errors?.length ? `，${result.errors.length} 个失败` : "");
          this.notify(msg, result.errors?.length ? "warning" : "success");
          await this.loadTunnels();
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async refreshRuntimeStatus() {
        if (!this.authenticated) {
          return;
        }

        try {
          this.cloudflared = await this.api("/api/cloudflared/status");
          this.lastRuntimeRefreshAt = new Date().toISOString();
          this.pollFailCount = 0;
          this.ensureSelectedProcess();
          if (this.runtimeLogVisible && this.selectedRuntimeTunnelId) {
            this.refreshCurrentRuntimeViewer({ silent: true });
          }
        } catch (_error) {
          this.pollFailCount += 1;
          // Surface a warning after 3 consecutive silent failures
          if (this.pollFailCount === 3) {
            this.notify("状态轮询连续失败，请检查服务连接是否正常", "warning");
          }
        }
      },
      async handleLogin() {
        try {
          await this.withGlobalLoading(async () => {
            if (!this.csrfToken) {
              await this.api("/api/auth/me");
            }
            const payload = await this.api("/api/auth/login", {
              method: "POST",
              body: JSON.stringify(this.loginForm)
            });
            this.setAuthenticated(true, payload.user);
            await this.hydrateDashboard();
          }, "正在登录...");
          this.notify("登录成功");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async handleLogout() {
        await this.withGlobalLoading(
          () => this.api("/api/auth/logout", { method: "POST" }),
          "正在退出..."
        );
        this.setAuthenticated(false);
        this.notify("已退出登录", "info");
      },
      async saveSettings() {
        try {
          await this.withGlobalLoading(async () => {
            // Empty string signals "keep existing token"; only send if user changed it
            const apiToken =
              this.settingsForm.apiToken === this.maskedApiToken ? "" : this.settingsForm.apiToken;
            await this.api("/api/settings/cloudflare", {
              method: "POST",
              body: JSON.stringify({
                accountId: this.settingsForm.accountId,
                apiToken
              })
            });
            this.configTestResult = "配置已保存。";
            this.configTestData = null;
            await Promise.all([this.loadSettings(), this.loadTunnels()]);
          }, "正在保存配置...");
          this.notify("Cloudflare 配置已保存");
        } catch (error) {
          this.configTestResult = error.message;
          this.configTestData = null;
          this.notify(error.message, "error");
        }
      },
      async testSettings() {
        try {
          const payload = await this.withGlobalLoading(async () => {
            const apiToken =
              this.settingsForm.apiToken === this.maskedApiToken ? "" : this.settingsForm.apiToken;
            return this.api("/api/settings/cloudflare/test", {
              method: "POST",
              body: JSON.stringify({
                accountId: this.settingsForm.accountId,
                apiToken
              })
            });
          }, "正在检测 Token...");
          this.configTestData = payload;
          this.configTestResult = this.formatJson(payload);
          this.notify("Token 检测完成");
        } catch (error) {
          this.configTestData = null;
          this.configTestResult = error.message;
          this.notify(error.message, "error");
        }
      },
      async changePassword() {
        if (!this.passwordForm.currentPassword || !this.passwordForm.newPassword) {
          this.passwordResult = "请完整填写当前密码和新密码。";
          this.notify(this.passwordResult, "warning");
          return;
        }

        if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
          this.passwordResult = "两次输入的新密码不一致。";
          this.notify(this.passwordResult, "warning");
          return;
        }

        try {
          await this.withGlobalLoading(async () => {
            await this.api("/api/auth/password", {
              method: "POST",
              body: JSON.stringify({
                currentPassword: this.passwordForm.currentPassword,
                newPassword: this.passwordForm.newPassword
              })
            });
          }, "正在修改密码...");
          this.passwordForm.currentPassword = "";
          this.passwordForm.newPassword = "";
          this.passwordForm.confirmPassword = "";
          this.passwordResult = "登录密码已修改成功，请重新登录。";
          this.setAuthenticated(false);
          this.notify("密码已修改，请重新登录", "info");
        } catch (error) {
          this.passwordResult = error.message;
          this.notify(error.message, "error");
        }
      },
      async createTunnel() {
        try {
          const payload = await this.withGlobalLoading(
            () =>
              this.api("/api/tunnels", {
                method: "POST",
                body: JSON.stringify(this.createTunnelForm)
              }),
            "正在创建 Tunnel..."
          );
          this.createTunnelForm.name = "";
          this.createTunnelForm.tunnelSecret = "";
          this.createTunnelVisible = false;
          await this.loadTunnels();
          this.notify("Tunnel 创建成功");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      addMapping(tunnel) {
        this.ensureTunnelUi(tunnel);
        if (!tunnel.configuration) {
          tunnel.configuration = { mappings: [], catchAll: { service: "http_status:404" } };
        }
        if (!Array.isArray(tunnel.configuration.mappings)) {
          tunnel.configuration.mappings = [];
        }
        tunnel.configuration.mappings.push({
          hostname: "",
          service: "",
          path: "",
          originRequest: {
            noTLSVerify: false,
            disableChunkedEncoding: false,
            http2Origin: false
          }
        });
        tunnel.ui.mappingDirty = true;
      },
      removeMapping(tunnel, index) {
        tunnel.configuration.mappings.splice(index, 1);
        if (!tunnel.configuration.mappings.length) {
          tunnel.configuration.mappings.push({
            hostname: "",
            service: "",
            path: "",
            originRequest: {
              noTLSVerify: false,
              disableChunkedEncoding: false,
              http2Origin: false
            }
          });
        }
        tunnel.ui.mappingDirty = true;
      },
      markMappingDirty(tunnel) {
        this.ensureTunnelUi(tunnel);
        tunnel.ui.mappingDirty = true;
      },
      async confirmReconnectTunnel(tunnelId, tunnelName) {
        const process = this.getTunnelProcess(tunnelId);
        if (!process?.running) {
          return false;
        }

        if (!process.manageable) {
          this.notify("路由已保存。当前 Tunnel 由外部 cloudflared 进程承载，请手动重启连接器以应用新路由。", "warning");
          return false;
        }

        try {
          await ElementPlus.ElMessageBox.confirm(
            `路由已保存，Tunnel「${tunnelName || tunnelId}」当前正在运行。是否立即断开并重连，让新路由生效？`,
            "重建连接",
            {
              confirmButtonText: "立即重连",
              cancelButtonText: "稍后",
              type: "warning"
            }
          );
        } catch (_error) {
          this.notify("路由已保存，新配置将在下次连接时生效。", "info");
          return false;
        }

        await this.withGlobalLoading(async () => {
          await this.api(`/api/tunnels/${encodeURIComponent(tunnelId)}/stop`, {
            method: "POST"
          });
          await this.api(`/api/tunnels/${encodeURIComponent(tunnelId)}/start`, {
            method: "POST"
          });
        }, "正在重建 Tunnel 连接...");

        this.selectedRuntimeTunnelId = tunnelId;
        await Promise.all([this.refreshRuntimeStatus(), this.loadTunnels()]);
        this.notify("Tunnel 已按最新路由重连");
        return true;
      },
      async saveMappings(tunnel) {
        const wasRunning = this.isTunnelRunning(tunnel.id);
        try {
          const payload = await this.withGlobalLoading(
            () =>
              this.api(`/api/tunnels/${tunnel.id}/configuration`, {
                method: "PUT",
                body: JSON.stringify({
                  mappings: tunnel.configuration.mappings
                })
              }),
            "正在保存路由..."
          );
          const configuration = payload.configuration || payload;
          const dnsSync = payload.dnsSync || null;
          tunnel.configuration = configuration;
          tunnel.ui.mappingDirty = false;
          tunnel.ui.originTests = {};
          tunnel.ui.mappingSignature = this.getMappingsSignature(configuration.mappings || []);
          await this.loadTunnels();
          if (dnsSync) {
            const dnsSummaryText = this.getDnsSyncSummaryMessage(dnsSync);
            const dnsSummary = this.getDnsSyncActionSummary(dnsSync);
            if (dnsSummary.created > 0 || dnsSummary.updated > 0) {
              this.notify(`路由已保存，并已自动同步 DNS。${dnsSummaryText}`);
            } else if (dnsSummary.skipped > 0) {
              this.notify("路由已保存，但有部分 DNS 记录未自动同步，请到配置里查看发布状态。", "warning");
            } else {
              this.notify("路由已保存到 Cloudflare");
            }
          } else {
            this.notify("路由已保存到 Cloudflare");
          }
          if (wasRunning) {
            await this.confirmReconnectTunnel(tunnel.id, tunnel.name);
          }
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async testOrigin(tunnel, mapping, index) {
        if (!mapping.service) {
          this.notify("请先填写 service 地址再测试。", "warning");
          return;
        }
        try {
          const payload = await this.withGlobalLoading(
            () =>
              this.api(`/api/tunnels/${tunnel.id}/origin-test`, {
                method: "POST",
                body: JSON.stringify({
                  service: mapping.service,
                  originRequest: mapping.originRequest || {
                    noTLSVerify: false,
                    disableChunkedEncoding: false,
                    http2Origin: false
                  }
                })
              }),
            "正在测试源站..."
          );
          this.ensureTunnelUi(tunnel);
          tunnel.ui.originTests[index] = payload;
          this.notify(payload.ok ? "本地源站测试通过" : "本地源站测试失败", payload.ok ? "success" : "error");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async checkTunnelPublishStatus(options = {}) {
        if (!this.tunnelEditor?.id) {
          return;
        }

        const silent = Boolean(options.silent);
        const tunnelId = this.tunnelEditor.id;
        this.tunnelEditor.ui = this.tunnelEditor.ui || {};
        this.tunnelEditor.ui.publishStatusLoading = true;
        this.tunnelEditor.ui.publishStatusError = "";

        try {
          const payload = await this.api(`/api/tunnels/${tunnelId}/publish-status`);
          if (!this.tunnelEditor || this.tunnelEditor.id !== tunnelId) {
            return;
          }

          this.applyTunnelEditorPublishReport(payload);
          if (!silent) {
            if (payload.summary?.unpublished > 0) {
              this.notify(`检查完成：有 ${payload.summary.unpublished} 条路由还没有真正发布到公网域名。`, "warning");
            } else if (payload.summary?.warnings > 0) {
              this.notify("检查完成：域名已发布，但仍有需要关注的 DNS 设置。", "warning");
            } else {
              this.notify("检查完成：当前路由对应的域名都已正确发布。");
            }
          }
        } catch (error) {
          if (!this.tunnelEditor || this.tunnelEditor.id !== tunnelId) {
            return;
          }

          this.tunnelEditor.ui.publishStatus = null;
          this.tunnelEditor.ui.publishStatusError = error.message;
          if (!silent) {
            this.notify(error.message, "error");
          }
        } finally {
          if (this.tunnelEditor && this.tunnelEditor.id === tunnelId) {
            this.tunnelEditor.ui.publishStatusLoading = false;
          }
        }
      },
      async syncTunnelDnsRecords(options = {}) {
        if (!this.tunnelEditor?.id) {
          return null;
        }

        const silent = Boolean(options.silent);
        const tunnelId = this.tunnelEditor.id;
        this.tunnelEditor.ui = this.tunnelEditor.ui || {};
        this.tunnelEditor.ui.publishStatusLoading = true;
        this.tunnelEditor.ui.publishStatusError = "";

        try {
          const payload = await this.api(`/api/tunnels/${tunnelId}/dns-sync`, {
            method: "POST"
          });
          if (!this.tunnelEditor || this.tunnelEditor.id !== tunnelId) {
            return payload;
          }

          this.applyTunnelEditorPublishReport(payload);
          if (!silent) {
            const summary = this.getDnsSyncActionSummary(payload);
            if (summary.created > 0 || summary.updated > 0) {
              this.notify(this.getDnsSyncSummaryMessage(payload), "success");
            } else if (summary.skipped > 0) {
              this.notify("DNS 同步已完成，但有部分记录因冲突或权限限制未自动处理。", "warning");
            } else {
              this.notify("DNS 已是最新状态，无需同步。");
            }
          }
          return payload;
        } catch (error) {
          if (!this.tunnelEditor || this.tunnelEditor.id !== tunnelId) {
            throw error;
          }

          this.tunnelEditor.ui.publishStatus = null;
          this.tunnelEditor.ui.publishStatusError = error.message;
          if (!silent) {
            this.notify(error.message, "error");
          }
          throw error;
        } finally {
          if (this.tunnelEditor && this.tunnelEditor.id === tunnelId) {
            this.tunnelEditor.ui.publishStatusLoading = false;
          }
        }
      },
      async renameTunnel(tunnel) {
        try {
          await this.withGlobalLoading(
            () =>
              this.api(`/api/tunnels/${tunnel.id}`, {
                method: "PUT",
                body: JSON.stringify({ name: tunnel.name })
              }),
            "正在保存 Tunnel 名称..."
          );
          this.notify("Tunnel 名称已保存");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async deleteTunnel(tunnel) {
        try {
          await this.withGlobalLoading(
            () => this.api(`/api/tunnels/${tunnel.id}`, { method: "DELETE" }),
            "正在删除 Tunnel..."
          );
          if (this.selectedRuntimeTunnelId === tunnel.id) {
            this.selectedRuntimeTunnelId = null;
          }
          await Promise.all([this.loadTunnels(), this.refreshRuntimeStatus()]);
          this.notify("Tunnel 已删除", "info");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async showTunnelDetail(tunnel) {
        try {
          const payload = await this.withGlobalLoading(
            () => this.api(`/api/tunnels/${tunnel.id}`),
            "正在读取 Tunnel 详情..."
          );
          this.tunnelEditor = this.ensureTunnelUi(JSON.parse(JSON.stringify(payload)));
          this.tunnelEditor.ui.mappingSignature = this.getMappingsSignature(
            this.tunnelEditor.configuration?.mappings || []
          );
          this.tunnelEditorVisible = true;
          void this.checkTunnelPublishStatus({ silent: true });
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      addEditorMapping() {
        if (!this.canEditTunnelEditor()) {
          return;
        }
        if (!this.tunnelEditor.configuration) {
          this.tunnelEditor.configuration = { mappings: [], catchAll: { service: "http_status:404" } };
        }
        if (!Array.isArray(this.tunnelEditor.configuration.mappings)) {
          this.tunnelEditor.configuration.mappings = [];
        }
        this.tunnelEditor.configuration.mappings.push({
          hostname: "",
          service: "",
          path: "",
          originRequest: {
            noTLSVerify: false,
            disableChunkedEncoding: false,
            http2Origin: false
          }
        });
      },
      removeEditorMapping(index) {
        if (!this.canEditTunnelEditor()) {
          return;
        }
        this.tunnelEditor.configuration.mappings.splice(index, 1);
        if (!this.tunnelEditor.configuration.mappings.length) {
          this.tunnelEditor.configuration.mappings.push({
            hostname: "",
            service: "",
            path: "",
            originRequest: {
              noTLSVerify: false,
              disableChunkedEncoding: false,
              http2Origin: false
            }
          });
        }
      },
      async saveTunnelEditor() {
        if (!this.tunnelEditor || !this.canEditTunnelEditor()) {
          return;
        }
        const previousSignature = this.tunnelEditor.ui?.mappingSignature ||
          this.getMappingsSignature(this.tunnelEditor.configuration?.mappings || []);
        try {
          const payload = await this.withGlobalLoading(async () => {
            await this.api(`/api/tunnels/${this.tunnelEditor.id}`, {
              method: "PUT",
              body: JSON.stringify({ name: this.tunnelEditor.name })
            });
            return this.api(`/api/tunnels/${this.tunnelEditor.id}/configuration`, {
              method: "PUT",
              body: JSON.stringify({
                mappings: this.tunnelEditor.configuration?.mappings || []
              })
            });
          }, "正在保存 Tunnel 配置...");
          const configuration = payload.configuration || payload;
          const dnsSync = payload.dnsSync || null;
          this.tunnelEditor.configuration = configuration;
          if (dnsSync) {
            this.applyTunnelEditorPublishReport(dnsSync);
          }
          const nextSignature = this.getMappingsSignature(configuration.mappings || []);
          this.tunnelEditor.ui.mappingSignature = nextSignature;
          await Promise.all([this.loadTunnels(), this.refreshRuntimeStatus()]);
          await this.checkTunnelPublishStatus({ silent: true });
          if (dnsSync) {
            const dnsSummaryText = this.getDnsSyncSummaryMessage(dnsSync);
            const dnsSummary = this.getDnsSyncActionSummary(dnsSync);
            if (dnsSummary.created > 0 || dnsSummary.updated > 0) {
              this.notify(`Tunnel 配置已保存，并已自动同步 DNS。${dnsSummaryText}`);
            } else if (dnsSummary.skipped > 0) {
              this.notify("Tunnel 配置已保存，但有部分 DNS 记录未自动同步，请检查发布状态。", "warning");
            } else {
              this.notify("Tunnel 配置已保存");
            }
          } else {
            this.notify("Tunnel 配置已保存");
          }
          if (previousSignature !== nextSignature) {
            await this.confirmReconnectTunnel(this.tunnelEditor.id, this.tunnelEditor.name);
          }
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async testEditorOrigin(mapping, index) {
        if (!this.tunnelEditor) {
          return;
        }
        if (!mapping.service) {
          this.notify("请先填写 service 地址", "warning");
          return;
        }
        try {
          const payload = await this.withGlobalLoading(
            () =>
              this.api(`/api/tunnels/${this.tunnelEditor.id}/origin-test`, {
                method: "POST",
                body: JSON.stringify({
                  service: mapping.service,
                  originRequest: mapping.originRequest || {
                    noTLSVerify: false,
                    disableChunkedEncoding: false,
                    http2Origin: false
                  }
                })
              }),
            "正在测试源站..."
          );
          this.tunnelEditor.ui = this.tunnelEditor.ui || { originTests: {} };
          this.tunnelEditor.ui.originTests = this.tunnelEditor.ui.originTests || {};
          this.tunnelEditor.ui.originTests[index] = payload;
          this.notify(payload.ok ? "本地源站测试通过" : "本地源站测试失败", payload.ok ? "success" : "error");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async startTunnel(tunnel, { force = false } = {}) {
        try {
          await this.withGlobalLoading(
            () => this.api(`/api/tunnels/${tunnel.id}/start${force ? "?force=true" : ""}`, { method: "POST" }),
            "正在启动 Tunnel..."
          );
          this.selectedRuntimeTunnelId = tunnel.id;
          await Promise.all([this.refreshRuntimeStatus(), this.loadTunnels()]);
          this.notify("Tunnel 已启动");
        } catch (error) {
          if (error.status === 409) {
            try {
              await ElementPlus.ElMessageBox.confirm(
                error.message,
                "确认接管 Tunnel",
                { confirmButtonText: "确认接管", cancelButtonText: "取消", type: "warning" }
              );
              await this.startTunnel(tunnel, { force: true });
            } catch {
              // user cancelled
            }
            return;
          }
          this.notify(error.message, "error");
        }
      },
      async stopTunnelFromList(tunnel) {
        try {
          await this.withGlobalLoading(
            () => this.api(`/api/tunnels/${tunnel.id}/stop`, { method: "POST" }),
            "正在停止 Tunnel..."
          );
          if (this.selectedRuntimeTunnelId === tunnel.id) {
            this.runtimeLogVisible = false;
            this.selectedRuntimeTunnelId = null;
          }
          this.hoveredStopTunnelId = null;
          await Promise.all([this.refreshRuntimeStatus(), this.loadTunnels()]);
          this.notify("Tunnel 已停止", "info");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async handleTunnelPrimaryAction(tunnel) {
        if (this.canStopTunnel(tunnel)) {
          await this.stopTunnelFromList(tunnel);
          return;
        }
        if (this.canStartTunnel(tunnel)) {
          await this.startTunnel(tunnel);
        }
      },
      openTunnelLogs(tunnel) {
        if (this.runtimeViewerTunnelId !== tunnel.id) {
          this.resetRuntimeViewer({ tunnelId: tunnel.id, mode: "logs" });
        } else {
          this.runtimeViewerMode = "logs";
        }
        this.selectedRuntimeTunnelId = tunnel.id;
        this.runtimeLogVisible = true;
        this.syncRuntimeLogDisplay();
      },
      selectRuntimeProcess(tunnelId) {
        if (this.runtimeViewerTunnelId !== tunnelId) {
          this.resetRuntimeViewer({ tunnelId, mode: "logs" });
        } else {
          this.runtimeViewerMode = "logs";
        }
        this.selectedRuntimeTunnelId = tunnelId;
        this.syncRuntimeLogDisplay();
        if (this.runtimeLogVisible) {
          this.refreshCurrentRuntimeViewer();
        }
      },
      async refreshCurrentRuntimeViewer(options = {}) {
        if (this.runtimeViewerMode === "metrics") {
          return this.refreshSelectedMetrics(options);
        }
        return this.refreshSelectedLogs(options);
      },
      async refreshSelectedLogs(options = {}) {
        if (!this.selectedRuntimeTunnelId) {
          await this.updateRuntimeViewerDisplay(this.cloudflared.statusHint || "等待状态刷新...", {
            reset: true
          });
          return;
        }

        const activeTunnelId = this.selectedRuntimeTunnelId;
        if (!options.silent) {
          this.syncRuntimeLogDisplay();
        }

        try {
          const payload = await this.api(
            `/api/tunnels/${encodeURIComponent(activeTunnelId)}/logs`
          );
          if (this.selectedRuntimeTunnelId !== activeTunnelId || this.runtimeViewerMode !== "logs") {
            return;
          }

          const nextLines = Array.isArray(payload.recentLogs) ? payload.recentLogs : [];
          this.runtimeLogLines = this.mergeLineSnapshots(this.runtimeLogLines, nextLines);
          await this.updateRuntimeViewerDisplay(
            this.runtimeLogLines.length
              ? this.runtimeLogLines.join("\n")
              : "当前进程暂时没有日志输出。",
            { reset: !this.runtimeLogLines.length && !options.silent }
          );
        } catch (error) {
          if (this.selectedRuntimeTunnelId === activeTunnelId && this.runtimeViewerMode === "logs") {
            await this.updateRuntimeViewerDisplay(error.message, {
              reset: !options.silent
            });
          }
        }
      },
      async stopSelectedTunnel() {
        if (!this.selectedProcess) {
          return;
        }
        try {
          await this.withGlobalLoading(
            () =>
              this.api(`/api/tunnels/${encodeURIComponent(this.selectedProcess.tunnelId)}/stop`, {
                method: "POST"
              }),
            "正在停止 Tunnel..."
          );
          await Promise.all([this.refreshRuntimeStatus(), this.loadTunnels()]);
          this.notify("当前 Tunnel 已停止", "info");
        } catch (error) {
          this.runtimeLogDisplay = error.message;
          this.notify(error.message, "error");
        }
      },
      async clearSelectedLogs() {
        if (!this.selectedProcess) {
          return;
        }
        try {
          await this.withGlobalLoading(
            () =>
              this.api(`/api/tunnels/${encodeURIComponent(this.selectedProcess.tunnelId)}/logs/clear`, {
                method: "POST"
              }),
            "正在清空日志..."
          );
          this.runtimeViewerMode = "logs";
          this.runtimeLogLines = [];
          await this.updateRuntimeViewerDisplay("日志已清空，等待最新输出...", {
            reset: true
          });
          await Promise.all([this.refreshRuntimeStatus(), this.refreshSelectedLogs({ silent: true })]);
          this.notify("当前日志已清空", "info");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async showSelectedLogs() {
        if (!this.selectedProcess) {
          return;
        }
        this.runtimeViewerMode = "logs";
        if (this.runtimeViewerTunnelId !== this.selectedProcess.tunnelId) {
          this.resetRuntimeViewer({ tunnelId: this.selectedProcess.tunnelId, mode: "logs" });
        }
        this.syncRuntimeLogDisplay();
        await this.refreshSelectedLogs();
      },
      async showSelectedMetrics() {
        if (!this.selectedProcess) {
          return;
        }
        try {
          if (this.runtimeViewerTunnelId !== this.selectedProcess.tunnelId) {
            this.resetRuntimeViewer({ tunnelId: this.selectedProcess.tunnelId, mode: "metrics" });
          } else {
            this.runtimeViewerMode = "metrics";
          }
          await this.withGlobalLoading(
            () => this.refreshSelectedMetrics({ silent: false, initialLoad: true }),
            "正在读取 metrics..."
          );
          this.notify("已加载当前 metrics", "info");
        } catch (error) {
          this.notify(error.message, "error");
        }
      },
      async refreshSelectedMetrics(options = {}) {
        if (!this.selectedProcess) {
          await this.updateRuntimeViewerDisplay("当前没有可查看的 metrics 进程。", {
            reset: !options.silent
          });
          return;
        }

        const activeTunnelId = this.selectedProcess.tunnelId;
        const payload = await this.api(`/api/tunnels/${encodeURIComponent(activeTunnelId)}/metrics`);
        if (this.selectedRuntimeTunnelId !== activeTunnelId || this.runtimeViewerMode !== "metrics") {
          return;
        }

        const normalizedPayload = String(payload || "").trim();
        if (!normalizedPayload) {
          if (!this.runtimeMetricsHistory.length) {
            await this.updateRuntimeViewerDisplay("当前没有可显示的 metrics 内容。", {
              reset: !options.silent
            });
          }
          return;
        }

        if (!options.initialLoad && normalizedPayload === this.runtimeMetricsLastPayload) {
          return;
        }

        this.runtimeMetricsLastPayload = normalizedPayload;
        const snapshotLabel = `[metrics] ${this.formatDateTime(new Date().toISOString())}`;
        this.runtimeMetricsHistory.push(`${snapshotLabel}\n${normalizedPayload}`);
        if (this.runtimeMetricsHistory.length > 20) {
          this.runtimeMetricsHistory = this.runtimeMetricsHistory.slice(-20);
        }
        await this.updateRuntimeViewerDisplay(this.runtimeMetricsHistory.join("\n\n"), {
          reset: this.runtimeMetricsHistory.length === 1
        });
      },
      parseMetricsText(rawText) {
        const text = String(rawText || "").trim();
        if (!text) return { connections: null, bytesUp: null, bytesDown: null, requests: null, errors: null, uptimeSeconds: null };

        const getFloat = (name) => {
          const match = text.match(new RegExp(`${name}\\s+([\\d.]+(?:e[+-]\\d+)?)`));
          return match ? parseFloat(match[1]) : null;
        };

        return {
          connections: getFloat("cloudflared_tunnel_active_connections"),
          bytesUp: getFloat("cloudflared_tunnel_total_bytes"),
          bytesDown: getFloat("cloudflared_tunnel_received_bytes"),
          requests: getFloat("cloudflared_tunnel_requests"),
          errors: getFloat("cloudflared_tunnel_request_errors"),
          uptimeSeconds: getFloat("cloudflared_tunnel_uptime_secs")
        };
      },
      formatBytes(bytes) {
        if (bytes === null || bytes === undefined) return "-";
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      },
    toggleAllFiltered() {
        if (this.allFilteredSelected) {
          this.tunnelSelection = [];
        } else {
          this.tunnelSelection = this.filteredTunnels.map(t => t.id);
        }
      },
      isTunnelSelected(tunnelId) {
        return this.tunnelSelection.includes(tunnelId);
      },
      toggleTunnelSelection(tunnelId) {
        const idx = this.tunnelSelection.indexOf(tunnelId);
        if (idx >= 0) {
          this.tunnelSelection.splice(idx, 1);
        } else {
          this.tunnelSelection.push(tunnelId);
        }
      },
      clearTunnelSelection() {
        this.tunnelSelection = [];
      },
      async batchAction(action) {
        const label = { start: "启动", stop: "停止", delete: "删除" }[action];
        if (!this.tunnelSelection.length) {
          this.notify("请先选择要操作的 Tunnel。", "warning");
          return;
        }
        if (action === "delete") {
          try {
            await ElementPlus.ElMessageBox.confirm(
              `确定要批量删除 ${this.tunnelSelection.length} 个 Tunnel？此操作不可撤销。`,
              "批量删除确认",
              { confirmButtonText: "确定删除", cancelButtonText: "取消", type: "warning" }
            );
          } catch (_) { return; }
        }
        this.batchActionLoading = true;
        try {
          const payload = await this.withGlobalLoading(
            () => this.api("/api/tunnels/batch", {
              method: "POST",
              body: JSON.stringify({ action, tunnelIds: [...this.tunnelSelection] })
            }),
            `正在批量${label}...`
          );
          const results = payload.results || [];
          const succeeded = results.filter(r => r.success).length;
          const failed = results.filter(r => !r.success).length;
          if (failed > 0) {
            this.notify(`批量${label}：${succeeded} 成功，${failed} 失败`, "warning");
          } else {
            this.notify(`批量${label}：${succeeded} 个全部成功`);
          }
          this.tunnelSelection = [];
          await Promise.all([this.loadTunnels(), this.refreshRuntimeStatus()]);
        } catch (error) {
          this.notify(error.message, "error");
        } finally {
          this.batchActionLoading = false;
        }
      }
    },
    mounted() {
      this.bootstrap();
      // Pause polling while tab is hidden; resume + refresh immediately on focus
      this._onVisibilityChange = () => {
        if (document.hidden) {
          if (this.statusPollTimer) {
            clearInterval(this.statusPollTimer);
            this.statusPollTimer = null;
          }
        } else if (this.authenticated) {
          this.refreshRuntimeStatus();
          if (!this.statusPollTimer) {
            this.statusPollTimer = setInterval(() => this.refreshRuntimeStatus(), 5000);
          }
        }
      };
      document.addEventListener("visibilitychange", this._onVisibilityChange);
    },
    beforeUnmount() {
      if (this.statusPollTimer) {
        clearInterval(this.statusPollTimer);
      }
      document.removeEventListener("visibilitychange", this._onVisibilityChange);
    },
    template: `
      <div class="liquid-shell">
        <section v-if="!authenticated" class="login-shell">
          <div class="login-layout">
            <div class="login-panel">
              <span class="page-kicker">SECURE EDGE ACCESS</span>
              <div class="login-brand">
                <div class="brand-orb">CF</div>
                <div>
                  <h1>Cloudflare Tunnel XUI</h1>
                  <p>本地 Tunnel 控制台</p>
                </div>
              </div>
              <div class="login-highlights">
                <article class="login-highlight">
                  <span>01</span>
                  <strong>加密配置存储</strong>
                  <p>凭据本地加密保存</p>
                </article>
                <article class="login-highlight">
                  <span>02</span>
                  <strong>路由与 DNS 同屏协同</strong>
                  <p>路由与 DNS 一体化</p>
                </article>
                <article class="login-highlight">
                  <span>03</span>
                  <strong>运行态可视化</strong>
                  <p>日志与 metrics 可查</p>
                </article>
              </div>
            </div>

            <el-card class="glass-card login-card">
              <div class="login-card-head">
                <span class="permission-title">登录控制台</span>
              </div>
              <el-form class="glass-form element-form" label-position="top">
                <el-form-item label="用户名">
                  <el-input v-model="loginForm.username" clearable placeholder="请输入用户名" />
                </el-form-item>
                <el-form-item label="密码">
                  <el-input v-model="loginForm.password" show-password placeholder="请输入密码" @keyup.enter="handleLogin" />
                </el-form-item>
                <el-form-item class="form-actions">
                  <el-button type="primary" class="glass-btn wide-action" @click="handleLogin">进入控制台</el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </div>
        </section>

        <section v-else class="dashboard-shell">
          <aside class="glass-sidebar">
            <div class="sidebar-brand">
              <div class="brand-orb">CF</div>
              <div class="sidebar-brand-text">
                <span class="sidebar-eyebrow">CONTROL PLANE</span>
                <strong>Cloudflare Tunnel</strong>
              </div>
              <button class="theme-toggle-btn" @click="toggleDarkMode" :title="darkMode ? '切换亮色主题' : '切换暗色主题'">
                <span v-if="darkMode">☀️</span>
                <span v-else>🌙</span>
              </button>
            </div>

            <div class="nav-stack">
              <el-button
                v-for="item in navItems"
                :key="item.key"
                class="nav-btn"
                :class="{ active: currentView === item.key }"
                @click="switchView(item.key)"
              >
                <span class="nav-btn-copy">
                  <strong>{{ item.title }}</strong>
                </span>
              </el-button>
            </div>

            <el-card class="glass-card sidebar-status sidebar-logout">
              <el-button class="glass-btn wide-action" @click="handleLogout">退出登录</el-button>
            </el-card>
          </aside>

          <main class="dashboard-main">
            <header class="glass-topbar">
              <div class="topbar-copy">
                <span class="page-kicker">EDGE OPERATIONS</span>
                <h2>{{ pageMeta.title }}</h2>
              </div>
              <div class="topbar-meta">
                <div class="tag-row">
                  <el-tag class="glass-tag">{{ runtimeBadgeLabel }}</el-tag>
                  <el-tag class="glass-tag">{{ tunnelCount }} 个 Tunnel</el-tag>
                  <el-tag class="glass-tag" :class="credentialsConfigured ? 'success' : 'warn'">
                    {{ credentialsConfigured ? '凭据已配置' : '待配置凭据' }}
                  </el-tag>
                </div>
              </div>
            </header>

            <transition :name="viewTransitionEnabled ? 'view-fade' : ''" mode="out-in">
              <div class="page-wrapper" :key="currentView">
                <section v-if="currentView === 'home'" class="page-grid home-page">
                  <div class="overview-grid single-wide">
                    <el-card class="glass-card compact-card tunnel-list-card" header="Tunnel 路由清单">
                      <transition-group tag="div" name="list" class="home-tunnel-stack">
                        <div v-if="tunnelsLoading" key="loading" class="skeleton-stack">
                          <div v-for="n in 3" :key="'home-skeleton-' + n" class="skeleton-card"></div>
                        </div>
                        <div v-else-if="!tunnels.length" key="empty" class="empty-line">还没有可展示的 Tunnel。</div>
                        <template v-else>
                          <div v-for="tunnel in tunnels.slice(0, 6)" :key="tunnel.id" class="home-tunnel-card">
                            <div class="home-tunnel-head">
                              <div>
                                <strong>{{ tunnel.name }}</strong>
                                <p>{{ tunnel.connections || 0 }} 条连接<span v-if="getTunnelUptime(tunnel.id)"> · 已运行 {{ getTunnelUptime(tunnel.id) }}</span></p>
                              </div>
                              <div class="tag-row">
                                <el-tag class="glass-tag" :type="getTunnelStatusType(tunnel)">{{ getTunnelStatusLabel(tunnel) }}</el-tag>
                                <el-tag class="glass-tag" :class="isTunnelRunning(tunnel.id) ? 'success' : 'muted'">
                                  {{ isTunnelRunning(tunnel.id) ? '本机运行中' : '未在本机运行' }}
                                </el-tag>
                              </div>
                            </div>
                            <div class="mapping-preview-list">
                              <div
                                v-for="(mapping, index) in (tunnel.configuration?.mappings || []).slice(0, 4)"
                                :key="index"
                                class="mapping-preview-row"
                              >
                                <span>{{ mapping.hostname || '未配置域名' }}</span>
                                <span class="arrow">→</span>
                                <span>{{ mapping.service || '未配置源站' }}</span>
                              </div>
                              <div v-if="!(tunnel.configuration?.mappings || []).length" class="empty-line">暂无路由</div>
                              <div v-else-if="(tunnel.configuration?.mappings || []).length > 4" class="empty-line small-empty">仅展示前 4 条路由。</div>
                            </div>
                          </div>
                          <div v-if="tunnels.length > 6" key="home-more" class="empty-line small-empty">
                            已有 {{ tunnels.length }} 个 Tunnel · <el-button link type="primary" @click="switchView('tunnels')">查看全部</el-button>
                          </div>
                        </template>
                      </transition-group>
                    </el-card>
                  </div>
                </section>

                <section v-else-if="currentView === 'settings'" class="page-grid settings-page">
                  <div class="settings-split-grid">
                    <el-card class="glass-card settings-card">
                  <template #header>
                    <div class="card-head-row">
                      <span>Cloudflare 配置</span>
                      <el-space wrap>
                        <el-button type="primary" class="glass-btn" @click="saveSettings">保存配置</el-button>
                        <el-button class="glass-btn" @click="testSettings">测试 Token 权限</el-button>
                      </el-space>
                    </div>
                  </template>
                  <el-form class="glass-form element-form" label-position="top">
                    <el-form-item label="Account ID">
                      <el-input v-model="settingsForm.accountId" placeholder="用于 Tunnel API 的 Account ID" />
                    </el-form-item>
                    <el-form-item label="API Token">
                      <el-input v-model="settingsForm.apiToken" show-password placeholder="留空则保留现有 Token" />
                    </el-form-item>
                  </el-form>
                  <div class="config-result-card" role="status" aria-live="polite">
                    <div class="config-result-scroll">
                      <div class="config-section">
                        <div class="permission-title">凭据状态</div>
                        <div class="detail-list">
                          <div class="detail-row">
                            <span>检测结果</span>
                            <el-tag class="glass-tag" :type="configTestData ? (configTestData.valid ? 'success' : (configTestData.permissions?.inspectable === false ? 'info' : 'warning')) : 'info'">
                              {{ configTestData ? (configTestData.valid ? '通过' : (configTestData.permissions?.inspectable === false ? '部分可确认' : '权限不完整')) : '等待检测' }}
                            </el-tag>
                          </div>
                          <div class="detail-row">
                            <span>Account ID</span>
                            <strong>{{ settingsForm.accountId || '未填写' }}</strong>
                          </div>
                          <div class="detail-row">
                            <span>提示信息</span>
                            <strong>{{ configTestData?.message || '点击“测试 Token 权限”后在此查看结果' }}</strong>
                          </div>
                          <div class="detail-row" v-if="configTestData">
                            <span>Tunnel 管理</span>
                            <strong>{{ getCapabilityStateLabel(configTestData.ready?.tunnelManagement) }}</strong>
                          </div>
                          <div class="detail-row" v-if="configTestData">
                            <span>DNS 自动发布</span>
                            <strong>{{ getCapabilityStateLabel(configTestData.ready?.dnsPublish) }}</strong>
                          </div>
                        </div>
                      </div>

                      <div class="config-section" v-if="configTestData">
                        <div class="permission-title">权限情况</div>
                        <div class="permission-block">
                          <div>
                            <span class="permission-title">已具备权限</span>
                            <div class="tag-row">
                              <el-tag v-for="item in grantedPermissions" :key="item" class="glass-tag success" type="success">{{ item }}</el-tag>
                              <span v-if="!grantedPermissions.length" class="empty-line small-empty">暂无明确返回</span>
                            </div>
                          </div>
                          <div>
                            <span class="permission-title">缺少权限</span>
                            <div class="tag-row">
                              <el-tag v-for="item in missingPermissions" :key="item" class="glass-tag warn" type="warning">{{ item }}</el-tag>
                              <span v-if="configTestData.permissions?.inspectable === false" class="empty-line small-empty">当前 API Token 无权读取自身权限明细（缺少或受限于 API Tokens Read），因此无法精确列出“缺少/已具备”的权限名；但 Tunnel/DNS 能力已通过真实接口探测。</span>
                              <span v-else-if="!missingPermissions.length" class="empty-line small-empty">未发现缺少权限</span>
                            </div>
                          </div>
                          <div>
                            <span class="permission-title">Tunnel 必需权限</span>
                            <div class="tag-row">
                              <el-tag v-for="item in tunnelMissingPermissions" :key="item" class="glass-tag warn" type="warning">{{ item }}</el-tag>
                              <span v-if="tunnelMissingPermissions === null" class="empty-line small-empty">权限明细不可读（API Tokens Read 受限），但 Tunnel 管理能力已通过探测。</span>
                              <span v-else-if="!tunnelMissingPermissions.length" class="empty-line small-empty">Tunnel 管理所需权限已具备</span>
                            </div>
                          </div>
                          <div>
                            <span class="permission-title">DNS 发布必需权限</span>
                            <div class="tag-row">
                              <el-tag v-for="item in dnsMissingPermissions" :key="item" class="glass-tag warn" type="warning">{{ item }}</el-tag>
                              <span v-if="dnsMissingPermissions === null" class="empty-line small-empty">权限明细不可读（API Tokens Read 受限），但 DNS 自动发布能力已通过探测。</span>
                              <span v-else-if="!dnsMissingPermissions.length" class="empty-line small-empty">DNS 自动发布所需权限已具备</span>
                            </div>
                          </div>
                          <div>
                            <span class="permission-title">要求权限</span>
                            <div class="tag-row">
                              <el-tag v-for="item in requiredPermissions" :key="item" class="glass-tag muted" type="info">{{ item }}</el-tag>
                              <span v-if="!requiredPermissions.length" class="empty-line small-empty">未返回要求权限列表</span>
                            </div>
                          </div>
                          <div v-if="optionalPermissions.length">
                            <span class="permission-title">可选辅助权限</span>
                            <div class="tag-row">
                              <el-tag v-for="item in optionalPermissions" :key="item" class="glass-tag muted" type="info">{{ item }}</el-tag>
                            </div>
                          </div>
                          <div v-if="configIssues.length">
                            <span class="permission-title">检测问题</span>
                            <div class="detail-list">
                              <div v-for="item in configIssues" :key="item" class="origin-result fail">{{ item }}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="config-section">
                        <div class="permission-title">接口返回</div>
                        <el-input type="textarea" class="glass-textarea compact-result-textarea" :rows="8" resize="none" readonly v-model="configTestResult" />
                      </div>
                    </div>
                  </div>
                </el-card>

                <el-card class="glass-card settings-card">
                  <template #header>
                    <div class="card-head-row">
                      <span>修改登录密码</span>
                      <el-button type="primary" class="glass-btn" @click="changePassword">修改密码</el-button>
                    </div>
                  </template>
                  <el-form class="glass-form element-form" label-position="top">
                    <el-form-item label="当前密码">
                      <el-input v-model="passwordForm.currentPassword" show-password placeholder="请输入当前密码" />
                    </el-form-item>
                    <el-form-item label="新密码">
                      <el-input v-model="passwordForm.newPassword" show-password placeholder="请输入新密码" />
                    </el-form-item>
                    <el-form-item label="确认新密码">
                      <el-input v-model="passwordForm.confirmPassword" show-password placeholder="请再次输入新密码" />
                    </el-form-item>
                  </el-form>
                  <el-input type="textarea" class="glass-textarea" :rows="4" resize="none" readonly v-model="passwordResult" />
                </el-card>
              </div>
                </section>

                <section v-else-if="currentView === 'tunnels'" class="page-grid tunnel-page">
                  <el-card class="glass-card tunnel-page-card">
                    <template #header>
                      <div class="card-head-row">
                        <el-space wrap class="tunnel-toolbar">
                          <el-input
                            v-model="tunnelSearch"
                            clearable
                            class="glass-mini-input"
                            placeholder="搜索 Tunnel 名称 / ID"
                          />
                          <el-select v-model="tunnelSort" class="glass-mini-select" placeholder="排序">
                            <el-option label="按名称" value="name" />
                            <el-option label="按创建时间" value="createdAt" />
                            <el-option label="按连接数" value="connections" />
                            <el-option label="按路由数" value="mappings" />
                          </el-select>
                          <el-button class="glass-btn" @click="toggleTunnelSortOrder">
                            {{ tunnelSortOrder === 'asc' ? '升序' : '降序' }}
                          </el-button>
                          <el-tag v-if="tunnelSearch" class="glass-tag muted" type="info">
                            {{ filteredTunnelCount }} / {{ tunnelCount }}
                          </el-tag>
                          <el-button type="primary" class="glass-btn" @click="createTunnelVisible = true">创建 Tunnel</el-button>
                          <el-button class="glass-btn" @click="reloadTunnelsManually">刷新状态</el-button>
                          <el-button class="glass-btn" @click="exportTunnels">导出</el-button>
                          <el-button class="glass-btn" @click="showImportDialog = true">导入</el-button>
                          <el-button v-if="tunnelSelection.length" class="glass-btn" @click="clearTunnelSelection">取消选择 ({{ selectedTunnelCount }})</el-button>
                          <el-button v-if="tunnelSelection.length" type="primary" class="glass-btn" :loading="batchActionLoading" @click="batchAction('start')">批量连接</el-button>
                          <el-button v-if="tunnelSelection.length" class="glass-btn" :loading="batchActionLoading" @click="batchAction('stop')">批量停止</el-button>
                          <el-button v-if="tunnelSelection.length" class="glass-btn danger-btn" :loading="batchActionLoading" @click="batchAction('delete')">批量销毁</el-button>
                        </el-space>
                      </div>
                    </template>

                    <div class="tunnel-stack tunnel-scroll-area">
                      <div v-if="tunnelsLoading" class="skeleton-stack">
                        <div v-for="n in 4" :key="'tunnel-skeleton-' + n" class="skeleton-card"></div>
                      </div>
                      <div v-if="tunnelsLoading" class="skeleton-stack">
                        <div v-for="n in 4" :key="'tunnel-skeleton-' + n" class="skeleton-card"></div>
                      </div>
                      <div v-else-if="!filteredTunnels.length" class="empty-line">
                        {{ tunnelSearch ? '没有匹配的 Tunnel。' : '还没有可展示的 Tunnel。' }}
                      </div>
                      <div v-else class="tunnel-stack">
                        <div class="tunnel-item-card tunnel-select-all">
                          <el-checkbox :model-value="allFilteredSelected" :indeterminate="tunnelSelection.length > 0 && !allFilteredSelected" @change="toggleAllFiltered" class="glass-checkbox" />
                          <span>全选 ({{ selectedTunnelCount }} / {{ filteredTunnelCount }})</span>
                        </div>
                        <div v-for="tunnel in filteredTunnels" :key="tunnel.id" class="tunnel-item-card tunnel-checkable">
                          <el-checkbox :model-value="isTunnelSelected(tunnel.id)" @change="toggleTunnelSelection(tunnel.id)" class="glass-checkbox" />
                          <div class="tunnel-card-layout" style="flex:1; min-width:0;">
                            <div class="tunnel-card-copy">
                              <div class="tunnel-card-summary">
                                <strong>{{ tunnel.name }}</strong>
                                <p>
                                  {{ getTunnelStatusLabel(tunnel) }}
                                  <span v-if="isTunnelRunning(tunnel.id)"> · 本机运行中</span>
                                </p>
                              </div>
                              <div class="tunnel-meta-line compact-tunnel-meta">
                                <span>连接：{{ tunnel.connections || 0 }}</span>
                                <span>路由：{{ tunnel.configuration?.mappings?.length || 0 }}</span>
                                <span>创建于：{{ formatDateTime(tunnel.createdAt) }}</span>
                              </div>
                            </div>
                            <el-space wrap class="tunnel-card-actions">
                              <el-button
                                type="primary"
                                class="glass-btn"
                                :disabled="!canStartTunnel(tunnel) && !canStopTunnel(tunnel)"
                                @mouseenter="canStopTunnel(tunnel) ? hoveredStopTunnelId = tunnel.id : null"
                                @mouseleave="hoveredStopTunnelId = null"
                                @click="handleTunnelPrimaryAction(tunnel)"
                              >
                                {{ getTunnelPrimaryActionLabel(tunnel) }}
                              </el-button>
                              <el-button class="glass-btn" :disabled="!canOpenTunnelLogs(tunnel.id)" @click="openTunnelLogs(tunnel)">日志</el-button>
                              <el-button class="glass-btn" @click="showTunnelDetail(tunnel)">配置</el-button>
                              <el-button class="glass-btn danger-btn" :disabled="!canDeleteTunnel(tunnel)" @click="deleteTunnel(tunnel)">销毁</el-button>
                            </el-space>
                          </div>
                        </div>
                      </div>
                    </div>
                  </el-card>
                </section>

                <section v-else class="page-grid">
                  <el-card class="glass-card" header="运行说明">
                    <div class="about-copy">
                      <p>使用顺序：配置 Token → 创建/选择 Tunnel → 配置路由 → 需要时连接并查看日志。</p>
                      <p>页面托管的 cloudflared 支持启动/停止与日志/metrics；外部进程仅展示不接管。</p>
                    </div>
                  </el-card>
                </section>
              </div>
            </transition>
          </main>
        </section>

        <el-dialog v-model="tunnelEditorVisible" title="Tunnel 配置与路由" width="960px" align-center class="glass-dialog glass-modal tunnel-editor-dialog" destroy-on-close @closed="cleanupDialogArtifacts">
          <div v-if="tunnelEditor" class="detail-list">
            <div class="drawer-editor-head">
              <div class="drawer-name-block">
                <span class="permission-title">Tunnel 名称</span>
                <el-input v-model="tunnelEditor.name" :disabled="!canEditTunnelEditor()" />
              </div>
              <el-space wrap>
                <el-button
                  class="glass-btn"
                  :loading="Boolean(tunnelEditor.ui?.publishStatusLoading)"
                  :disabled="Boolean(tunnelEditor.ui?.publishStatusLoading)"
                  @click="syncTunnelDnsRecords()"
                >
                  同步 CNAME 记录
                </el-button>
                <el-button
                  class="glass-btn"
                  :loading="Boolean(tunnelEditor.ui?.publishStatusLoading)"
                  :disabled="Boolean(tunnelEditor.ui?.publishStatusLoading)"
                  @click="checkTunnelPublishStatus()"
                >
                  核验 DNS 发布
                </el-button>
                <el-button type="primary" class="glass-btn" :disabled="!canEditTunnelEditor()" @click="saveTunnelEditor">保存配置</el-button>
              </el-space>
            </div>
            <div class="drawer-info-grid">
              <div class="detail-row">
                <span>ID</span>
                <strong>{{ tunnelEditor.id }}</strong>
              </div>
              <div class="detail-row">
                <span>状态</span>
                <strong>{{ tunnelEditor.status || 'unknown' }}</strong>
              </div>
              <div class="detail-row">
                <span>连接数</span>
                <strong>{{ tunnelEditor.connections || 0 }}</strong>
              </div>
              <div class="detail-row">
                <span>创建时间</span>
                <strong>{{ formatDateTime(tunnelEditor.createdAt) }}</strong>
              </div>
              <div class="detail-row">
                <span>最后活动</span>
                <strong>{{ formatDateTime(tunnelEditor.connsActiveAt) }}</strong>
              </div>
            </div>
            <div class="mapping-editor drawer-mapping-editor">
              <div class="mapping-toolbar">
                <strong>路由映射</strong>
                  <el-space wrap>
                    <el-button class="glass-btn" :disabled="!canEditTunnelEditor()" @click="addEditorMapping">新增路由</el-button>
                  </el-space>
                </div>
              <div class="origin-result">路由保存到 Cloudflare 后，如当前 Tunnel 由控制台托管运行，系统会提示是否立即断开并重连以应用新配置。</div>
              <div
                v-if="tunnelEditor.ui?.publishStatus"
                class="origin-result"
                :class="getPublishStatusSummaryTone(tunnelEditor.ui.publishStatus)"
              >
                {{ getPublishStatusSummaryMessage(tunnelEditor.ui.publishStatus) }}
                <span v-if="tunnelEditor.ui.publishStatus.expectedTarget">
                  目标记录应指向 <code>{{ tunnelEditor.ui.publishStatus.expectedTarget }}</code>。
                </span>
              </div>
              <div
                v-if="tunnelEditor.ui?.publishStatus?.syncedAt && getDnsSyncSummaryMessage(tunnelEditor.ui.publishStatus)"
                class="origin-result"
              >
                {{ getDnsSyncSummaryMessage(tunnelEditor.ui.publishStatus) }}
              </div>
              <div v-else-if="tunnelEditor.ui?.publishStatusLoading" class="origin-result">
                正在核验 hostname 是否已发布到 Cloudflare DNS...
              </div>
              <div v-else-if="tunnelEditor.ui?.publishStatusError" class="origin-result fail">
                {{ tunnelEditor.ui.publishStatusError }}
              </div>
              <div
                v-for="(mapping, index) in (tunnelEditor.configuration?.mappings || [])"
                :key="index"
                class="mapping-row-card"
              >
                <el-row :gutter="10">
                  <el-col :md="9" :sm="24">
                    <el-input v-model="mapping.hostname" :disabled="!canEditTunnelEditor()" placeholder="hostname，例如 app.example.com" />
                  </el-col>
                  <el-col :md="9" :sm="24">
                    <el-input v-model="mapping.service" :disabled="!canEditTunnelEditor()" placeholder="service，例如 http://127.0.0.1:3000" />
                  </el-col>
                  <el-col :md="6" :sm="24">
                    <el-input v-model="mapping.path" :disabled="!canEditTunnelEditor()" placeholder="可选 path，例如 /api/*" />
                  </el-col>
                </el-row>
                <div class="mapping-advanced-stack">
                  <div class="mapping-advanced-row">
                    <el-switch
                      v-model="mapping.originRequest.noTLSVerify"
                      :disabled="!canEditTunnelEditor()"
                    />
                    <div class="mapping-advanced-copy">
                      <strong class="mapping-advanced-title">跳过源站 TLS 证书校验</strong>
                      <span class="mapping-advanced-hint">
                        当源站使用自签名证书，或证书域名与实际访问地址不一致时，请开启此项。
                      </span>
                    </div>
                  </div>
                  <div class="mapping-advanced-row">
                    <el-switch
                      v-model="mapping.originRequest.disableChunkedEncoding"
                      :disabled="!canEditTunnelEditor()"
                    />
                    <div class="mapping-advanced-copy">
                      <strong class="mapping-advanced-title">关闭分块传输编码</strong>
                      <span class="mapping-advanced-hint">
                        PVE 这类管理页放到 Cloudflare 后，如果登录后操作异常、图表不刷新或控制台不稳定，可尝试开启。
                      </span>
                    </div>
                  </div>
                  <div class="mapping-advanced-row">
                    <el-switch
                      v-model="mapping.originRequest.http2Origin"
                      :disabled="!canEditTunnelEditor()"
                    />
                    <div class="mapping-advanced-copy">
                      <strong class="mapping-advanced-title">对源站使用 HTTP/2</strong>
                      <span class="mapping-advanced-hint">
                        当源站本身支持 HTTPS 和 HTTP/2 时可尝试开启；PVE 常与“跳过源站 TLS 校验”配合使用。
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  v-if="isLikelyIpHttpsService(mapping.service) && !mapping.originRequest.noTLSVerify"
                  class="origin-result warn"
                >
                  当前源站是 <code>https + IP/localhost</code> 形式，像 PVE 这类管理页面通常会使用自签名证书或证书域名不匹配。
                  如果测试或访问失败，通常需要开启“跳过源站 TLS 证书校验”。
                </div>
                <div
                  v-if="isLikelyIpHttpsService(mapping.service) && !mapping.originRequest.disableChunkedEncoding"
                  class="origin-result warn"
                >
                  如果这是 PVE 或类似管理页面，访问正常但登录后操作异常、控制台打不开或界面不完整时，通常还需要开启“关闭分块传输编码”。
                </div>
                <div class="mapping-preview-row">
                  <span>{{ mapping.hostname || '未填写域名' }}</span>
                  <span class="arrow">→</span>
                  <span>{{ mapping.service || '未填写源站' }}</span>
                </div>
                <div
                  v-if="getPublishStatusItem(index)"
                  class="origin-result"
                  :class="getPublishStatusTone(getPublishStatusItem(index))"
                >
                  {{ getPublishStatusItem(index).message }}
                </div>
                <div class="drawer-mapping-actions">
                  <el-space wrap>
                    <el-button class="glass-btn" :disabled="!canTestTunnelEditorOrigin()" @click="testEditorOrigin(mapping, index)">本地探测</el-button>
                    <el-button class="glass-btn danger-btn" :disabled="!canEditTunnelEditor()" @click="removeEditorMapping(index)">移除</el-button>
                  </el-space>
                </div>
                <div
                  v-if="tunnelEditor.ui?.originTests?.[index]"
                  class="origin-result"
                  :class="{ ok: tunnelEditor.ui.originTests[index].ok, fail: !tunnelEditor.ui.originTests[index].ok }"
                >
                  {{ tunnelEditor.ui.originTests[index].ok
                    ? '本地探测通过' + (tunnelEditor.ui.originTests[index].status ? ' · HTTP ' + tunnelEditor.ui.originTests[index].status : '')
                    : '本地探测失败 · ' + (tunnelEditor.ui.originTests[index].message || ('HTTP ' + (tunnelEditor.ui.originTests[index].status || 'unknown'))) }}
                </div>
              </div>
              <div v-if="!(tunnelEditor.configuration?.mappings || []).length" class="empty-line small-empty">暂无路由</div>
            </div>
          </div>
        </el-dialog>

        <el-dialog v-model="runtimeLogVisible" :title="runtimeLogTitle" width="960px" align-center class="glass-dialog glass-modal" destroy-on-close @closed="cleanupDialogArtifacts">
          <div class="runtime-dialog-shell">
            <div class="card-head-row">
              <span class="permission-title">运行状态 · {{ runtimeViewerLabel }}</span>
              <el-space wrap>
                <el-button class="glass-btn" :disabled="!selectedProcess?.running || !selectedProcess?.manageable" @click="stopSelectedTunnel">停止当前 Tunnel</el-button>
                <el-button class="glass-btn" :disabled="!selectedProcess?.manageable" @click="clearSelectedLogs">清空当前日志</el-button>
                <el-button class="glass-btn" :disabled="!selectedProcess" @click="showSelectedLogs">查看 Tunnel 日志</el-button>
                <el-button class="glass-btn" :disabled="!selectedProcess?.metricsUrl" @click="showSelectedMetrics">查看当前 metrics</el-button>
              </el-space>
            </div>

            <div class="runtime-dialog-metrics">
              <el-card class="glass-card metric-card">
                <span class="metric-kicker">状态</span>
                <strong>{{ selectedProcess?.running ? '运行中' : '未运行' }}</strong>
                <p>{{ selectedProcess ? getProcessSourceLabel(selectedProcess) : '尚未发现进程' }}<span v-if="selectedProcess?.startedAt"> · {{ formatUptime(selectedProcess.startedAt) }}</span></p>
              </el-card>
              <el-card class="glass-card metric-card">
                <span class="metric-kicker">PID</span>
                <strong>{{ selectedProcess?.pid || '-' }}</strong>
                <p>{{ selectedProcess?.hostnames?.[0] || '未配置域名' }}</p>
              </el-card>
              <el-card class="glass-card metric-card">
                <span class="metric-kicker">Metrics</span>
                <strong>{{ selectedProcess?.metricsPort || '-' }}</strong>
                <p>{{ selectedProcess?.metricsUrl || '暂无 metrics 地址' }}</p>
              </el-card>
            </div>

            <div v-if="runtimeViewerMode === 'metrics'" class="runtime-dialog-metrics">
              <el-card class="glass-card metric-card">
                <span class="metric-kicker">活跃连接</span>
                <strong>{{ parsedMetrics.connections !== null ? parsedMetrics.connections : '-' }}</strong>
                <p>当前连接数</p>
              </el-card>
              <el-card class="glass-card metric-card">
                <span class="metric-kicker">上行流量</span>
                <strong>{{ formatBytes(parsedMetrics.bytesUp) }}</strong>
                <p>已发送</p>
              </el-card>
              <el-card class="glass-card metric-card">
                <span class="metric-kicker">下行流量</span>
                <strong>{{ formatBytes(parsedMetrics.bytesDown) }}</strong>
                <p>已接收</p>
              </el-card>
              <el-card class="glass-card metric-card">
                <span class="metric-kicker">请求数</span>
                <strong>{{ parsedMetrics.requests !== null ? parsedMetrics.requests.toLocaleString() : '-' }}</strong>
                <p>{{ parsedMetrics.errors !== null ? '错误 ' + parsedMetrics.errors : '' }}</p>
              </el-card>
            </div>

            <el-input ref="runtimeViewer" type="textarea" class="glass-textarea log-textarea runtime-dialog-textarea" :rows="18" resize="none" readonly v-model="runtimeLogDisplay" />
          </div>
        </el-dialog>

        <el-dialog v-model="createTunnelVisible" title="创建 Tunnel" width="960px" align-center class="glass-dialog glass-modal" destroy-on-close @closed="cleanupDialogArtifacts">
          <el-form class="glass-form element-form" label-position="top">
            <el-form-item label="Tunnel 名称">
              <el-input v-model="createTunnelForm.name" placeholder="请输入 Tunnel 名称" />
            </el-form-item>
            <el-form-item label="自定义 Secret">
              <el-input v-model="createTunnelForm.tunnelSecret" placeholder="可选，自定义 Secret" />
            </el-form-item>
            <div class="tunnel-create-hint">
              <span><code>自定义 Secret</code> 可选。它是创建 Tunnel 时使用的固定隧道密钥；不填时，系统会自动生成一个随机安全值。</span>
            </div>
          </el-form>
          <template #footer>
            <el-space wrap>
              <el-button class="glass-btn" @click="createTunnelVisible = false">取消</el-button>
              <el-button type="primary" class="glass-btn" @click="createTunnel">创建</el-button>
            </el-space>
          </template>
        </el-dialog>

        <el-dialog v-model="showImportDialog" title="导入 Tunnel 配置" width="720px" align-center class="glass-dialog glass-modal" destroy-on-close>
          <el-form class="glass-form element-form" label-position="top">
            <el-form-item label="粘贴导出的 JSON 数据">
              <el-input type="textarea" class="glass-textarea" :rows="12" resize="none" v-model="importTunnelJson" placeholder="粘贴从「导出」功能获取的 JSON 数据..." />
            </el-form-item>
          </el-form>
          <div v-if="importResult" class="origin-result" :class="importResult.errors?.length ? 'fail' : 'ok'" style="margin-top: 12px;">
            <div>新建 {{ importResult.created || 0 }} 个 Tunnel</div>
            <div>更新 {{ importResult.updated || 0 }} 个 Tunnel 配置</div>
            <div v-if="importResult.errors?.length">失败 {{ importResult.errors.length }} 个</div>
            <div v-for="err in (importResult.errors || [])" :key="err.tunnelId" style="font-size: 12px; margin-top: 4px;">
              {{ err.name || err.tunnelId }}：{{ err.message }}
            </div>
          </div>
          <template #footer>
            <el-space wrap>
              <el-button class="glass-btn" @click="showImportDialog = false; importResult = null">关闭</el-button>
              <el-button type="primary" class="glass-btn" @click="importTunnels">开始导入</el-button>
            </el-space>
          </template>
        </el-dialog>

        <transition name="overlay-fade">
          <div v-if="globalLoadingVisible" class="global-overlay" aria-live="polite" aria-busy="true">
            <div class="global-overlay-card">
              <div class="overlay-spinner" aria-hidden="true"></div>
              <div class="overlay-text">{{ globalLoadingText }}</div>
              <div class="overlay-subtext">请稍候…</div>
            </div>
          </div>
        </transition>
      </div>
    `
  });

  app.use(ElementPlus);
  app.mount("#app");
})();
