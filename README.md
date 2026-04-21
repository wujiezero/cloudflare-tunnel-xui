# Cloudflare Tunnel XUI

一个基于 Node.js + Express 的 Cloudflare Tunnel 管理页面，提供账户登录、Cloudflare API 凭据加密保存、Tunnel 增删改查、Token 权限校验，以及 `cloudflared` 本地运行状态管理。

## 功能清单

1. 使用项目根目录 `config.json` 中的账户信息进行登录校验。
2. 使用 `config.json` 中的 `crypto.secretKey` 对 Cloudflare API Token 进行 AES-256-GCM 加密存储。
3. 提供 Tunnel 列表、详情、新建、重命名、删除。
4. 支持配置 Cloudflare Account ID、API Token、`cloudflared` Run Token，并测试 Token 是否有效。
5. 权限测试会检查：
   - Token 是否处于 active 状态
   - 是否可以读取 Tunnel 列表
   - 是否可读取 Token 详细策略
   - 若可读取策略，则显示已授予权限、缺失权限
6. 项目支持将 `cloudflared` 二进制放在 `./bin/cloudflared`，服务启动时自动探测版本，并在配置了 Run Token 后自动拉起。
7. 支持 Docker 启动，提供完整 `Dockerfile` 与 `docker-compose.yml`。
8. 使用纯 `express-session` 管理登录态，配合同源校验、CSRF Token、基础安全响应头和轻量登录限流。
9. 前端采用 Apple Liquid Glass 风格：半透明卡片、模糊玻璃、柔和光晕、圆角与高光边框。

## 目录结构

```text
.
├── bin/
│   └── README.md
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   ├── cloudflare-service.js
│   ├── cloudflared-manager.js
│   ├── config-store.js
│   ├── crypto-utils.js
│   └── server.js
├── config.json
├── Dockerfile
├── docker-compose.yml
├── package.json
└── CHANGELOG.md
```

## 配置说明

### `config.json`

项目首次启动会自动补齐随机 `sessionSecret` 与 `secretKey`（如果你还保留了占位值）。
如果 `config.json` 不存在，服务会自动基于 [config.example.json](./config.example.json) 初始化一份默认配置。

仓库中提供的是 [config.example.json](./config.example.json)。实际运行时请复制为 `config.json` 并填写你自己的配置与密钥。

默认示例：

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 8866
  },
  "auth": {
    "username": "admin",
    "passwordSalt": "b1fbb4a8b2d34ce7a3a67a92c1d4ef7d",
    "passwordHash": "64c4a57ff3cfd21e09bf898f1a88d3a914bf213de00b4d37b9e49d0b2b57d209",
    "sessionSecret": "replace-this-session-secret-with-a-random-long-string"
  },
  "crypto": {
    "secretKey": "replace-this-encryption-key-with-a-random-long-string"
  },
  "cloudflare": {
    "encryptedAccountId": "",
    "encryptedApiToken": ""
  },
  "cloudflared": {
    "binaryPath": "./bin/cloudflared",
    "metricsHost": "127.0.0.1",
    "logLevel": "info",
    "extraArgs": []
  }
}
```

默认登录信息：

- 用户名：`admin`
- 初始密码：`ChangeMe123!`

说明：

- `passwordHash` 是 PBKDF2-SHA256 派生结果。
- `cloudflare.encryptedAccountId` 与 `cloudflare.encryptedApiToken` 都是加密后的 JSON 字符串，不保存明文。
- 页面中填写的 `Account ID` 实际上是 Tunnel API 所需的 Cloudflare Account ID。
- 每个 Tunnel 的 Run Token 都会在点击“连接”时实时拉取，不保存在 `config.json`。
- 每个 Tunnel 进程的 metrics 端口都会在启动时动态分配，不需要固定写入 `config.json`。

## Cloudflare Token 建议权限

建议给 API Token 至少授予以下账户级权限中的一组读写能力：

- `读取, Cloudflare Tunnel:编辑, Cloudflare Tunnel:读取, 访问：服务令牌:读取, 访问：组织、标识提供程序和组:编辑, 帐户设置:读取, 访问：应用和策略:编辑`
- `所有区域 - 区域:读取, DNS:读取, DNS:编辑`

如果还希望页面读取 Token 自身的详细策略并提示“缺少什么权限”，还建议额外提供可读取 token 明细的权限，否则系统只能验证“能不能访问 Tunnel API”，无法完全枚举策略详情。

## 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 准备 `cloudflared`

把对应平台的 `cloudflared` 可执行文件放入：

```bash
./bin/cloudflared
```

并授予执行权限：

```bash
chmod +x ./bin/cloudflared
```

如果 `./bin/cloudflared` 不存在、不可执行，或者当前文件与系统架构不匹配，服务启动时也会自动执行以下动作：

- 检测当前系统和 CPU 架构
- 从官方 `cloudflared` 发布地址下载对应版本
- 如果是压缩包则自动解压
- 删除下载下来的压缩包
- 修复可执行权限后继续启动服务

### 3. 启动服务

```bash
npm start
```

默认访问地址：

- [http://localhost:8866](http://localhost:8866)

也可以临时覆盖监听地址：

```bash
HOST=0.0.0.0 PORT=8866 npm start
```

停止说明：

- 如果你是通过 `npm start` 或 `HOST=0.0.0.0 PORT=8866 npm start` 这类方式启动前端服务，终端里按 `Ctrl+C` 会触发优雅退出。
- 退出时，页面托管启动的 `cloudflared` 进程会被自动停止。
- 同时，对应的 `.cloudflared/<tunnelId>/` 运行目录也会一并清理。
- 自动发现的外部 `cloudflared` 进程不在这个自动清理范围内。

### macOS 持久运行 cloudflared

如果当前终端/沙箱环境对长驻子进程有限制，建议改用 `launchd` 启动连接器：

```bash
./scripts/install-launchagent.sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.cloudflared.xui.plist
```

停止：

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.cloudflared.xui.plist
```

