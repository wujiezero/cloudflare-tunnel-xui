<template>
  <div class="about-page page-shell">
    <div class="page-kicker">控制台</div>
    <h1 class="page-title">运行说明</h1>
    <p class="page-subtitle">使用流程与常见问题</p>

    <div class="surface-card about-hero">
      <BrandMark :size="46" :radius="12" />
      <div class="about-brand-copy">
        <h3 class="about-title">Cloudflare Tunnel XUI</h3>
        <p class="about-version">基于 Node.js + Express 的 Cloudflare Tunnel 管理面板</p>
      </div>
      <div class="about-links">
        <a href="https://github.com/wujiezero/cloudflare-tunnel-xui" target="_blank" rel="noopener" class="about-link">
          <el-icon><Link /></el-icon>GitHub 源码
        </a>
        <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/" target="_blank" rel="noopener" class="about-link">
          <el-icon><Document /></el-icon>官方文档
        </a>
      </div>
    </div>

    <div class="surface-card about-section">
      <h4 class="section-title"><el-icon><Guide /></el-icon>使用流程</h4>
      <ol class="steps">
        <li v-for="step in steps" :key="step.title" class="step">
          <span class="step-index" :class="{ done: step.done }">
            <el-icon v-if="step.done"><Check /></el-icon>
            <template v-else>{{ step.n }}</template>
          </span>
          <div class="step-body">
            <div class="step-head">
              <strong>{{ step.title }}</strong>
              <button v-if="!step.done" type="button" class="step-jump" @click="step.jump">{{ step.jumpLabel }}</button>
            </div>
            <span>{{ step.desc }}</span>
          </div>
        </li>
      </ol>
    </div>

    <div class="surface-card about-section">
      <h4 class="section-title"><el-icon><InfoFilled /></el-icon>常见问题</h4>
      <div class="faq-list">
        <div v-for="f in faqs" :key="f.id" class="faq-item">
          <button type="button" class="faq-question" @click="toggleFaq(f.id)">
            {{ f.q }}
            <el-icon class="faq-chevron" :class="{ open: openFaqs[f.id] }"><ArrowDown /></el-icon>
          </button>
          <transition name="collapse-fade">
            <p v-if="openFaqs[f.id]" class="faq-answer">{{ f.a }}</p>
          </transition>
        </div>
      </div>
    </div>

    <div class="surface-card about-section">
      <h4 class="section-title"><el-icon><Cpu /></el-icon>说明</h4>
      <ul class="notes">
        <li><el-icon><Lock /></el-icon>API Token 以 AES-256-GCM 加密存储于 config.json，不保存明文。</li>
        <li><el-icon><Key /></el-icon>每个 Tunnel 的 Run Token 在点击「启动」时实时拉取，不落盘。</li>
        <li><el-icon><Cpu /></el-icon>cloudflared 缺失或架构不符时，服务启动会自动下载对应版本。</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive } from "vue";
import { useRouter } from "vue-router";
import { Link, Document, Guide, InfoFilled, Lock, Key, Cpu, Check, ArrowDown } from "@element-plus/icons-vue";
import { useSettings } from "../composables/useSettings.js";
import { useTunnels } from "../composables/useTunnels.js";
import { useCloudflared } from "../composables/useCloudflared.js";
import BrandMark from "../components/common/BrandMark.vue";

const router = useRouter();
const { state: sState, loadSettings } = useSettings();
const { state: tunnelsState, loadTunnels } = useTunnels();
const { state: cfState, refreshRuntimeStatus } = useCloudflared();

const hasCreds = computed(() => !!(sState.settingsForm.accountId && sState.settingsForm.apiToken));
const tokenTested = computed(() => !!sState.configTestData);
const hasTunnels = computed(() => tunnelsState.tunnels.length > 0);
const hasRoutesAny = computed(() => tunnelsState.tunnels.some((t) => (t.configuration?.mappings || []).length > 0));
const hasRunning = computed(() =>
  cfState.cloudflared.runningCount > 0 || tunnelsState.tunnels.some((t) => t.status === "healthy")
);

