#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
test -f docker-compose.yml || { echo '请将更新包解压到原 tcgshop-pos-sync 项目目录后执行'; exit 1; }
test -f .env || { echo '没有找到原 .env，请确认目录，勿新建同步密钥'; exit 1; }
test -f data/shop.json || { echo '没有找到原 data/shop.json，请确认这是现有 POS 项目目录'; exit 1; }
test -f release/latest.json
docker compose up -d --build
docker compose ps
attempt=0
until docker exec tcgshop-pos-sync node -e 'fetch("http://127.0.0.1:3000/api/health",{headers:{Authorization:"Bearer "+process.env.SYNC_TOKEN}}).then(async r=>{const h=await r.json();if(!r.ok||h.features?.deltaSync!==1||h.features?.imageStore!==1||h.features?.liveNotifications!==1)process.exit(1)}).catch(()=>process.exit(1))'; do
 attempt=$((attempt+1))
 test "$attempt" -lt 20 || { echo '服务未就绪，未发布新 APK，请查看容器日志'; exit 1; }
 sleep 1
done
sh ./publish-release.sh
echo '服务和版本发布已完成，请确认外网接口返回本次发布版本。'
