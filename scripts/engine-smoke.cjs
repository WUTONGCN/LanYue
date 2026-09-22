const fs = require('node:fs/promises');
const path = require('node:path');
const { Engine } = require('../app/lib/engine.cjs');
const { FileBroker } = require('../app/lib/files.cjs');
const root = path.resolve(__dirname,'..');
(async () => {
  const broker = new FileBroker(); await broker.start();
  const data = path.join(root,'output/engine-smoke');
  const engine = new Engine({runtime:path.join(root,'runtime/mac-arm64'), data, sourceOrigin:broker.origin, onStatus:console.log});
  try {
    const origin = await engine.start();
    console.log('Unauthenticated health:',(await fetch(origin+'/actuator/health')).status);
    const results = [];
    for (const name of ['sample.txt','sample.pdf','sample.png','sample.zip','sample.rar','sample.7z','text.dxf']) {
      const file = await broker.add(path.join(root,'vendor/kkFileView/tests/e2e/fixtures',name));
      const url = origin+'/onlinePreview?url='+encodeURIComponent(Buffer.from(broker.url(file.id)).toString('base64'));
      const result = await fetch(url,{headers:{'X-LanYue-Token':engine.secret}}); const text = await result.text();
      await fs.writeFile(path.join(data,name+'.html'),text);
      results.push({name,status:result.status,unsupported:/不支持|预览失败|无法预览|发生错误/.test(text),bytes:text.length});
    }
    console.log(JSON.stringify(results,null,2));
    await fs.writeFile(path.join(data,'results.json'),JSON.stringify(results,null,2));
  } finally { await engine.stop(); await broker.stop(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
