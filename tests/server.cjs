// Small Range-capable static server: local tests exercise the same MP4 seeking as GitHub Pages.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.SITE_ROOT || path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 18770);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp4': 'video/mp4', '.jpeg': 'image/jpeg' };
http.createServer((req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/videogame\//, '/'); }
  catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, `.${name === '/' ? '/index.html' : name}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
    let start = 0, end = stat.size - 1;
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) { start = Number(range[1]); if (range[2]) end = Math.min(Number(range[2]), end); }
    if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
    const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD') res.end();
    else { const stream = fs.createReadStream(file, { start, end }); stream.pipe(res); res.on('close', () => stream.destroy()); }
  });
}).listen(port, '127.0.0.1', () => console.log(`Test server: http://127.0.0.1:${port}/videogame/`));
