const fs = require('node:fs');
const manifest = require('../package.json');
const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : '';
if (tag && tag !== `v${manifest.version}`) {
  throw new Error(`Tag ${tag} must match package.json version v${manifest.version}. Run npm version first.`);
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${manifest.version}\n`);
console.log(`Building LanYue ${manifest.version} (${process.env.GITHUB_SHA || 'local'})`);
