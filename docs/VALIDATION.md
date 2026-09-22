# 开发预览版验收记录（0.1.0–0.1.2）

日期：2026-09-21。宿主：macOS Apple 芯片。固定上游：kkFileView `cd127fd8559970a28cd4d513f68e41b1bfdc966a`（5.0.2）。

此记录区分路由保留、构建完成和实际样本显示，不构成全格式兼容性保证。

| 项目 | 当前证据 |
|---|---|
| TXT / JSON / Markdown | Electron 内显示实际文本内容 |
| PDF | PDF.js 显示实际页面 |
| DOCX / XLSX / PPTX | 随包 LibreOffice 转换，实际文档、表格、幻灯片显示 |
| PNG | 图片预览显示 |
| MP4 | 播放器显示视频及时长；尚未覆盖各类编解码和全部转码路径 |
| OFD | `helloworld.ofd` 显示一页中文内容 |
| DWG | Aspose `Line.dwg` 转换到 SVG；验证路径、全图适配和缩放/重置；保留试用水印 |
| DXF | 上游 `text.dxf` 完成转换；另一份 Aspose `Line.dxf` 失败，错误为 `The binary key cannot have an odd number of digits`，未计入通过 |
| STL | 自建 12 面盒体显示，尺寸 40×24×16 |
| STEP / IGES | 10 mm 立方体显示 12 个三角面和正确尺寸；实测鼠标拖动旋转 |
| OBJ / MTL | 带材质模型显示，依赖文件从选定模型目录读取 |
| ZIP | 目录展开并点击 `inner.txt`，实际文本显示 |
| RAR / 7z | 目录展开；Mac ARM64 使用原生 7zz，RAR 中的链接条目安全占位 |
| 文件保护 | 最终回归前后 30 个原始样本 SHA256 保持不变；4 项 Node 测试验证 GET/HEAD/Range、非写入接口、删除/替换文件、同名路径身份和模型依赖范围 |
| 桌面交互 | 极简版重新验收：文件切换、按需工具、自动主题、480×360 布局、清理缓存、不保存历史 |
| macOS ARM64 便携包 | 上一版打包应用 19 个样本显示通过；极简版打包应用另完成 15 个样本回归，无界面脚本错误 |
| Windows x64 | Windows Java/Office/原生转换库已组装；尚无 Windows 实机验证 |
| macOS Intel | 提供构建目标，尚未生成发行包或验收 |

测试输出与截图：`output/playwright/`；初轮全类型桌面日志 `output-desktop.log`；工程格式日志 `output-engineering.log`；三维与材质日志 `output-models-direct.log`；其他格式日志 `output-more-formats.log`。日志中的局部测试失败被保留，不隐藏失败样本。

## 尚未完成的验收

- Windows 实机、干净系统、不同区域设置，系统右键/文件关联。
- 所有上游格式、历史版本、密码保护文档/压缩包、损坏文件、大装配体和超大图纸。
- DICOM、IFC、3DM、FBX、邮件、电子书、XMind、Visio、Draw.io、BPMN、HEIC/AVIF 等虽保留原组件，但不等于已实测通过。
- 打印、PDF 标注/保存、Office 多种预览模式、完整视频转码矩阵。
- 复杂外部引用：CAD 外部参照、跨目录模型贴图、OBJ 多材质库/贴图选项、视频播放列表分片；当前以独立本地文件为主。
- 平台发行签名、公证，以及全部依赖的商业再分发审查。

## 发布阻碍与已知限制

1. Aspose.CAD 未配置商业授权，试用水印和评估限制会影响图纸显示，不能称为正式商用版。
2. Mac 最终包使用经官方 SHA256 校验的 Azul Zulu JRE 21.0.12.1；Windows 包使用校验后的 Corretto 21.0.12.1。初轮开发测试的旧运行时不再随最终 Mac 包交付。
3. Mac ARM64 和 Windows x64 独立打包；不包含另一架构的原生组件。
4. 运行时约 GB 级，缓存随使用增长，可从操作菜单清理。引擎按需启动，不承诺所有复杂文件瞬时打开。
5. 文件只在本机处理，外网资源加载被拦截；需要远程附件的文件可能不完整。

