const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const version = '26.03';
const url = 'https://github.com/ip7z/7zip/releases/download/26.03/7z2603-mac.tar.xz';
// Pinned digest of the archive downloaded from the official HTTPS release.
const sha256 = '5ca87677072c59f5602e5c49baa27d4694bacd2259b4e507f0094249d4281480';
function checkRarSupport(binary) {
  const info = execFileSync(binary, ['i'], {encoding:'utf8'}).split('Codecs:')[1]?.split('Hashers:')[0] || '';
  for (const codec of ['Rar1','Rar2','Rar3','Rar5']) {
    if (!new RegExp('^\\s+\\S*D\\S*\\s+[0-9A-F]+\\s+' + codec + '\\s*$', 'mi').test(info)) {
      throw new Error('7-Zip is missing the ' + codec + ' decoder. Use the official full macOS build.');
    }
  }
}
function prepareSevenZip(runtime) {
  let binary = process.env.LANYUE_7ZIP_SOURCE;
  let license;
  if (binary) {
    license = process.env.LANYUE_7ZIP_LICENSE || path.join(path.dirname(binary),'License.txt');
  } else {
    const downloads = path.resolve(__dirname,'../output/downloads');
    fs.mkdirSync(downloads,{recursive:true});
    const archive = path.join(downloads,'7z2603-mac.tar.xz');
    if (!fs.existsSync(archive)) execFileSync('curl',['-fL','--retry','2','--connect-timeout','20',url,'-o',archive],{stdio:'inherit'});
    if (crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex') !== sha256) throw new Error('7-Zip archive checksum mismatch');
    const extracted = path.join(downloads,'7zip-mac');
    fs.mkdirSync(extracted,{recursive:true});
    execFileSync('tar',['-xf',archive,'-C',extracted]);
    binary = path.join(extracted,'7zz');
    license = path.join(extracted,'License.txt');
  }
  checkRarSupport(binary);
  if (!fs.existsSync(license)) throw new Error('Supply the matching full 7-Zip license with LANYUE_7ZIP_LICENSE.');
  fs.mkdirSync(path.join(runtime,'tools'),{recursive:true});
  fs.mkdirSync(path.join(runtime,'licenses'),{recursive:true});
  fs.copyFileSync(binary,path.join(runtime,'tools/7zz'));
  fs.chmodSync(path.join(runtime,'tools/7zz'),0o755);
  fs.copyFileSync(license,path.join(runtime,'licenses/7zip-LICENSE.txt'));
  fs.writeFileSync(path.join(runtime,'tools/7zip-source.json'),JSON.stringify(binary === process.env.LANYUE_7ZIP_SOURCE ? {source:'custom',rarDecodersVerified:true} : {version,url,sha256,rarDecodersVerified:true},null,2));
}
module.exports = {checkRarSupport,prepareSevenZip};
