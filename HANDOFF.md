# TCGshop POS 工作交接

更新日期：2026-11-03。

## 当前目标与范围

- 当前任务：记录交接信息，并将已经完成的 POS 源码修改同步到 GitHub。沿用通用公开源码规则，不上传实际业务数据、商户资料、部署凭证、签名密钥、APK、店铺头图和社交二维码。
- 后续产品目标：玩家在手机上预订商品，通过微信支付或支付宝官方渠道付款，服务器确认付款后显示普通取货二维码，店员用现有 POS 的扫一扫核销。
- 用户最终选择官方支付渠道。此前讨论过的人工核款仅为备选方案，不是当前选定实现。
- 用户主体为个体工商户，尚不确定是否已有微信支付商户号、支付宝商家账号或支付产品权限。
- 预订、支付、取货码和核销目前都处于调研与方案阶段，尚未开发、部署或打包。不能将方案描述为已实现。

## 已完成内容

### 当前已发布版本

- Android 正式版：1.1.2，versionCode 38，包名 com.tcgshop.pos。
- 2026-10-28 已发布至 NAS 的自动更新入口。当时核验了新旧入口的版本清单、实际 APK 下载与 SHA256；这不代表后续任意日期的服务器状态已重新检查。
- 本地发布状态：tcgshop-server/out/publish-v1.1.2-status.json。
- APK：安装包/TCGshop-POS-v1.1.2.apk；SHA256：26e7e6005b5e1e502c247d89eb17179ab4b9173a5a1ebefbd1793494cc8bd080。
- 使用原应用签名，可覆盖既有版本。不得仅为调整显示版本而降低 versionCode。

### 1.1.1 已完成的功能

- 重复商品编码：表单持续显示醒目的红色警告，列出已有商品信息，标红编码输入框；阻止保存但保留编辑草稿。
- 扫码提速：并行启动相机和识别库，二维码优先识别，缩短失败重试间隔，常规帧缩小解码并定期以原分辨率补扫。
- 收银台名称排序：保留有库存优先，同组内按名称排序，新增和改名后自动重排；常用商品按名称排序。

### 1.1.2 已完成的功能

- App 更新入口改为 https://pos.example.com/api/update。
- 新公网同步服务根地址为 https://pos.example.com。上线时实测新站的 /tcgshop/api/update 返回 404，不能沿用旧路径。
- 保存的旧地址 https://pos.example.com/tcgshop 自动迁移到新根地址；同时保留同步密钥、偏好、localStorage 基线及 IndexedDB 基线，不改变账号和账本。
- 内网 NAS 和其他自定义地址不自动更改。
- 旧域名保留更新服务，以便已安装的旧 APK 获取新版本；不能直接关闭旧入口或仅返回重定向。
- 1.1.2 一键发布工具优先使用 PowerShell 7，缺少 pwsh.exe 时回退到 Windows PowerShell 5.1。
- APK 发布仅更新清单及安装包，不重建同步容器；发布工具核对新旧公网清单，并校验实际 APK 大小和 SHA256。

### 预订项目调研与决策

- ShopXO：https://github.com/gongfuxiang/shopxo；已查看自提取货码、核销数量及剩余数量相关订单代码，适合作为商品预订参考。
- CRMEB：https://github.com/crmeb/CRMEB；已查看订单核销接口和订单码生成逻辑。所查看代码生成微信小程序码，不能直接认为现有普通二维码扫描器可识别。
- pretix：https://github.com/pretix/pretix；核销 API 可参考，更偏向比赛报名与活动门票。
- 尚未选定或引入任何第三方商城源码。优先考虑保留现有 POS，在服务器增加独立预订与支付模块，避免维护两套库存和销售账本。
- 2026-11-03 查阅的微信官方权限表：个体工商户支持 JSAPI、小程序等支付，不支持微信外浏览器的 H5 支付。可考虑微信内网页加 JSAPI 或微信小程序；需要先确认商户号与 AppID 条件。
- 官方权限表：https://pay.wechatpay.cn/doc/v3/merchant/4015420731。
- 微信商户平台：https://pay.weixin.qq.com/；支付宝商家中心：https://b.alipay.com/。
- 收款码、商户号、线上支付接口权限是不同事项；不能凭已有店内收款码判断已具备在线预订支付能力。
- 官方支付费率随主体、行业、支付产品及签约协议变化，不承诺固定低费率。线下优惠费率不能直接套用于线上预订。

## 修改的文件

以下为本轮已完成版本的重点文件，不代表整个工作区所有改动；其他项目的未提交修改不得顺带覆盖或上传。

| 文件 | 已完成修改 |
| --- | --- |
| pos/product-editor.js | 重复商品编码警告、输入校验及草稿保留 |
| pos/theme.css | 重复编码警告样式、输入框错误状态、滚动定位 |
| pos/scanner.js | 相机与识别库并行、二维码优先、重试及分辨率优化 |
| pos/app.js | 重复扫码反馈、收银台和常用商品排序、版本显示 |
| pos/nas-sync.js | 新域名、旧配置迁移、两种存储中的同步基线保留 |
| pos/verify-product-duplicates.cjs | 重复编码、扫码反馈及不同屏幕宽度检查 |
| pos/verify-scanner.cjs | 扫码行为与重复提示回归 |
| pos/verify-scanner-performance.cjs | 并行启动、相机释放、低分辨率及原图补扫检查 |
| pos/verify-domain-settings.cjs | 域名迁移、基线保留、账号账本不变、内网地址保留检查 |
| pos/verify-packaged-accounts.cjs | 1.1.2 打包资源中的账号、收款、备份与退出检查 |
| tcgshop-android/app/src/main/AndroidManifest.xml | 1.1.2 / versionCode 38 |
| tcgshop-android/app/src/main/java/com/tcgshop/pos/AppUpdates.java | 新域名更新入口 |
| tcgshop-android/build-release.ps1 | 1.1.2 正式版构建输出 |
| tcgshop-android/build-test.ps1 | 预留 1.1.3-test1 / versionCode 39；未据此发布测试版 |
| tcgshop-android/publish-update.ps1 | 默认发布 APK 路径更新，签名与发布清单校验 |
| 安装包/1.1.2-一键发布/ | APK 发布脚本、便携 ZIP 校验、PowerShell 7 启动器和说明 |
| HANDOFF.md | 当前目标、完成情况、文件、待办和交接约束 |

