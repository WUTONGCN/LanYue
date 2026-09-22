const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Engine}=require('../app/lib/engine.cjs');
test('closing during asynchronous engine preparation does not spawn an orphan',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lanyue-close-'));
 try {
  const runtime=path.join(dir,'runtime');
  for(const folder of ['java/bin','engine',process.platform==='darwin'?'office/LibreOffice.app/Contents':'office/LibreOffice'])await fs.mkdir(path.join(runtime,folder),{recursive:true});
  await fs.writeFile(path.join(runtime,'java/bin',process.platform==='win32'?'java.exe':'java'),'invalid executable');
  await fs.writeFile(path.join(runtime,'engine/kkFileView.jar'),'fixture');
  await fs.writeFile(path.join(runtime,'engine/application.properties'),'');
  const engine=new Engine({runtime,data:path.join(dir,'data'),sourceOrigin:'http://127.0.0.1:1'});
  const pending=engine.start();const rejected=assert.rejects(pending,/取消/);await engine.stop();await rejected;
  assert.equal(engine.child,undefined);assert.equal(engine.state.phase,'idle');
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
