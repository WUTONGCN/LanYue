const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const net = require('node:net');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const prop = value => String(value).replaceAll('\\', '/').replaceAll('\n', '');
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
class Engine {
  constructor({ runtime, data, sourceOrigin, onStatus }) {
    Object.assign(this, { runtime, data, sourceOrigin, onStatus });
    this.secret = crypto.randomBytes(32).toString('hex');
    this.generation = 0;
    this.state = { phase: 'idle', message: '按需启动 · 本地处理' };
  }
  status(phase, message) { this.state = { phase, message }; this.onStatus?.(this.state); }
  async start() {
    if (this.state.phase === 'ready') return this.origin;
    if (this.starting) return this.starting;
    this.starting = this.launch(this.generation).finally(() => { this.starting = null; });
    return this.starting;
  }
  async launch(generation) {
    const java = path.join(this.runtime, 'java', 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    const jar = path.join(this.runtime, 'engine', 'kkFileView.jar');
    const office = path.join(this.runtime, 'office', process.platform === 'darwin' ? 'LibreOffice.app/Contents' : 'LibreOffice');
    for (const file of [java, jar, office]) if (!fs.existsSync(file)) {
      this.status('error', '预览组件不完整，请使用完整便携包。'); throw new Error('预览组件不完整，请重新解压完整便携包。开发环境请先运行 runtime:prepare。');
    }
    this.status('starting', '正在准备预览引擎，首次打开请稍候…');
    const run = path.join(this.data, 'engine');
    const cache = path.join(this.data, 'cache', require('../../package.json').version);
    await fsp.mkdir(run, { recursive: true }); await fsp.mkdir(cache, { recursive: true });
    await fsp.mkdir(path.join(this.data, 'logs'), { recursive: true });
    await fsp.mkdir(path.join(this.data, 'tmp'), { recursive: true });
    await fsp.mkdir(path.join(run, 'bin'), { recursive: true });
    const config = path.join(run, 'application.properties');
    const baseline = await fsp.readFile(path.join(this.runtime, 'engine', 'application.properties'), 'utf8');
    const officePort = await freePort();
    const overrides = {
      'server.address': '127.0.0.1', 'server.port': '0', 'file.dir': cache + '/',
      'office.home': office, 'office.plugin.server.ports': officePort,
      'cache.type': 'jdk', 'cache.clean.enabled': 'false', 'delete.source.file': 'false',
      'trust.host': '127.0.0.1', 'not.trust.host': '', 'local.preview.dir': 'default',
      'file.upload.disable': 'true', 'delete.password': 'false', 'kk.key': 'false',
      'kk.scriptjs': 'false', 'kk.enable.redirect': 'false', 'kk.ignore.ssl': 'false',
      'pdf.print.disable': 'false', 'pdf.download.disable': 'false',
      'pdf.disable.editing': 'false', 'office.preview.switch.disabled': 'false',
      'cad.thread': '1', 'pdf.max.threads': '2', 'tif.thread': '1',
      'media.convert.disable': 'false', 'kk.refreshschedule': '1',
      'spring.main.banner-mode': 'off', 'logging.file.name': path.join(this.data, 'logs', 'engine.log'),
      'management.endpoints.web.exposure.include': 'health', 'management.endpoint.health.show-details': 'never'
    };
    await fsp.writeFile(config, baseline + '\n# LanYue desktop overrides\n' + Object.entries(overrides).map(([key, value]) => `${key}=${prop(value)}`).join('\n'), { mode: 0o600 });
    if (generation !== this.generation) throw new Error('预览启动已取消。');
    const output = fs.createWriteStream(path.join(this.data, 'logs', 'engine-console.log'), { flags: 'w', mode: 0o600 });
    this.child = spawn(java, ['-Xms64m', '-Xmx1536m', '-Dfile.encoding=UTF-8', '-Djava.awt.headless=true',
      `-Djava.io.tmpdir=${path.join(this.data, 'tmp')}`, '-jar', jar, `--spring.config.location=${config}`], {
      cwd: run, detached: process.platform !== 'win32', windowsHide: true,
      env: { ...process.env, KKFILEVIEW_BIN_FOLDER: path.join(run, 'bin'), LANYUE_ENGINE_TOKEN: this.secret, LANYUE_CONFIG: config,
        LANYUE_SOURCE_ORIGIN: this.sourceOrigin, ...(process.platform === 'darwin' ? { LANYUE_7ZIP: path.join(this.runtime, 'tools/7zz') } : {}) }
    });
    const child = this.child;
    let launchError, buffer = '';
    const log = chunk => {
      output.write(chunk); buffer = (buffer + chunk.toString()).slice(-6000);
      const match = /Tomcat started on port\s+(\d+)/.exec(buffer);
      if (match) this.origin = `http://127.0.0.1:${match[1]}`;
    };
    child.stdout.on('data', log); child.stderr.on('data', log);
    child.on('error', error => { launchError = error; });
    child.on('exit', () => {
      output.end();
      if (this.child === child) { this.child = null; this.origin = null; if (this.state.phase !== 'stopping') this.status('error', '预览引擎已退出，可重新打开文件重试。'); }
    });
    const deadline = Date.now() + 100000;
    try {
      while (Date.now() < deadline) {
        if (generation !== this.generation) throw new Error('预览启动已取消。');
        if (launchError) throw launchError;
        if (child.exitCode !== null) throw new Error('预览引擎未能启动，请查看诊断日志。');
        if (this.origin) {
          try {
            const result = await fetch(this.origin + '/actuator/health', { headers: { 'X-LanYue-Token': this.secret }, signal: AbortSignal.timeout(1500) });
            if (result.ok && (await result.json()).status === 'UP') { this.status('ready', '预览引擎就绪 · 本地处理'); return this.origin; }
          } catch {}
        }
        await delay(250);
      }
      throw new Error('预览引擎启动超时，请重试或查看诊断日志。');
    } catch (error) { if (generation === this.generation) { await this.stop(); this.status('error', error.message); } throw error; }
  }
  async stop() {
    this.generation++;
    const child = this.child; if (!child) { this.status('idle', '按需启动 · 本地处理'); return; }
    this.status('stopping', '正在释放预览资源…');
    if (process.platform === 'win32') {
      await new Promise(resolve => { const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }); killer.on('error', resolve); killer.on('exit', resolve); });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch {}
      for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++) await delay(100);
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
    this.child = null; this.origin = null; this.status('idle', '按需启动 · 本地处理');
  }
}
module.exports = { Engine };
