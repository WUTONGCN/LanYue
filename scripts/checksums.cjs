const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const target = process.env.LANYUE_TARGET;
if (!['mac-arm64', 'win-x64'].includes(target)) throw new Error('Unsupported checksum target.');
const version = require('../package.json').version;
const file = `LanYue-${version}-${target}.zip`;
const dist = path.resolve(__dirname, '../dist');
(async () => {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(path.join(dist, file))) hash.update(chunk);
  fs.writeFileSync(path.join(dist, `${file}.sha256`), `${hash.digest('hex')}  ${file}\n`);
})().catch(error => { console.error(error); process.exitCode = 1; });
