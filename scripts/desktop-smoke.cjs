const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const output = path.join(root,'output/playwright');
(async () => {
  await fs.mkdir(output,{recursive:true});
  const data = await fs.mkdtemp(path.join(output,'profile-'));
  const env = {...process.env,LANYUE_TEST_DATA:data}; delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.LANYUE_APP || require('electron');
  const app = await electron.launch({ executablePath,args:process.env.LANYUE_APP ? [] : ['.'],cwd:root,env,timeout:30000 });
  const errors = [], results=[];
  try {
    const page = await app.firstWindow(); page.on('pageerror',error=>errors.push(error.message));
    await page.locator('#open').waitFor();
    assert.equal(await page.locator('button:visible').count(),1);
    assert.equal((await page.locator('body').innerText()).trim().replace(/\n+/g,'\n'),'打开文件\n或拖入文件');
    await page.screenshot({path:path.join(output,'01-home.png'),scale:'css'});
    await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='dark';});
    await page.screenshot({path:path.join(output,'02-dark.png'),scale:'css'});
    await app.evaluate(({nativeTheme})=>{nativeTheme.themeSource='light';});
    const fixtureDir = path.join(root,'vendor/kkFileView/tests/e2e/fixtures');
    const files = (process.env.LANYUE_SAMPLES || 'sample.txt,sample.pdf,sample.docx,sample.xlsx,sample.pptx,text.dxf,sample.stl,sample.zip,sample.mp4').split(',');
    // Exercise the OS second-instance open-file route, not internal renderer APIs.
    const second = spawn(executablePath,[...(process.env.LANYUE_APP ? [] : ['.']),...files.map(name=>path.join(fixtureDir,name))],{cwd:root,env,stdio:'ignore'});
    await new Promise((resolve,reject)=>{second.on('exit',resolve);second.on('error',reject);});
    if (process.env.LANYUE_CHECK_DOCK==='1') await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.webContents.setBackgroundThrottling(false);window.hide();});
    await page.locator('#preview:not(.hidden)').waitFor();
    for (let i=0;i<files.length;i++) {
      const name=files[i]; const start=Date.now();
      if (i) await page.getByRole('button',{name:'下一个文件',exact:true}).click();
      await page.locator('#viewer:not(.hidden)').waitFor({timeout:110000});
      if (name.match(/\.(dxf|dwg|igs)$/)) {
        const deadline = Date.now()+110000;
        while (Date.now()<deadline) { await page.waitForTimeout(1500); const text=await page.frames()[1]?.locator('body').innerText().catch(()=> '文件转换中'); if((await page.frames()[1]?.locator('#svg-container svg').count()) || (text && !text.includes('文件转换中'))) break; }
      } else await page.waitForTimeout(name.match(/\.(docx|pptx)$/) ? 6000 : name.match(/\.(stl|stp|iges)$/) ? 7000 : 1200);
      if (name === 'sample.zip') {
        const archive=page.frames()[1];
        assert.equal(await archive.locator('.preview-title-row .panel-title').isVisible(),false);
        assert.equal(await archive.locator('#treeSummary').isVisible(),false);
        assert.ok(!/\b[a-f0-9]{10}-[0-9]+-sample\.zip/.test(await archive.locator('#treeDemo').innerText()),'Archive names must not show internal cache IDs');
        await archive.getByText('inner.txt',{exact:true}).click();
        await page.waitForTimeout(1500);
        const nested=page.frames().find(frame=>frame.parentFrame()===archive);
        assert.ok((await nested.locator('body').innerText()).includes('kkFileView zip inner file'),'Archive file contents must render');
        await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(480,360));
        await page.waitForTimeout(200);
        const archiveFit=await archive.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,tree:document.querySelector('.tree-panel').getBoundingClientRect().right,preview:document.querySelector('.preview-panel').getBoundingClientRect().left}));
        assert.ok(archiveFit.scroll<=archiveFit.width && Math.abs(archiveFit.tree-archiveFit.preview)<2,'Archive must keep directory and preview side by side in a narrow window');
        await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1040,740));
      }
      if (name.match(/\.(stl|stp|iges|obj)$/)) {
        await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(item=>item.label==='视图').submenu.items.find(item=>item.label==='预览工具').click());
        const model=page.frames().find(frame=>frame.url().includes("/website/index.html"));
        await model.getByText('Triangles:',{exact:true}).waitFor({timeout:60000});
        const canvas=model.locator('canvas').first();const bounds=await canvas.boundingBox();
        assert.ok(bounds && bounds.width>100);
        await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
        await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+90,bounds.y+bounds.height/2+30,{steps:8});await page.mouse.up();
        await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(item=>item.label==='视图').submenu.items.find(item=>item.label==='预览工具').click());
      }
      if (name.match(/\.(dxf|dwg|igs)$/)) {
        const drawing=page.frames()[1]; await drawing.locator('#svg-container svg').waitFor({timeout:15000});
        const svg=await drawing.locator('#svg-container svg').evaluate(el=>({viewBox:el.getAttribute('viewBox'),width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,paths:el.querySelectorAll('path,line,polyline,text').length}));
        assert.ok(svg.width>10 && svg.paths>0);console.log('CAD',name,svg);
        await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(item=>item.label==='视图').submenu.items.find(item=>item.label==='预览工具').click());
        await drawing.getByTitle('放大',{exact:true}).click(); await drawing.getByTitle('重置视图',{exact:true}).click();
        await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(item=>item.label==='视图').submenu.items.find(item=>item.label==='预览工具').click());
      }
      const frames=[];
      assert.equal(await page.locator('#file-name').innerText(),name,'Preview must still show the requested file');
      if (name.match(/\.(docx|pptx|pdf)$/)) {
        await page.frameLocator('#viewer').frameLocator('iframe').locator('canvas').first().waitFor({timeout:30000});
      }
      if (name.match(/\.xlsx$/)) await page.frameLocator('#viewer').locator('canvas:visible').first().waitFor({timeout:30000});
      for(const frame of page.frames().slice(1)) {try {frames.push({url:frame.url().replace(/\?.*/, '?…'),text:(await frame.locator('body').innerText({timeout:1500})).slice(0,1500),canvases:await frame.locator('canvas').count()});}catch{}}
      results.push({name,ms:Date.now()-start,frames});
      if (i===0 && process.platform==='darwin' && process.env.LANYUE_CHECK_DOCK==='1') {
        const dock=JSON.parse(execFileSync('swift',[path.join(root,'scripts/check-dock.swift'),String(app.process().pid)],{encoding:'utf8'}));
        assert.equal(dock.hostPolicy,0,'The preview app must remain visible in Dock');
        assert.ok(dock.helpers.length>0,'Office must actually be running during the Dock check');
        assert.ok(dock.helpers.every(helper=>helper.policy!==0),'Office must not appear as a second Dock app');
        console.log('DOCK',JSON.stringify(dock));
      }
      if (process.env.LANYUE_CHECK_DOCK!=='1') await page.screenshot({path:path.join(output,`preview-${name}.png`)});
      console.log('PREVIEW',name,JSON.stringify(frames).slice(0,350));
    }
    if (process.env.LANYUE_CHECK_DOCK==='1') {
      await fs.writeFile(path.join(output,'desktop-results.json'),JSON.stringify({results,errors,dockChecked:true},null,2));
      console.log('UI ERRORS',errors); return;
    }
    await page.locator('#more').focus(); await page.keyboard.press('Escape');
    await page.locator('#empty:not(.hidden)').waitFor();
    assert.equal(await page.locator('button:visible').count(),1);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(480,360));
    await page.screenshot({path:path.join(output,'03-compact.png'),scale:'css'});
    const fit=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
    console.log('FIT',fit); assert.ok(fit.scrollWidth<=fit.width && fit.scrollHeight<=fit.height);
    await app.evaluate(({Menu})=>{const file=Menu.getApplicationMenu().items.find(item=>item.label==='文件');file.submenu.items.find(item=>item.label==='清理缓存').click();});
    await page.getByText('缓存已清理',{exact:true}).waitFor({timeout:15000});
    assert.deepEqual(await fs.readdir(path.join(data,'cache')),[]);
    assert.equal(await fs.access(path.join(data,'preferences.json')).then(()=>true,()=>false),false,'No recent history should be persisted');
    await fs.writeFile(path.join(output,'desktop-results.json'),JSON.stringify({results,errors,fit},null,2));
    console.log('UI ERRORS',errors);
  } catch(error) {await (await app.firstWindow()).screenshot({path:path.join(output,'failure.png'),scale:'css'}).catch(()=>{});throw error;} finally {await fs.writeFile(path.join(output,'latest-results.json'),JSON.stringify({results,errors,data},null,2));await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
