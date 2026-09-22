const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const version = require('../package.json').version;
const target = process.env.LANYUE_TARGET || `mac-${process.arch}`;
if(!['mac-arm64','mac-x64'].includes(target))throw new Error('Unsupported macOS target.');
const build = JSON.parse(fs.readFileSync(path.join(root,'dist',`latest-${target}.json`),'utf8'));
const relative = path.relative(path.join(root,'dist/builds'),build.output);
if(build.version!==version || build.target!==target || !relative || relative.startsWith('..') || path.isAbsolute(relative))throw new Error('Build metadata mismatch; package the current version first.');
// electron-builder uses mac/ for x64, and mac-arm64/ for ARM64.
const app = path.join(build.output,target==='mac-x64'?'mac':'mac-arm64','LanYue.app');
const zip = path.join(root,`dist/LanYue-${version}-${target}.zip`);
if(!fs.existsSync(app))throw new Error('Build the app first.');
execFileSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',app,zip],{stdio:'inherit'});
console.log(zip, `${(fs.statSync(zip).size/1024/1024).toFixed(1)} MiB`);
