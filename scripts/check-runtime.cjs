const fs = require('node:fs');
const path = require('node:path');
const target = process.env.LANYUE_TARGET || (process.platform === 'darwin' ? `mac-${process.arch}` : 'win-x64');
const runtime = path.resolve(__dirname,'../runtime',target);
const required = ['runtime.json','engine/kkFileView.jar','engine/application.properties','engine/upstream.json',
  target.startsWith('mac') ? 'java/bin/java':'java/bin/java.exe',
  target.startsWith('mac') ? 'office/LibreOffice.app/Contents/MacOS/soffice':'office/LibreOffice/program/soffice.exe',
  ...(target.startsWith('mac') ? ['tools/7zz'] : [])];
for (const file of required) if (!fs.existsSync(path.join(runtime,file))) throw new Error(`Incomplete portable runtime: ${target}/${file}`);
if (target.startsWith('mac') && process.platform === 'darwin') require('./mac-sevenzip.cjs').checkRarSupport(path.join(runtime,'tools/7zz'));
const upstream = JSON.parse(fs.readFileSync(path.join(runtime,'engine/upstream.json')));
if (upstream.platform !== target) throw new Error('Engine native architecture mismatch');
let size=0;
function walk(dir) { for (const item of fs.readdirSync(dir,{withFileTypes:true})) {const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.isFile())size+=fs.statSync(file).size; } }
walk(runtime); console.log(`Portable runtime verified: ${target} ${(size/1024/1024).toFixed(1)} MiB (before compression)`);
