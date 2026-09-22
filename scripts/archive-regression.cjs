const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {Engine}=require('../app/lib/engine.cjs');
const {FileBroker}=require('../app/lib/files.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
  const data=await fs.mkdtemp(path.join(root,'output/archive-regression-'));
  const broker=new FileBroker();await broker.start();
  const engine=new Engine({runtime:path.join(root,'runtime/mac-arm64'),data,sourceOrigin:broker.origin});
  const cache=path.join(data,'cache',require('../package.json').version);
  async function walk(dir){const result=[];for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())result.push(...await walk(file));else result.push(file);}return result;}
  try{
    const origin=await engine.start();
    async function preview(file){const item=await broker.add(file);const response=await fetch(origin+'/onlinePreview?url='+encodeURIComponent(Buffer.from(broker.url(item.id)).toString('base64')),{headers:{'X-LanYue-Token':engine.secret}});assert.equal(response.status,200);return response.text();}
    await preview(path.join(root,'vendor/kkFileView/tests/e2e/fixtures/sample.rar'));
    const files=await walk(cache);
    const link=files.find(file=>path.basename(file)==='testlink');assert.ok(link);
    assert.equal((await fs.lstat(link)).isSymbolicLink(),false);
    assert.match(await fs.readFile(link,'utf8'),/此条目是压缩包中的文件链接/);
    const regular=files.find(file=>path.basename(file)==='test.txt');assert.ok(regular);
    assert.equal((await fs.readFile(regular)).length,20);
    // A real tar header exercises the native listing and extraction path guard.
    const header=Buffer.alloc(512);header.write('../../lanyue-escape.txt');
    header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
    header.write('00000000004\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header[156]=48;
    header.write('ustar\0',257);header.write('00',263);
    header.write([...header].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);
    const payload=Buffer.alloc(512);payload.write('test');
    const archive=path.join(data,'unsafe.tar');await fs.writeFile(archive,Buffer.concat([header,payload,Buffer.alloc(1024)]));
    const html=await preview(archive);assert.match(html,/无法处理|无法预览|不支持/);
    assert.ok(!(await walk(data)).some(file=>path.basename(file)==='lanyue-escape.txt'));
    await fs.writeFile(path.join(root,'output/archive-regression.json'),JSON.stringify({realRarFile:true,realLinkExcluded:true,traversalRejected:true},null,2));
    console.log('PASS: regular RAR content, true link exclusion, archive traversal rejection');
  }finally{await engine.stop();await broker.stop();}
})().catch(error=>{console.error(error);process.exitCode=1;});
