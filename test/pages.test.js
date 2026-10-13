import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { runInNewContext } from 'node:vm';
import { buildPages } from '../scripts/build-pages.mjs';
import { pagesServer, repositoryPath } from '../scripts/preview-pages.mjs';

let folder, server, origin, api;
before(async()=>{
  folder=mkdtempSync(join(tmpdir(),'volt-pages-'));buildPages(folder);
  server=pagesServer(folder);server.listen(0,'127.0.0.1');await once(server,'listening');
  origin=`http://127.0.0.1:${server.address().port}${repositoryPath}`;
  const window={};runInNewContext(readFileSync(join(folder,'pages-preview.js'),'utf8'),{window,fetch:path=>fetch(new URL(path,origin))});api=window.voltPreviewApi;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));rmSync(folder,{recursive:true,force:true});});
test('static export resolves scripts, styles, fonts, and every product image under a repository subpath',async()=>{
  const html=await (await fetch(origin)).text();
  assert.match(html,/data-store-mode="preview"/);
  assert.ok(html.indexOf('./pages-preview.js')<html.indexOf('./app.js'));
  for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
    if(/^https?:/.test(match[1]))continue;
    const url=new URL(match[1],origin);assert.ok(url.pathname.startsWith(repositoryPath),url.href);
    assert.equal((await fetch(url)).status,200,url.href);
  }
  const css=await (await fetch(new URL('./styles.css',origin))).text();assert.match(css,/url\('\.\/fonts.css'\)/);
  const products=(await api('/api/products')).products;assert.equal(products.length,19);
  for(const p of products){const image=p.photo||`./images/${p.image}.svg`;assert.equal((await fetch(new URL(image,origin))).status,200,image);}
  assert.equal((await fetch(new URL('/styles.css',origin))).status,404);
  assert.equal((await fetch(new URL('./api/products',origin))).status,404);
  assert.deepEqual(readdirSync(folder).sort(),['.nojekyll','app.js','catalog.json','fonts.css','images','index.html','marketplace.css','marketplace.js','operations.css','operations.js','pages-preview.js','styles.css']);
});
test('preview cart calculates sample prices, coupon cap, quantities and shipping without a backend',async()=>{
  const phone=await api('/api/quote',{items:[{id:'iphone-16',quantity:1,price:1}],coupon:'volt10'});
  assert.equal(phone.total,6890000);assert.equal(phone.discount,100000);assert.equal(phone.shipping,0);
  const small=await api('/api/quote',{items:[{id:'arc-mouse',quantity:1}]});assert.equal(small.total,159800);
  const fraction=await api('/api/quote',{items:[{id:'sound-one',quantity:1}],coupon:'VOLT10'});assert.equal(fraction.total,449910);
  for(const items of [[],[{id:'unknown',quantity:1}],[{id:'iphone-16',quantity:11}],[{id:'iphone-16',quantity:1},{id:'iphone-16',quantity:1}]])await assert.rejects(api('/api/quote',{items}));
});
test('static preview never pretends to authenticate or accept orders',async()=>{
  assert.equal((await api('/api/auth/me')).user,null);
  for(const route of ['/api/auth/register','/api/auth/login','/api/orders','/api/seller/products','/api/orders/lookup'])await assert.rejects(api(route,{}),/browsing preview/);
});
test('export rejects unexpected private files and does not serve backend files',async()=>{
  for(const path of ['server.js','.env','data/store.sqlite','scripts/admin.mjs','test/store.test.js'])assert.equal((await fetch(new URL(path,origin))).status,404,path);
  const stray=join(folder,'.env');writeFileSync(stray,'EXAMPLE=test');
  try{assert.throws(()=>buildPages(folder),/Unexpected deployment file/);}finally{unlinkSync(stray);}
  const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
  assert.equal(vercel.outputDirectory,'github-pages');
  assert.match(vercel.buildCommand,/build:pages/);
  assert.ok(vercel.headers[0].headers.some(h=>h.key==='Content-Security-Policy'&&h.value.includes("frame-ancestors 'none'")));
});
