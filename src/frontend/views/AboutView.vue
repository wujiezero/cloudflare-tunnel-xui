<template>
  <div class="about-page page-shell">
    <div class="glass-card surface-card">
      <h3>Cloudflare Tunnel XUI</h3>
      <p class="version">基于 Node.js + Express 的 Cloudflare Tunnel 管理面板</p>
      <el-divider />
      <h4>使用流程</h4>
      <ol>
        <li>在 "Cloudflare 配置" 中填写 Account ID 和 API Token</li>
        <li>测试 Token 权限，确保具备 Tunnel 管理和 DNS 发布权限</li>
        <li>在 "Tunnels" 页面创建新的 Tunnel</li>
        <li>点击 "编辑" 配置路由映射 (ingress rules)</li>
        <li>点击 "启动" 运行 Tunnel 进程</li>
      </ol>
      <el-divider />
      <p style="font-size:12px;color:var(--text-secondary,#999)">
        项目源码: <a href="https://github.com/wujiezero/cloudflare-tunnel-xui" target="_blank">GitHub</a>
      </p>
    </div>
  </div>
</template>

<style scoped>
.about-page { max-width: 600px; }
.glass-card { padding: 24px; }
h3 { margin: 0 0 4px; }
.version { margin: 0 0 8px; color: var(--text-secondary, #999); font-size: 13px; }
h4 { margin: 0 0 8px; }
ol li { padding: 4px 0; font-size: 14px; }
</style>
