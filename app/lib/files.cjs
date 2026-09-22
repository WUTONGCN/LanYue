const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
// kkFileView's URL detection follows Java URLEncoder, which also escapes these
// characters left literal by encodeURIComponent. Avoid double-encoding names.
const encodeFileName = value => encodeURIComponent(value).replace(/[!'()*~]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());

class FileBroker {
  constructor() { this.files = new Map(); this.tokens = new Map(); }
  async add(input) {
    if (typeof input !== 'string' || !path.isAbsolute(input)) throw new Error('请选择本地文件。');
    const real = await fsp.realpath(input);
    const stat = await fsp.stat(real);
    if (!stat.isFile()) throw new Error('请打开文件；文件夹请使用“打开文件夹”。');
    const id = crypto.createHash('sha256').update(real).digest('hex').slice(0, 24);
    const old = this.files.get(id);
    const item = { id, path: real, name: path.basename(real), size: stat.size, modified: stat.mtimeMs,
      extension: path.extname(real).slice(1).toLowerCase(), token: old?.token || crypto.randomBytes(24).toString('hex') };
    this.files.set(id, item); this.tokens.set(item.token, id);
    return this.public(item);
  }
  public(item) { const { token, ...safe } = item; return safe; }
  get(id) { const item = this.files.get(id); if (!item) throw new Error('文件尚未打开，请重新选择。'); return item; }
  async companions(id) {
    const primary = this.get(id), base = path.dirname(primary.path), seen = new Set([primary.path]), items = [];
    const add = async name => {
      if (!name || /^(?:[a-z]+:|\/|\\)/i.test(name) || items.length >= 200) return;
      const candidate = path.resolve(base, name.replaceAll('\\', '/'));
      if (!candidate.startsWith(base + path.sep) || seen.has(candidate)) return;
      try {
        const real = await fsp.realpath(candidate);
        if (!real.startsWith(base + path.sep)) return;
        seen.add(candidate); const item = await this.add(real); items.push(item); return item;
      } catch {}
    };
    // Follow only explicit model references, bounded to the selected model's folder.
    if (primary.size <= 32 * 1024 * 1024 && primary.extension === 'gltf') {
      try { const gltf = JSON.parse(await fsp.readFile(primary.path, 'utf8'));
        for (const entry of [...(gltf.buffers || []), ...(gltf.images || [])]) if (entry.uri) await add(decodeURIComponent(entry.uri));
      } catch {}
    }
    if (primary.size <= 32 * 1024 * 1024 && primary.extension === 'obj') {
      const text = await fsp.readFile(primary.path, 'utf8');
      for (const line of text.split(/\r?\n/)) if (/^\s*mtllib\s+/.test(line)) {
        const name = line.replace(/^\s*mtllib\s+/, '').trim();
        const material = await add(name);
        if (material && material.size <= 4 * 1024 * 1024) {
          for (const row of (await fsp.readFile(material.path, 'utf8')).split(/\r?\n/)) {
            if (/^\s*(?:map_\w+|bump|disp|decal|norm)\s+/i.test(row)) {
              const reference = row.trim().split(/\s+/).slice(1).join(' ');
              await add(path.join(path.dirname(name), reference));
            }
          }
        }
      }
    }
    return items;
  }
  async start() {
    this.server = http.createServer(async (req, res) => {
      try {
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
        const parts = new URL(req.url, 'http://127.0.0.1').pathname.split('/');
        const item = this.files.get(this.tokens.get(parts[2]));
        if (parts[1] !== 'source' || !item || decodeURIComponent(parts.slice(3).join('/')) !== item.name) {
          res.writeHead(404); return res.end();
        }
        const real = await fsp.realpath(item.path);
        if (real !== item.path) { res.writeHead(403); return res.end(); }
        const stat = await fsp.stat(real);
        let start = 0, end = stat.size - 1, status = 200;
        if (req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
          if (match[1]) { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
          else { start = Math.max(0, stat.size - Number(match[2])); }
          if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
          status = 206;
        }
        const headers = { 'Content-Type': 'application/octet-stream', 'Content-Length': Math.max(0, end - start + 1),
          'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(item.name)}` };
        if (this.previewOrigin) headers['Access-Control-Allow-Origin'] = this.previewOrigin;
        if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        res.writeHead(status, headers);
        if (req.method === 'HEAD' || !stat.size) return res.end();
        const stream = fs.createReadStream(real, { start, end });
        stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
      } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
    });
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(0, '127.0.0.1', resolve); });
    this.origin = `http://127.0.0.1:${this.server.address().port}`;
  }
  url(id) { const item = this.get(id); return `${this.origin}/source/${item.token}/${encodeFileName(item.name)}`; }
  async stop() { if (this.server) { this.server.closeAllConnections(); await new Promise(resolve => this.server.close(resolve)); } }
}
module.exports = { FileBroker, encodeFileName };
