const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const yauzl = require('yauzl');
const run = promisify(execFile);

// Replace only application-owned Windows entries. In particular, portable-data
// and documents beside the EXE must survive an update or rollback.
const windowsEntries = new Set([
  'LanYue.exe', 'resources', 'locales', 'LICENSE.electron.txt', 'LICENSES.chromium.html',
  'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'dxcompiler.dll',
  'dxil.dll', 'ffmpeg.dll', 'icudtl.dat', 'resources.pak', 'snapshot_blob.bin',
  'v8_context_snapshot.bin', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll'
]);

function inspectZip(file, platform, signal) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(error);
      let total = 0, count = 0;
      const names = new Set();
      const fail = error => { zip.close(); reject(error); };
      zip.on('error', fail);
      zip.on('end', () => resolve(total));
      zip.on('entry', entry => {
        (async () => {
          signal?.throwIfAborted();
          const name = entry.fileName;
          const parts = name.replace(/\/$/, '').split('/');
          if (parts.some(part => !part || part === '.' || part === '..' || /[:\x00-\x1f]/.test(part))) throw new Error('更新包包含无效路径。');
          if (platform === 'win32' && parts.some(part => /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('更新包包含无效 Windows 路径。');
          const key = name.toLowerCase().replace(/\/$/, '');
          if (names.has(key)) throw new Error('更新包包含重复路径。');
          names.add(key);
          if (platform === 'darwin' ? !['LanYue.app', '__MACOSX'].includes(parts[0]) : !windowsEntries.has(parts[0])) throw new Error('更新包的应用结构不匹配。');
          if (++count > 150000 || (total += entry.uncompressedSize) > 12 * 1024 ** 3) throw new Error('更新包体积异常。');
          const type = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (type === 0o120000) {
            if (platform !== 'darwin' || parts[0] !== 'LanYue.app' || entry.uncompressedSize > 4096) throw new Error('更新包包含无效链接。');
            const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream)));
            const chunks = []; for await (const chunk of stream) chunks.push(chunk);
            const link = Buffer.concat(chunks).toString('utf8');
            const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), link));
            if (!link || /[\x00\\]/.test(link) || path.posix.isAbsolute(link) || !resolved.startsWith('LanYue.app/')) throw new Error('更新包包含越界链接。');
          } else if (type && type !== 0o100000 && type !== 0o040000) throw new Error('更新包包含不支持的文件类型。');
          zip.readEntry();
        })().catch(fail);
      });
      zip.readEntry();
    });
  });
}

async function preparePackage({ work, archive, version, signal }) {
  const unpackedBytes = await inspectZip(archive, process.platform, signal);
  const space = await fsp.statfs(work);
  if (space.bavail * space.bsize < unpackedBytes + 256 * 1024 ** 2) throw new Error('磁盘空间不足，请清理空间后重试更新。');
  const stage = path.join(work, 'stage');
  await fsp.mkdir(stage);
  if (process.platform === 'darwin') {
    await run('/usr/bin/ditto', ['-x', '-k', archive, stage], { timeout: 10 * 60 * 1000, signal });
  } else {
    // tar.exe is included with supported Windows 10/11. No PowerShell command
    // interpolation: filenames (including spaces and Chinese) stay arguments.
    await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/tar.exe'), ['-xf', archive, '-C', stage], { windowsHide: true, timeout: 10 * 60 * 1000, signal });
  }
  const resources = process.platform === 'darwin' ? path.join(stage, 'LanYue.app/Contents/Resources') : path.join(stage, 'resources');
  // Electron's fs reads package.json inside ASAR without executing new code.
  const manifest = JSON.parse(await fsp.readFile(path.join(resources, 'app.asar/package.json'), 'utf8'));
  if (manifest.name !== 'lanyue-desktop' || manifest.version !== version) throw new Error('更新包版本与发布信息不一致。');
  const runtime = JSON.parse(await fsp.readFile(path.join(resources, 'runtime/runtime.json'), 'utf8'));
  const expected = `${process.platform === 'darwin' ? 'mac' : 'win'}-${process.arch}`;
  if (runtime.target !== expected) throw new Error('更新包与当前电脑架构不匹配。');
  const executable = process.platform === 'darwin' ? path.join(stage, 'LanYue.app/Contents/MacOS/LanYue') : path.join(stage, 'LanYue.exe');
  await fsp.access(executable, process.platform === 'darwin' ? fs.constants.X_OK : fs.constants.R_OK);
  return { stage, entries: process.platform === 'win32' ? [...windowsEntries] : [] };
}

module.exports = { preparePackage };
