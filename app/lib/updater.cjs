const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { preparePackage } = require('./update-package.cjs');

const repository = 'WUTONGCN/LanYue';
const releasePage = `https://github.com/${repository}/releases`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function newer(version, current) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^\d+\.\d+\.\d+$/.test(current)) return false;
  const a = version.split('.').map(Number), b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
function trustedURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
    !['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname)) throw new Error('更新下载地址无效。');
  return url.href;
}

class PortableUpdater {
  constructor({ app, net, dialog, shell, getWindow, canPrompt, onChange }) {
    Object.assign(this, { app, net, dialog, shell, getWindow, canPrompt, onChange });
    this.state = 'idle'; this.percent = 0;
    this.data = path.join(app.getPath('userData'), 'updates');
    fs.mkdirSync(this.data, { recursive: true });
    try { this.preferences = JSON.parse(fs.readFileSync(path.join(this.data, 'preferences.json'), 'utf8')); } catch { this.preferences = {}; }
    this.target = process.platform === 'darwin' ? path.resolve(process.execPath, '../../..') : path.dirname(process.execPath);
    this.parent = process.platform === 'darwin' ? path.dirname(this.target) : this.target;
    this.pendingFile = path.join(this.data, 'pending.json');
    try {
      const pending = JSON.parse(fs.readFileSync(this.pendingFile, 'utf8'));
      if (pending.phase === 'ready' && /^[a-f0-9]{32}$/.test(pending.token)) {
        const work = path.join(this.parent, `.lanyue-update-${pending.token}`);
        const plan = JSON.parse(fs.readFileSync(path.join(work, 'plan.json'), 'utf8'));
        if (plan.target === this.target && plan.work === work && plan.token === pending.token && newer(plan.version, app.getVersion()) && fs.existsSync(plan.stage)) {
          this.work = work; this.token = plan.token; this.plan = plan; this.state = 'ready';
        }
      }
      if (this.state !== 'ready') fs.unlinkSync(this.pendingFile);
    } catch { /* No pending package, or a previous installer has finished. */ }
  }
  setState(state) {
    this.state = state;
    this.getWindow()?.setProgressBar(state === 'downloading' ? this.percent / 100 : -1);
    this.onChange();
  }
  menuItem() {
    const label = { checking: '正在检查更新…', downloading: `正在下载更新 ${this.percent}%（点击取消）`, preparing: '正在准备更新…', ready: '重启并更新…', installing: '正在安装更新…' }[this.state] || '检查更新…';
    return { label, enabled: !['checking', 'preparing', 'installing'].includes(this.state), click: () => {
      if (this.state === 'downloading') this.controller?.abort();
      else if (this.state === 'ready') this.offerInstall().catch(error => this.failure(error));
      else this.check(true);
    } };
  }
  async message(options) {
    const win = this.getWindow();
    return win && !win.isDestroyed() ? this.dialog.showMessageBox(win, { title: '览阅更新', noLink: true, ...options }) : { response: options.cancelId ?? 0 };
  }
  async failure(error) {
    if (this.stopped) return;
    this.log(error);
    const { response } = await this.message({ type: 'warning', message: '暂时无法完成更新', detail: `${error.message}\n\n可以稍后重试，或从开源仓库下载新版。`, buttons: ['关闭', '打开下载页面'], cancelId: 0 });
    if (response === 1) await this.shell.openExternal(releasePage);
  }
  log(error) { try { fs.appendFileSync(path.join(this.data, 'update.log'), `${new Date().toISOString()} ${error.stack || error}\n`); } catch {} }
  start() {
    if (!this.app.isPackaged || !['darwin', 'win32'].includes(process.platform)) return;
    // Check only when a normal preview window is visible. Never interrupt a
    // Finder/Explorer Space preview or bring a background window to the front.
    this.timer = setTimeout(() => this.check(false), 15000);
    this.interval = setInterval(() => this.check(false), 6 * 60 * 60 * 1000);
    this.timer.unref(); this.interval.unref();
  }
  windowShown() {
    if (!this.app.isPackaged || this.stopped || this.state !== 'idle' || Date.now() - (this.lastCheck || 0) < 6 * 60 * 60 * 1000) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.check(false), 15000);
    this.timer.unref();
  }
  async startupComplete() {
    const arg = process.argv.find(value => /^--lanyue-update=[a-f0-9]{32}$/.test(value));
    if (arg) {
      const token = arg.split('=')[1], work = path.join(this.parent, `.lanyue-update-${token}`);
      try {
        const plan = JSON.parse(await fsp.readFile(path.join(work, 'plan.json'), 'utf8'));
        if (plan.token === token && plan.version === this.app.getVersion() && plan.target === this.target) await fsp.writeFile(path.join(work, 'ack'), 'ready', { mode: 0o600 });
      } catch (error) { this.log(error); }
    }
    try {
      const resultPath = path.join(this.data, 'result.txt');
      const detail = await fsp.readFile(resultPath, 'utf8');
      await fsp.unlink(resultPath);
      await this.message({ type: 'warning', message: '上次更新未完成', detail, buttons: ['知道了'] });
    } catch (error) { if (error.code !== 'ENOENT') this.log(error); }
  }
  async request(url, signal, allowMissing = false) {
    for (let redirects = 0; redirects < 6; redirects++) {
      const response = await this.net.fetch(trustedURL(url), { redirect: 'manual', signal, cache: 'no-store', credentials: 'omit', headers: { 'User-Agent': `LanYue/${this.app.getVersion()}`, Accept: 'application/vnd.github+json' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('更新下载地址响应异常。');
        url = new URL(location, url).href; continue;
      }
      if (allowMissing && response.status === 404) { await response.body?.cancel(); return null; }
      if (!response.ok) { await response.body?.cancel(); throw new Error(`更新服务暂不可用（HTTP ${response.status}）。`); }
      return response;
    }
    throw new Error('更新下载重定向次数过多。');
  }
  async text(url, signal, missing = false) {
    const response = await this.request(url, signal, missing);
    if (!response) return null;
    const chunks = []; let length = 0;
    for await (const chunk of Readable.fromWeb(response.body)) {
      length += chunk.length;
      if (length > 2 * 1024 * 1024) throw new Error('更新信息过大。');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  async check(manual) {
    if (this.stopped || this.state !== 'idle' || (!manual && !this.canPrompt())) return;
    if (!this.app.isPackaged) {
      if (manual) await this.message({ type: 'info', message: '请在完整便携版中检查更新。', buttons: ['知道了'] });
      return;
    }
    this.setState('checking');
    this.lastCheck = Date.now();
    try {
      const body = await this.text(`https://api.github.com/repos/${repository}/releases/latest`, AbortSignal.timeout(20000), true);
      const release = body ? JSON.parse(body) : null;
      const version = release?.tag_name?.replace(/^v/, '');
      if (!release || release.draft || release.prerelease || !newer(version, this.app.getVersion())) {
        if (manual) await this.message({ type: 'info', message: release ? '当前已是最新发布版本' : '尚无公开发布的更新', detail: `览阅 ${this.app.getVersion()}`, buttons: ['知道了'] });
        return;
      }
      const target = `${process.platform === 'darwin' ? 'mac' : 'win'}-${process.arch}`;
      const filename = `LanYue-${version}-${target}.zip`;
      const asset = release.assets?.find(item => item.name === filename && item.state === 'uploaded');
      if (!asset) throw new Error('新版尚未提供适合当前电脑的更新包。');
      if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > 2 * 1024 ** 3) throw new Error('更新包体积无效。');
      const expectedURL = `https://github.com/${repository}/releases/download/v${version}/${filename}`;
      if (asset.browser_download_url !== expectedURL) throw new Error('更新包来源不匹配。');
      let digest = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest || '')?.[1]?.toLowerCase();
      if (!digest) {
        const sums = release.assets.find(item => item.name === 'SHA256SUMS.txt');
        if (sums?.browser_download_url !== `https://github.com/${repository}/releases/download/v${version}/SHA256SUMS.txt`) throw new Error('新版缺少校验信息。');
        const text = await this.text(sums.browser_download_url, AbortSignal.timeout(20000));
        digest = text.split(/\r?\n/).map(line => /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line)).find(match => match?.[2] === filename)?.[1];
      }
      if (!digest) throw new Error('新版缺少有效的 SHA256 校验信息。');
      if (!manual && (this.preferences.dismissedVersion === version && Date.now() - this.preferences.dismissedAt < 24 * 60 * 60 * 1000 || !this.canPrompt())) return;
      const choice = await this.message({ type: 'info', message: `览阅 ${version} 可用`, detail: `当前版本 ${this.app.getVersion()}，下载约 ${Math.ceil(asset.size / 1024 ** 2)} MB。下载期间可继续预览文件，完成后再重启更新。`, buttons: ['下载更新', '稍后'], defaultId: 0, cancelId: 1 });
      if (choice.response !== 0) {
        this.preferences = { dismissedVersion: version, dismissedAt: Date.now() };
        await fsp.writeFile(path.join(this.data, 'preferences.json'), JSON.stringify(this.preferences));
        return;
      }
      this.downloadTask = this.download({ version, asset, digest });
      await this.downloadTask;
    } catch (error) { if (manual) await this.failure(error); else this.log(error); }
    finally { if (this.state === 'checking') this.setState('idle'); }
  }
  async download(candidate) {
    try {
      if (process.platform === 'darwin' && this.target.includes('/AppTranslocation/')) throw new Error('请先把览阅移到固定文件夹，再重新打开并更新。');
      await fsp.access(this.parent, fs.constants.W_OK);
      this.token = crypto.randomBytes(16).toString('hex');
      this.work = path.join(this.parent, `.lanyue-update-${this.token}`);
      await fsp.mkdir(this.work, { mode: 0o700 });
      const space = await fsp.statfs(this.work);
      if (space.bavail * space.bsize < candidate.asset.size + 256 * 1024 ** 2) throw new Error('磁盘空间不足，无法下载更新。');
      const archive = path.join(this.work, 'update.zip');
      this.controller = new AbortController();
      const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(60 * 60 * 1000)]);
      this.percent = 0; this.setState('downloading');
      const response = await this.request(candidate.asset.browser_download_url, signal);
      const hash = crypto.createHash('sha256'); let received = 0;
      const meter = new Transform({ transform: (chunk, encoding, done) => {
        received += chunk.length;
        if (received > candidate.asset.size) return done(new Error('下载文件长度与发布信息不一致。'));
        hash.update(chunk);
        const percent = Math.floor(received / candidate.asset.size * 100);
        if (percent !== this.percent) { this.percent = percent; this.setState('downloading'); }
        done(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(archive, { flags: 'wx', mode: 0o600 }), { signal });
      if (received !== candidate.asset.size || hash.digest('hex') !== candidate.digest) throw new Error('更新包校验失败，请重新下载。');
      this.setState('preparing');
      const prepared = await preparePackage({ work: this.work, archive, version: candidate.version, signal });
      this.plan = { ...prepared, work: this.work, target: this.target, pid: process.pid, token: this.token, version: candidate.version, result: path.join(this.data, 'result.txt') };
      await fsp.writeFile(path.join(this.work, 'plan.json'), JSON.stringify(this.plan), { mode: 0o600 });
      await fsp.writeFile(this.pendingFile, JSON.stringify({ token: this.token, phase: 'ready' }), { mode: 0o600 });
      this.setState('ready');
      if (!this.stopped && this.canPrompt()) await this.offerInstall();
    } catch (error) {
      const canceled = this.controller?.signal.aborted;
      // Installer-owned directories contain rollback files; never clean them
      // from the old app once the detached installer has taken over.
      if (this.work && this.state !== 'installing') await fsp.rm(this.work, { recursive: true, force: true }).catch(e => this.log(e));
      await fsp.unlink(this.pendingFile).catch(() => {});
      this.work = null; this.plan = null; this.setState('idle');
      if (!canceled) await this.failure(error);
    } finally { this.controller = null; }
  }
  async offerInstall() {
    if (this.state !== 'ready') return;
    const choice = await this.message({ type: 'info', message: `览阅 ${this.plan.version} 已准备好`, detail: '重启后完成更新，当前预览将关闭。原文件和便携数据会保留。', buttons: ['重启并更新', '稍后'], defaultId: 0, cancelId: 1 });
    if (choice.response === 0) await this.install();
  }
  async install() {
    if (this.state !== 'ready') return;
    this.setState('installing');
    let child;
    try {
      const mac = process.platform === 'darwin';
      const name = mac ? 'install-mac.sh' : 'install-win.ps1';
      const helper = path.join(this.work, name);
      await fsp.rm(path.join(this.work, 'helper-ready'), { force: true });
      await fsp.rm(path.join(this.work, 'ack'), { force: true });
      // A downloaded package may have been kept across application launches.
      this.plan.pid = process.pid;
      await fsp.writeFile(path.join(this.work, 'plan.json'), JSON.stringify(this.plan), { mode: 0o600 });
      await fsp.writeFile(this.pendingFile, JSON.stringify({ token: this.token, phase: 'installing' }), { mode: 0o600 });
      await fsp.copyFile(path.join(__dirname, '../update', name), helper);
      const command = mac ? '/bin/bash' : path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
      const args = mac ? [helper, this.target, String(process.pid), this.token, this.plan.result] : ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, '-Plan', path.join(this.work, 'plan.json')];
      // work is the first macOS helper argument.
      if (mac) args.splice(1, 0, this.work);
      child = spawn(command, args, { detached: true, windowsHide: true, stdio: 'ignore', cwd: this.parent });
      let launchError;
      child.on('error', error => { launchError = error; });
      for (let i = 0; i < 100; i++) {
        if (launchError) throw launchError;
        if (child.exitCode !== null) throw new Error('更新组件未能启动。');
        if (fs.existsSync(path.join(this.work, 'helper-ready'))) { child.unref(); this.app.quit(); return; }
        await pause(100);
      }
      throw new Error('更新组件启动超时。');
    } catch (error) {
      child?.kill();
      await fsp.writeFile(this.pendingFile, JSON.stringify({ token: this.token, phase: 'ready' }), { mode: 0o600 }).catch(() => {});
      this.setState('ready'); throw error;
    }
  }
  async stop() {
    this.stopped = true;
    clearTimeout(this.timer); clearInterval(this.interval);
    this.controller?.abort();
    // Stop extraction before deleting its work directory; a fully prepared
    // package survives normal quits, so "Later" does not trigger another GB download.
    if (['downloading', 'preparing'].includes(this.state)) await this.downloadTask;
  }
}

module.exports = { PortableUpdater };
