const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { FileBroker, encodeFileName } = require('../app/lib/files.cjs');
test('Chinese and URL-special filenames retain identity through the engine URL', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lanyue-names-')),broker=new FileBroker();
  try {
    await broker.start();
    for(const name of ["中文 (10)(1).docx","a!b'c~d*e%20+&.txt"]){
      const file=path.join(dir,name);await fs.writeFile(file,'unchanged');const item=await broker.add(file);
      const url=broker.url(item.id)+'?fullfilename='+encodeFileName(name);
      assert.equal(await (await fetch(url)).text(),'unchanged');
      assert.equal(new URL(url).searchParams.get('fullfilename'),name);
      assert.doesNotMatch(new URL(url).pathname,/[!'()*~]/);
    }
  } finally {await broker.stop();await fs.rm(dir,{recursive:true,force:true});}
});
test('selected files stay read-only; access is capability-scoped; range requests work', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'lanyue-test-')); const broker = new FileBroker();
  try {
    const file = path.join(dir,'中文 & 测试.txt'); await fs.writeFile(file,'0123456789');
    const item = await broker.add(file); await broker.start();
    const url = broker.url(item.id);
    assert.equal(await (await fetch(url)).text(),'0123456789');
    const range = await fetch(url,{headers:{Range:'bytes=2-5'}}); assert.equal(range.status,206); assert.equal(await range.text(),'2345');
    assert.equal(await (await fetch(url,{headers:{Range:'bytes=-3'}})).text(),'789');
    assert.equal((await fetch(url,{headers:{Range:'bytes=30-40'}})).status,416);
    assert.equal((await fetch(url,{method:'DELETE'})).status,405);
    assert.equal((await fetch(broker.origin+'/source/no-token/test.txt')).status,404);
    assert.equal((await fetch(url.replace(encodeURIComponent(item.name),'other.txt'))).status,404);
    assert.equal(await fs.readFile(file,'utf8'),'0123456789');
    await fs.unlink(file); assert.equal((await fetch(url)).status,404);
  } finally { await broker.stop(); await fs.rm(dir,{recursive:true,force:true}); }
});
test('same names in separate folders have separate identities; symlink replacement cannot escape', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'lanyue-test-')); const broker = new FileBroker();
  try {
    for (const sub of ['a','b']) { await fs.mkdir(path.join(dir,sub)); await fs.writeFile(path.join(dir,sub,'same.txt'),sub); }
    const a = await broker.add(path.join(dir,'a/same.txt')); const b = await broker.add(path.join(dir,'b/same.txt'));
    assert.notEqual(a.id,b.id); await broker.start();
    await fs.unlink(a.path); await fs.symlink(b.path,a.path);
    assert.equal((await fetch(broker.url(a.id))).status,403);
  } finally { await broker.stop(); await fs.rm(dir,{recursive:true,force:true}); }
});
test('model dependencies are followed inside the selected folder only', async () => {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lanyue-model-')), broker=new FileBroker();
  try {
    await fs.writeFile(path.join(dir,'model.obj'),'mtllib material.mtl\n');
    await fs.writeFile(path.join(dir,'material.mtl'),'newmtl red\nmap_Kd texture.png\nmap_Ks ../../secret.png\n');
    await fs.writeFile(path.join(dir,'texture.png'),'fixture');
    const file=await broker.add(path.join(dir,'model.obj'));
    assert.deepEqual((await broker.companions(file.id)).map(f=>f.name),['material.mtl','texture.png']);
    await fs.writeFile(path.join(dir,'model.gltf'),JSON.stringify({buffers:[{uri:'mesh.bin'},{uri:'https://example.com/private.bin'}],images:[{uri:'texture.png'}]}));
    await fs.writeFile(path.join(dir,'mesh.bin'),'fixture');
    const gltf=await broker.add(path.join(dir,'model.gltf'));
    assert.deepEqual((await broker.companions(gltf.id)).map(f=>f.name),['mesh.bin','texture.png']);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
