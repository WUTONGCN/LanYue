const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const asar=require('@electron/asar');
(async()=>{
 const results=[];
 for(const [target,dir,resources] of [['mac-arm64','dist/mac-arm64/LanYue.app','Contents/Resources'],['win-x64','dist/win-unpacked','resources']]){
  const base=path.join(root,dir),res=path.join(base,resources),runtime=path.join(res,'runtime');
  const metadata=JSON.parse(fs.readFileSync(path.join(runtime,'engine/upstream.json')));
  if(metadata.platform!==target)throw new Error('Native engine target mismatch');
  const java=path.join(runtime,'java/bin',target.startsWith('mac')?'java':'java.exe');
  const data=fs.readFileSync(java);
  if(target.startsWith('mac')){if(data.readUInt32LE(4)!==0x0100000c)throw new Error('Expected ARM64 Java');}
  else{const offset=data.readUInt32LE(0x3c);if(data.readUInt16LE(offset+4)!==0x8664)throw new Error('Expected x64 Java');}
  const appFile=path.join(res,'app.asar');
  for (const file of ['app/main.cjs','app/preload.cjs','app/lib/files.cjs','app/lib/engine.cjs','app/ui/renderer.js','app/ui/index.html','app/ui/style.css']) {
    if(!asar.extractFile(appFile,file).equals(fs.readFileSync(path.join(root,file))))throw new Error('Packaged app source is stale: '+file);
  }
  if(JSON.parse(asar.extractFile(appFile,'package.json')).version!==require('../package.json').version)throw new Error('Packaged app version is stale');
  for(const file of ['engine/kkFileView.jar','engine/application.properties','java/release',...(target.startsWith('mac')?['office/LibreOffice.app/Contents/Info.plist','tools/7zz','tools/7zip-source.json','licenses/7zip-LICENSE.txt']:[])]){
   const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
   if(digest(path.join(runtime,file))!==digest(path.join(root,'runtime',target,file)))throw new Error('Packaged runtime differs: '+target+'/'+file);
  }
  results.push({target,engine:metadata,java:fs.readFileSync(path.join(runtime,'java/release'),'utf8').split('\n').filter(x=>/JAVA_VERSION=|OS_ARCH=|IMPLEMENTOR=/.test(x))});
 }
 fs.writeFileSync(path.join(root,'output/package-verification.json'),JSON.stringify(results,null,2));console.log('Both package contents match source/runtime; Java machine architectures verified. This does not execute Windows.');
})().catch(e=>{console.error(e);process.exitCode=1;});
