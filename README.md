# 览阅 LanYue

<img src="build/lanyue-icon-v2.png" width="112" alt="览阅图标">

[开源仓库](https://github.com/WUTONGCN/LanYue) · [反馈问题](https://github.com/WUTONGCN/LanYue/issues) · [Apache-2.0](LICENSE)

面向 macOS 和 Windows 的本地文件预览工具。基于 Electron 44 和固定版本的 kkFileView 5.0.2，保留其格式解析器与预览页面。此版本是可运行的开发预览版，尚未完成所有格式、文件版本和 Windows 实机验收。

## 直接使用

- Apple 芯片 Mac：解压 `LanYue-0.1.5-mac-arm64.zip`，打开 `LanYue.app`。不必移动到“应用程序”，也不需要另装 Java 或 LibreOffice。
- Windows x64：将 `LanYue-0.1.5-win-x64.zip` **完整解压**，打开 `LanYue.exe`。不要单独复制 EXE，也不要在压缩软件内直接运行。尚未进行 Windows 实机验收。
- 首次打开一个文件时启动本地转换引擎；之后重复打开使用转换缓存。Office/CAD 的首次转换需要等待，耗时取决于文件。
- 极简界面：空白页只有打开/拖入入口；打开后只显示文件名、必要的切换箭头和操作菜单。没有文件库、最近记录、分类、标签栏、设置页或常驻状态栏。
- Mac 用 `⌘O` 打开、`⌘W` 关闭当前预览；Windows 对应 `Ctrl+O`、`Ctrl+W`。`⌘⇧T` / `Ctrl+Shift+T` 展开预览工具，也可从右上角菜单选择。外观自动跟随系统。
- 预览与转换在本机运行，原文件只读。数据默认保存到系统应用数据目录；Windows 如需随盘携带缓存，可在 EXE 同级创建 `portable-data` 目录后再启动。
- 开发包未做发行签名、公证；系统可能提示未验证开发者。只使用自己构建或来源可信的包，通过系统提供的“仍要打开”操作处理。没有自动设置默认文件关联。

## 能力与边界

保留上游 Office、PDF、CAD、三维、OFD、图片、音视频、压缩包、邮件、电子书、思维导图、流程图、代码等预览路径。实际扩展名从上游源代码和配置生成，完整清单位于源码的格式清单。

PDF、三维、CAD 的辅助工具默认收起，内容占满窗口；通过“预览工具”重新展开。页码、缩放、搜索、打印、下载、预览模式切换、压缩包内嵌预览、三维旋转等能力保留。桌面版通过本地文件选择代替网页上传服务；不提供公共网络预览服务器。

**CAD 授权是当前明确限制。** 上游 Aspose.CAD 处于试用状态，DWG/DXF 转换输出带试用水印并受评估限制；没有剥离水印。商用前需要落实适用的转换器授权与依赖许可审查。保留解析入口不等于全部文件验收通过，详见 [验收记录](docs/VALIDATION.md)。

OBJ 自动加载所引用的同目录材质和常规贴图；glTF 自动加载同目录引用的 bin 和图片。跨目录、外网依赖和复杂材质选项仍需更多样本验证。压缩包里的符号链接用说明占位，不跟随到本机任意位置。

## 构建

开发依赖：Node.js 22.12+、npm、Git、Maven、可再分发的 JDK 21。Mac 系统集成组件需要 Xcode Command Line Tools（Swift）；Windows 组件需要 MinGW-w64 C++ 编译器，默认命令为 `x86_64-w64-mingw32-g++`，可用 `LANYUE_MINGW_CXX` 指定。预览使用随包运行时，终端上的 JDK 仅供构建。

```sh
npm ci
node node_modules/electron/install.js
node scripts/bootstrap.cjs
```

macOS Apple 芯片（JDK、LibreOffice、7zz 均须为 ARM64）：

```sh
export JAVA_HOME=/path/to/jdk21/Contents/Home
export LANYUE_JDK="$JAVA_HOME"
export LANYUE_OFFICE=/Applications/LibreOffice.app
npm run engine:build
npm run runtime:prepare
npm test
npm start
npm run release:mac
```

Windows x64 可原生构建或交叉打包。准备 Windows x64 JRE 21 和解压的 LibreOffice 目录，设置 `LANYUE_TARGET=win-x64`、`LANYUE_JRE`、`LANYUE_OFFICE`，依次运行 `engine:build`、`runtime:prepare`、`pack:win`。PowerShell 设置环境变量使用 `$env:变量名='值'`。不能将 Mac 的 Java/LibreOffice 拷入 Windows 包。

LibreOffice MSI 用 `msiextract -C <目录> <文件.msi>` 解开，`LANYUE_OFFICE` 指向含 `program/soffice.exe` 的目录。脚本同时复制 MSI 的 `System64` CRT DLL 和 `Fonts` 到应用私有目录，避免全局安装依赖。Windows JRE 可使用 JDK 的 jmods 经 `jlink` 生成。

Mac Intel 构建使用 `LANYUE_TARGET=mac-x64` 和匹配的三个运行时组件，然后 `node scripts/pack.cjs mac-x64`；当前没有交付或验收 Intel 包。

也可设置 `LANYUE_JRE` 使用同架构的完整 JRE；当前 Mac 包采用经 SHA256 校验的 Azul Zulu 21.0.12.1，Windows 使用 Corretto 21.0.12.1。

源代码不包含约数 GB 的第三方二进制，运行时在 `runtime/<平台>-<架构>`；生产包内置它们，不在线下载、不要求 Docker。引擎固定到 `cd127fd8559970a28cd4d513f68e41b1bfdc966a`；所有桌面适配位于 `engine-overlay/` 和 `scripts/build-engine.cjs`。

## 自动构建与发布

[GitHub Actions 构建记录](https://github.com/WUTONGCN/LanYue/actions/workflows/build.yml) · [版本下载](https://github.com/WUTONGCN/LanYue/releases)

推送到 `main` 会自动构建 Apple 芯片 Mac 和 Windows x64 便携 ZIP；在对应 Actions 运行页面底部的 **Artifacts** 下载，保留 14 天。也可以进入 Actions → Build portable apps → Run workflow 手动构建。构建记录和产物名称带运行编号，便于区分同一版本号的开发更新。

发布新版本时，先提交代码，再执行：

```sh
npm version patch
git push origin main --follow-tags
```

例如当前 `0.1.5` 会变成 `0.1.6`，同时更新 `package.json`、锁文件，创建版本提交和 `v0.1.6` 标签。也可使用 `npm version minor` 或 `npm version 1.0.0`。标签必须与源码版本一致；推送标签后，两端构建全部成功才会生成包含 ZIP、SHA256 校验和与更新说明的 **Release 草稿**。在 Releases 检查草稿并点击 Publish release 后，用户即可下载。已发布版本的文件不会被重跑流程覆盖，修正应使用新版本号。

云端采用 Node.js 22、Temurin JDK 21、固定版本 LibreOffice 26.2.6（固定 SHA256），以及现有脚本中的固定 kkFileView 和 7-Zip。Mac 使用 GitHub 的 ARM64 runner，Windows 使用 x64 runner 和 MinGW；无需上传本机运行时或配置额外 Token。仅发布草稿的任务拥有仓库写权限。配置见 [build.yml](.github/workflows/build.yml)，云端运行时准备见 [prepare-ci-runtime.cjs](scripts/prepare-ci-runtime.cjs)。

自动构建完成不代表文件预览、系统集成或全部格式验收通过。此流程不运行桌面交互测试，也不提供发行签名、公证或应用内自动升级；用户下载新 ZIP、退出旧版后替换应用。开发预览版仍保留前述 CAD 评估限制和第三方组件声明。

## 体积策略

按平台/架构单独打包 JavaCV 原生库，使用 jlink 精简 Java，桌面界面不引入前端框架，资源放入 ASAR，使用压缩 ZIP，Windows 仅移除未使用的 LibreOffice 界面翻译资源。转换库、Office 格式过滤器、字体、词典、三维 WASM 均保留。更激进的组件裁剪必须先做格式与排版回归。

## 验证与诊断

`npm test` 验证文件只读、访问范围、Range、同名文件身份、模型依赖和引擎退出。准备默认样本先安装 Python 的 `python-docx`、`openpyxl`、`python-pptx`，运行 `python3 scripts/prepare-fixtures.py`。`npm run test:desktop` 使用真实 Electron 窗口验证界面及格式样本；设置 `LANYUE_APP` 可指定打包后的可执行文件，`LANYUE_SAMPLES` 可选择样本。测试产生独立数据目录与截图，位于 `output/playwright`。

查看 [实施约定](docs/IMPLEMENTATION.md)、[验收记录](docs/VALIDATION.md) 和 [第三方组件声明](THIRD_PARTY_NOTICES.md)。

macOS 的内置 Office 转换器以辅助进程运行，不单独显示 Dock 图标；相关准备步骤由 `scripts/mac-office-agent.cjs` 在运行时准备和打包时执行。

0.1.1 修复拖入文件列表跨进程丢失、内嵌预览区域吞掉拖入事件，以及中文文件名含括号等字符时重复编码导致的 404。

0.1.2 修复 RAR 普通文件被误判为链接；Mac 改用包含完整 RAR 解码器的官方 7-Zip，保留真实链接和越界路径防护。预览缓存按应用版本隔离，升级后不会复用旧的错误占位文档。

0.1.3 将压缩包目录折叠按钮改为小尺寸线条侧栏图标，移除常驻边框；鼠标经过时显示轻微底色，保留键盘焦点提示。

Mac 运行时准备会下载固定版本的官方 7-Zip，并校验固定摘要和 RAR 解码器。自定义组件时须同时提供 `LANYUE_7ZIP_SOURCE` 与对应 `LANYUE_7ZIP_LICENSE`；不再默认复制系统 Homebrew 组件。

## 双击与空格预览

从右上角「··· → 系统集成」设置：

- **默认打开方式**：Mac 可将当前文件类型或全部支持类型关联到览阅；Windows 会注册当前用户的文件类型能力，并打开系统默认应用页面，由用户选择，不修改受保护的 UserChoice。
- **空格预览**：启用后，在 Finder／资源管理器选择文件并按空格；再次按空格或 Esc 返回。输入框、搜索和重命名时不触发。Mac 首次使用需要手动授权辅助功能与 Finder 自动化。
- **登录时启动**：可选。不开启时，需要先启动一次览阅，后台空格预览才会可用。

空格预览启用后，关闭窗口会留在后台；选择「退出览阅」会完全退出并停止快捷预览。后台无额外 Dock／托盘图标。窗口隐藏 60 秒后释放文档转换引擎，下一次预览按需启动。移动便携包之后，需要重新设置文件关联与登录启动路径。

Mac 的空格预览由览阅的后台快捷预览组件提供，并非替换系统 Quick Look 扩展；Windows 也无需安装资源管理器扩展。两者都使用应用内同一套预览引擎。0.1.4 已完成构建，交互与权限授权仍待运行验收。

新图标源文件：`build/lanyue-icon-v2.png`；Mac `build/lanyue-v2.icns`，Windows `build/lanyue-v2.ico`；内置 image_gen 的完整生成提示词保存在 `build/lanyue-icon-v2-prompt.txt`。

## 开源许可

本仓库桌面端源码采用 [Apache License 2.0](LICENSE)，项目地址：https://github.com/WUTONGCN/LanYue。保留 kkFileView 及其他上游组件的原始署名和许可，详见 [NOTICE](NOTICE) 与 [第三方组件声明](THIRD_PARTY_NOTICES.md)。

GitHub 仓库包含源码、图标与构建脚本，不包含个人文档、测试输出、转换缓存、Java／LibreOffice／CAD 转换器等第三方运行时。第三方运行时需要按构建说明另行准备，其许可证不因本仓库开源而改变。

当前内部转换主要服务于预览，例如 Office 转 PDF、CAD 转可显示的图像或矢量内容。尚未提供统一的“选择目标格式并另存为”或批量转换界面。
