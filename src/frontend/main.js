const dbg = window.__dbg || function () {};

function renderFatalError(error) {
  const appRoot = document.getElementById("app");
  if (!appRoot) return;

  const message = error?.message || String(error || "未知错误");
  const shell = document.createElement("div");
  shell.style.cssText = "min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1b2b44;background:#eaf2ff;";

  const panel = document.createElement("div");
  panel.style.cssText = "max-width:560px;width:100%;padding:24px;border:1px solid rgba(92,126,178,.28);border-radius:14px;background:rgba(255,255,255,.78);box-shadow:0 18px 42px rgba(50,80,130,.14);";

  const title = document.createElement("h1");
  title.style.cssText = "margin:0 0 12px;font-size:20px;";
  title.textContent = "前端加载失败";

  const detail = document.createElement("pre");
  detail.style.cssText = "white-space:pre-wrap;margin:0;font-size:13px;line-height:1.5;color:#d95558;";
  detail.textContent = message;

  panel.append(title, detail);
  shell.appendChild(panel);
  appRoot.replaceChildren(shell);
}

async function bootstrap() {
  dbg("1. main.js module executing");

  try {
    const vue = await import("vue");
    dbg("2. Vue loaded");

    const ElementPlus = (await import("element-plus")).default;
    const ElementPlusIconsVue = await import("@element-plus/icons-vue");
    dbg("3. ElementPlus loaded");

    await import("element-plus/dist/index.css");
    await import("./styles/global.css");
    dbg("4. CSS loaded");

    const App = (await import("./App.vue")).default;
    dbg("5. App.vue loaded");

    const router = (await import("./router/index.js")).default;
    dbg("6. Router loaded");

    const app = vue.createApp(App);

    app.config.errorHandler = function (err, instance, info) {
      console.error("[Vue error]", err);
      renderFatalError(new Error(`${err.message || err} | ${info}`));
    };

    dbg("7. Installing plugins...");
    app.use(ElementPlus);
    app.use(router);

    for (const [name, component] of Object.entries(ElementPlusIconsVue)) {
      app.component(name, component);
    }
    dbg("8. Mounting to #app...");

    app.mount("#app");
    document.getElementById("boot-status")?.remove();
    dbg("9. Mount OK! App should be visible now.");
    console.log("[XUI] Vue app mounted successfully");
  } catch (error) {
    console.error("[XUI] Fatal:", error);
    renderFatalError(error);
  }
}

bootstrap();
