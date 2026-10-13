import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

const temp=mkdtempSync(join(tmpdir(),'volt-market-test-')); const dbPath=join(temp,'store.sqlite');
const origin='http://127.0.0.1:3098';let server;
function client(){return {cookie:'',csrf:''};}
async function call(path,data,c=client(),headers={}){
 const response=await fetch(origin+path,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),Cookie:c.cookie,'X-CSRF-Token':c.csrf,...headers},body:data===undefined?undefined:JSON.stringify(data)});
 const result=await response.json();const cookie=response.headers.get('set-cookie');if(cookie)c.cookie=cookie.split(';')[0];if(result.csrf)c.csrf=result.csrf;
 return {status:response.status,data:result,headers:response.headers};
}
async function start(){server=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'3098',DB_PATH:dbPath},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Startup timeout')),10000);server.stdout.on('data',value=>{if(value.toString().includes('VOLT is ready')){clearTimeout(timeout);resolve();}});server.once('error',reject);server.once('exit',code=>{if(code)reject(new Error(`Exited ${code}`));});});}
async function stop(){const exit=once(server,'exit');server.kill();await exit;}
before(start);after(async()=>{await stop();rmSync(temp,{recursive:true,force:true});});
test('complete marketplace journey, authentication and ownership boundaries',async t=>{
 const seller=client(),buyer=client(),other=client();let product,order,recovery;
 const password='ExamplePass-2026!';
 const customer={name:'Test Buyer',email:'buyer@example.com',phone:'9876543210',address:'123 Sample Road',city:'Hyderabad',state:'Telangana',pincode:'500001'};
 const listing={name:'Test & <b> Studio Headphones',category:'Audio',price:259999,originalPrice:329900,stock:5,image:'headphones',photo:'',condition:'New',tagline:'Clear sound for everyday listening',description:'An original test product with a comfortable fit and wireless connectivity.',specs:['Bluetooth 5.3','USB-C charging']};
 await t.test('sign up, cookie attributes, password hashing and account isolation',async()=>{
   const registered=await call('/api/auth/register',{name:'Test Seller',email:'seller@example.com',password},seller);
   assert.equal(registered.status,201);recovery=registered.data.recoveryCode;
   assert.match(registered.headers.get('set-cookie'),/HttpOnly/);assert.match(registered.headers.get('set-cookie'),/SameSite=Strict/);
   assert.equal((await call('/api/auth/register',{name:'Test Buyer',email:'buyer@example.com',password},buyer)).status,201);
   assert.equal((await call('/api/auth/register',{name:'Other Seller',email:'other@example.com',password},other)).status,201);
   assert.equal((await call('/api/auth/register',{name:'Duplicate',email:'SELLER@example.com',password})).status,409);
   assert.equal((await call('/api/auth/login',{email:'seller@example.com',password:'WrongPassword!'})).status,401);
   assert.equal((await call('/api/auth/me',undefined,seller)).data.user.email,'seller@example.com');
   assert.equal((await call('/api/seller/dashboard')).status,401);
   const db=new DatabaseSync(dbPath);const rows=db.prepare('SELECT password,recovery_hash FROM users').all();assert.ok(rows.every(r=>r.password!==password&&r.password.includes(':')));assert.equal(new Set(rows.map(r=>r.password)).size,3);assert.notEqual(rows[0].recovery_hash,recovery);db.close();
 });
 await t.test('CSRF and seller permissions are enforced',async()=>{
   assert.equal((await call('/api/seller/enroll',{storeName:'Test Audio'},seller,{'X-CSRF-Token':'wrong'})).status,403);
   assert.equal((await call('/api/seller/products',listing,buyer)).status,403);
   assert.equal((await call('/api/seller/enroll',{storeName:'Test Audio'},seller)).status,200);
   assert.equal((await call('/api/seller/enroll',{storeName:'Other Audio'},other)).status,200);
   assert.equal((await call('/api/seller/products',{...listing,stock:-1},seller)).status,400);
   const result=await call('/api/seller/products',listing,seller);assert.equal(result.status,201);product=result.data.product;
   assert.equal((await call('/api/seller/products',{...listing,id:product.id,price:100},other)).status,404);
   assert.equal((await call('/api/seller/visibility',{id:product.id,active:false},other)).status,404);
 });
 await t.test('image uploads validate content and ownership; catalog includes seller attribution',async()=>{
   const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1kAAAAASUVORK5CYII=';
   assert.equal((await call('/api/seller/image',{image:'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='},seller)).status,400);
   const uploaded=await call('/api/seller/image',{image:png},seller);assert.equal(uploaded.status,201);
   assert.equal((await fetch(origin+uploaded.data.path)).status,200);
   assert.equal((await call('/api/seller/products',{...listing,photo:uploaded.data.path},other)).status,400);
   assert.equal((await call('/api/seller/products',{...listing,id:product.id,photo:uploaded.data.path},seller)).status,200);
   const catalog=(await call('/api/products')).data.products;const p=catalog.find(p=>p.id===product.id);assert.equal(p.name,listing.name);assert.equal(p.sellerName,'Test Audio');assert.equal(p.reviewCount,0);
 });
 await t.test('profile and wishlist persist, checkout links buyer and seller',async()=>{
   assert.equal((await call('/api/account/profile',{name:customer.name,address:customer},buyer)).status,200);
   assert.equal((await call('/api/account/wishlist',{ids:[product.id]},buyer)).status,200);
   assert.deepEqual((await call('/api/auth/me',undefined,buyer)).data.user.wishlist,[product.id]);
   const payload={items:[{id:product.id,quantity:2,price:1}],coupon:'VOLT10',customer,payment:'cod',requestKey:randomUUID(),accessToken:randomUUID()};
   assert.equal((await call('/api/orders',payload,seller)).status,400);
   const created=await call('/api/orders',payload,buyer);assert.equal(created.status,201);order=created.data;
   assert.equal(order.subtotal,519998);assert.equal(order.discount,52000);assert.equal(order.total,467998);
   assert.equal((await call('/api/account/orders',undefined,buyer)).data.orders.length,1);
   assert.equal((await call('/api/account/orders',undefined,other)).data.orders.length,0);
   assert.equal((await call('/api/account/cancel',{id:order.id},other)).status,404);
   const dashboard=(await call('/api/seller/dashboard',undefined,seller)).data;assert.equal(dashboard.orders.length,1);assert.equal(dashboard.orders[0].items.length,1);assert.equal(dashboard.orders[0].customer.email,undefined);assert.equal(dashboard.listings[0].stock,3);
   assert.equal((await call('/api/seller/dashboard',undefined,other)).data.orders.length,0);
 });
 await t.test('seller fulfillment transitions and verified reviews',async()=>{
   const update={orderId:order.id,productId:product.id,status:'Delivered'};
   assert.equal((await call('/api/seller/fulfillment',update,seller)).status,409);
   assert.equal((await call('/api/seller/fulfillment',{...update,status:'Processing'},other)).status,404);
   assert.equal((await call('/api/reviews',{productId:product.id,rating:5,comment:'Great test headphones, easy to use.'},buyer)).status,403);
   for(const status of ['Processing','Shipped','Delivered'])assert.equal((await call('/api/seller/fulfillment',{...update,status},seller)).status,200);
   assert.equal((await call('/api/account/cancel',{id:order.id},buyer)).status,409);
   assert.equal((await call('/api/reviews',{productId:product.id,rating:5,comment:'Great test headphones, easy to use.'},buyer)).status,200);
   assert.equal((await call('/api/reviews',{productId:product.id,rating:6,comment:'Great test headphones, easy to use.'},buyer)).status,400);
   const reviews=(await call(`/api/products/${product.id}/reviews`)).data.reviews;assert.equal(reviews.length,1);assert.equal(reviews[0].verified,true);assert.equal(reviews[0].name,'Test');
   assert.equal((await call('/api/products')).data.products.find(p=>p.id===product.id).rating,5);
 });
 await t.test('cancellation restores stock once; archive hides and blocks purchases',async()=>{
   const result=await call('/api/orders',{items:[{id:product.id,quantity:1}],customer,payment:'cod',requestKey:randomUUID(),accessToken:randomUUID()},buyer);assert.equal(result.status,201);
   for(let i=0;i<2;i++)assert.equal((await call('/api/account/cancel',{id:result.data.id},buyer)).status,200);
   assert.equal((await call('/api/products')).data.products.find(p=>p.id===product.id).stock,3);
   assert.equal((await call('/api/seller/visibility',{id:product.id,active:false},seller)).status,200);
   assert.equal((await call('/api/products')).data.products.some(p=>p.id===product.id),false);
   assert.equal((await call('/api/quote',{items:[{id:product.id,quantity:1}]})).status,400);
   assert.equal((await call('/api/seller/visibility',{id:product.id,active:true},seller)).status,200);
 });
 await t.test('account data, sessions, listings and orders survive restart',async()=>{
   await stop();await start();assert.equal((await call('/api/auth/me',undefined,buyer)).data.user.address.city,'Hyderabad');
   assert.equal((await call('/api/account/orders',undefined,buyer)).data.orders.length,2);
   assert.equal((await call('/api/seller/dashboard',undefined,seller)).data.listings.length,1);
 });
 await t.test('password changes revoke sessions; recovery key rotates and cannot be replayed',async()=>{
   const second=client();assert.equal((await call('/api/auth/login',{email:'seller@example.com',password},second)).status,200);
   assert.equal((await call('/api/account/password',{currentPassword:password,password:'ChangedPassword2026!'},seller)).status,200);
   assert.equal((await call('/api/auth/me',undefined,second)).data.user,null);
   assert.equal((await call('/api/auth/recover',{email:'seller@example.com',password:'RecoveredPassword2026!',recoveryCode:'wrong'})).status,401);
   const recovered=await call('/api/auth/recover',{email:'seller@example.com',password:'RecoveredPassword2026!',recoveryCode:recovery});assert.equal(recovered.status,200);assert.notEqual(recovered.data.recoveryCode,recovery);
   assert.equal((await call('/api/auth/me',undefined,seller)).data.user,null);
   assert.equal((await call('/api/auth/recover',{email:'seller@example.com',password:'AnotherPassword2026!',recoveryCode:recovery})).status,401);
   assert.equal((await call('/api/auth/login',{email:'seller@example.com',password:'RecoveredPassword2026!'},seller)).status,200);
   assert.equal((await call('/api/auth/logout',{},seller)).status,200);assert.equal((await call('/api/auth/me',undefined,seller)).data.user,null);
 });
});
