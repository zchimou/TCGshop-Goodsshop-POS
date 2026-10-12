# NAS 部署与升级

服务要求 Node.js 22 或 Docker。默认容器端口 3000，Compose 映射主机端口 5689。

## 首次部署

1. 将 tcgshop-server 内容放入服务器独立目录。
2. 将 .env.example 复制为 .env，设置至少 32 位随机 SYNC_TOKEN。
3. 执行 docker compose up -d --build。
4. 为服务配置 HTTPS 入口。公开 Android 源码默认禁用明文网络请求，管理员在 App 设置中填写实际 HTTPS 服务地址和相同同步密钥，连接并核对账本。
5. 其他设备从已有 NAS 载入账本和账号，再使用所属账号登录。

## 保存及同步

data/shop.json 保存账本；data/images 保存内容编号对应的封面，data/updates 保存发布版本和 APK。更新时保留整个 data 目录及 .env。导出账本备份包含完整图片，可独立恢复。

服务提供旧全量接口及增量接口，采用版本校验处理并发上传。新增销售、退款、盘库和库存流水按记录编号合并；共同基准存在时保留不同字段的独立修改，同一字段双端修改时采用 NAS 值。实时等待请求最长 15 秒，反向代理读超时建议至少 25 秒，并透传 Authorization、If-Match、If-None-Match 及 ETag。

## 发布 APK

在项目 release 目录准备 latest.json 及清单 SHA-256 命名的 APK。运行安装更新.sh 构建服务、检查健康状态并发布；容器名应与 Compose 中的 tcgshop-pos-sync 一致。publish-release.sh 校验大小和哈希，并拒绝较小 versionCode 或相同编号的不同 APK，不按显示版本排序。

Windows 上传工具在 release-tools。先将示例 NAS 地址、账号、目录和外网更新 URL 修改为实际值，再双击一键更新NAS并发布.cmd。ZIP 根目录应含服务源码、Dockerfile、安装更新.sh、publish-release.sh 和 release 文件夹；不要打包 .env、Compose 现有配置或 data。

只生成文件不代表服务已部署；上传后核对 /api/update 的 versionCode、versionName 与 SHA-256。HTTPS 及设备网络权限由部署环境配置。同步密钥具有整个服务账本的读写权限，应妥善保管。
