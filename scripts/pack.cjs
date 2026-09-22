const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const target=process.argv[2];
if(!['mac-arm64','mac-x64','win-x64'].includes(target)) throw new Error('Expected mac-arm64, mac-x64 or win-x64');
const root=path.resolve(__dirname,'..');
if (target.startsWith('mac-')) require('./mac-office-agent.cjs').prepareOfficeAgent(path.join(root,'runtime',target));
function run(command,args) {const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env:{...process.env,ELECTRON_BUILDER_COMPRESSION_LEVEL:process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || '9',LANYUE_TARGET:target}}); if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
run(process.execPath,['scripts/check-runtime.cjs']);
run(process.execPath,['scripts/build-system.cjs',target]);
const electronDist=path.join(path.dirname(require.resolve('electron')),'dist');
const reuseElectron=target===`mac-${process.arch}` && process.platform==='darwin' && fs.existsSync(path.join(electronDist,'Electron.app'));
run(process.execPath,[require.resolve('electron-builder/cli.js'),'--publish','never',...(target.startsWith('mac-')?['--mac','dir']:['--win','zip']),target.endsWith('arm64')?'--arm64':'--x64',...(reuseElectron ? ['--config.electronDist='+electronDist] : [])]);
