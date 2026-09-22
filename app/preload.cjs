const { contextBridge, ipcRenderer, webUtils } = require('electron');
if (process.isMainFrame) contextBridge.exposeInMainWorld('desktop', {
  state: () => ipcRenderer.invoke('state'),
  pick: () => ipcRenderer.invoke('pick'),
  dropped: files => {
    if (!Array.isArray(files) || !files.length) return Promise.resolve({ok:false,error:'没有接收到文件，请重新拖入。'});
    const paths = files.map(file => webUtils.getPathForFile(file)).filter(Boolean);
    if (!paths.length) return Promise.resolve({ok:false,error:'无法读取拖入文件的位置，请使用“打开文件”。'});
    return ipcRenderer.invoke('open-paths', paths);
  },
  preview: id => ipcRenderer.invoke('preview', id),
  menu: state => ipcRenderer.invoke('menu', state),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  onFiles: fn => { const cb = (_, items) => fn(items); ipcRenderer.on('files', cb); return () => ipcRenderer.removeListener('files', cb); },
  onStatus: fn => { const cb = (_, status) => fn(status); ipcRenderer.on('engine-status', cb); return () => ipcRenderer.removeListener('engine-status', cb); },
  onCommand: fn => { const cb = (_, command) => fn(command); ipcRenderer.on('command', cb); return () => ipcRenderer.removeListener('command', cb); }
});
