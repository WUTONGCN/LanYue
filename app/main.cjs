const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session, nativeTheme, net } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { FileBroker, encodeFileName } = require('./lib/files.cjs');
const { Engine } = require('./lib/engine.cjs');
const { SystemIntegration } = require('./lib/system.cjs');
const { PortableUpdater } = require('./lib/updater.cjs');
const projectUrl = require('../package.json').homepage;

app.setName('LanYue');
const overrideData = process.env.LANYUE_TEST_DATA;
const portable = path.join(path.dirname(process.execPath), 'portable-data');
if (overrideData) app.setPath('userData', overrideData);
else if (process.platform === 'win32' && fs.existsSync(portable)) app.setPath('userData', portable);
const index = pathToFileURL(path.join(__dirname, 'ui', 'index.html')).href;
let win, engine, broker, integration, updater, quitting = false, quickMode = false, quickWasVisible = false, currentFile = null;
let idleTimer;
const background = process.argv.includes('--background');
const queued = [];
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
function argsFiles(args) { return args.filter(value => value !== process.execPath && value !== __filename && !value.startsWith('-') && path.isAbsolute(value) && fs.existsSync(value) && fs.statSync(value).isFile()); }
app.on('open-file', (event, file) => { event.preventDefault(); if (win && !win.webContents.isLoadingMainFrame()) { showWindow(); openPaths([file], true).catch(showError); } else queued.push(file); });
app.on('second-instance', (_, argv) => { if(argv.includes('--background'))return;showWindow();const paths=argsFiles(argv);if(paths.length)openPaths(paths,true).catch(showError); });
function showWindow(){clearTimeout(idleTimer);if(win){if(win.isMinimized())win.restore();app.dock?.show();win.show();win.focus();updater?.windowShown();}}
function showError(error) { if (win) dialog.showMessageBox(win, { type: 'error', title: '览阅', message: error.message }); }
function releaseLater(){clearTimeout(idleTimer);idleTimer=setTimeout(()=>{if(win&&!win.isVisible())engine.stop().catch(()=>{});},60000);}
function endQuick(restoreFocus=true){if(!quickMode)return;quickMode=false;win?.webContents.send('command',{name:'end-quick'});if(!quickWasVisible){win?.hide();app.dock?.hide();releaseLater();}if(restoreFocus)integration?.restoreFocus();}
async function openPaths(paths, notify = false, quick = false) {
  if(!quick && quickMode)endQuick(false);
  if (!Array.isArray(paths) || paths.length > 500) throw new Error('一次最多打开 500 个文件。');
  const items = [], errors = [];
  for (const file of paths) { try { items.push(await broker.add(file)); } catch (error) { errors.push({ name: path.basename(String(file)), message: error.code === 'ENOENT' ? '文件已移动或删除' : error.message }); } }
  const result = { items, errors, quick };
  if (notify && win) win.webContents.send('files', result);
  return result;
}
function bind(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== index) throw new Error('拒绝访问');
    try { return { ok: true, value: await fn(...args) }; } catch (error) { return { ok: false, error: error.code === 'ENOENT' ? '文件已移动或删除，请重新选择。' : error.message }; }
  });
}
async function folderFiles(root) {
  const result = [];
  async function walk(dir) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || result.length >= 500) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) result.push(full);
    }
  }
  await walk(root); return result;
}
async function pickFiles() {
  const result = await dialog.showOpenDialog(win, { title: '打开文件', properties: ['openFile', 'multiSelections'] });
  return result.canceled ? { items: [], errors: [] } : openPaths(result.filePaths);
}
function createWindow() {
  win = new BrowserWindow({ title: '览阅', width: 1040, height: 740, minWidth: 480, minHeight: 360,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#fafafa', show: false, autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32' ? {titleBarOverlay:{color:nativeTheme.shouldUseDarkColors ? '#202020' : '#fafafa',symbolColor:nativeTheme.shouldUseDarkColors ? '#ddd' : '#333',height:44}} : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false, partition: 'lanyue' } });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (engine.origin && url.startsWith(engine.origin + '/')) {
      const preview = new BrowserWindow({ title: '览阅 · 预览', width: 1100, height: 760, parent: win,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'lanyue' } });
      preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      preview.webContents.on('will-navigate', (event, dest) => { if (!dest.startsWith(engine.origin + '/')) event.preventDefault(); });
      preview.loadURL(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => { if (url !== index) event.preventDefault(); });
  win.once('ready-to-show', () => {if(!background || queued.length)showWindow();else app.dock?.hide();});
  win.webContents.once('did-finish-load', () => { const paths = [...queued.splice(0), ...argsFiles(process.argv.slice(app.isPackaged ? 1 : 2))]; if (paths.length) {showWindow();openPaths(paths, true).catch(showError);} });
  win.webContents.once('did-finish-load', () => updater?.startupComplete().catch(showError));
  win.webContents.on('before-input-event',(event,input)=>{if(quickMode&&input.type==='keyDown'&&!input.control&&!input.meta&&!input.alt&&(input.key==='Escape'||input.key===' ')){event.preventDefault();endQuick();}});
  win.on('close',event=>{if(!quitting&&integration?.enabled){event.preventDefault();endQuick(false);win.hide();app.dock?.hide();releaseLater();}});
  win.loadURL(index);
  win.on('closed', () => { win = null; });
}
if (gotLock) app.whenReady().then(async () => {
  const data = app.getPath('userData');
  nativeTheme.themeSource = 'system';
  broker = new FileBroker(); await broker.start();
  const runtime = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : path.join(__dirname, '..', 'runtime', `${process.platform === 'darwin' ? 'mac' : 'win'}-${process.arch}`);
  engine = new Engine({ runtime, data, sourceOrigin: broker.origin, onStatus: state => win?.webContents.send('engine-status', state) });
  integration=new SystemIntegration({app,shell,dialog,runtime,data,onChange:()=>updateMenu(),onFailure:showError,onPreview:async paths=>{
    if(!win || win.webContents.isLoadingMainFrame())return;
    if(!quickMode)quickWasVisible=win.isVisible();
    quickMode=true;showWindow();await openPaths(paths,true,true);
  }});
  updater = new PortableUpdater({ app, net, dialog, shell, getWindow: () => win,
    canPrompt: () => !!win?.isVisible() && !quickMode && !quitting, onChange: () => updateMenu() });
  const ses = session.fromPartition('lanyue');
  ses.setPermissionRequestHandler((_, permission, callback) => callback(permission === 'fullscreen'));
  ses.setPermissionCheckHandler((_, permission) => permission === 'fullscreen');
  ses.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      const url = new URL(details.url);
      allowed = ['data:', 'blob:', 'devtools:'].includes(url.protocol) || details.url === 'about:blank' ||
        (url.protocol === 'file:' && details.url.startsWith(pathToFileURL(path.join(__dirname, 'ui') + path.sep).href)) ||
        url.origin === engine.origin || url.origin === broker.origin;
    } catch {}
    callback({ cancel: !allowed });
  });
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (engine.origin && details.url.startsWith(engine.origin + '/')) details.requestHeaders['X-LanYue-Token'] = engine.secret;
    callback({ requestHeaders: details.requestHeaders });
  });
  bind('state', () => ({ platform: process.platform }));
  bind('pick', pickFiles);
  bind('open-paths', paths => openPaths(paths));
  bind('preview', async id => {
    const file = broker.get(id); const fresh = await broker.add(file.path);
    currentFile=fresh;
    const origin = await engine.start();
    // Unique engine filename prevents collisions between same-named files and stale modified files.
    const unique = `${id.slice(0, 10)}-${Math.floor(fresh.modified)}-${file.name}`;
    const direct = 'obj 3ds stl ply off 3dm fbx dae wrl 3mf ifc glb o3dv gltf stp step iges brep fcstd bim'.split(' ').includes(file.extension);
    if (direct) {
      broker.previewOrigin = origin;
      const companions = await broker.companions(id);
      const urls = [fresh, ...companions].map(item => broker.url(item.id));
      return { url: `${origin}/website/index.html#model=${urls.join(',')}`, file: fresh };
    }
    const source = broker.url(id) + (direct ? '' : '?fullfilename=' + encodeFileName(unique));
    return { url: `${origin}/onlinePreview?url=${encodeURIComponent(Buffer.from(source).toString('base64'))}`, file: fresh };
  });
  const command = (name, extra = {}) => win?.webContents.send('command', {name, ...extra});
  bind('clear-cache', async () => {
    if (engine.starting) throw new Error('正在打开文件，请稍后清理。');
    await engine.stop(); await fsp.rm(path.join(data, 'cache'), { recursive: true, force: true });
    await fsp.mkdir(path.join(data, 'cache'), { recursive: true });
  });
  const openMenu = async () => { const result = await pickFiles(); win?.webContents.send('files', result); };
  const folderMenu = async () => {
    const result = await dialog.showOpenDialog(win, { title: '打开文件夹', properties: ['openDirectory'] });
    if(!result.canceled) await openPaths(await folderFiles(result.filePaths[0]), true);
  };
  const logs = async () => { const folder=path.join(data,'logs'); await fsp.mkdir(folder,{recursive:true}); await shell.openPath(folder); };
  const openItem = {label:'打开文件…',accelerator:'CmdOrCtrl+O',click:()=>openMenu().catch(showError)};
  const folderItem = {label:'打开文件夹…',accelerator:'CmdOrCtrl+Shift+O',click:()=>folderMenu().catch(showError)};
  const reloadItem = {label:'重新加载',accelerator:'CmdOrCtrl+R',click:()=>command('reload')};
  const closeItem = {label:'关闭预览',accelerator:'CmdOrCtrl+W',click:()=>quickMode?endQuick():command('close')};
  const clearItem = () => ({label:'清理缓存',enabled:!engine.starting,click:()=>command('clear-cache')});
  const logsItem = {label:'查看日志',click:()=>logs().catch(showError)};
  const aboutItem = {label:'关于览阅',click:async()=>{
    const result=await dialog.showMessageBox(win,{type:'info',title:'关于览阅',message:`览阅 ${app.getVersion()}`,detail:`本地文件预览 · Apache-2.0 开源\n\n${projectUrl}\n\n基于 kkFileView，第三方组件遵循各自许可证。`,buttons:['关闭','查看源码'],defaultId:0,cancelId:0,noLink:true});
    if(result.response===1)await shell.openExternal(projectUrl).catch(showError);
  }};
  const systemMenu=()=>({label:'系统集成',submenu:[
    {label:'默认打开方式…',click:()=>integration.associate(win,currentFile).catch(showError)},
    {label:'空格预览',type:'checkbox',checked:integration.enabled,click:async item=>{try{if(item.checked){const choice=await dialog.showMessageBox(win,{type:'info',message:'启用空格预览',detail:process.platform==='darwin'?'在 Finder 选中文件后按空格预览，再按空格或 Esc 关闭。首次使用需授权辅助功能和 Finder 自动化。关闭窗口后仍在后台运行，完全退出览阅后停止。':'在资源管理器选中文件后按空格预览，再按空格或 Esc 关闭。关闭窗口后仍在后台运行，完全退出览阅后停止。',buttons:['启用','取消'],cancelId:1,noLink:true});if(choice.response===0)await integration.startQuick(true);}else{endQuick();integration.stopQuick();}}catch(error){showError(error);}finally{updateMenu();}}},
    {label:'登录时启动',type:'checkbox',checked:integration.loginEnabled(),click:item=>{try{integration.setLogin(item.checked);}catch(error){showError(error);}}},
    ...(process.platform==='darwin'?[{label:'系统权限设置…',click:()=>shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility').catch(showError)}]:[])
  ]});
  bind('menu', state => {
    if(!Array.isArray(state?.opened) || state.opened.length>500)throw new Error('无效文件列表。');
    const files=state.opened.map(id=>broker.get(id));const current=state.current ? broker.get(state.current) : null;
    const menu=Menu.buildFromTemplate([
      openItem, folderItem,
      ...(files.length>1 ? [{label:'已打开的文件',submenu:files.map(file=>({label:file.name,type:'radio',checked:file.id===current?.id,click:()=>command('select',{id:file.id})}))}] : []),
      {type:'separator'}, {label:'预览工具',type:'checkbox',checked:!!state.tools,click:()=>command('tools')}, reloadItem,
      {label:'显示原文件',enabled:!!current,click:()=>current && shell.showItemInFolder(current.path)},
      closeItem,{type:'separator'},systemMenu(),clearItem(),logsItem,updater.menuItem(),aboutItem,{type:'separator'},{role:'quit',label:'退出览阅'}
    ]);
    menu.popup({window:win});
  });
  function updateMenu(){Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{label:'览阅',submenu:[aboutItem,updater.menuItem(),{type:'separator'},{role:'hide'},{role:'quit'}]}] : []),
    {label:'文件',submenu:[openItem,folderItem,{type:'separator'},reloadItem,closeItem,{type:'separator'},systemMenu(),clearItem(),logsItem,...(process.platform==='win32'?[updater.menuItem(),{role:'quit'}]:[])]},
    {label:'编辑',submenu:[{role:'copy'},{role:'selectAll'}]},
    {label:'视图',submenu:[{label:'预览工具',accelerator:'CmdOrCtrl+Shift+T',click:()=>command('tools')},{role:'togglefullscreen'}]}
  ]));}
  updateMenu();
  nativeTheme.on('updated',()=>{
    const color=nativeTheme.shouldUseDarkColors ? '#202020' : '#fafafa';win?.setBackgroundColor(color);
    if(process.platform==='win32')win?.setTitleBarOverlay({color,symbolColor:nativeTheme.shouldUseDarkColors ? '#ddd' : '#333'});
  });
  createWindow();
  updater.start();
  if(integration.settings.quickEnabled)integration.startQuick(false).catch(error=>{showWindow();showError(error);});
  else if(background)showWindow();
}).catch(error => { dialog.showErrorBox('览阅启动失败', error.message); app.quit(); });
app.on('window-all-closed', () => app.quit());
app.on('activate',()=>{if(win)showWindow();});
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); quitting = true;
  clearTimeout(idleTimer);integration?.stopQuick(false);
  Promise.allSettled([engine?.stop(), broker?.stop(), updater?.stop()]).finally(() => app.quit());
});
