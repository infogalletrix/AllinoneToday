import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
const root = resolve(import.meta.dirname, '../artifacts/app-previews');
const types = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf','.svg':'image/svg+xml'};
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (!path.startsWith('/app-previews/')) throw new Error('Not found');
    let file = resolve(root, path.slice('/app-previews/'.length));
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Not found');
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(4179, '127.0.0.1', () => console.log('App previews: http://127.0.0.1:4179/app-previews/'));
