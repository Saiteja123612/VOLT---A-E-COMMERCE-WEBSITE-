import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn,spawnSync } from 'node:child_process';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

const folder=mkdtempSync(join(tmpdir(),'volt-admin-test-')),dbPath=join(folder,'store.sqlite'),origin='http://127.0.0.1:3102';let server;
const client=()=>({cookie:'',csrf:''});
async function call(path,data,c=client(),headers={}){
 const response=await fetch(origin+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),Cookie:c.cookie,'X-CSRF-Token':c.csrf,...headers},body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();if(response.headers.get('set-cookie'))c.cookie=response.headers.get('set-cookie').split(';')[0];if(result.csrf)c.csrf=result.csrf;return {status:response.status,data:result};
}
async function start(){server=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'3102',DB_PATH:dbPath},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Startup timeout')),10000);server.stdout.on('data',d=>{if(d.toString().includes('VOLT is ready')){clearTimeout(timer);resolve();}});server.once('error',reject);server.once('exit',code=>{if(code)reject(new Error('Server exited '+code));});});}
async function stop(){const done=once(server,'exit');server.kill();await done;}
before(start);after(async()=>{await stop();rmSync(folder,{recursive:true,force:true});});
test('admin and customer operations are persisted and enforce role boundaries',async t=>{
 const owner=client(),buyer=client(),stranger=client();const password='OnlyForTesting2026!';let buyerId,order,ticket,product;
 const customer={name:'Test Buyer',email:'buyer@volt.test',phone:'9876543210',address:'123 Example Street',city:'Hyderabad',state:'Telangana',pincode:'500001'};
 const orderInput=()=>({items:[{id:'iphone-16',quantity:1}],customer,payment:'cod',requestKey:randomUUID(),accessToken:randomUUID()});
 await t.test('registration cannot grant admin and owner bootstrap revokes old sessions',async()=>{
  const reg=await call('/api/auth/register',{name:'Store Owner',email:'owner@volt.test',password,role:'admin'},owner);assert.equal(reg.data.user.role,'customer');
  buyerId=(await call('/api/auth/register',{name:'Test Buyer',email:'buyer@volt.test',password},buyer)).data.user.id;
  await call('/api/auth/register',{name:'Other Customer',email:'other@volt.test',password},stranger);
  assert.equal((await call('/api/admin/overview',undefined,owner)).status,403);
  const grant=spawnSync(process.execPath,['scripts/admin.mjs','owner@volt.test'],{cwd:new URL('..',import.meta.url),env:{...process.env,DB_PATH:dbPath},encoding:'utf8'});assert.equal(grant.status,0,grant.stderr);
  assert.equal((await call('/api/auth/me',undefined,owner)).data.user,null);
  assert.equal((await call('/api/auth/login',{email:'owner@volt.test',password},owner)).data.user.role,'admin');
  for(const path of ['overview','products','users','orders','support','coupons','audit'])assert.equal((await call('/api/admin/'+path,undefined,buyer)).status,403);
  assert.equal((await call('/api/admin/overview')).status,401);
 });
 await t.test('admin manages catalog with CSRF protection and hidden items cannot be purchased',async()=>{
  product=(await call('/api/admin/products',undefined,owner)).data.products.find(p=>p.id==='iphone-16');
  assert.equal((await call('/api/admin/products/save',{...product,price:6490000,stock:7},buyer)).status,403);
  assert.equal((await call('/api/admin/products/save',{...product,price:6490000,stock:7},owner,{'X-CSRF-Token':'wrong'})).status,403);
  assert.equal((await call('/api/admin/products/save',{...product,price:6490000,stock:7},owner)).status,200);
  assert.equal((await call('/api/admin/products/visibility',{id:product.id,hidden:true},owner)).status,200);
  assert.equal((await call('/api/products')).data.products.some(p=>p.id===product.id),false);
  assert.equal((await call('/api/orders',orderInput(),buyer)).status,400);
  await call('/api/admin/products/visibility',{id:product.id,hidden:false},owner);
  const p={name:'Admin desk light',category:'Desk setup',price:150000,originalPrice:170000,stock:5,image:'lamp',photo:'',description:'An adjustable desk light for the test store inventory.',tagline:'A bright idea for your desk',specs:['USB-C power'],condition:'New'};
  assert.equal((await call('/api/admin/products/save',p,owner)).status,201);
 });
 await t.test('coupons enforce server amounts, expiry, caps, and minimum spend',async()=>{
  const coupon={code:'HELLO20',percent:20,cap:200000,minimum:500000,active:true,expiresAt:''};assert.equal((await call('/api/admin/coupons/save',coupon,owner)).status,200);
  assert.equal((await call('/api/quote',{items:[{id:product.id,quantity:1}],coupon:'hello20'})).data.discount,200000);
  assert.equal((await call('/api/quote',{items:[{id:'arc-mouse',quantity:1}],coupon:'HELLO20'})).status,400);
  await call('/api/admin/coupons/save',{...coupon,expiresAt:'2020-01-01T00:00:00Z'},owner);assert.equal((await call('/api/quote',{items:[{id:product.id,quantity:1}],coupon:'HELLO20'})).status,400);
  await call('/api/admin/coupons/save',coupon,owner);
 });
 await t.test('admin fulfills seed catalog orders and tracking appears to the buyer',async()=>{
  const response=await call('/api/orders',orderInput(),buyer);assert.equal(response.status,201);order=response.data;
  assert.equal((await call('/api/admin/orders/update',{id:order.id,productId:product.id,status:'Delivered'},owner)).status,409);
  for(const status of ['Processing','Shipped','Delivered']){const result=await call('/api/admin/orders/update',{id:order.id,productId:product.id,status,carrier:'Test Courier',tracking:'DEMO-TRACK-001'},owner);assert.equal(result.status,200,JSON.stringify(result.data));}
  const saved=(await call('/api/account/orders',undefined,buyer)).data.orders[0];assert.equal(saved.status,'Delivered');assert.equal(saved.items[0].tracking.number,'DEMO-TRACK-001');
  assert.equal((await call('/api/admin/orders/update',{id:order.id,status:'Cancelled'},owner)).status,409);
  assert.equal((await call('/api/reviews',{productId:product.id,rating:5,comment:'This is a verified test purchase review.'},buyer)).status,200);
 });
 await t.test('admin cancellation restores stock once',async()=>{
  const before=(await call('/api/products')).data.products.find(p=>p.id===product.id).stock;
  const otherOrder=(await call('/api/orders',orderInput(),buyer)).data;
  for(let i=0;i<2;i++)assert.equal((await call('/api/admin/orders/update',{id:otherOrder.id,status:'Cancelled'},owner)).status,200);
  assert.equal((await call('/api/products')).data.products.find(p=>p.id===product.id).stock,before);
 });
 await t.test('customer return conversations are scoped, persistent, and actionable by admins',async()=>{
  const req={kind:'return',orderId:order.id,subject:'Return my test order',message:'Please help me return the delivered item.'};
  assert.equal((await call('/api/account/support',req,stranger)).status,404);
  assert.equal((await call('/api/account/support',{...req,orderId:''},buyer)).status,400);
  const result=await call('/api/account/support',req,buyer);assert.equal(result.status,201,JSON.stringify(result.data));ticket=result.data.ticket;assert.equal(ticket.messages.length,1);
  assert.equal((await call('/api/account/support?id='+ticket.id,undefined,stranger)).status,404);
  assert.equal((await call('/api/account/support/reply',{id:ticket.id,message:'Read someone else’s request'},stranger)).status,404);
  assert.equal((await call('/api/admin/support/reply',{id:ticket.id,message:'We will arrange the return with you here.'},owner)).status,200);
  assert.equal((await call('/api/admin/support/status',{id:ticket.id,status:'approved'},owner)).status,200);
  const updated=(await call('/api/account/support?id='+ticket.id,undefined,buyer)).data.ticket;assert.equal(updated.status,'approved');assert.equal(updated.messages[1].staff,1);
  assert.equal((await call('/api/admin/support/status',{id:ticket.id,status:'resolved'},owner)).status,200);
  assert.equal((await call('/api/account/support/reply',{id:ticket.id,message:'Another reply'},buyer)).status,409);
 });
 await t.test('suspension invalidates sessions and hides seller inventory without deleting data',async()=>{
  await call('/api/seller/enroll',{storeName:'Buyer Test Store'},buyer);
  const p={name:'Seller keyboard',category:'Desk setup',price:200000,originalPrice:220000,stock:4,image:'keyboard',photo:'',description:'A quiet keyboard with a compact layout for testing.',tagline:'A compact everyday keyboard',specs:['USB-C connection'],condition:'New'};
  const listing=(await call('/api/seller/products',p,buyer)).data.product;
  assert.equal((await call('/api/admin/users/update',{id:buyerId,status:'suspended'},owner)).status,200);
  assert.equal((await call('/api/auth/me',undefined,buyer)).data.user,null);
  assert.equal((await call('/api/auth/login',{email:'buyer@volt.test',password},buyer)).status,403);
  assert.equal((await call('/api/products')).data.products.some(p=>p.id===listing.id),false);
  await call('/api/admin/users/update',{id:buyerId,status:'active'},owner);await call('/api/auth/login',{email:'buyer@volt.test',password},buyer);
  assert.equal((await call('/api/products')).data.products.some(p=>p.id===listing.id),true);
  const own=(await call('/api/auth/me',undefined,owner)).data.user;
  assert.equal((await call('/api/admin/users/update',{id:own.id,role:'customer'},owner)).status,409);
  assert.equal((await call('/api/admin/users/update',{id:own.id,status:'suspended'},owner)).status,409);
 });
 await t.test('restart keeps admin pricing, support history, role, audit trail and new inventory',async()=>{
  await stop();await start();
  const inventory=(await call('/api/products')).data.products;
  assert.equal(inventory.find(p=>p.id===product.id).price,6490000);assert.equal(inventory.find(p=>p.id===product.id).stock,6);
  assert.equal(inventory.some(p=>p.name==='Admin desk light'),true);
  assert.equal((await call('/api/account/support?id='+ticket.id,undefined,buyer)).data.ticket.messages.length,2);
  assert.equal((await call('/api/auth/me',undefined,owner)).data.user.role,'admin');
  const audit=(await call('/api/admin/audit',undefined,owner)).data.events;assert.ok(audit.some(a=>a.action==='admin.granted_by_owner'));assert.ok(audit.some(a=>a.action==='product.updated'));assert.ok(audit.some(a=>a.action==='support.status'));
  const overview=(await call('/api/admin/overview',undefined,owner)).data;assert.equal(overview.metrics.customers,3);assert.equal(overview.metrics.orders,2);assert.equal(overview.trend.length,7);
 });
});
