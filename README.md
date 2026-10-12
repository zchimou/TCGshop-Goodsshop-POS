# TCGshop POS

面向零售店铺的收银与库存管理系统。当前源码版本为 **1.1.0**，Android 内部更新编号为 **36**。

## 功能

- 商品管理、封面压缩、扫码查找、常用商品及收款时定价。
- 分店库存、采购与出库、盘库数量和金额差异、负库存提示。
- 销售及独立退款记录，按日期分组，记录列表仅显示人员名称。
- 经营统计和扣除退货后的商品明细，适配手机、平板及折叠屏。
- 管理员与店员权限、蓝牙 ESC/POS 配对、打印及小票样式设置。
- NAS 静默实时通知、增量同步、图片独立存储和离线恢复。
- 在线启动检查更新；发现更新后提示安装，离线继续使用。

## 目录

| 目录 | 内容 |
| --- | --- |
| pos/ | 界面、业务逻辑、同步客户端、浏览器回归脚本与第三方许可 |
| tcgshop-android/ | Android 容器、蓝牙打印、更新桥接、图标及构建脚本 |
| tcgshop-server/ | NAS 服务、Compose 配置、增量账本与图片存储、发布脚本 |
| release-tools/ | Windows 一键上传工具与 ZIP 检查工具 |

## 本地预览与验证

安装 Node.js 22 或以上版本，在仓库根目录运行：

```sh
npm install
npx playwright install chromium
npm run preview
```

浏览器打开 http://127.0.0.1:5690。首次使用自行创建管理员；预览数据保存在当前浏览器。

```sh
npm test
```

可用 CHROME_PATH 指定现有 Chrome 可执行文件。独立的 verify-*.cjs 脚本覆盖账号、退款、盘库、同步、打印和布局；部分需要预览服务运行，Java 桥接检查需要 JAVA_HOME。打包资产检查需先构建 APK。

## Android 构建

Windows PowerShell 构建入口为 tcgshop-android/build-release.ps1，需要 JDK 21、Android SDK 的 build-tools 36.0.0 及 android-37.0 平台。配置 JAVA_HOME、TCGSHOP_SIGNING_KEY、TCGSHOP_STORE_PASSWORD 和可选的 TCGSHOP_KEY_PASSWORD，使用 -KeyAlias 指定密钥别名。脚本支持 -SdkRoot、-JdkRoot 和 -SigningKey。

原应用的签名密钥不包含在仓库中。覆盖安装与自动更新必须使用原签名，且内部 versionCode 高于已安装版本；显示版本 versionName 可以调整。公开源码使用独立的通用本地存储键；已有品牌版本迁移时需保留原存储键或先完成数据迁移。

## NAS 部署与版本发布

参见 [NAS 部署说明](tcgshop-server/NAS部署说明.md)。公开 Android 源码默认仅允许 HTTPS 网络连接，NAS 同步和更新服务需配置 HTTPS。Android 更新服务地址为示例 https://pos.example.com/tcgshop/api/update，部署前修改 tcgshop-android/app/src/main/java/com/tcgshop/pos/AppUpdates.java。

用 tcgshop-android/publish-update.ps1 的 -Apk、-ReferenceApk 和 -Output 生成发布清单；ReferenceApk 应是已部署的同签名版本。release-tools/deploy-nas-update.ps1 使用示例 NAS 地址、账号和目录，部署前填写实际配置，并保持工具与对应 NAS 更新 ZIP 在同一目录。-CheckOnly 仅做本地完整性检查。

## 数据和公开源码

仓库不包含实际商品、销售账本、账号库、同步密钥、签名密钥、APK、私有头图或二维码。小票默认不显示头图，可在设置中上传。示例地址和配置不是可用服务凭证。业务备份需保存完整 NAS data 目录及原签名密钥。

浏览器测试、模拟 NAS 与编译检查无法替代实际蓝牙打印、相机以及设备网络验证。离线多设备重复退款超出订单数量时会阻止合并并保留数据，需要核对真实退款。
