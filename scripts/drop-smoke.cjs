const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
(async()=>{
  const output=path.join(root,'output/drop'); await fs.mkdir(output,{recursive:true});
  const data=await fs.mkdtemp(path.join(output,'profile-'));
  const env={...process.env,LANYUE_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  const app=await electron.launch({executablePath:process.env.LANYUE_APP||require('electron'),args:process.env.LANYUE_APP?[]:['.'],cwd:root,env});
  const records=[];
  try {
    const page=await app.firstWindow(); await page.locator('#open').waitFor();
    if(process.env.LANYUE_QUIET_TEST==='1') await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.webContents.setBackgroundThrottling(false);window.hide();});
    page.on('pageerror',error=>console.log('PAGE ERROR',error.message));
    const cdp=await page.context().newCDPSession(page);
    async function drop(files,x=500,y=350) {
      const paths=files.map(name=>path.isAbsolute(name)?name:path.join(root,'vendor/kkFileView/tests/e2e/fixtures',name));
      if(process.env.LANYUE_QUIET_TEST==='1') {
        const frame=page.frames().filter(frame=>frame.url().startsWith('http://127.0.0.1:')).at(-1)||page.mainFrame();
        await frame.evaluate(()=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.id='drop-test-input';input.hidden=true;document.body.appendChild(input);});
        const input=frame.locator('#drop-test-input');await input.setInputFiles(paths);
        await input.evaluate(element=>{const dataTransfer=new DataTransfer();for(const file of element.files)dataTransfer.items.add(file);for(const type of ['dragenter','dragover','drop']) document.body.dispatchEvent(new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer}));element.remove();});
        return;
      }
      const data={items:[],files:paths,dragOperationsMask:1};
      for(const type of ['dragEnter','dragOver','drop']) await cdp.send('Input.dispatchDragEvent',{type,x,y,data});
    }
    const cases=process.env.LANYUE_DROP_FILES ? JSON.parse(process.env.LANYUE_DROP_FILES) : [['中文 & 预览.txt'],['sample.pdf'],['sample.txt','sample.stl'],['sample.stl'],['sample.txt']];
    for (const files of cases) {
      await drop(files);
      await page.waitForFunction(name=>document.getElementById('file-name').textContent===name,path.basename(files[0]),{timeout:12000});
      await page.locator('#viewer:not(.hidden)').waitFor({timeout:110000});
      if(files[0].endsWith('.txt')) await page.frameLocator('#viewer').getByText('0.kkFileView e2e sample text',{exact:false}).waitFor({timeout:15000});
      else if(files[0].endsWith('.stl')) {await page.frameLocator('#viewer').locator('canvas').waitFor({timeout:30000});await page.waitForTimeout(3000);}
      else if(files[0].endsWith('.rar') && process.env.LANYUE_ARCHIVE_MEMBER) {
        const archive=page.frameLocator('#viewer');
        await archive.locator('#treeDemo li').first().waitFor({timeout:30000});
        const member=archive.getByText(process.env.LANYUE_ARCHIVE_MEMBER,{exact:true});
        for(let depth=0;depth<20 && !(await member.count());depth++) {
          const folder=archive.locator('#treeDemo [id$="_switch"][class*="_close"]').first();
          if(!(await folder.count())) break;
          await folder.evaluate(element=>element.click());
        }
        await member.evaluate(element=>element.click());
        const pdf=archive.frameLocator('#previewFrame').frameLocator('iframe');
        await pdf.locator('canvas:visible').first().waitFor({timeout:60000});
        assert.ok(!(await pdf.locator('body').innerText()).includes('此条目是压缩包中的文件链接'),'A regular RAR entry must display its original document');
      }
      else await page.frameLocator('#viewer').frameLocator('iframe').locator('canvas').first().waitFor({timeout:30000});
      records.push({files,passed:true});
      console.log('DROP PASS',JSON.stringify(files));
    }
    if(cases.flat().length>1) assert.equal(await page.locator('#navigation').isVisible(),true);
    assert.equal(await page.locator('#drop-overlay').isVisible(),false);
    if(process.env.LANYUE_QUIET_TEST!=='1') await page.screenshot({path:path.join(output,'preview.png')});
  } catch(error) {
    const page=await app.firstWindow(); console.log('TITLE',await page.locator('#file-name').innerText());
    await fs.writeFile(path.join(output,'failure-frames.json'),JSON.stringify(await Promise.all(page.frames().map(async frame=>({url:frame.url(),body:await frame.locator('body').innerText().catch(()=>'' )}))),null,2));
    if(process.env.LANYUE_QUIET_TEST!=='1') await page.screenshot({path:path.join(output,'failure.png')}); throw error;
  } finally {
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify(records,null,2)); await app.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
