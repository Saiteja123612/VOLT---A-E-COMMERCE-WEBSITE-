import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { catalog } from '../catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function buildPages(output = resolve(root, 'github-pages')) {
  mkdirSync(output, { recursive: true });
  // Explicit public-only allowlist. Never copy SQLite, uploads, logs, or credentials.
  for (const file of ['app.js', 'marketplace.js', 'styles.css', 'marketplace.css', 'fonts.css', 'pages-preview.js', 'operations.js', 'operations.css', 'images']) {
    cpSync(resolve(root, 'public', file), resolve(output, file), { recursive: true });
  }
  let html = readFileSync(resolve(root, 'public/index.html'), 'utf8');
  html = html.replace('<html lang="en">', '<html lang="en" data-store-mode="preview">')
    .replace('<script src="./app.js" defer>', '<script src="./pages-preview.js" defer></script><script src="./app.js" defer>')
    .replace('<body>', '<body><div class="preview-banner"><strong>VOLT preview</strong><span>Browse products and try the bag. Accounts, selling, and orders are not connected.</span></div>')
    .replace('Local demo store', 'Storefront preview')
    .replace('A working local demo with a sample catalog. Orders are saved on this computer; no payment is taken and no products are dispatched.', 'A browsing preview with sample prices and stock. Your bag and favorites stay in this browser. No orders or payments are accepted.');
  writeFileSync(resolve(output, 'index.html'), html);
  writeFileSync(resolve(output, '.nojekyll'), '');
  writeFileSync(resolve(output, 'catalog.json'), JSON.stringify(catalog.map(p => ({ ...p, photo:p.photo?.replace(/^\//, './'), sellerId:null, sellerName:p.demoListing?'VOLT demo catalog':'VOLT Studio', rating:0, reviewCount:0 })), null, 2));
  console.log(`GitHub Pages files ready: ${output}`);
  return output;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) buildPages();
