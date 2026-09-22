const {spawnSync}=require('node:child_process');
const path=require('node:path');
const target=process.argv[2];
if(!['mac-arm64','mac-x64','win-x64'].includes(target)) throw new Error('Expected mac-arm64, mac-x64 or win-x64');
const root=path.resolve(__dirname,'..');
if (target.startsWith('mac-')) require('./mac-office-agent.cjs').prepareOfficeAgent(path.join(root,'runtime',target));
function run(command,args) {const result=spawnSync(command,args,{cwd:root,stdio:'inherit',env:{...process.env,ELECTRON_BUILDER_COMPRESSION_LEVEL:process.env.ELECTRON_BUILDER_COMPRESSION_LEVEL || '9',LANYUE_TARGET:target}}); if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
run(process.execPath,['scripts/check-runtime.cjs']);
run(process.execPath,['scripts/build-system.cjs',target]);
run(process.execPath,[require.resolve('electron-builder/cli.js'),...(target.startsWith('mac-')?['--mac','dir']:['--win','zip']),target.endsWith('arm64')?'--arm64':'--x64',...(target===`mac-${process.arch}` && process.platform==='darwin' ? ['--config.electronDist='+path.join(path.dirname(require.resolve('electron')),'dist')] : [])]);
