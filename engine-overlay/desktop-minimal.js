(() => {
  const signalFileDrag = () => {if(parent!==window) parent.postMessage({type:'lanyue-file-drag'},'*');};
  for(const type of ['dragenter','dragover']) window.addEventListener(type,event=>{
    if(parent!==window && event.dataTransfer?.types.includes('Files')) {event.preventDefault();event.stopImmediatePropagation();signalFileDrag();}
  },true);
  window.addEventListener('drop',event=>{
    if(parent!==window && event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();event.stopImmediatePropagation();
      parent.postMessage({type:'lanyue-file-drop',files:Array.from(event.dataTransfer.files)},'*');
    }
  },true);
  window.addEventListener('message',event=>{
    if(![...document.querySelectorAll('iframe')].some(frame=>frame.contentWindow===event.source)) return;
    if(event.data?.type==='lanyue-file-drag') signalFileDrag();
    if(event.data?.type==='lanyue-file-drop' && Array.isArray(event.data.files)) parent.postMessage(event.data,'*');
  });
  let visible = parent === window;
  const path = location.pathname;
  const kind = path.includes('/website/') ? 'model' : path.includes('/pdfjs/') ? 'pdf' : path.includes('/ofd/') ? 'ofd' : 'document';
  document.documentElement.dataset.lanyuePreview = kind;
  const style = document.createElement('style');
  style.textContent = `
    html:not(.lanyue-tools)[data-lanyue-preview=model] #header,
    html:not(.lanyue-tools)[data-lanyue-preview=model] #main_left_container,
    html:not(.lanyue-tools)[data-lanyue-preview=model] #main_right_container,
    html:not(.lanyue-tools)[data-lanyue-preview=pdf] #toolbarContainer,
    html:not(.lanyue-tools)[data-lanyue-preview=pdf] #sidebarContainer,
    html:not(.lanyue-tools)[data-lanyue-preview=ofd] .el-header,
    html:not(.lanyue-tools)[data-lanyue-preview=document] .panel-heading,
    html:not(.lanyue-tools)[data-lanyue-preview=document] .img-preview,
    html:not(.lanyue-tools)[data-lanyue-preview=document] #container .controls,
    html:not(.lanyue-tools)[data-lanyue-preview=document] #container .zoom-display {display:none!important}
    html:not(.lanyue-tools)[data-lanyue-preview=pdf] #mainContainer {left:0!important;inset-inline-start:0!important}
    html:not(.lanyue-tools)[data-lanyue-preview=pdf] #viewerContainer {top:0!important}
    .compress-page .preview-title-row .panel-title,
    .compress-page #treeStatus,
    .compress-page #treeSummary,
    .compress-page #previewStatus,
    .compress-page .preview-card p,
    .compress-page .preview-tips {display:none!important}
    .compress-page .workspace,.compress-page .tree-panel,
    .compress-page .panel-header,.compress-page .preview-panel-body {background:#fafafa!important;box-shadow:none!important;backdrop-filter:none!important}
    .compress-page .panel-header {padding:10px 14px!important;min-height:36px;box-sizing:border-box}
    .compress-page .panel-title {font-size:13px;font-weight:500}
    .compress-page #toggleTreePanel {display:inline-flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;height:28px;min-width:0;padding:0;border:0;border-radius:5px;background:transparent;box-shadow:none;color:#777;font-size:0;transition:background-color .15s,color .15s}
    .compress-page #toggleTreePanel span {display:none}
    .compress-page #toggleTreePanel::before {content:"";width:18px;height:18px;background:currentColor;mask:center/contain no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='16' rx='2'/%3E%3Cpath d='M9 4v16m7-11-3 3 3 3'/%3E%3C/svg%3E")}
    .compress-page #toggleTreePanel:hover {background:rgba(0,0,0,.05);color:#333}
    .compress-page #toggleTreePanel:focus {outline:none}
    .compress-page #toggleTreePanel:focus-visible {outline:2px solid #999;outline-offset:2px}
    .compress-page .is-tree-collapsed #toggleTreePanel::before {mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='16' rx='2'/%3E%3Cpath d='M9 4v16m4-11 3 3-3 3'/%3E%3C/svg%3E")}
    .compress-page .is-tree-collapsed .tree-panel .panel-header {padding:10px!important;justify-content:center}
    .compress-page .preview-card {border:0;background:none;box-shadow:none;padding:0}
    .compress-page .preview-card h3 {font-size:14px;font-weight:400;color:#888;margin:0}
    .compress-page,.compress-page .workspace {height:100vh;min-height:0!important}
    .compress-page .workspace {grid-template-columns:min(240px,35vw) minmax(0,1fr)!important}
    .compress-page .workspace.is-tree-collapsed {grid-template-columns:48px minmax(0,1fr)!important}
    .compress-page .panel-header {flex-direction:row!important;flex-shrink:0}
    .compress-page .tree-panel-body {padding:8px;overflow:auto}
    .compress-page .tree-shell {min-height:0;border:0;border-radius:0;padding:0;background:none}
    .compress-page .preview-frame,.compress-page .preview-placeholder {min-height:0!important}
    .compress-page .is-tree-collapsed .tree-header-main {display:none!important}
    html[data-lanyue-preview=document] body:has(#textData) .container {width:100%;padding:0}
    html[data-lanyue-preview=document] body:has(#textData) .panel {border:0;box-shadow:none;margin:0}
    html[data-lanyue-preview=document] #divPagenation:empty {display:none}
  `;
  document.head.appendChild(style);
  function apply() {
    document.documentElement.classList.toggle('lanyue-tools', visible);
    for (const frame of document.querySelectorAll('iframe')) frame.contentWindow?.postMessage({type:'lanyue-tools',visible},location.origin);
    window.dispatchEvent(new Event('resize'));
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'lanyue-tools' || typeof event.data.visible !== 'boolean') return;
    visible = event.data.visible; apply();
  });
  window.addEventListener('load', () => {apply(); for(const frame of document.querySelectorAll('iframe')) frame.addEventListener('load',apply);});
})();