说明：

- 启动前请先通过页面的 Tunnel 列表生成最新的 `.cloudflared.token` 与 `.cloudflared-config.yml`
- 日志会写入项目根目录的 `.cloudflared.log`
- 这种方式比由 Web 服务托管子进程更适合 macOS 常驻运行

## Docker 启动

### 方式一：直接构建镜像

```bash
docker build -t cloudflare-tunnel-xui .
docker run --name cloudflare-tunnel-xui -p 8866:8866 \
  --dns 1.1.1.1 \
  --dns 1.0.0.1 \
  -v "$(pwd)/config.json:/app/config.json" \
  -v "$(pwd)/bin:/app/bin" \
  cloudflare-tunnel-xui
```

### 方式二：使用编排文件

当前项目已经提供 `docker-compose.yml`，并使用当前项目路径作为构建上下文：

```bash
docker compose up -d --build
```

特点：

- `build.context` 指向当前目录 `.`
- 容器内默认设置 `PORT=8866`
- 默认显式指定容器 DNS 为 `1.1.1.1` / `1.0.0.1`，绕过部分宿主机环境下 Docker 内置 `127.0.0.11` 解析异常
- 自动映射 `./config.json` 到容器内 `/app/config.json`
- 自动映射 `./bin` 到容器内 `/app/bin`

首次使用建议先准备好配置文件：

```bash
cp config.example.json config.json
```

补充说明：

- 如果宿主机上的 `./config.json` 不存在，Docker 可能会先创建一个同名目录并挂载进去。
- 当前版本会自动在这个目录里初始化 `config.json`，容器可以正常启动。
- 如果你希望宿主机保持“单个配置文件”的结构，删掉误创建的 `config.json/` 目录后，重新执行一次 `cp config.example.json config.json` 再启动即可。

如果当前网络环境不能直接访问 `1.1.1.1`，可以在启动前覆盖：

```bash
DOCKER_DNS_1=8.8.8.8 DOCKER_DNS_2=8.8.4.4 docker compose up -d --build
```

如果日志里出现下面这类错误：

- `lookup cfd-features.argotunnel.com on 127.0.0.11:53: server misbehaving`
- `edge discovery: error looking up Cloudflare edge IPs`

通常说明问题出在容器 DNS，而不是 Tunnel Run Token、ingress 映射或 Cloudflare API 配置。

## 页面使用流程

1. 使用 `config.json` 里的账号密码登录。
2. 在“Cloudflare API 凭据”中填写 `Account ID` 和 `API Token`。
3. 点击“测试 Token 权限”，确认 Token 有效且具备所需权限。
4. 保存加密配置，系统会把 Token 加密后写回 `config.json`。
5. 在“Tunnels”区域创建、查看、重命名或删除 Tunnel。
6. 若要在当前主机或容器内实际运行某个 Tunnel，直接在列表中点击“连接”，系统会实时拉取 Run Token 并启动 `cloudflared`。

## 已实现接口

### 登录与会话

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 配置与测试

- `GET /api/settings`
- `POST /api/settings/cloudflare`
- `POST /api/settings/cloudflare/test`

### Tunnel 管理

- `GET /api/tunnels`
- `POST /api/tunnels`
- `GET /api/tunnels/:id`
- `PUT /api/tunnels/:id`
- `DELETE /api/tunnels/:id`

### cloudflared 运行控制

- `GET /api/cloudflared/status`
- `GET /api/tunnels/:id/logs`
- `POST /api/tunnels/:id/start`
- `POST /api/tunnels/:id/stop`
- `POST /api/tunnels/:id/logs/clear`
- `GET /api/tunnels/:id/metrics`

## 安全建议

1. 立即修改默认管理员密码。
2. 生产环境请把 `config.json` 权限限制为仅服务账号可读写。
3. 建议将 `sessionSecret` 和 `crypto.secretKey` 替换为你自己的高强度随机字符串。
4. 如果部署到公网，请在反向代理层增加 HTTPS、IP 白名单或额外认证，并设置 `TRUST_PROXY` 以便安全识别代理后的请求协议。
5. Docker 容器内运行时，请确保挂载的 `./bin/cloudflared` 为 Linux 版本。

## 参考说明

实现过程中依据了 Cloudflare 官方 API 文档中的 Tunnel 与 Token 接口说明，包括：

- [List Cloudflare Tunnels](https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/methods/list/)
- [Cloudflare Tunnels API 概览](https://developers.cloudflare.com/cloudflare-one/api-terraform/access-api-examples/service-token/)
- [Verify Token](https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/get/)

## 后续可扩展项

1. 增加管理员密码修改页面。
2. 增加 Tunnel 配置文件编辑能力。
3. 增加审计日志与操作历史。
4. 将默认内存 Session Store 替换为更持久的轻量存储实现（如自定义文件存储），以支撑长时间运行或多实例部署。