const steps = computed(() => [
  { n: 1, title: "配置凭据", desc: "在「Cloudflare 配置」中填写 Account ID 与 API Token。", done: hasCreds.value, jumpLabel: "去配置", jump: () => router.push("/settings") },
  { n: 2, title: "校验权限", desc: "测试 Token，确保具备 Tunnel 管理与 DNS 发布权限。", done: tokenTested.value, jumpLabel: "去校验", jump: () => router.push("/settings") },
  { n: 3, title: "创建 Tunnel", desc: "在「Tunnels」页面新建一个命名 Tunnel。", done: hasTunnels.value, jumpLabel: "去创建", jump: () => router.push({ path: "/tunnels", query: { create: "1" } }) },
  { n: 4, title: "配置路由", desc: "进入编辑页，添加域名到本地服务的 ingress 映射。", done: hasRoutesAny.value, jumpLabel: "去配置", jump: () => router.push("/tunnels") },
  { n: 5, title: "启动运行", desc: "点击「启动」拉起 cloudflared 进程，并同步 DNS。", done: hasRunning.value, jumpLabel: "去启动", jump: () => router.push("/tunnels") }
]);

const openFaqs = reactive({});
function toggleFaq(id) {
  openFaqs[id] = !openFaqs[id];
}
const faqs = [
  { id: "f1", q: "Tunnel 显示离线怎么办？", a: "点击列表中的「启动」重新拉起 cloudflared 进程；若仍失败，请检查 API Token 权限与本机网络连通性。" },
  { id: "f2", q: "如何删除某条路由？", a: "进入 Tunnel 编辑页，点击对应路由右侧的删除图标即可；删除后可在提示中点击「撤销」恢复。" },
  { id: "f3", q: "Token 权限不足如何处理？", a: "在「Cloudflare 配置」页重新生成具备 Tunnel 编辑与 DNS 编辑权限的 API Token，并点击「测试 Token 权限」验证。" },
  { id: "f4", q: "支持同时管理多少个 Tunnel？", a: "数量没有硬性限制，实际以本机 cloudflared 进程与网络资源为限。" }
];

onMounted(() => {
  loadSettings();
  loadTunnels();
  refreshRuntimeStatus();
});
</script>

<style scoped>
.about-page { max-width: 720px; }

.about-hero { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 22px 24px; margin-bottom: 20px; }
.about-brand-copy { flex: 1; min-width: 200px; }
.about-title { margin: 0 0 3px; font-size: 16px; font-weight: 700; }
.about-version { margin: 0; color: var(--text-2); font-size: 13px; }
.about-links { display: flex; gap: 18px; flex-wrap: wrap; }
.about-link { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: var(--text-2); }
.about-link:hover { text-decoration: none; color: var(--accent); }

.about-section { padding: 22px 24px; margin-bottom: 20px; }
.about-section .section-title { margin-bottom: 18px; }

.steps { list-style: none; margin: 0; padding: 0; display: grid; }
.step { display: flex; gap: 14px; padding-bottom: 18px; }
.step:last-child { padding-bottom: 0; }
.step-index {
  flex-shrink: 0;
  width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--card-2); border: 1px solid var(--border-strong); color: var(--text-2);
  font-size: 12px; font-weight: 600;
}
.step-index.done { background: var(--success); border-color: transparent; color: #fff; }
.step-body { flex: 1; padding-top: 2px; }
.step-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.step-head strong { font-size: 13.5px; font-weight: 600; }
.step-jump {
  padding: 2px 9px; border-radius: var(--radius-pill); border: 1px solid var(--accent);
  background: transparent; color: var(--accent); font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit;
}
.step-body span { display: block; font-size: 12.5px; color: var(--text-2); margin-top: 3px; }

.faq-list { display: grid; }
.faq-item { border-top: 1px solid var(--border); }
.faq-item:first-child { border-top: none; }
.faq-question {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 15px 0; border: none; background: transparent; color: var(--text);
  font-size: 13.5px; font-weight: 500; text-align: left; cursor: pointer; font-family: inherit;
}
.faq-chevron { flex-shrink: 0; color: var(--text-2); transition: transform var(--motion-fast) var(--motion-ease); }
.faq-chevron.open { transform: rotate(180deg); }
.faq-answer { margin: 0; padding: 0 0 16px; font-size: 13px; color: var(--text-2); line-height: var(--lh-base); }

.notes { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
.notes li { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--fs-sm); color: var(--text-2); line-height: var(--lh-base); }
.notes .el-icon { color: var(--accent); font-size: 16px; margin-top: 2px; flex-shrink: 0; }

.collapse-fade-enter-active, .collapse-fade-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.collapse-fade-enter-from, .collapse-fade-leave-to { opacity: 0; transform: translateY(-4px); }
@media (prefers-reduced-motion: reduce) {
  .collapse-fade-enter-active, .collapse-fade-leave-active, .faq-chevron { transition: none; }
  .collapse-fade-enter-from, .collapse-fade-leave-to { transform: none; }
}
</style>
