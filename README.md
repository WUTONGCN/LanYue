# 览阅 LanYue

<img src="build/lanyue-icon-v2.png" width="112" alt="览阅图标">

[下载最新版](https://github.com/WUTONGCN/LanYue/releases/latest) · [开源仓库](https://github.com/WUTONGCN/LanYue) · [反馈问题](https://github.com/WUTONGCN/LanYue/issues)

极简、离线、免安装的 macOS / Windows 文件预览工具，基于 Electron 和 kkFileView。内置预览运行时，无需另装 Java、LibreOffice 或 Docker。

## 使用

- **Apple 芯片 Mac**：下载 `mac-arm64.zip`，解压并打开 `LanYue.app`。
- **Windows x64**：下载 `win-x64.zip`，完整解压并打开 `LanYue.exe`；请保留同目录的其他文件。
- 将文件拖进窗口，或按 `⌘O` / `Ctrl+O` 打开。按 `⌘W` / `Ctrl+W` 关闭当前预览。
- 右上角「···」提供打印、预览工具、系统集成和检查更新。`⌘⇧T` / `Ctrl+Shift+T` 展开预览工具。

支持 Office、PDF、CAD、三维模型、OFD、图片、音视频、压缩包、邮件、电子书、思维导图、流程图和代码等 kkFileView 预览类型。支持压缩包内文件预览，以及各格式自带的搜索、缩放、旋转、打印等工具。转换在本机完成，原文件只读；首次转换耗时取决于文件大小和格式。当前没有统一的格式转换或批量导出入口。

CAD 转换使用上游 Aspose.CAD 评估组件，存在水印及评估限制。发行包尚未签名、公证，首次打开可能需要在系统安全设置中允许运行。

## 系统集成与更新

在「··· → 系统集成」中设置默认打开方式、空格预览和登录启动。启用空格预览后，在 Finder / 资源管理器选中文件并按空格即可预览，再按空格或 Esc 返回。Mac 需要授予辅助功能与 Finder 自动化权限；Windows 默认应用由系统设置页面选择。

启用空格预览后，关闭窗口会保留后台服务，选择「退出览阅」才会完全退出。移动应用目录后，需要重新设置文件关联和登录启动。

应用自动检查 GitHub 正式版本，也可手动「检查更新」。下载完成并校验后，选择「重启并更新」替换程序；更新失败时尝试恢复旧版。更新需要应用目录可写，保留原文件和应用数据。`0.1.5` 及更早版本需先手动升级一次。

Windows 可在 EXE 同级创建 `portable-data` 目录，将缓存和设置保存在便携目录中；否则使用系统应用数据目录。

## 构建

需要 Node.js 22.12+、npm、Git、Maven、JDK 21。Mac 系统组件需要 Xcode Command Line Tools；Windows 系统组件需要 MinGW-w64，可用 `LANYUE_MINGW_CXX` 指定编译器路径。

```sh
npm ci
node node_modules/electron/install.js
node scripts/bootstrap.cjs
npm run engine:build
```

为目标架构准备 Java 和 LibreOffice，设置 `LANYUE_JDK`（或 `LANYUE_JRE`）、`LANYUE_OFFICE`，再运行：

```sh
npm run runtime:prepare
npm start
npm run release:mac  # macOS ARM64
# npm run pack:win  # Windows x64
```

Windows 构建需设置 `LANYUE_TARGET=win-x64`，使用 Windows x64 运行时；LibreOffice 目录需包含 `program/soffice.exe`。Intel Mac 可设置 `LANYUE_TARGET=mac-x64`，准备对应架构运行时后运行 `node scripts/pack.cjs mac-x64`。

运行时位于 `runtime/<平台>-<架构>`，不随源码提交。打包输出到独立的 `dist/builds/` 目录，发布 ZIP 位于 `dist/`。单元测试运行 `npm test`。

## 自动发布

推送到 `main` 后，[GitHub Actions](https://github.com/WUTONGCN/LanYue/actions/workflows/build.yml) 自动构建 macOS ARM64 和 Windows x64。两端成功后发布正式 [Release](https://github.com/WUTONGCN/LanYue/releases)，包含便携 ZIP 和 SHA256 校验文件，应用内更新随之可用。

版本号以 `package.json` 为起点；若已有相同或更高版本，自动递增补丁号并写入构建包。也可推送与 `package.json` 版本一致的 `vX.Y.Z` 标签，或在 Actions 手动运行。无需配置额外 Token。

## 许可

桌面端源码采用 [Apache-2.0](LICENSE)。第三方组件保留各自许可，见 [NOTICE](NOTICE) 和 [第三方组件声明](THIRD_PARTY_NOTICES.md)。
