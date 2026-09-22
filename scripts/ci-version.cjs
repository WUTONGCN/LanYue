const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = require('../package.json');
const parse = value => {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error(`Invalid release version: ${value}`);
  const parts = value.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Release version is too large.');
  return parts;
};
const compare = (a, b) => {
  const left = parse(a), right = parse(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
};

let version = process.env.LANYUE_BUILD_VERSION || manifest.version;
parse(version);
const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : '';
if (tag && tag !== `v${manifest.version}`) {
  throw new Error(`Tag ${tag} must match package.json version v${manifest.version}. Run npm version first.`);
}

if (process.argv.includes('--resolve')) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('GITHUB_REPOSITORY is required.');
  const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`], { encoding: 'utf8' }));
  const releases = pages.flat().filter(release => !release.prerelease && /^v\d+\.\d+\.\d+$/.test(release.tag_name));
  const previousAttempt = releases.find(release => release.target_commitish === process.env.GITHUB_SHA && (!tag || release.tag_name === tag));
  if (previousAttempt) {
    version = previousAttempt.tag_name.slice(1);
  } else if (!tag) {
    const highest = releases.map(release => release.tag_name.slice(1)).sort(compare).at(-1);
    if (highest && compare(version, highest) <= 0) {
      const parts = parse(highest);
      parts[2]++;
      version = parts.join('.');
    }
  }
} else if (version !== manifest.version) {
  manifest.version = version;
  const lock = require('../package-lock.json');
  lock.version = version;
  lock.packages[''].version = version;
  fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
}
parse(version);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
console.log(`Building LanYue ${version} (${process.env.GITHUB_SHA || 'local'})`);
