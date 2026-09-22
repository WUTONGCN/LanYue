// Prepare a complete portable runtime on a fresh GitHub-hosted runner.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const target = process.env.LANYUE_TARGET;
const inputs = {
  'mac-arm64': {
    platform: 'darwin', arch: 'arm64',
    file: 'LibreOffice_26.2.6_MacOS_aarch64.dmg', directory: 'mac/aarch64',
    sha256: '94bb3248df074c225490a8a6d1d9dc87c7d6783dbb7a8e9f0d0c3d94348552af'
  },
  'win-x64': {
    platform: 'win32', arch: 'x64',
    file: 'LibreOffice_26.2.6_Win_x86-64.msi', directory: 'win/x86_64',
    sha256: 'f9877032fd908beb9c0ddf06df4af5c2e85f419c42e14876c4cce5aae5fb2660'
  }
};
const input = inputs[target];
if (!input || process.platform !== input.platform || process.arch !== input.arch) {
  throw new Error('CI runtime preparation requires a native mac-arm64 or win-x64 runner.');
}
const javaHome = process.env.JAVA_HOME;
if (!javaHome) throw new Error('JAVA_HOME must point to JDK 21.');
const downloads = path.join(root, 'output/ci-runtime');
fs.mkdirSync(downloads, { recursive: true });
const archive = path.join(downloads, input.file);
const url = `https://download.documentfoundation.org/libreoffice/stable/26.2.6/${input.directory}/${input.file}`;
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
run(process.platform === 'win32' ? 'curl.exe' : 'curl', ['-fL', '--retry', '3', '--connect-timeout', '30', url, '-o', archive]);

async function main() {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
  if (hash.digest('hex') !== input.sha256) throw new Error('LibreOffice download checksum mismatch.');
  const env = { ...process.env, LANYUE_JDK: javaHome };
  if (target === 'mac-arm64') {
    const mount = path.join(downloads, 'office-mount');
    fs.mkdirSync(mount, { recursive: true });
    run('hdiutil', ['attach', archive, '-readonly', '-nobrowse', '-mountpoint', mount]);
    try {
      env.LANYUE_OFFICE = path.join(mount, 'LibreOffice.app');
      run(process.execPath, ['scripts/prepare-runtime.cjs'], { env });
    } finally {
      run('hdiutil', ['detach', mount]);
    }
  } else {
    const extracted = path.join(downloads, 'office');
    fs.mkdirSync(extracted, { recursive: true });
    const result = spawnSync('msiexec.exe', ['/a', archive, '/qn', `TARGETDIR=${extracted}`, '/L*v', path.join(downloads, 'msi-extract.log')], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (![0, 3010].includes(result.status)) throw new Error(`LibreOffice MSI extraction failed (${result.status}).`);
    function findOffice(dir) {
      if (fs.existsSync(path.join(dir, 'program/soffice.exe'))) return dir;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const found = findOffice(path.join(dir, entry.name));
          if (found) return found;
        }
      }
    }
    env.LANYUE_OFFICE = findOffice(extracted);
    if (!env.LANYUE_OFFICE) throw new Error('LibreOffice MSI did not contain program/soffice.exe.');
    env.LANYUE_OFFICE_EXTRACTED = extracted;
    env.LANYUE_JRE = path.join(downloads, 'jre');
    run(path.join(javaHome, 'bin/jlink.exe'), ['--add-modules', 'java.se,jdk.crypto.ec,jdk.unsupported,jdk.zipfs,jdk.charsets,jdk.localedata,jdk.naming.dns,jdk.httpserver,jdk.management,jdk.management.agent', '--strip-debug', '--no-header-files', '--no-man-pages', '--compress=zip-6', '--output', env.LANYUE_JRE]);
    run(process.execPath, ['scripts/prepare-runtime.cjs'], { env });
  }
  fs.writeFileSync(path.join(root, 'runtime', target, 'ci-source.json'), JSON.stringify({ libreoffice: { version: '26.2.6', url, sha256: input.sha256 }, java: 'Eclipse Temurin 21 (actions/setup-java)', commit: process.env.GITHUB_SHA }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
