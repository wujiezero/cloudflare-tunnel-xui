将 `cloudflared` 可执行文件放到本目录，文件名固定为 `cloudflared`。

建议：

1. Linux / Docker 环境放 Linux 版本二进制。
2. macOS 本地运行放 macOS 版本二进制。
3. 放入后执行 `chmod +x ./bin/cloudflared`。

应用启动时会自动检测版本；若 `config.json` 中已配置 `cloudflared.runToken`，服务启动后也会尝试自动拉起该进程。
