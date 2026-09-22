const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),target=process.argv[2]||`mac-${process.arch}`;
const out=path.join(root,'runtime',target,'tools');fs.mkdirSync(out,{recursive:true});
if(target.startsWith('mac-')){
  execFileSync('xcrun',['swiftc','-O','-target',`${target.endsWith('arm64')?'arm64':'x86_64'}-apple-macos12.0`,'native/macos-system.swift','-o',path.join(out,'LanYueSystem')],{cwd:root,stdio:'inherit'});
  execFileSync('codesign',['--force','--sign','-','--identifier','com.lanyue.preview.system','--timestamp=none',path.join(out,'LanYueSystem')],{stdio:'inherit'});
}else if(target==='win-x64'){
  execFileSync(process.env.LANYUE_MINGW_CXX||'x86_64-w64-mingw32-g++',['-std=c++17','-Os','-municode','-static','-static-libgcc','-static-libstdc++','native/windows-system.cpp','-o',path.join(out,'LanYueSystem.exe'),'-lole32','-loleaut32','-luuid','-lshlwapi','-lshell32','-ladvapi32','-luser32'],{cwd:root,stdio:'inherit'});
}else throw new Error('Unsupported target');
console.log('System integration helper built:',target);
