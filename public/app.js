(function bootstrapElementApp() {
  const { createApp, nextTick } = Vue;

  const viewMeta = {
    home: {
      title: "首页",
      description: "实时监控 Tunnel、路由映射与本机连接器状态"
    },
    settings: {
      title: "Cloudflare 配置",
      description: "配置 Cloudflare 凭据、核验权限并调整管理口令"
    },
    tunnels: {
      title: "Tunnel 清单",
      description: "维护 Tunnel 路由与连接器运行态"
    },
    about: {
      title: "运行说明",
      description: "架构说明、运维建议与使用顺序"
    }
  };

  const app = createApp({
    data() {
      return {
        authenticated: false,
        user: "",
        currentView: "home",
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
        passwordForm: {
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        },
        createTunnelForm: {
          name: "",
          tunnelSecret: ""
        },
        tunnels: [],
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
        csrfToken: ""
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
          throw new Error(payload?.message || `Request failed: ${response.status}`);
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
        if (!this.loadingInstance) {
          this.loadingInstance = ElementPlus.ElLoading.service({
            lock: true,
            text,
            background: "rgba(236, 244, 255, 0.36)"
          });
        }
      },
      closeGlobalLoading() {
        this.loadingCount = Math.max(0, this.loadingCount - 1);
        if (this.loadingCount === 0 && this.loadingInstance) {
          this.loadingInstance.close();
          this.loadingInstance = null;
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
            mapping.service ||
            mapping.path ||
            mapping.originRequest.noTLSVerify ||
            mapping.originRequest.disableChunkedEncoding ||
            mapping.originRequest.http2Origin
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
        return this.cloudflared.processes.some(
          (item) => item.tunnelId === tunnelId && item.running
        );
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
        } catch (_error) {
          this.setAuthenticated(false);
        }
      },
      async hydrateDashboard() {
        await Promise.all([this.loadSettings(), this.loadTunnels(), this.refreshRuntimeStatus()]);
        if (!this.statusPollTimer) {
          this.statusPollTimer = setInterval(() => {
            this.refreshRuntimeStatus();
          }, 5000);
        }
      },
      async loadSettings() {
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
      },
      async loadTunnels() {
        const payload = await this.api("/api/tunnels");
        this.tunnels = (payload.items || []).map((item) => this.ensureTunnelUi(item));
      },
      async reloadTunnelsManually() {
        try {
          await this.withGlobalLoading(() => this.loadTunnels(), "正在刷新 Tunnel 列表...");
          this.notify("Tunnel 列表已刷新", "info");
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
      async startTunnel(tunnel) {
        try {
          await this.withGlobalLoading(
            () => this.api(`/api/tunnels/${tunnel.id}/start`, { method: "POST" }),
            "正在启动 Tunnel..."
          );
          this.selectedRuntimeTunnelId = tunnel.id;
          await Promise.all([this.refreshRuntimeStatus(), this.loadTunnels()]);
          this.notify("Tunnel 已启动");
        } catch (error) {
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
        await this.updateRuntimeViewerDisplay(this.runtimeMetricsHistory.join("\n\n"), {
          reset: this.runtimeMetricsHistory.length === 1
        });
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
                  <p>面向单机运维场景的 Tunnel 控制面，统一管理凭据、路由、DNS 发布与本地连接器生命周期。</p>
                </div>
              </div>
              <div class="login-highlights">
                <article class="login-highlight">
                  <span>01</span>
                  <strong>加密配置存储</strong>
                  <p>敏感配置保存在本地，适合把控制面部署在自己的主机上。</p>
                </article>
                <article class="login-highlight">
                  <span>02</span>
                  <strong>路由与 DNS 同屏协同</strong>
                  <p>创建 Tunnel、维护 hostname、同步 CNAME 与探测源站在同一套流程里完成。</p>
                </article>
                <article class="login-highlight">
                  <span>03</span>
                  <strong>运行态可视化</strong>
                  <p>把 Cloudflare 侧连接状态和本机 cloudflared 进程状态分开展示，排障更直接。</p>
                </article>
              </div>
            </div>

            <el-card class="glass-card login-card">
              <div class="login-card-head">
                <span class="permission-title">登录控制台</span>
                <p>输入本地管理账号后进入 Tunnel 控制面。</p>
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
              <div>
                <span class="sidebar-eyebrow">CONTROL PLANE</span>
                <strong>Cloudflare Tunnel</strong>
                <span>Edge routing and local connector workspace</span>
              </div>
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

            <el-card class="glass-card sidebar-status">
              <div class="sidebar-status-grid">
                <div class="sidebar-status-item">
                  <span>当前账号</span>
                  <strong>{{ user }}</strong>
                </div>
                <div class="sidebar-status-item">
                  <span>自动刷新</span>
                  <strong>{{ runtimePollingLabel }}</strong>
                </div>
              </div>
              <div class="sidebar-runtime">{{ runtimeBadgeLabel }}</div>
              <el-button class="glass-btn wide-action" @click="handleLogout">退出登录</el-button>
            </el-card>
          </aside>

          <main class="dashboard-main">
            <header class="glass-topbar">
              <div class="topbar-copy">
                <span class="page-kicker">EDGE OPERATIONS</span>
                <h2>{{ pageMeta.title }}</h2>
                <p>{{ pageMeta.description }}</p>
              </div>
              <div class="topbar-meta">
                <div class="tag-row">
                  <el-tag class="glass-tag">{{ runtimeBadgeLabel }}</el-tag>
                  <el-tag class="glass-tag">{{ tunnelCount }} 个 Tunnel</el-tag>
                  <el-tag class="glass-tag" :class="credentialsConfigured ? 'success' : 'warn'">
                    {{ credentialsConfigured ? '凭据已配置' : '待配置凭据' }}
                  </el-tag>
                </div>
                <p class="topbar-note">本机控制面 · {{ runtimePollingLabel }}</p>
              </div>
            </header>

            <section v-if="currentView === 'home'" class="page-grid home-page">
              <div class="overview-grid single-wide">
                <el-card class="glass-card compact-card tunnel-list-card" header="Tunnel 路由清单">
                  <div class="home-tunnel-stack">
                    <div v-if="!tunnels.length" class="empty-line">还没有可展示的 Tunnel。</div>
                    <div v-for="tunnel in tunnels.slice(0, 6)" :key="tunnel.id" class="home-tunnel-card">
                      <div class="home-tunnel-head">
                        <div>
                          <strong>{{ tunnel.name }}</strong>
                          <p>{{ tunnel.connections || 0 }} 条连接</p>
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
                    <div v-if="tunnels.length > 6" class="empty-line small-empty">仅展示前 6 个 Tunnel。</div>
                  </div>
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
                              <span v-if="configTestData.permissions?.inspectable === false" class="empty-line small-empty">当前无法精确列出缺少项，请先补充 API Tokens Read</span>
                              <span v-else-if="!missingPermissions.length" class="empty-line small-empty">未发现缺少权限</span>
                            </div>
                          </div>
                          <div>
                            <span class="permission-title">Tunnel 必需权限</span>
                            <div class="tag-row">
                              <el-tag v-for="item in tunnelMissingPermissions" :key="item" class="glass-tag warn" type="warning">{{ item }}</el-tag>
                              <span v-if="tunnelMissingPermissions === null" class="empty-line small-empty">当前无法精确判断，请先补充 API Tokens Read</span>
                              <span v-else-if="!tunnelMissingPermissions.length" class="empty-line small-empty">Tunnel 管理所需权限已具备</span>
                            </div>
                          </div>
                          <div>
                            <span class="permission-title">DNS 发布必需权限</span>
                            <div class="tag-row">
                              <el-tag v-for="item in dnsMissingPermissions" :key="item" class="glass-tag warn" type="warning">{{ item }}</el-tag>
                              <span v-if="dnsMissingPermissions === null" class="empty-line small-empty">当前无法精确判断，请先补充 API Tokens Read</span>
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
                    <span>Tunnel 清单</span>
                    <el-space wrap>
                      <el-button type="primary" class="glass-btn" @click="createTunnelVisible = true">创建 Tunnel</el-button>
                      <el-button class="glass-btn" @click="reloadTunnelsManually">刷新状态</el-button>
                    </el-space>
                  </div>
                </template>

                <div class="tunnel-stack tunnel-scroll-area">
                  <el-card v-for="tunnel in tunnels.slice(0, 8)" :key="tunnel.id" class="glass-card tunnel-card">
                    <div class="tunnel-card-layout">
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
                  </el-card>
                  <div v-if="tunnels.length > 8" class="empty-line small-empty">仅展示前 8 个 Tunnel。</div>
                </div>
              </el-card>
            </section>

            <section v-else class="page-grid">
              <el-card class="glass-card" header="运行说明">
                <div class="about-copy">
                  <p>本控制台用于集中管理 Cloudflare Tunnel、路由映射与本机 cloudflared 进程状态，可在一个工作台内完成凭据配置、Tunnel 生命周期管理、路由维护和运行态观测。</p>
                  <p>推荐流程：先在“Cloudflare 配置”录入 Account ID 与 API Token 并通过权限核验；再在“Tunnel 清单”确认已有 Tunnel 或创建新实例；最后进入“配置”维护 hostname 路由与源站信息，并按需启动连接器。</p>
                  <p>同机多站点场景建议优先复用同一 Tunnel 追加多条路由；仅在权限隔离或生命周期隔离需求明确时再拆分多个 Tunnel。控制台会将 Cloudflare 侧连接状态与本机进程状态分层展示，便于快速判断问题属于云端还是本机。</p>
                  <p>路由保存后若当前 Tunnel 由控制台托管运行，系统会提示是否立即重连以应用新配置。日志、metrics 与停止操作仅作用于本机托管进程。</p>
                  <p>如果通过命令行启动控制台，退出服务时，控制台托管的 cloudflared 进程会同步停止并清理运行目录；其他独立运行的 cloudflared 进程仅被发现与展示，不会被接管或误删。</p>
                </div>
              </el-card>
            </section>
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
                <p>{{ selectedProcess ? getProcessSourceLabel(selectedProcess) : '尚未发现进程' }}</p>
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
      </div>
    `
  });

  app.use(ElementPlus);
  app.mount("#app");
})();
