import { randomUUID } from 'node:crypto';

const fail = (message, status=400) => { throw Object.assign(new Error(message), {status}); };
const text = (value,label,min=1,max=200) => {
  if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail(`${label} must be ${min}–${max} characters.`);
  return value.trim();
};
export function migrateOperations(db) {
  const columns=db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
  if(!columns.includes('role'))db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin'))");
  if(!columns.includes('status'))db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended'))");
  db.exec(`CREATE TABLE IF NOT EXISTS catalog_overrides(product_id TEXT PRIMARY KEY REFERENCES products(id));
    CREATE TABLE IF NOT EXISTS product_controls(product_id TEXT PRIMARY KEY REFERENCES products(id),hidden INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS coupons(code TEXT PRIMARY KEY,percent INTEGER NOT NULL,cap INTEGER NOT NULL,minimum INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,expires_at TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),order_id TEXT,kind TEXT NOT NULL,subject TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ticket_messages(id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL REFERENCES tickets(id),user_id TEXT NOT NULL REFERENCES users(id),staff INTEGER NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY AUTOINCREMENT,actor_id TEXT,action TEXT NOT NULL,target TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);
    INSERT OR IGNORE INTO coupons VALUES('VOLT10',10,100000,0,1,'');`);
}

export function operations(db,{body,market}) {
  const audit=(actor,action,target,detail={})=>db.prepare('INSERT INTO audit_log(actor_id,action,target,detail,created_at) VALUES(?,?,?,?,?)').run(actor,action,String(target),JSON.stringify(detail),new Date().toISOString());
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}};
  const orders=()=>db.prepare('SELECT payload FROM orders ORDER BY created_at DESC').all().map(r=>JSON.parse(r.payload));
  const orderById=id=>{const r=db.prepare('SELECT payload FROM orders WHERE id=?').get(id);if(!r)fail('Order not found.',404);return JSON.parse(r.payload);};
  const tickets=(userId=null)=>db.prepare(`SELECT t.*,u.name,u.email FROM tickets t JOIN users u ON u.id=t.user_id ${userId?'WHERE t.user_id=?':''} ORDER BY t.updated_at DESC`).all(...(userId?[userId]:[]));
  const ticketById=(id,user)=>{const t=db.prepare('SELECT * FROM tickets WHERE id=?').get(id);if(!t||(user.role!=='admin'&&t.user_id!==user.id))fail('Request not found.',404);return t;};
  const ticketDetail=(id,user)=>({...ticketById(id,user),messages:db.prepare('SELECT m.id,m.message,m.staff,m.created_at,u.name FROM ticket_messages m JOIN users u ON m.user_id=u.id WHERE ticket_id=? ORDER BY m.created_at,m.rowid').all(id)});
  const inventory=()=>db.prepare(`SELECT p.*,u.store_name,u.name owner_name,u.status owner_status,o.user_id,o.active,coalesce(c.hidden,0) hidden FROM products p LEFT JOIN product_owners o ON o.product_id=p.id LEFT JOIN users u ON u.id=o.user_id LEFT JOIN product_controls c ON c.product_id=p.id`).all().map(r=>({...JSON.parse(r.payload),price:r.price,stock:r.stock,sellerId:r.user_id||null,sellerName:r.store_name||'VOLT catalog',hidden:Boolean(r.hidden),active:r.active!==0,ownerStatus:r.owner_status||'active'}));
  function couponDiscount(code,subtotal) {
    if(!code)return 0;
    const coupon=db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(code);
    if(!coupon||(coupon.expires_at&&new Date(coupon.expires_at).getTime()<=Date.now()))fail('That discount code is unavailable or expired.');
    if(subtotal<coupon.minimum)fail(`This code needs an order subtotal of ₹${(coupon.minimum/100).toLocaleString('en-IN')}.`);
    return Math.min(Math.round(subtotal*coupon.percent/100),coupon.cap);
  }
  async function handle(req,res,url,json) {
    const path=url.pathname,admin=path.startsWith('/api/admin/');
    if(!admin&&!path.startsWith('/api/account/support'))return false;
    const session=market.requireSession(req),user=session.user;
    if(admin&&user.role!=='admin')fail('Administrator access required.',403);
    if(req.method==='GET') {
      if(path==='/api/admin/overview'){
        const all=orders(),live=all.filter(o=>o.status!=='Cancelled'),items=inventory();
        const trend=Array.from({length:7},(_,i)=>{const d=new Date();d.setUTCDate(d.getUTCDate()-6+i);const day=d.toISOString().slice(0,10);const set=live.filter(o=>o.createdAt.startsWith(day));return {day,orders:set.length,total:set.reduce((n,o)=>n+o.total,0)};});
        json(200,{metrics:{orders:all.length,orderValue:live.reduce((n,o)=>n+o.total,0),pending:live.filter(o=>!['Delivered','Cancelled'].includes(o.status)).length,customers:db.prepare('SELECT count(*) n FROM users').get().n,sellers:db.prepare('SELECT count(*) n FROM users WHERE seller=1').get().n,products:items.length,lowStock:items.filter(p=>p.stock<=5&&!p.hidden).length,openTickets:db.prepare("SELECT count(*) n FROM tickets WHERE status IN ('open','in_progress','approved')").get().n},trend,recentOrders:all.slice(0,5),lowStock:items.filter(p=>p.stock<=5&&!p.hidden).slice(0,6),audit:db.prepare('SELECT a.*,u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 6').all()});return true;
      }
      if(path==='/api/admin/products'){json(200,{products:inventory()});return true;}
      if(path==='/api/admin/orders'){json(200,{orders:orders()});return true;}
      if(path==='/api/admin/users'){json(200,{users:db.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,u.seller,u.store_name,u.created_at,(SELECT count(*) FROM order_owners o WHERE o.user_id=u.id) order_count FROM users u ORDER BY u.created_at DESC`).all()});return true;}
      if(path==='/api/admin/coupons'){json(200,{coupons:db.prepare('SELECT * FROM coupons ORDER BY code').all()});return true;}
      if(path==='/api/admin/audit'){json(200,{events:db.prepare('SELECT a.*,u.name actor FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200').all()});return true;}
      if(path==='/api/admin/support'||path==='/api/account/support'){
        const id=url.searchParams.get('id');json(200,id?{ticket:ticketDetail(id,user)}:{tickets:tickets(admin?null:user.id)});return true;
      }
    }
    if(req.method==='POST') {
      const input=await body(req);
      if(path==='/api/admin/users/update'){
        const target=db.prepare('SELECT * FROM users WHERE id=?').get(String(input.id));if(!target)fail('User not found.',404);
        const role=input.role??target.role,status=input.status??target.status;
        if(!['admin','customer'].includes(role)||!['active','suspended'].includes(status))fail('Invalid role or account status.');
        if(target.id===user.id&&(role!=='admin'||status!=='active'))fail('You cannot remove your own administrator access.',409);
        transaction(()=>{
          if(target.role==='admin'&&(role!=='admin'||status!=='active')&&db.prepare("SELECT count(*) n FROM users WHERE role='admin' AND status='active'").get().n<=1)fail('Keep at least one active administrator.',409);
          db.prepare('UPDATE users SET role=?,status=? WHERE id=?').run(role,status,target.id);
          if(role!==target.role||status!==target.status)db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
          audit(user.id,'account.updated',target.id,{role,status});
        });json(200,{ok:true});return true;
      }
      if(path==='/api/admin/products/save'){
        const old=input.id?db.prepare('SELECT * FROM products WHERE id=?').get(String(input.id)):null;
        if(input.id&&!old)fail('Product not found.',404);
        const previous=old?JSON.parse(old.payload):{},id=old?.id||`product-${randomUUID()}`;
        const validated=market.validateListing(input,user.id,id,previous.photo||'');
        const product={...previous,...validated,badge:previous.badge||(old?'':'VOLT Studio')};
        transaction(()=>{db.prepare('INSERT INTO products(id,payload,price,stock) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,price=excluded.price,stock=excluded.stock').run(id,JSON.stringify(product),product.price,product.stock);db.prepare('INSERT OR IGNORE INTO catalog_overrides VALUES(?)').run(id);audit(user.id,old?'product.updated':'product.created',id,{name:product.name,price:product.price,stock:product.stock});});
        json(old?200:201,{product});return true;
      }
      if(path==='/api/admin/products/visibility'){
        if(typeof input.hidden!=='boolean'||!db.prepare('SELECT id FROM products WHERE id=?').get(String(input.id)))fail('Invalid product visibility.');
        transaction(()=>{db.prepare('INSERT INTO product_controls VALUES(?,?) ON CONFLICT(product_id) DO UPDATE SET hidden=excluded.hidden').run(input.id,Number(input.hidden));audit(user.id,input.hidden?'product.hidden':'product.restored',input.id);});json(200,{ok:true});return true;
      }
      if(path==='/api/admin/orders/update'){
        const order=orderById(String(input.id)),next={Confirmed:'Processing',Processing:'Shipped',Shipped:'Delivered'};
        transaction(()=>{
          if(input.status==='Cancelled'){
            if(order.status==='Cancelled')return;
            if(order.items.some(i=>['Shipped','Delivered'].includes(i.status)))fail('Shipped orders must use the support/returns process.',409);
            for(const item of order.items){db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.quantity,item.id);item.status='Cancelled';}
            order.status='Cancelled';order.cancelledAt=new Date().toISOString();
          }else{
            if(order.status==='Cancelled')fail('Cancelled orders cannot be fulfilled.',409);
            const item=order.items.find(i=>i.id===input.productId);if(!item)fail('Order item not found.',404);
            if(next[item.status||'Confirmed']!==input.status)fail('Advance one fulfillment step at a time.',409);
            item.status=input.status;item.updatedAt=new Date().toISOString();
            const carrier=typeof input.carrier==='string'?input.carrier.trim():'';const tracking=typeof input.tracking==='string'?input.tracking.trim():'';
            if(carrier.length>80||tracking.length>120)fail('Tracking details are too long.');
            if(carrier||tracking)item.tracking={carrier,number:tracking};
            order.status=market.stateOf(order);
          }
          db.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(order),order.id);audit(user.id,'order.updated',order.id,{status:input.status,productId:input.productId||null});
        });json(200,{order});return true;
      }
      if(path==='/api/admin/coupons/save'){
        const code=text(input.code,'Code',3,24).toUpperCase();if(!/^[A-Z0-9_-]+$/.test(code))fail('Use letters, digits, underscores or hyphens in the code.');
        if(!Number.isInteger(input.percent)||input.percent<1||input.percent>100)fail('Discount must be 1–100%.');
        for(const key of ['cap','minimum'])if(!Number.isSafeInteger(input[key])||input[key]<0||input[key]>100000000)fail('Invalid coupon amount.');
        if(input.cap<1||typeof input.active!=='boolean')fail('Set a positive discount limit and a valid status.');
        const expiry=input.expiresAt?new Date(input.expiresAt):null;if(expiry&&!Number.isFinite(expiry.getTime()))fail('Invalid expiry date.');
        transaction(()=>{db.prepare('INSERT INTO coupons VALUES(?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET percent=excluded.percent,cap=excluded.cap,minimum=excluded.minimum,active=excluded.active,expires_at=excluded.expires_at').run(code,input.percent,input.cap,input.minimum,Number(input.active),expiry?expiry.toISOString():'');audit(user.id,'coupon.saved',code,{active:input.active,percent:input.percent});});json(200,{ok:true});return true;
      }
      if(path==='/api/account/support'){
        const kind=input.kind==='return'?'return':'question',subject=text(input.subject,'Subject',4,120),message=text(input.message,'Message',10,3000);
        const orderId=input.orderId?String(input.orderId):null;
        if(orderId){if(!db.prepare('SELECT order_id FROM order_owners WHERE order_id=? AND user_id=?').get(orderId,user.id))fail('Order not found.',404);if(kind==='return'&&!orderById(orderId).items.some(i=>i.status==='Delivered'))fail('Returns can be requested after delivery.',409);}
        else if(kind==='return')fail('Select a delivered order for your return.');
        if(db.prepare("SELECT count(*) n FROM tickets WHERE user_id=? AND status IN ('open','in_progress','approved')").get(user.id).n>=20)fail('You have 20 open requests. Please continue an existing conversation.',409);
        const id=`SUP-${randomUUID().slice(0,8).toUpperCase()}`,now=new Date().toISOString();
        transaction(()=>{db.prepare('INSERT INTO tickets VALUES(?,?,?,?,?,?,?,?)').run(id,user.id,orderId,kind,subject,'open',now,now);db.prepare('INSERT INTO ticket_messages VALUES(?,?,?,?,?,?)').run(randomUUID(),id,user.id,0,message,now);});
        json(201,{ticket:ticketDetail(id,user)});return true;
      }
      if(path==='/api/account/support/reply'||path==='/api/admin/support/reply'){
        const t=ticketById(String(input.id),user),message=text(input.message,'Message',2,3000),now=new Date().toISOString();
        if(['resolved','rejected'].includes(t.status))fail('This request is closed. Open a new request if you still need help.',409);
        transaction(()=>{db.prepare('INSERT INTO ticket_messages VALUES(?,?,?,?,?,?)').run(randomUUID(),t.id,user.id,Number(admin),message,now);db.prepare('UPDATE tickets SET updated_at=? WHERE id=?').run(now,t.id);if(admin)audit(user.id,'support.replied',t.id);});json(200,{ticket:ticketDetail(t.id,user)});return true;
      }
      if(path==='/api/admin/support/status'){
        const t=ticketById(String(input.id),user),states=t.kind==='return'?['open','in_progress','approved','rejected','resolved']:['open','in_progress','resolved'];
        if(!states.includes(input.status))fail('Invalid request status.');
        transaction(()=>{db.prepare('UPDATE tickets SET status=?,updated_at=? WHERE id=?').run(input.status,new Date().toISOString(),t.id);audit(user.id,'support.status',t.id,{status:input.status});});json(200,{ticket:ticketDetail(t.id,user)});return true;
      }
    }
    json(404,{error:'Endpoint not found.'});return true;
  }
  return {handle,couponDiscount};
}
