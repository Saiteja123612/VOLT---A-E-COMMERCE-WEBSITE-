import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog } from './catalog.js';
import { marketplace } from './marketplace.js';
import { operations } from './operations.js';

const root = dirname(fileURLToPath(import.meta.url));
const publicOrigin=process.env.PUBLIC_ORIGIN?new URL(process.env.PUBLIC_ORIGIN).origin:null;
if(process.env.NODE_ENV==='production'&&(!publicOrigin||!publicOrigin.startsWith('https://')))throw new Error('Set PUBLIC_ORIGIN to your HTTPS website origin in production.');
const dbPath = process.env.DB_PATH || resolve(root, 'data/store.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, payload TEXT NOT NULL, price INTEGER NOT NULL, stock INTEGER NOT NULL CHECK(stock>=0));
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, request_key TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);`);
db.exec('CREATE TABLE IF NOT EXISTS catalog_overrides(product_id TEXT PRIMARY KEY REFERENCES products(id))');
const seed = db.prepare('INSERT INTO products VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, price=excluded.price WHERE products.id NOT IN (SELECT product_id FROM catalog_overrides)');
for (const p of catalog) seed.run(p.id, JSON.stringify(p), p.price, p.stock);
const uploadDir = resolve(dirname(dbPath), 'uploads');
const market = marketplace(db, { body, customer, uploadDir, secureCookies:Boolean(publicOrigin?.startsWith("https://")) });
const ops=operations(db,{body,market});
const productRows = () => market.enrichProducts(db.prepare('SELECT * FROM products').all().map(r => ({ ...JSON.parse(r.payload), price:r.price, stock:r.stock })));
const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const hash = value => createHash('sha256').update(value).digest('hex');
function quote(input) {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length>30) fail('Add at least one item to your bag.');
  const products = productRows(); const seen = new Set();
  const items = input.items.map(item => {
    if(!item||typeof item!=='object')fail('Your bag contains an invalid product.');
    const product = products.find(p=>p.id===item.id);
    if (!product || seen.has(item.id)) fail('Your bag contains an invalid or duplicate product.');
    seen.add(item.id);
    if (!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>10) fail('Choose between 1 and 10 of each item.');
    if (item.quantity>product.stock) fail(`${product.name} has only ${product.stock} left.`,409);
    return {id:product.id,name:product.name,quantity:item.quantity,price:product.price,lineTotal:product.price*item.quantity,sellerId:product.sellerId,sellerName:product.sellerName,image:product.image,photo:product.photo||'',status:'Confirmed'};
  });
  const subtotal=items.reduce((sum,item)=>sum+item.lineTotal,0);
  const coupon=String(input.coupon||'').trim().toUpperCase();
  const discount=ops.couponDiscount(coupon,subtotal);
  const shipping=subtotal>=299900?0:9900;
  return {items,coupon,subtotal,discount,shipping,total:subtotal-discount+shipping,currency:'INR',taxNote:'All displayed prices are inclusive of applicable taxes.'};
}
async function body(req, maximum=20000) {
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>maximum)fail('Request is too large.',413);chunks.push(chunk);}
  try{const value=JSON.parse(Buffer.concat(chunks).toString());if(!value||typeof value!=='object'||Array.isArray(value))fail('Send a JSON object.');return value;}catch{fail('Invalid JSON object.');}
}
function customer(input) {
  const c={};for(const key of ['name','email','phone','address','city','state','pincode']){
    if(typeof input?.[key]!=='string')fail('Please complete your delivery details.');
    c[key]=input[key].trim();if(!c[key]||c[key].length>250)fail('Please check your delivery details.');
  }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))fail('Enter a valid email address.');
  if(!/^[6-9]\d{9}$/.test(c.phone))fail('Enter a valid 10-digit Indian mobile number.');
  if(!/^[1-9]\d{5}$/.test(c.pincode))fail('Enter a valid 6-digit PIN code.');
  if(c.name.length<2||c.address.length<8)fail('Enter your full name and complete address.');
  return c;
}
const limits=new Map();
function rateLimit(req){const key=req.socket.remoteAddress;const now=Date.now();let item=limits.get(key);if(!item||now-item.start>60000){item={start:now,count:0};limits.set(key,item);}if(++item.count>180)fail('Too many requests. Please wait a minute.',429);}
const server=http.createServer(async(req,res)=>{
  const json=(status,payload)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));};
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  try {
    if(!(publicOrigin?req.headers.host===new URL(publicOrigin).host:/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||'')))fail('Invalid host.',403);
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/')) {
      rateLimit(req);
      if(req.method==='POST'){
        if(req.headers.origin && req.headers.origin!==(publicOrigin||`http://${req.headers.host}`))fail('Cross-origin request rejected.',403);
        if(!req.headers['content-type']?.startsWith('application/json'))fail('Send application/json.',415);
      }
      if(await ops.handle(req,res,url,json))return;
      if(await market.handle(req,res,url,json))return;
      if(req.method==='GET'&&url.pathname==='/api/products')return json(200,{products:productRows()});
      if(req.method==='GET'&&url.pathname==='/api/health')return json(200,{ok:true,database:'SQLite'});
      if(req.method==='POST'&&url.pathname==='/api/quote')return json(200,quote(await body(req)));
      if(req.method==='POST'&&url.pathname==='/api/orders'){
        const session=market.identify(req)?market.requireSession(req):null;
        const input=await body(req);const c=customer(input.customer);
        if(input.payment!=='cod')fail('Only cash on delivery is available.');
        if(!/^[a-f0-9-]{36}$/.test(input.requestKey||''))fail('Missing checkout request key.');
        if(!/^[a-f0-9-]{36}$/.test(input.accessToken||''))fail('Missing order access token.');
        const existing=db.prepare('SELECT * FROM orders WHERE request_key=?').get(input.requestKey);
        if(existing){if(hash(input.accessToken)!==existing.token_hash)fail('Checkout key already used.',409);return json(200,JSON.parse(existing.payload));}
        db.exec('BEGIN IMMEDIATE');
        try{
          const totals=quote(input);const id='VLT-'+randomUUID().slice(0,8).toUpperCase();
          if(input.expectedTotal!==undefined && input.expectedTotal!==totals.total)fail('Prices changed. Return to your bag to review the updated total.',409);
          if(session && totals.items.some(i=>i.sellerId===session.user.id))fail('You cannot buy your own listing.');
          const order={id,...totals,customer:c,payment:'Cash on delivery',status:'Confirmed',createdAt:new Date().toISOString()};
          for(const item of totals.items)db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(item.quantity,item.id);
          db.prepare('INSERT INTO orders VALUES(?,?,?,?,?)').run(id,hash(input.accessToken),input.requestKey,JSON.stringify(order),order.createdAt);
          if(session)db.prepare('INSERT INTO order_owners VALUES(?,?)').run(id,session.user.id);
          db.exec('COMMIT');return json(201,order);
        }catch(error){db.exec('ROLLBACK');throw error;}
      }
      if(req.method==='POST'&&url.pathname==='/api/orders/lookup'){
        const input=await body(req);const row=db.prepare('SELECT * FROM orders WHERE id=?').get(String(input.id||'').toUpperCase());
        if(!row||typeof input.accessToken!=='string'||!timingSafeEqual(Buffer.from(row.token_hash),Buffer.from(hash(input.accessToken))))fail('Order not found. Check the order ID and access key.',404);
        return json(200,JSON.parse(row.payload));
      }
      return json(404,{error:'Endpoint not found.'});
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(405,{error:'Method not allowed.'});
    if(/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/.test(url.pathname)){
      const filePath=resolve(uploadDir,url.pathname.split('/').pop());
      if(!existsSync(filePath))return json(404,{error:'Image not found.'});
      const types={'.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
      res.writeHead(200,{'Content-Type':types[extname(filePath)],'Cache-Control':'public,max-age=86400'});res.end(req.method==='HEAD'?undefined:readFileSync(filePath));return;
    }
    const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const publicRoot=resolve(root,'public');const path=resolve(publicRoot,relative);
    if(!path.startsWith(publicRoot+'/')&&!path.startsWith(publicRoot+'\\'))return json(403,{error:'Forbidden'});
    if(!existsSync(path))return json(404,{error:'File not found.'});
    const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
    const file=readFileSync(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:file);
  }catch(error){if(!error.status)console.error(error);json(error.status||500,{error:error.status?error.message:'Something went wrong. Please try again.'});}
});
const port=Number(process.env.PORT||3000);
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`VOLT is ready at http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
