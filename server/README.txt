飞牛 fnOS 部署说明

1. 将本文件夹完整复制到 NAS，例如：/docker/generic-ledger-sync
2. 确认同一目录内有 Dockerfile、docker-compose.yml、package.json、server.js
3. 在飞牛 Docker -> 项目/Compose 中，从该目录创建项目
4. 构建并启动项目
5. 服务测试地址：http://192.0.2.10:5688/api/health
6. 记账 App 的同步地址：http://192.0.2.10:5688

如果 Docker 项目要求填写 Compose 内容，请直接使用同目录下的 docker-compose.yml。
