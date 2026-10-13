import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { catalog } from '../catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exportedFiles = ['app.js','marketplace.js','styles.css','marketplace.css','fonts.css','pages-preview.js','operations.js','operations.css','index.html','catalog.json','.nojekyll'];
function checkImages(directory) {
  if(lstatSync(directory).isSymbolicLink())throw new Error('Do not publish linked asset directories.');
  for(const entry of readdirSync(directory,{withFileTypes:true})) {
    const path=resolve(directory,entry.name);
    if(entry.isSymbolicLink() || entry.name.startsWith('.'))throw new Error(`Unexpected public asset: ${entry.name}`);
    if(entry.isDirectory())checkImages(path);
    else if(!entry.isFile() || !/\.(svg|png|jpg|jpeg|webp)$/i.test(entry.name))throw new Error(`Unexpected public asset: ${entry.name}`);
  }
}
export function buildPages(output = resolve(root, 'github-pages')) {
  // Fail closed instead of republishing unexpected files left by a manual upload.
  if(existsSync(output)) {
    if(lstatSync(output).isSymbolicLink())throw new Error('Do not publish a linked output directory.');
    for(const entry of readdirSync(output,{withFileTypes:true})) {
      if(entry.name==='images' && entry.isDirectory())checkImages(resolve(output,'images'));
      else if(!entry.isFile() || !exportedFiles.includes(entry.name))throw new Error(`Unexpected deployment file: ${entry.name}`);
    }
  }
  checkImages(resolve(root,'public/images'));
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
