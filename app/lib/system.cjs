const fs=require('node:fs'),path=require('node:path'),{spawn,execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile);
class SystemIntegration {
  constructor({app,shell,dialog,runtime,data,onPreview,onChange,onFailure}) {
    Object.assign(this,{app,shell,dialog,onPreview,onChange,onFailure});
    this.binary=path.join(runtime,'tools',process.platform==='darwin'?'LanYueSystem':'LanYueSystem.exe');
    this.settingsPath=path.join(data,'system.json');
    try{this.settings=JSON.parse(fs.readFileSync(this.settingsPath,'utf8'));}catch{this.settings={};}
    this.enabled=false;
    this.extensions=[...new Set(require('../ui/formats.json').flatMap(group=>group.extensions))].filter(ext=>/^[a-z0-9-]+$/.test(ext));
  }
  save(){fs.mkdirSync(path.dirname(this.settingsPath),{recursive:true});fs.writeFileSync(this.settingsPath,JSON.stringify(this.settings,null,2),{mode:0o600});}
  async associate(window,current) {
    if(!this.app.isPackaged)throw new Error('请在完整便携版中设置默认打开方式。');
    if(process.platform==='win32'){
      await run(this.binary,['--register',process.execPath,...this.extensions],{windowsHide:true,timeout:30000});
      await this.shell.openExternal('ms-settings:defaultapps?registeredAppUser=LanYue');
      return;
    }
    const extension=current?.extension;
    const one=extension&&this.extensions.includes(extension);
    const buttons=one?[`所有 .${extension} 文件`,'全部支持的类型','取消']:['全部支持的类型','取消'];
    const {response}=await this.dialog.showMessageBox(window,{type:'question',title:'默认打开方式',message:'双击哪些文件时使用览阅？',detail:'按文件类型设置后，同类文件都会使用览阅打开。移动便携版的位置后，需要重新设置。',buttons,defaultId:0,cancelId:buttons.length-1,noLink:true});
    if(response===buttons.length-1)return;
    const types=one&&response===0?[extension]:this.extensions;
    const bundle=path.resolve(process.execPath,'../../..');
    const {stdout}=await run(this.binary,['--associate',bundle,...types],{timeout:300000,maxBuffer:1024*1024});
    const result=JSON.parse(stdout.trim().split('\n').at(-1));
    await this.dialog.showMessageBox(window,{type:result.failed?.length?'warning':'info',message:result.failed?.length?'部分类型尚未设置':'默认打开方式已设置',detail:result.failed?.length?`以下类型请通过 Finder「显示简介 → 打开方式」设置：${result.failed.join('、')}`:'以后双击这些类型的文件，就会用览阅打开。'});
  }
  async startQuick(prompt=false){
    if(this.child)return;
    await new Promise((resolve,reject)=>{
      const child=spawn(this.binary,['--watch',...(prompt?['--prompt']:[])],{stdio:['pipe','pipe','pipe'],windowsHide:true});this.child=child;
      child.stdout.setEncoding('utf8');
      let buffer='',ready=false,settled=false;
      const timer=setTimeout(()=>fail(new Error('空格预览未能启动，请重新启用。')),12000);
      const fail=error=>{if(settled)return;settled=true;clearTimeout(timer);this.stopQuick(false);reject(error);};
      child.stderr.on('data',()=>{});
      child.stdout.on('data',chunk=>{
        buffer+=chunk.toString('utf8');if(buffer.length>1024*1024)return fail(new Error('空格预览响应异常。'));
        let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let message;try{message=JSON.parse(line);}catch{continue;}
          if(message.type==='ready'){ready=true;settled=true;clearTimeout(timer);this.enabled=true;this.settings.quickEnabled=true;this.save();this.onChange();resolve();}
          else if(message.type==='preview'&&ready&&Array.isArray(message.paths)&&message.paths.length<=500&&message.paths.every(p=>typeof p==='string'&&path.isAbsolute(p))){Promise.resolve(this.onPreview(message.paths)).catch(this.onFailure);}
          else if(message.type==='permission'||message.type==='error'){
            const error=new Error(message.type==='permission'?(message.permission==='automation'?'请在系统设置「隐私与安全性 → 自动化」中允许览阅控制 Finder，再重新启用空格预览。':'请在系统设置「隐私与安全性 → 辅助功能」中允许览阅（或 LanYueSystem），再重新启用空格预览。'):(message.message||'空格预览不可用。'));
            error.permission=message.permission;
            if(!ready)fail(error);else{this.stopQuick();this.onFailure(error);}
          }
        }
      });
      child.on('error',fail);
      child.on('exit',()=>{if(this.child!==child)return;this.child=null;this.enabled=false;this.onChange();if(!ready)fail(new Error('空格预览组件已退出。'));else this.onFailure(new Error('空格预览已停止，请在菜单中重新启用。'));});
    });
  }
  stopQuick(persist=true){const child=this.child;this.child=null;this.enabled=false;if(child){child.stdin.end();child.kill();}if(persist){this.settings.quickEnabled=false;this.save();}this.onChange();}
  restoreFocus(){if(this.child?.stdin.writable)this.child.stdin.write('restore\n');}
  loginEnabled(){return this.app.getLoginItemSettings({path:process.execPath,args:['--background']}).openAtLogin;}
  setLogin(enabled){if(!this.app.isPackaged)throw new Error('请在完整便携版中设置。');this.app.setLoginItemSettings({openAtLogin:enabled,path:process.execPath,args:['--background']});this.onChange();}
}
module.exports={SystemIntegration};
