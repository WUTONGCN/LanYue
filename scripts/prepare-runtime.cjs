const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const target = process.env.LANYUE_TARGET || (process.platform === 'darwin' ? `mac-${process.arch}` : 'win-x64');
const runtime = path.join(root,'runtime',target);
fs.mkdirSync(runtime,{recursive:true});
const copy = (from,to) => { fs.mkdirSync(path.dirname(to),{recursive:true}); fs.cpSync(from,to,{recursive:true,verbatimSymlinks:true}); };
if (target.startsWith('mac')) {
  const javaHome = process.env.LANYUE_JDK || process.env.JAVA_HOME;
  const java = path.join(runtime,'java');
  if (process.env.LANYUE_JRE) {
    if (!fs.existsSync(path.join(process.env.LANYUE_JRE,'bin/java'))) throw new Error('LANYUE_JRE must contain bin/java.');
    fs.rmSync(java,{recursive:true,force:true});copy(process.env.LANYUE_JRE,java);
  } else if (!fs.existsSync(java)) {
    if (!javaHome || !fs.existsSync(path.join(javaHome,'bin/jlink'))) throw new Error('Set LANYUE_JDK to a redistributable JDK 21+ matching the target architecture.');
    execFileSync(path.join(javaHome,'bin/jlink'), ['--add-modules','java.se,jdk.crypto.ec,jdk.unsupported,jdk.zipfs,jdk.charsets,jdk.localedata,jdk.naming.dns,jdk.httpserver,jdk.management,jdk.management.agent', '--strip-debug','--no-header-files','--no-man-pages','--compress=zip-6','--output',java], {stdio:'inherit'});
  }
  const office = process.env.LANYUE_OFFICE || '/Applications/LibreOffice.app';
  if (!fs.existsSync(path.join(office,'Contents/MacOS/soffice'))) throw new Error('Set LANYUE_OFFICE to a LibreOffice.app matching the target architecture.');
  const officeDest = path.join(runtime,'office/LibreOffice.app');
  if (!fs.existsSync(officeDest)) copy(office,officeDest);
  require('./mac-office-agent.cjs').prepareOfficeAgent(runtime);
  require('./mac-sevenzip.cjs').prepareSevenZip(runtime);
} else {
  if (!process.env.LANYUE_JRE || !process.env.LANYUE_OFFICE) throw new Error('Set LANYUE_JRE to an extracted Windows x64 JRE 21+, and LANYUE_OFFICE to an extracted LibreOffice directory.');
  copy(process.env.LANYUE_JRE,path.join(runtime,'java'));
  copy(process.env.LANYUE_OFFICE,path.join(runtime,'office/LibreOffice'));
  // MSI extraction does not install its shared CRT and fonts. Keep them app-local.
  const extracted = process.env.LANYUE_OFFICE_EXTRACTED || path.dirname(process.env.LANYUE_OFFICE);
  const crt = path.join(extracted,'System64');
  if (fs.existsSync(crt)) for (const file of fs.readdirSync(crt)) if (file.endsWith('.dll')) copy(path.join(crt,file),path.join(runtime,'office/LibreOffice/program',file));
  const fonts = path.join(extracted,'Fonts');
  if (fs.existsSync(fonts)) copy(fonts,path.join(runtime,'office/LibreOffice/share/fonts/truetype'));
  // Office runs headless. Remove only unused UI translations, retaining rendering
  // locale data, every font, dictionary, format filter and native conversion library.
  const messages=path.join(runtime,'office/LibreOffice/program/resource');
  if (fs.existsSync(messages)) for (const lang of fs.readdirSync(messages)) {
    if (!['common','en-US','en_US','zh_CN','zh_TW'].includes(lang)) fs.rmSync(path.join(messages,lang),{recursive:true,force:true});
  }
}
fs.writeFileSync(path.join(runtime,'runtime.json'),JSON.stringify({target,java:'21+',prepared:new Date().toISOString(),distribution:'portable-full'},null,2));
console.log('Runtime prepared:',runtime);
