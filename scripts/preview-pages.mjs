import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repositoryPath = '/VOLT---A-E-COMMERCE-WEBSITE-/';
export function pagesServer(directory) {
  const root = resolve(directory);
  const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
  return createServer((req,res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!path.startsWith(repositoryPath)) { res.writeHead(404);return res.end('Not found'); }
      const file = resolve(root, path.slice(repositoryPath.length) || 'index.html');
      if (!file.startsWith(root + sep) || !statSync(file).isFile()) { res.writeHead(404);return res.end('Not found'); }
      res.writeHead(200, {'Content-Type':types[extname(file)] || 'text/plain','Cache-Control':'no-store'});
      res.end(readFileSync(file));
    } catch { res.writeHead(404);res.end('Not found'); }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../github-pages');
  pagesServer(root).listen(3101,'127.0.0.1',()=>console.log(`Pages preview: http://localhost:3101${repositoryPath}`));
}
