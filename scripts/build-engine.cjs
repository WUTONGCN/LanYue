const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const upstream = path.join(root, 'vendor/kkFileView');
const commit = 'cd127fd8559970a28cd4d513f68e41b1bfdc966a';
const platform = process.env.LANYUE_TARGET || (process.platform === 'darwin' ? `mac-${process.arch}` : 'win-x64');
const nativePlatform = { 'mac-arm64': 'macosx-arm64', 'mac-x64': 'macosx-x86_64', 'win-x64': 'windows-x86_64' }[platform];
if (!nativePlatform) throw new Error('Unsupported build target');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim();
if (head !== commit) throw new Error(`Upstream pin mismatch: ${head}`);
const original = file => execFileSync('git', ['show', `HEAD:${file}`], { cwd: upstream, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
const write = (file, body) => { fs.mkdirSync(path.dirname(path.join(upstream, file)), { recursive: true }); fs.writeFileSync(path.join(upstream, file), body); };
// Drop foreign-architecture binaries; keep each format's matching native implementation.
let pom = original('server/pom.xml');
pom = pom.replace(/\s*<dependency>\s*<groupId>org.bytedeco<\/groupId>\s*<artifactId>(opencv|openblas|ffmpeg)<\/artifactId>[\s\S]*?<\/dependency>/g, '');
const versions = { opencv: '${opencv.version}', openblas: '${openblas.version}', ffmpeg: '${ffmpeg.version}' };
pom = pom.replace('    <dependencies>\n        <!--', '    <dependencies>\n' + Object.entries(versions).map(([name, version]) => `        <dependency><groupId>org.bytedeco</groupId><artifactId>${name}</artifactId><version>${version}</version><classifier>${nativePlatform}</classifier></dependency>`).join('\n') + '\n        <!--');
// Compilation resources remain complete; developer source maps do not affect previews.
pom = pom.replace('<filtering>false</filtering>', '<filtering>false</filtering><excludes><exclude>**/*.map</exclude></excludes>');
write('server/pom.xml', pom);
let office = original('server/src/main/java/cn/keking/service/OfficePluginManager.java');
office = office.replace('boolean killOffice = killProcess();', 'boolean killOffice = false; // Desktop: never terminate another application\'s Office process.');
office = office.replace('.portNumbers(ports)', '.portNumbers(ports)\n                    .startFailFast(true)\n                    .existingProcessAction(org.jodconverter.local.office.ExistingProcessAction.FAIL)\n                    .workingDir(new File(System.getProperty("java.io.tmpdir")))');
write('server/src/main/java/cn/keking/service/OfficePluginManager.java', office);
let config = original('server/src/main/java/cn/keking/utils/ConfigUtils.java');
config = config.replace('public static String getCustomizedConfigPath() {', 'public static String getCustomizedConfigPath() {\n        if (System.getenv("LANYUE_CONFIG") != null) return System.getenv("LANYUE_CONFIG");');
write('server/src/main/java/cn/keking/utils/ConfigUtils.java', config);
let archive = original('server/src/main/java/cn/keking/service/CompressFileReader.java');
archive = archive.replace('List<String> imgUrls = new ArrayList<>();', 'if (System.getenv("LANYUE_7ZIP") != null) return cn.keking.desktop.DesktopArchive.extract(filePath, filePassword, fileName, fileAttribute, fileHandlerService);\n        List<String> imgUrls = new ArrayList<>();');
write('server/src/main/java/cn/keking/service/CompressFileReader.java', archive);
for (const file of fs.readdirSync(path.join(root, 'engine-overlay'))) if (file.endsWith('.java')) write('server/src/main/java/cn/keking/desktop/' + file, fs.readFileSync(path.join(root, 'engine-overlay', file)));
write('server/src/main/resources/web/fileNotSupported.ftl', fs.readFileSync(path.join(root,'engine-overlay/fileNotSupported.ftl')));
let waiting = original('server/src/main/resources/web/waiting.ftl');
waiting = waiting.replaceAll('${fileName}', '${fileName?replace("^[a-f0-9]{10}-[0-9]+-", "", "r")}').replaceAll('服务器负载','本机性能');
write('server/src/main/resources/web/waiting.ftl', waiting);
let compress = original('server/src/main/resources/web/compress.ftl');
compress = compress.replace('treeNodes = normalizeTreeNodes(res || []);', `treeNodes = normalizeTreeNodes(res || []);
        treeNodes.forEach(function (node) { if (/^[a-f0-9]{10}-[0-9]+-/.test(node.name)) node.name = node.name.replace(/^[a-f0-9]{10}-[0-9]+-/, '').replace(/_$/, ''); });`);
write('server/src/main/resources/web/compress.ftl', compress);
let svg = original('server/src/main/resources/web/svg.ftl');
svg = svg.replace("svgElement.style.transformOrigin = 'center center';", `// Fit the full CAD drawing, preserving its original coordinate system.
                    const vb = svgElement.viewBox.baseVal;
                    const w = vb.width || svgElement.width.baseVal.value || 1000;
                    const h = vb.height || svgElement.height.baseVal.value || 1000;
                    if (!vb.width || !vb.height) svgElement.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                    svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                    const fit = () => {
                        const scale = Math.min((container.clientWidth - 48) / w, (container.clientHeight - 80) / h);
                        svgContainer.style.width = Math.max(1, w * scale) + 'px';
                        svgContainer.style.height = Math.max(1, h * scale) + 'px';
                        svgContainer.style.transform = '';
                        resetView();
                    };
                    fit();
                    new ResizeObserver(fit).observe(container);
                    svgElement.style.transformOrigin = 'center center';`);
svg = svg.replace("const svgRect = svgContainer.getBoundingClientRect();", "const svgRect = { width: svgContainer.offsetWidth, height: svgContainer.offsetHeight };");
svg = svg.replace('    <style>', '    <style>\n        html,body { margin:0; padding:0; overflow:hidden; }');
write('server/src/main/resources/web/svg.ftl', svg);
for (const template of ['txt','code','json','xml','markdown']) {
  const file = `server/src/main/resources/web/${template}.ftl`;
  write(file, original(file).replaceAll('${file.name}', '${file.name?replace("^[a-f0-9]{10}-[0-9]+-", "", "r")?html}'));
}
write('server/src/main/resources/static/desktop-minimal.js', fs.readFileSync(path.join(root,'engine-overlay/desktop-minimal.js')));
const minimalScript = '<script src="/desktop-minimal.js"></script>';
// Upstream reports every OfficeException as an invalid document version, even
// when LibreOffice itself has a broken runtime/configuration. Preserve password
// handling but report conversion failure without blaming the original file.
const officePreviewFile = 'server/src/main/java/cn/keking/service/impl/OfficeFilePreviewImpl.java';
write(officePreviewFile, original(officePreviewFile).replace(
  '抱歉，该文件版本不兼容，文件版本错误。',
  '文档转换未完成。请完全退出览阅后重新打开再试；若仍失败，请查看日志。此提示不代表原文件损坏。'
));
write('server/src/main/resources/web/commonHeader.ftl', original('server/src/main/resources/web/commonHeader.ftl') + '\n' + minimalScript);
for (const page of ['website/index.html','pdfjs/web/viewer.html','ofd/index.html']) {
  const file = 'server/src/main/resources/static/' + page;
  write(file, original(file).replace('</head>', minimalScript + '</head>'));
}
const types = original('server/src/main/java/cn/keking/model/FileType.java');
const labels = { OFFICE_TYPES: 'Office 与设计文档', PICTURE_TYPES: '图片', ARCHIVE_TYPES: '压缩包', ONLINE3D_TYPES: '三维模型', CAD_TYPES: 'CAD 图纸', CODES: '代码', EML_TYPES:'电子邮件', MSG_TYPES:'Outlook 邮件', XMIND_TYPES:'思维导图', EPUB_TYPES:'电子书', DCM_TYPES:'医学影像', DRAWIO_TYPES:'流程图', TIFF_TYPES:'多页图片', OFD_TYPES:'OFD 文档' };
const groups = [...types.matchAll(/String\[\] (\w+) = \{([^}]+)\}/g)].map(match => ({ name: labels[match[1]] || match[1].replace('_TYPES',''), extensions: [...match[2].matchAll(/"([^"]+)"/g)].map(x => x[1]) }));
groups.push({ name: '文档与影音', extensions: ['pdf','md','txt','bpmn','mp3','wav','mp4','flv','mpd','m3u8','ts','mpeg','m4a','avi','mov','wmv','mkv','3gp','rm'] });
const baseline = original('server/src/main/config/application.properties');
for (const [key,name] of [['simText','纯文本'],['media','音视频'],['convertMedias','音视频转换']]) {
  const line = baseline.split('\n').find(line => line.startsWith(key + ' ='));
  const match = line?.match(/\$\{[^:]+:([^}]+)\}/);
  if (match) groups.push({name,extensions:match[1].split(',')});
}
fs.writeFileSync(path.join(root,'app/ui/formats.json'), JSON.stringify(groups,null,2));
const packageFile=path.join(root,'package.json'),manifest=JSON.parse(fs.readFileSync(packageFile));
manifest.build.fileAssociations[0].ext=[...new Set(groups.flatMap(group=>group.extensions))].sort();
fs.writeFileSync(packageFile,JSON.stringify(manifest,null,2)+'\n');
fs.mkdirSync(path.join(root, 'licenses'), { recursive: true });
fs.copyFileSync(path.join(upstream, 'LICENSE'), path.join(root, 'licenses/kkFileView-LICENSE'));
const mavenArgs = ['-B','-pl','server','-DskipTests','-Dassembly.skipAssembly=true','package'];
const result = spawnSync(process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'mvn', process.platform === 'win32' ? ['/d','/s','/c','mvn.cmd',...mavenArgs] : mavenArgs, { cwd: upstream, stdio: 'inherit', env: process.env });
if (result.status !== 0) process.exit(result.status || 1);
const target = path.join(upstream, 'server/target');
const jar = fs.readdirSync(target).find(file => /^kkFileView-[\d.]+\.jar$/.test(file));
if (!jar) throw new Error('Build did not produce an engine JAR');
const dest = path.join(root, 'runtime', platform, 'engine'); fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(path.join(target, jar), path.join(dest, 'kkFileView.jar'));
fs.copyFileSync(path.join(upstream, 'server/src/main/config/application.properties'), path.join(dest, 'application.properties'));
fs.writeFileSync(path.join(dest, 'upstream.json'), JSON.stringify({ repository:'https://github.com/kekingcn/kkFileView',commit,platform,nativePlatform, built:new Date().toISOString() },null,2));
fs.writeFileSync(path.join(root,'engine-overlay/upstream.patch'), execFileSync('git',['diff'],{cwd:upstream,maxBuffer:5*1024*1024}));
console.log('Engine ready:', dest);