公开仓库将发布工具放在 release-tools/ 下，使用示例配置。仓库 README、CHANGELOG、package.json 和交接文件应与 1.1.2 保持一致。

## 验证情况

1.1.2 发布前已通过：

- Android 编译、签名 v2/v3、包名与版本、ZIP 对齐、运行资源哈希校验及既有签名对比。
- pos/verify-domain-settings.cjs。
- pos/verify-packaged-accounts.cjs。
- pos/verify-nas-sync.cjs：新设备连接、共享账号、销售退款、离线与并发合并。
- pos/verify-nas-safety.cjs：请求期间本机修改保护、部分保存失败回滚、ETag 与账本结构检查。
- pos/verify-updates.cjs 和 tcgshop-server/verify-publisher.cjs：更新下载、发布完整性、降级与同编号替换拒绝。
- 一键发布 -CheckOnly；发布后 -VerifyOnly，核验新旧公网入口及实际下载。

浏览器和临时 NAS 回归测试不等于真实平板相机、蓝牙打印或真实支付验证。预订与支付尚没有对应实现或测试。

2026-11-03 本次 GitHub 同步前，已在脱敏后的 1.1.2 公开源码副本中重新通过 package.json 的完整默认测试序列：域名设置迁移、重复编码、扫码性能、退款净商品统计、离线合并、发布校验、手机历史布局及实时增量同步。另已通过所有公开 JavaScript 语法检查、7 个 PowerShell 脚本解析、版本一致性及私有引用检查。公开导出时保留旧、新域名两个不同示例来源，防止脱敏后迁移测试失去意义。

## 待办事项

1. 完成本次 GitHub 同步并核对远端 main 与生成的公开源码清单一致；保留正常提交历史，不强制覆盖他人提交。
2. 用户检查微信支付商家助手及商户平台：是否有商户、主体类型、JSAPI 权限；确认是否已有认证公众号或小程序。
3. 用户检查支付宝商家中心：账号、手机网站支付签约状态、可用的开放平台应用。
4. 根据真实主体与审核结果确定微信入口及支付宝支付产品；部署前再次核对当期官方准入要求。
5. 确定第一版预订规则：商品或活动、全款或预付款、预留数量、超时释放、整单或分批领取、退款规则。
6. 设计服务器订单、支付通知、主动查单、退款和核销接口；顾客入口独立鉴权，不得把现有整店 NAS 同步密钥交给玩家手机。
7. 支付通知需验证签名、金额、商户和订单归属，重复通知只处理一次；付款页面跳转不作为已付款凭据。
8. 确认付款只记录一次收款；核销只确认交付及出库。退款、库存预留及报表口径需统一，禁止重复记账或扣库存。
9. 取货码使用普通二维码和不可猜测的凭证；服务器原子核销，重复扫描、已退款、跨门店情况按规则拒绝或提示。第一版优先联网核销。
10. 用户授权实施后再开发；先做隔离支付测试，再申请生产配置和真实小额联调。当前不生成新的 APK、不再次发布 NAS。

## 注意事项

- POS 当前工程为 pos/、tcgshop-android/、tcgshop-server/。工作区内根目录旧账本、android-app/、server/、card-care/、homepage/ 等还有独立修改；不要据 git status 将它们一并纳入本次 POS 发布，也不要擅自清理。
- 本地生产版保留原存储键 TCGshop-POS-ledger-v1、原包名与原签名。公开源码使用 TCGshop-POS-ledger-v1，不可直接覆盖生产资源而忽略数据迁移。
- 通用公开版本不含店铺品牌、真实域名或部署账号；更新和同步地址使用示例，部署时填写自己的服务地址。生产和公开版本的差异是有意保留的。
- 公开 Android 默认仅允许 HTTPS；本地生产版的内网 HTTP 支持是已有行为，不能无提示更改。
- 不上传 .env、账本、账号数据库、付款截图、商户资料、签名密钥、API 私钥、APK 或本地工具缓存。
- GitHub 发布采用显式文件清单；tcgshop-server/out/export-github-source.cjs 及 read-github-blobs.cjs 为本地导出工具。不要使用 git add . 上传整个工作区。
- PowerShell 脚本保留 UTF-8 BOM 以兼容 Windows PowerShell 5.1；CMD 使用无 BOM 的 CRLF。文本替换需按完整字符串操作，避免 PowerShell 单元素数组展平导致按字符替换。
- SSH 与 sudo 密码由用户在可见终端输入，不在聊天或脚本中保存。NAS 发布成功与 App 安装成功是两个步骤，Android 安装仍需设备用户确认。
- 本文件用于后续工作定位，不包含对话原文。GitHub 远端提交结果以实际读取的分支状态为准，不在文件中预先宣称尚未完成的推送成功。
