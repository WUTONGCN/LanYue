const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Only change the application's private copy, never /Applications/LibreOffice.app.
function prepareOfficeAgent(runtime) {
  if (process.platform !== 'darwin') throw new Error('Prepare macOS runtime on macOS.');
  const office = path.join(runtime, 'office/LibreOffice.app');
  const plist = path.join(office, 'Contents/Info.plist');
  if (!fs.existsSync(plist)) throw new Error('Missing private LibreOffice bundle.');
  const read = key => { try { return execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], {encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch { return ''; } };
  if (read('LSUIElement') === 'true' && read('CFBundleIdentifier') === 'com.lanyue.preview.office-helper') {
    try { execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',office],{stdio:'ignore'}); return; } catch {}
  }
  execFileSync('/usr/bin/plutil', ['-replace', 'LSUIElement', '-bool', 'YES', plist]);
  execFileSync('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', 'com.lanyue.preview.office-helper', plist]);
  // Re-seal the private development bundle and nested frameworks. Production
  // distribution must replace these ad-hoc signatures with the release identity.
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', '--preserve-metadata=entitlements,flags,runtime', office], {stdio:'inherit'});
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', office], {stdio:'inherit'});
}
module.exports = { prepareOfficeAgent };
if (require.main === module) prepareOfficeAgent(path.resolve(process.argv[2] || 'runtime/mac-' + process.arch));
