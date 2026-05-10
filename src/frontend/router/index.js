import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", redirect: "/dashboard" },
  {
    path: "/dashboard",
    name: "dashboard",
    meta: { title: "首页" },
    component: () => import("../views/DashboardView.vue")
  },
  {
    path: "/tunnels",
    name: "tunnels",
    meta: { title: "Tunnel 清单" },
    component: () => import("../views/TunnelListView.vue")
  },
  {
    path: "/tunnels/create",
    name: "tunnels-create",
    meta: { title: "新建 Tunnel" },
    component: () => import("../views/TunnelCreateView.vue")
  },
  {
    path: "/tunnels/:id/edit",
    name: "tunnel-editor",
    meta: { title: "编辑 Tunnel" },
    component: () => import("../views/TunnelEditorView.vue"),
    props: true
  },
  {
    path: "/settings",
    name: "settings",
    meta: { title: "Cloudflare 配置" },
    component: () => import("../views/SettingsView.vue")
  },
  {
    path: "/about",
    name: "about",
    meta: { title: "运行说明" },
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
