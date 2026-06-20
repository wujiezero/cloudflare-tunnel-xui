import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", redirect: "/dashboard" },
  {
    path: "/dashboard",
    name: "dashboard",
    meta: { title: "首页", subtitle: "Tunnel 与连接器运行总览" },
    component: () => import("../views/DashboardView.vue")
  },
  {
    path: "/tunnels",
    name: "tunnels",
    meta: { title: "Tunnel 清单", subtitle: "创建、配置并运行 Cloudflare Tunnel" },
    component: () => import("../views/TunnelListView.vue")
  },
  {
    path: "/tunnels/create",
    name: "tunnels-create",
    meta: { title: "新建 Tunnel", subtitle: "为账户创建一个新的命名 Tunnel" },
    component: () => import("../views/TunnelCreateView.vue")
  },
  {
    // Editing now happens in an in-context drawer on the tunnel list.
    // Keep the legacy path working by redirecting to the list with ?edit=<id>.
    path: "/tunnels/:id/edit",
    redirect: (to) => ({ path: "/tunnels", query: { edit: to.params.id } })
  },
  {
    path: "/settings",
    name: "settings",
    meta: { title: "Cloudflare 配置", subtitle: "API 凭据、权限校验与账户安全" },
    component: () => import("../views/SettingsView.vue")
  },
  {
    path: "/about",
    name: "about",
    meta: { title: "运行说明", subtitle: "使用流程与常见问题" },
    component: () => import("../views/AboutView.vue")
  }
];

function normalizeLegacyHashRoute() {
  if (!window.location.hash.startsWith("#/")) {
    return;
  }

  const legacyPath = window.location.hash.slice(1);
  window.history.replaceState(null, "", `${legacyPath}${window.location.search}`);
}

normalizeLegacyHashRoute();

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
