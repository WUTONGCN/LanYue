const $ = id => document.getElementById(id);
let opened = [], current = null, generation = 0, dragDepth = 0, toastTimer, toolsVisible = false;
let quickSnapshot = null;
async function call(promise) { const result = await promise; if (!result.ok) throw new Error(result.error); return result.value; }
function toast(text) { $('toast').textContent = text; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 4500); }
function safely(fn) { return async (...args) => { try { await fn(...args); } catch (error) { toast(error.message); } }; }
function dropActive(active) {document.body.classList.toggle('file-drag',active);$('drop-overlay').classList.toggle('hidden',!active);if(!active)dragDepth=0;}
window.addEventListener('message',safely(async event=>{
  const source=$('viewer').getAttribute('src');
  if(event.source!==$('viewer').contentWindow || !source || event.origin!==new URL(source).origin) return;
  if(event.data?.type==='lanyue-file-drag') dropActive(true);
  if(event.data?.type==='lanyue-file-drop') {dropActive(false);await receive(await call(window.desktop.dropped(event.data.files)));}
}));
function header() {
  $('file-name').textContent = current?.name || ''; $('file-name').title = current?.name || '';
  $('navigation').classList.toggle('hidden', opened.length < 2 || !current);
  const index = opened.findIndex(file => file.id === current?.id);
  $('previous').disabled = index <= 0; $('next').disabled = index >= opened.length - 1;
}
function sendTools() {const url=$('viewer').getAttribute('src');if(url && url!=='about:blank') $('viewer').contentWindow.postMessage({type:'lanyue-tools',visible:toolsVisible},new URL(url).origin);}
function closeAll() { dropActive(false); generation++; opened = []; current = null; $('viewer').src = 'about:blank'; $('preview').classList.add('hidden'); $('empty').classList.remove('hidden'); header(); }
function closeCurrent() { const index = opened.findIndex(file => file.id === current?.id); opened = opened.filter(file => file.id !== current?.id); if (opened.length) show(opened[Math.min(index, opened.length - 1)]); else closeAll(); }
async function receive(result) {
  if (result.errors?.length) toast(result.errors.map(error => `${error.name}：${error.message}`).join('；'));
  if (!result.items.length) return;
  if(result.quick){if(!quickSnapshot)quickSnapshot={opened:[...opened],current};opened=[];}
  for (const file of result.items) { opened = opened.filter(old => old.id !== file.id); opened.push(file); }
  await show(result.items[0]);
}
async function show(file) {
  const request = ++generation; current = file; toolsVisible = false; header();
  $('empty').classList.add('hidden'); $('preview').classList.remove('hidden'); $('viewer').classList.add('hidden'); $('viewer').src = 'about:blank';
  $('error').classList.add('hidden'); $('loading').classList.remove('hidden'); $('loading-message').textContent = '正在打开…';
  try {
    const result = await call(window.desktop.preview(file.id));
    if (request !== generation) return;
    $('viewer').onload = () => { if (request !== generation || $('viewer').getAttribute('src') === 'about:blank') return; $('loading').classList.add('hidden'); $('viewer').classList.remove('hidden'); sendTools(); };
    $('viewer').src = result.url;
  } catch (error) { if (request !== generation) return; $('loading').classList.add('hidden'); $('error').classList.remove('hidden'); $('error-message').textContent = error.message; }
}
$('open').onclick = safely(async () => receive(await call(window.desktop.pick())));
$('retry').onclick = () => current && show(current);
$('previous').onclick = () => { const i = opened.findIndex(file => file.id === current?.id); if (i > 0) show(opened[i - 1]); };
$('next').onclick = () => { const i = opened.findIndex(file => file.id === current?.id); if (i < opened.length - 1) show(opened[i + 1]); };
$('more').onclick = safely(() => call(window.desktop.menu({current:current?.id,opened:opened.map(file=>file.id),tools:toolsVisible})));
window.desktop.onFiles(safely(receive));
window.desktop.onStatus(status => { if (status.phase === 'starting') $('loading-message').textContent = '首次打开，请稍候…'; });
window.desktop.onCommand(safely(async command => {
  if(command.name==='end-quick'){const snapshot=quickSnapshot;quickSnapshot=null;closeAll();if(snapshot){opened=snapshot.opened;if(snapshot.current)await show(snapshot.current);}}
  if (command.name === 'tools') {toolsVisible=!toolsVisible;sendTools();}
  if (command.name === 'select') { const file = opened.find(file=>file.id === command.id); if(file) await show(file); }
  if (command.name === 'reload' && current) await show(current);
  if (command.name === 'close') { if(current)closeCurrent(); else window.close(); }
  if (command.name === 'clear-cache') { closeAll(); await call(window.desktop.clearCache()); toast('缓存已清理'); }
}));
document.addEventListener('keydown', event => { if (event.key === 'Escape') {event.preventDefault();if(document.body.classList.contains('file-drag'))dropActive(false);else closeAll();} });
document.addEventListener('dragenter', event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) {dragDepth++;dropActive(true);} });
document.addEventListener('dragover', event => { event.preventDefault(); if(event.dataTransfer)event.dataTransfer.dropEffect='copy'; });
document.addEventListener('dragleave', event => {event.preventDefault();if(--dragDepth<=0)dropActive(false);});
document.addEventListener('drop', safely(async event => {event.preventDefault();dropActive(false);await receive(await call(window.desktop.dropped(Array.from(event.dataTransfer.files))));}));
window.addEventListener('blur',()=>dropActive(false));
document.addEventListener('dragend',()=>dropActive(false));
safely(async()=>{const state=await call(window.desktop.state());document.body.classList.toggle('windows',state.platform==='win32');})();
