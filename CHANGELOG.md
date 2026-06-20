# Changelog

## 1.0.2 - 2026-06-20

### Added

- Tunnel 列表工具栏新增「全选」复选框（含半选态），补全此前已有的批量操作能力，可一键选中当前筛选结果。
- Tunnel 列表的路由标签支持点击复制域名，编辑页头部新增可复制的 Tunnel ID 徽标，方便快速取用标识符。
- Tunnel 编辑页增加「未保存改动」感知：路由或名称有改动时显示提示，离开页面或刷新前会二次确认，放弃改动会还原到上次保存状态。
- 修改密码表单增加实时校验：两次密码不一致时即时提示，并在信息不完整时禁用提交按钮、支持回车提交。

### Changed

- 编辑页「高级选项」切换由 `span` 改为可聚焦的按钮，并补充 `aria-expanded`，提升键盘可达性。
- 名称未改动时禁用「保存」按钮，并支持回车提交，减少无效操作。
- 复制操作在非安全上下文（如局域网 http 访问）下提供 `execCommand` 回退路径。

## 1.0.1 - 2026-04-02

### Fixed

- 为 Docker 编排增加显式 DNS 配置，降低容器内 `cloudflared` 依赖 Docker 内置 `127.0.0.11` 解析器时出现 `server misbehaving` 的概率。
- 补充 Docker 文档，说明如何覆盖默认 DNS 以及如何识别这类问题属于容器 DNS 异常。

## 1.0.0 - 2026-03-31

### Added

- 新建 Node.js + Express 单体应用骨架。
- 新增 `config.json` 配置文件模型，承载登录信息、会话密钥、加密密钥、Cloudflare 凭据和 `cloudflared` 运行配置。
- 新增 PBKDF2 密码校验与 AES-256-GCM Account ID / Token 加密工具。
- 新增 Cloudflare Tunnel API 封装，支持 Tunnel 列表、详情、新建、更新和删除。
- 新增 Cloudflare API Token 验证逻辑，支持有效性检测、Tunnel API 可读性检测、权限明细读取与缺失权限提示。
- 新增 `cloudflared` 进程管理器，支持版本探测、启动、停止、日志缓存和 metrics 读取。
- 新增 Apple Liquid Glass 风格前端管理页面。
- 新增 Dockerfile、`docker-compose.yml` 和 `bin/README.md`。
- 新增详细的 `README.md` 使用文档。

### Notes

- 默认管理员账号为 `admin`，初始密码请参考 `config.example.json` 中的说明。
- 生产使用前应立即替换默认密码、会话密钥和加密密钥。