## 样本来源

- kkFileView 固定提交的 `tests/e2e/fixtures`；Office 文档由该仓库样本生成脚本生成。
- DWG / 额外 DXF：[Aspose.CAD Java Examples](https://github.com/aspose-cad/Aspose.CAD-for-Java/tree/master/Examples/src/main/resources/DWGDrawings)。
- STEP / IGES：[occt-import-js Cube 10x10](https://github.com/kovacsv/occt-import-js/tree/main/test/testfiles/cube-10x10mm)。
- OFD：[ofdrw-reader helloworld](https://github.com/Trisia/ofdrw/tree/master/ofdrw-reader/src/test/resources)。
- STL / OBJ：测试脚本生成的基本几何体。

Windows 下载校验：LibreOffice 26.2.5.2 MSI SHA256 `f15ba07bfcb0186986cf3171063506f5d207c11f8cc051ba0d135209e9e915f9`；Corretto Windows JDK ZIP SHA256 `a85f5430ff621668cc682438e2eb54e3466d57112afb97b8a724005588852c22`。与各官方来源校验值核对一致。

Mac Azul JRE SHA256：`611673ab332d58e6d3a61506eaafbfb13e9f9b0e01452067a9cc8b2f470289fb`，来自 Azul 官方包元数据并核对一致。

最终 Mac 包回归：`output-packaged-mac.log`、`output/packaged-mac-results.json`。两平台包内 Java 架构、引擎/配置/主进程源码一致性检查见 `output/package-verification.json`；该检查不替代 Windows 运行验收。

极简版打包实测：`output-minimal-packaged.log`、`output/minimal-packaged-mac-results.json`；首页仅一个打开按钮，预览工具按需展开，未写入最近文件记录。最终回归后的原文件校验见 `output/fixture-integrity.json`。

压缩包界面补充验收：移除品牌、状态标签、统计和功能介绍；显示原始包名；480×360 下目录与正文仍保持左右排列，内嵌文本实际加载通过。记录：`output-minimal-archive.log`、`output/minimal-archive-results.json`。

最终静态资源更新后，再次对打包 Mac 应用验证 ZIP 内嵌预览及窄窗口布局、PDF、中文 DOCX、STEP 旋转与工具切换，全部通过；记录：`output-final-package.log`、`output/final-package-results.json`。

单 Dock 图标修复：内置 LibreOffice 使用独立辅助程序标识和 LSUIElement，并重新封装开发签名。真实打包应用运行时，AppKit 返回主应用 activationPolicy=0，转换辅助程序 activationPolicy=1；中文 DOCX、XLSX、PPTX 均实际渲染通过。日志：`output-single-dock-final.log`；结果：`output/single-dock-packaged-results.json`。后台角色参考 [Apple LSUIElement 文档](https://developer.apple.com/documentation/bundleresources/information-property-list/lsuielement)。只修改随包组件，未修改系统安装的 LibreOffice。

## 0.1.1 拖入与文件名修复

- 复现 FileList 经过 contextBridge 后变为空列表，改为先转换为 File 数组，并为缺失文件路径提供明确错误。
- 引擎页与内嵌 PDF 页转发拖入事件和原生 File 对象，主界面验证消息来源后统一打开；保留沙箱与上下文隔离。
- 对比引擎日志，确认括号导致上游 URL 编码检测误判，将已编码的中文再次编码；统一文件地址和 fullfilename 参数编码，未改变原文件名称。
- 开发应用通过 CDP 原生文件拖入路径，覆盖首页、文本页、PDF 内嵌页、三维页和多文件（`output-drop-after.log`）。
- 最终打包应用使用磁盘文件生成的 File 对象执行同一组页面拖入事件，并验证正文/画布；用户反馈的中文加括号 Word 完成实际 PDF 转换和显示（`output-drop-packaged.log`、`output/drop-packaged-results.json`）。后台测试避免与用户操作窗口冲突。
- 5 项 Node 测试通过，新增文件名特殊字符的读取与路径一致性回归。Windows 打包内容与源码一致，但仍未做 Windows 实机运行验证。

## 0.1.2 RAR 内容修复

- 空的 `Symbolic Link` / `Hard Link` 字段不再将普通文件标为链接；真实链接仍排除解压并显示占位说明。
- 原 Mac Homebrew 7zz 能列出 RAR 目录，但缺少 RAR 解码器。改用官方 7-Zip 26.03 macOS 完整组件，保留对应许可证；构建检查必须找到 Rar1/2/3/5 解码器，防止再次打入精简版本。
- 官方 HTTPS 下载包本地固定摘要：`5ca87677072c59f5602e5c49baa27d4694bacd2259b4e507f0094249d4281480`。此摘要用于后续构建复现，并非经独立官方摘要核对。
- 缓存按应用版本隔离，0.1.2 不复用旧版本生成的占位文档。
- 已记录的验收中，开发应用与最终 Mac 打包应用均已预览实际 RAR 内部 Word 和此前报 404 的中文含括号 Word：`output-rar-word-fixed.log`、`output-rar-word-packaged.log`、`output/rar-word-packaged-results.json`。
- RAR 内 4 份 DOCX 的解压内容与原始压缩包逐字节一致，原始 RAR 与独立 Word 文件在打包回归前后 SHA256 一致：`output/rar-content-integrity.json`、`output/user-file-hashes-before.txt`、`output/user-file-hashes-after.txt`。这些用户文件与测试缓存不进入发行源码包。
- 实际 RAR 普通文件、真实符号链接排除、包含 `../` 的 TAR 越界路径拒绝均通过：`output/archive-regression.json`。5 项 Node 测试通过。
- 两平台打包目录内容与源码/运行时一致；Windows 尚未实机运行。后续版本的运行验收状态另行记录。

## 0.1.3 目录按钮样式

压缩包目录折叠按钮改为 18 px 线条图标与 28 px 点击区域，去掉常驻圆角边框，折叠/展开方向同步变化；保留悬停反馈和键盘焦点。本版本完成修改与构建，未进行新的自动测试或界面验收。

## 0.1.4 图标与系统集成（待用户验收）

- 独立应用图标已生成并转换为多尺寸 ICNS／ICO；源 PNG 与完整 image_gen 提示词在 `build/lanyue-icon-v2*`。
- Mac 原生组件编译采用 AppKit 的内容类型默认应用 API；Windows 原生组件注册当前用户的应用能力，并将默认选择交给系统设置，不修改 UserChoice。
- 空格快捷预览组件仅处理 Finder／Explorer 文件列表的空格键，排除文本输入与组合键；文件由原有本地预览引擎打开，支持空格或 Esc 关闭。此路径属于应用自己的后台快捷预览，不是系统 Quick Look 扩展。
- Mac 辅助功能与 Finder 自动化需要用户授权。登录启动为独立可选项；退出应用时关闭原生组件，父进程断开管道时组件也会结束。
- 双平台原生组件已编译。尚未运行该版本的交互、权限、关联、后台常驻或 Windows 实机测试，不能将构建完成视为这些项目已验收。

## 0.1.5 开源发布

源码发布到 https://github.com/WUTONGCN/LanYue ，采用 Apache-2.0；README、包元数据和应用“关于览阅”入口显示同一项目地址。第三方运行时与用户测试数据不纳入源码仓库。本次只完成源码发布与构建，不新增运行验收结论。

## 0.1.6 应用内更新

已接入正式 GitHub Release 检查、可取消的完整包下载、SHA256 与包结构校验、便携版替换和启动失败恢复。Mac／Windows 的下载、权限、文件占用、重启及恢复场景尚未进行实机验收；构建产物不代表这些场景已通过。0.1.5 需要手动替换为含更新组件的版本。
