const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function listFrontendFiles(dir = path.join(root, "src/frontend")) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFrontendFiles(fullPath);
    }
    if (!/\.(js|vue)$/.test(entry.name)) {
      return [];
    }
    return fullPath;
  });
}

test("frontend uses imported Element Plus feedback APIs", () => {
  const offenders = listFrontendFiles()
    .filter((file) => read(path.relative(root, file)).includes("window.ElementPlus"))
    .map((file) => path.relative(root, file));

  assert.deepEqual(offenders, []);
});

test("app authentication visibility is derived from shared auth state", () => {
  const app = read("src/frontend/App.vue");

  assert.match(app, /computed/);
  assert.match(app, /authState\.authenticated/);
  assert.doesNotMatch(app, /const\s+authenticated\s*=\s*ref\(/);
});

test("login view uses the shared auth composable", () => {
  const login = read("src/frontend/views/LoginView.vue");

  assert.match(login, /useAuth/);
  assert.match(login, /login\(\)/);
  assert.doesNotMatch(login, /const\s+authState\s*=\s*reactive\(/);
});

test("Docker image installs dependencies from the lockfile", () => {
  const dockerfile = read("Dockerfile");

  assert.match(dockerfile, /COPY\s+package\.json\s+package-lock\.json\s+\.\//);
  assert.match(dockerfile, /npm\s+ci\s+--omit=dev/);
});

test("loading overlay is scoped to the app content area", () => {
  const layout = read("src/frontend/components/layout/AppLayout.vue");
  const loading = read("src/frontend/components/common/GlobalLoading.vue");

  assert.doesNotMatch(loading, /teleport\s+to=["']body["']/);
  assert.match(layout, /<GlobalLoading\s*\/>/);
  assert.match(layout, /class="content-area"/);
  assert.match(loading, /position:\s*absolute/);
});

test("dashboard uses skeleton loading instead of a full loading mask", () => {
  const dashboard = read("src/frontend/views/DashboardView.vue");

  assert.doesNotMatch(dashboard, /v-loading="dashboardLoading"/);
  assert.match(dashboard, /dashboard-skeleton/);
  assert.match(dashboard, /skeleton-card/);
});

test("tunnel list uses skeleton loading instead of a full page loading mask", () => {
  const tunnelList = read("src/frontend/views/TunnelListView.vue");

  assert.doesNotMatch(tunnelList, /class="tunnels-page"\s+v-loading=/);
  assert.match(tunnelList, /tunnel-list-skeleton/);
  assert.match(tunnelList, /skeleton-tunnel-card/);
});

test("tunnel start and stop actions expose pending motion state", () => {
  const tunnelList = read("src/frontend/views/TunnelListView.vue");

  assert.match(tunnelList, /actionState\s*=\s*ref/);
  assert.match(tunnelList, /handleTunnelAction\(t\)/);
  assert.match(tunnelList, /is-action-running/);
  assert.match(tunnelList, /tunnel-action-sweep/);
  assert.match(tunnelList, /prefers-reduced-motion:\s*reduce/);
});

test("runtime dialog footer uses a non-overlapping flex layout", () => {
  const runtimeViewer = read("src/frontend/components/monitoring/RuntimeViewer.vue");
  const globalCss = read("src/frontend/styles/global.css");

  assert.match(runtimeViewer, /runtime-dialog-footer/);
  assert.match(runtimeViewer, /runtime-close-button/);
  assert.match(runtimeViewer, /white-space:\s*nowrap/);
  assert.match(globalCss, /\.runtime-dialog \.el-dialog__footer\s*\{[^}]*display:\s*flex/s);
  assert.match(globalCss, /\.glass-dialog\.runtime-dialog \.el-dialog__footer/);
});

test("initial dashboard hydration does not trigger the global content overlay", () => {
  const app = read("src/frontend/App.vue");

  assert.doesNotMatch(app, /useGlobalLoading/);
  assert.doesNotMatch(app, /withGlobalLoading/);
});

test("authenticated hydration does not force dashboard navigation", () => {
  const app = read("src/frontend/App.vue");

  assert.doesNotMatch(app, /router\.push\(["']\/dashboard["']\)/);
});

test("app root renders above the fixed body visual overlay", () => {
  const globalCss = read("src/frontend/styles/global.css");

  assert.match(globalCss, /#app\s*\{[^}]*position:\s*relative[^}]*z-index:\s*1/s);
});

test("runtime viewer dark scrollbar styles do not collapse onto the theme root", () => {
  const runtimeViewer = read("src/frontend/components/monitoring/RuntimeViewer.vue");

  assert.doesNotMatch(runtimeViewer, /:global\(\[data-theme="dark"\]\)\s+\.runtime-textarea-wrapper::/);
});

test("frontend entry does not rely on top-level await", () => {
  const main = read("src/frontend/main.js");

  assert.match(main, /async function bootstrap\(\)/);
  assert.doesNotMatch(main, /(^|\n)await\s+import\(/);
  assert.match(main, /function renderFatalError/);
});

test("vite entry html does not ship debug scaffolding", () => {
  const entry = read("index.html");

  assert.doesNotMatch(entry, /debug-panel/);
  assert.doesNotMatch(entry, /window\.__dbg/);
});

test("vite entry uses CSP-safe boot status script", () => {
  const entry = read("index.html");
  const bootScript = read("public/boot-status.js");

  assert.doesNotMatch(entry, /<script>\s*window\.setTimeout/);
  assert.match(entry, /<script\s+src="\/boot-status\.js"\s+defer><\/script>/);
  assert.match(bootScript, /document\.getElementById\("boot-status"\)/);
});

test("login feature list does not use emoji icons", () => {
  const login = read("src/frontend/views/LoginView.vue");

  assert.doesNotMatch(login, /🔒|🚀|📊/);
  assert.match(login, /feature-mark/);
});

test("router supports direct tunnels paths and legacy hash URLs", () => {
  const router = read("src/frontend/router/index.js");

  assert.match(router, /createWebHistory/);
  assert.doesNotMatch(router, /createWebHashHistory/);
  assert.match(router, /normalizeLegacyHashRoute\(\)/);
});

test("global design system exposes shared motion and surface primitives", () => {
  const globalCss = read("src/frontend/styles/global.css");

  assert.match(globalCss, /--motion-fast:\s*150ms/);
  assert.match(globalCss, /--motion-normal:\s*220ms/);
  assert.match(globalCss, /--surface-radius:\s*16px/);
  assert.match(globalCss, /\.page-shell\s*\{/);
  assert.match(globalCss, /\.surface-card\s*\{/);
  assert.match(globalCss, /\.interactive-surface\s*\{/);
  assert.match(globalCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("authenticated shell uses normalized app structure and route transitions", () => {
  const layout = read("src/frontend/components/layout/AppLayout.vue");

  assert.match(layout, /class="app-layout liquid-shell"/);
  assert.match(layout, /class="main-area scroll-thin"/);
  assert.match(layout, /class="content-area"/);
  assert.match(layout, /name="view-slide-fade"/);
  assert.match(layout, /appear/);
  assert.match(layout, /--motion-normal/);
});

test("sidebar uses text-safe controls and active motion indicator", () => {
  const sidebar = read("src/frontend/components/layout/AppSidebar.vue");

  assert.doesNotMatch(sidebar, /☀️|🌙|🔧|🚀|⚙️/);
  assert.match(sidebar, /class="nav-indicator"/);
  assert.match(sidebar, /class="theme-toggle"/);
  assert.match(sidebar, /class="logout-button"/);
});

test("main pages use shared page and surface classes", () => {
  const pageFiles = [
    "src/frontend/views/DashboardView.vue",
    "src/frontend/views/TunnelListView.vue",
    "src/frontend/views/SettingsView.vue",
    "src/frontend/views/TunnelEditorView.vue",
    "src/frontend/views/TunnelCreateView.vue",
    "src/frontend/views/AboutView.vue"
  ];

  for (const file of pageFiles) {
    const source = read(file);
    assert.match(source, /page-shell/, `${file} should use shared page-shell spacing`);
    assert.match(source, /surface-card/, `${file} should use shared surface-card styling`);
  }
});
