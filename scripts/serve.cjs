'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '../public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };
function createServer() {
  return http.createServer(async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
      const realFile = await fs.realpath(file);
      if (!realFile.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
      const body = await fs.readFile(realFile);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (require.main === module) {
  const port = Number(process.env.PORT || 4873);
  const server = createServer();
  server.on('error', error => { console.error('無法啟動伺服器：' + error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Timing Studio: http://localhost:${server.address().port}`));
}
module.exports = { createServer };
