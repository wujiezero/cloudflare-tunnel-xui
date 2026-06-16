<template>
  <div class="about-page page-shell">
    <div class="surface-card about-hero">
      <div class="about-brand">CF</div>
      <div class="about-brand-copy">
        <h3 class="about-title">Cloudflare Tunnel XUI</h3>
        <p class="about-version">基于 Node.js + Express 的 Cloudflare Tunnel 管理面板</p>
        <div class="about-links">
          <a href="https://github.com/wujiezero/cloudflare-tunnel-xui" target="_blank" rel="noopener" class="about-link">
            <el-icon><Link /></el-icon>GitHub 源码
          </a>
          <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/" target="_blank" rel="noopener" class="about-link">
            <el-icon><Document /></el-icon>官方文档
          </a>
        </div>
      </div>
    </div>

    <div class="surface-card about-section">
      <h4 class="section-title"><el-icon><Guide /></el-icon>使用流程</h4>
      <ol class="steps">
        <li v-for="(step, i) in steps" :key="i" class="step">
          <span class="step-index">{{ i + 1 }}</span>
          <div class="step-body">
            <strong>{{ step.title }}</strong>
            <span>{{ step.desc }}</span>
          </div>
        </li>
      </ol>
    </div>

    <div class="surface-card about-section">
      <h4 class="section-title"><el-icon><InfoFilled /></el-icon>说明</h4>
      <ul class="notes">
        <li><el-icon><Lock /></el-icon>API Token 以 AES-256-GCM 加密存储于 config.json，不保存明文。</li>
        <li><el-icon><Key /></el-icon>每个 Tunnel 的 Run Token 在点击「启动」时实时拉取，不落盘。</li>
        <li><el-icon><Cpu /></el-icon>cloudflared 缺失或架构不符时，服务启动会自动下载对应版本。</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { Link, Document, Guide, InfoFilled, Lock, Key, Cpu } from "@element-plus/icons-vue";

const steps = [
  { title: "配置凭据", desc: "在「Cloudflare 配置」中填写 Account ID 与 API Token。" },
  { title: "校验权限", desc: "测试 Token，确保具备 Tunnel 管理与 DNS 发布权限。" },
  { title: "创建 Tunnel", desc: "在「Tunnels」页面新建一个命名 Tunnel。" },
  { title: "配置路由", desc: "进入编辑页，添加域名到本地服务的 ingress 映射。" },
  { title: "启动运行", desc: "点击「启动」拉起 cloudflared 进程，并同步 DNS。" }
];
</script>

<style scoped>
.about-page { max-width: 720px; }

.about-hero { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-6); }
.about-brand {
  flex-shrink: 0;
  width: 56px; height: 56px; border-radius: var(--radius-md);
  display: grid; place-items: center; color: #fff; font-size: 18px; font-weight: 800;
  background: linear-gradient(145deg, var(--brand-orange), var(--brand-orange-2));
  box-shadow: 0 10px 22px rgba(243, 128, 32, 0.34), inset 0 1px 0 rgba(255,255,255,0.3);
}
.about-title { margin: 0; font-size: var(--fs-lg); font-weight: 700; }
.about-version { margin: 4px 0 var(--space-3); color: var(--text-secondary); font-size: var(--fs-sm); }
.about-links { display: flex; gap: var(--space-4); flex-wrap: wrap; }
.about-link { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-sm); font-weight: 600; }
.about-link:hover { text-decoration: none; color: var(--primary-strong); }

.about-section { padding: var(--space-6); }
.about-section .section-title { margin-bottom: var(--space-4); }

.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
.step { display: flex; gap: var(--space-3); align-items: flex-start; }
.step-index {
  flex-shrink: 0;
  width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--primary); color: #fff; font-size: var(--fs-xs); font-weight: 700;
  box-shadow: var(--shadow-primary);
}
.step-body { display: grid; gap: 1px; }
.step-body strong { font-size: var(--fs-base); }
.step-body span { font-size: var(--fs-sm); color: var(--text-secondary); }

.notes { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
.notes li { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--fs-sm); color: var(--text-secondary); line-height: var(--lh-base); }
.notes .el-icon { color: var(--primary); font-size: 16px; margin-top: 2px; flex-shrink: 0; }
</style>
