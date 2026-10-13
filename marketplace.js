import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrateOperations } from './operations.js';

const deriveKey = promisify(scrypt);
const digest = value => createHash('sha256').update(value).digest('hex');
const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const categories = ['Audio', 'Desk setup', 'Wearables', 'Accessories', 'Phones & tablets', 'Laptops', 'Computers', 'Cameras', 'Gaming'];
const illustrations = ['headphones', 'keyboard', 'speaker', 'watch', 'mouse', 'charger', 'earbuds', 'lamp'];
const text = (value, label, min, max) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) error(`${label} must be ${min}–${max} characters.`);
  return value.trim();
};
const validPassword = value => { if (typeof value !== 'string' || value.length < 10 || value.length > 128) error('Use a password with 10–128 characters.'); return value; };
async function passwordHash(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${(await deriveKey(password, salt, 64)).toString('hex')}`; }
async function verify(password, saved) {
  const [salt, key] = saved.split(':');
  return timingSafeEqual(Buffer.from(key, 'hex'), await deriveKey(password, salt, 64));
}
const publicUser = row => ({ id: row.id, name: row.name, email: row.email, seller: Boolean(row.seller), storeName: row.store_name, address: JSON.parse(row.address), wishlist: JSON.parse(row.wishlist), createdAt: row.created_at, role: row.role, status: row.status });

export function marketplace(db, { body, customer, uploadDir, secureCookies=false }) {
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL,
    recovery_hash TEXT NOT NULL, seller INTEGER NOT NULL DEFAULT 0, store_name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '{}', wishlist TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS product_owners (product_id TEXT PRIMARY KEY REFERENCES products(id), user_id TEXT NOT NULL REFERENCES users(id), active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS order_owners (order_id TEXT PRIMARY KEY REFERENCES orders(id), user_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS uploads (path TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), user_id TEXT NOT NULL REFERENCES users(id), rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(product_id,user_id));`);
  migrateOperations(db);
  mkdirSync(uploadDir, { recursive: true });
  const attempts = new Map();
  const slowAuth = req => {
    const key = req.socket.remoteAddress; const now = Date.now(); const entry = attempts.get(key) || { count: 0, time: now };
    if (now - entry.time > 600000) { entry.count = 0; entry.time = now; }
    if (++entry.count > 25) error('Too many account attempts. Please try again in 10 minutes.', 429);
    attempts.set(key, entry);
  };
  const userById = id => db.prepare('SELECT * FROM users WHERE id=?').get(id);
  function identify(req) {
    const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('volt_session='))?.slice(13);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(digest(token), Date.now());
    if (!session) return null;
    const user=userById(session.user_id);
    if(!user||user.status!=='active')return null;
    return { ...session, user };
  }
  function requireSession(req, seller = false) {
    const session = identify(req);
    if (!session) error('Please sign in to continue.', 401);
    if (req.method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf) error('Your session changed. Refresh the page and try again.', 403);
    if (seller && !session.user.seller) error('Create your seller profile first.', 403);
    return session;
  }
  function createSession(res, user) {
    const token = randomBytes(32).toString('hex'); const csrf = randomBytes(24).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token), user.id, csrf, Date.now() + 7 * 86400000);
    res.setHeader('Set-Cookie', `volt_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secureCookies?'; Secure':''}`);
    return { user: publicUser(user), csrf };
  }
  const clearCookie = res => res.setHeader('Set-Cookie', `volt_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookies?'; Secure':''}`);
  function enrichProducts(rows) {
    return rows.filter(p => db.prepare('SELECT active FROM product_owners WHERE product_id=?').get(p.id)?.active !== 0 && !db.prepare('SELECT hidden FROM product_controls WHERE product_id=?').get(p.id)?.hidden && !db.prepare("SELECT 1 FROM product_owners o JOIN users u ON u.id=o.user_id WHERE o.product_id=? AND u.status='suspended'").get(p.id)).map(p => {
      const owner = db.prepare('SELECT u.id,u.store_name FROM product_owners o JOIN users u ON o.user_id=u.id WHERE product_id=?').get(p.id);
      const reviews = db.prepare('SELECT count(*) count, avg(rating) rating FROM reviews WHERE product_id=?').get(p.id);
      return { ...p, sellerId: owner?.id || null, sellerName: owner?.store_name || (p.demoListing ? 'VOLT demo catalog' : 'VOLT Studio'), rating: reviews.rating || 0, reviewCount: reviews.count };
    });
  }
  function saveOrder(order) { db.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(order), order.id); }
  function stateOf(order) {
    if (order.status === 'Cancelled') return 'Cancelled';
    const statuses = order.items.map(i => i.status || 'Confirmed');
    if (statuses.every(s => s === 'Delivered')) return 'Delivered';
    if (statuses.some(s => s === 'Shipped' || s === 'Delivered')) return 'Shipped';
    if (statuses.some(s => s === 'Processing')) return 'Processing';
    return 'Confirmed';
  }
  function ownedOrder(id, userId) {
    const row = db.prepare('SELECT o.payload FROM orders o JOIN order_owners u ON o.id=u.order_id WHERE o.id=? AND u.user_id=?').get(id, userId);
    if (!row) error('Order not found.', 404);
    return JSON.parse(row.payload);
  }
  function ownProduct(id, userId) {
    const row = db.prepare('SELECT p.*,o.active FROM products p JOIN product_owners o ON p.id=o.product_id WHERE p.id=? AND o.user_id=?').get(id, userId);
    if (!row) error('Listing not found.', 404);
    return { ...JSON.parse(row.payload), stock: row.stock, price: row.price, active: Boolean(row.active) };
  }
  function listing(input, userId, id, allowedPhoto='') {
    const name = text(input.name, 'Product name', 3, 90);
    if (!categories.includes(input.category)) error('Choose a valid category.');
    if (!Number.isSafeInteger(input.price) || input.price < 100 || input.price > 100000000) error('Price must be ₹1–₹10,00,000.');
    if (!Number.isSafeInteger(input.originalPrice) || input.originalPrice < input.price || input.originalPrice > 100000000) error('Reference price must be at least the selling price.');
    if (!Number.isInteger(input.stock) || input.stock < 0 || input.stock > 100000) error('Stock must be a whole number from 0–100,000.');
    if (!illustrations.includes(input.image)) error('Choose a product illustration.');
    const description = text(input.description, 'Description', 20, 3000);
    const tagline = text(input.tagline, 'Short description', 3, 100);
    if (!Array.isArray(input.specs) || input.specs.length < 1 || input.specs.length > 8) error('Add 1–8 product specifications.');
    const specs = input.specs.map(s => text(s, 'Specification', 2, 150));
    let photo = '';
    if (input.photo) {
      if (input.photo!==allowedPhoto && !db.prepare('SELECT path FROM uploads WHERE path=? AND user_id=?').get(input.photo, userId)) error('Upload a photo from your own account.');
      photo = input.photo;
    }
    return { id, name, category: input.category, price: input.price, originalPrice: input.originalPrice, stock: input.stock, image: input.image, photo, tagline, description, specs, badge: 'Independent seller', condition: ['New', 'Like new', 'Used'].includes(input.condition) ? input.condition : 'New' };
  }

  async function handle(req, res, url, json) {
    const path = url.pathname;
    const match = path.match(/^\/api\/products\/([a-z0-9-]+)\/reviews$/);
    if (match && req.method === 'GET') {
      const reviews = db.prepare('SELECT r.rating,r.comment,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE product_id=? ORDER BY r.created_at DESC').all(match[1]);
      json(200, { reviews: reviews.map(r => ({ ...r, name: r.name.split(' ')[0], verified: true })) }); return true;
    }
    if (!/^\/api\/(auth|account|seller|reviews)(\/|$)/.test(path)) return false;
    if (path === '/api/auth/me' && req.method === 'GET') {
      const s = identify(req); json(200, s ? { user: publicUser(s.user), csrf: s.csrf } : { user: null, csrf: null }); return true;
    }
    if (req.method === 'POST' && ['/api/auth/register', '/api/auth/login', '/api/auth/recover'].includes(path)) {
      slowAuth(req); const input = await body(req); const email = text(input.email, 'Email', 5, 150).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error('Enter a valid email address.');
      const password = validPassword(input.password);
      if (path.endsWith('/register')) {
        const name = text(input.name, 'Name', 2, 100);
        if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) error('An account already uses that email. Sign in instead.', 409);
        const id = randomUUID(); const recoveryCode = randomBytes(20).toString('hex'); const encrypted = await passwordHash(password);
        try { db.prepare('INSERT INTO users(id,email,name,password,recovery_hash,created_at) VALUES(?,?,?,?,?,?)').run(id, email, name, encrypted, digest(recoveryCode), new Date().toISOString()); }
        catch (e) { if (e.message.includes('UNIQUE')) error('An account already uses that email.', 409); throw e; }
        json(201, { ...createSession(res, userById(id)), recoveryCode }); return true;
      }
      const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
      if (path.endsWith('/recover')) {
        if (!user || typeof input.recoveryCode !== 'string' || !timingSafeEqual(Buffer.from(user.recovery_hash), Buffer.from(digest(input.recoveryCode.trim())))) error('Email or recovery key is incorrect.', 401);
        const encrypted = await passwordHash(password); const recoveryCode = randomBytes(20).toString('hex');
        const changed = db.prepare('UPDATE users SET password=?,recovery_hash=? WHERE id=? AND recovery_hash=?').run(encrypted, digest(recoveryCode), user.id, user.recovery_hash);
        if (!changed.changes) error('This recovery key has already been used.', 409);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id); clearCookie(res);
        json(200, { recovered: true, recoveryCode }); return true;
      }
      // Run a password derivation even for a missing account to reduce timing differences.
      const fallback = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
      if (!await verify(password, user?.password || fallback) || !user) error('Email or password is incorrect.', 401);
      if(user.status!=='active')error('This account is suspended. Contact the store administrator.',403);
      json(200, createSession(res, user)); return true;
    }
    const s = requireSession(req, path.startsWith('/api/seller/') && !['/api/seller/enroll','/api/seller/image'].includes(path));
    if(path==='/api/seller/image'&&!s.user.seller&&s.user.role!=='admin')error('Create your seller profile first.',403);
    const user = s.user;
    if (path === '/api/auth/logout' && req.method === 'POST') {
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(s.token_hash); clearCookie(res); json(200, { ok: true }); return true;
    }
    if (path === '/api/account/profile' && req.method === 'POST') {
      const input = await body(req); const name = text(input.name, 'Name', 2, 100);
      const address = input.address ? customer({ ...input.address, name, email: user.email }) : JSON.parse(user.address);
      db.prepare('UPDATE users SET name=?,address=? WHERE id=?').run(name, JSON.stringify(address), user.id);
      json(200, { user: publicUser(userById(user.id)) }); return true;
    }
    if (path === '/api/account/password' && req.method === 'POST') {
      slowAuth(req); const input = await body(req); validPassword(input.password);
      if (typeof input.currentPassword !== 'string' || input.currentPassword.length > 128 || !await verify(input.currentPassword, user.password)) error('Current password is incorrect.', 401);
      const encrypted = await passwordHash(input.password);
      db.prepare('UPDATE users SET password=? WHERE id=?').run(encrypted, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      json(200, createSession(res, userById(user.id))); return true;
    }
    if (path === '/api/account/wishlist' && req.method === 'POST') {
      const input = await body(req);
      if (!Array.isArray(input.ids) || input.ids.length > 200 || !input.ids.every(id => typeof id === 'string' && db.prepare('SELECT id FROM products WHERE id=?').get(id))) error('Invalid wishlist.');
      const ids = [...new Set(input.ids)]; db.prepare('UPDATE users SET wishlist=? WHERE id=?').run(JSON.stringify(ids), user.id);
      json(200, { ids }); return true;
    }
    if (path === '/api/account/orders' && req.method === 'GET') {
      const orders = db.prepare('SELECT o.payload FROM orders o JOIN order_owners u ON o.id=u.order_id WHERE u.user_id=? ORDER BY o.created_at DESC').all(user.id).map(r => JSON.parse(r.payload));
      json(200, { orders }); return true;
    }
    if (path === '/api/account/cancel' && req.method === 'POST') {
      const input = await body(req); const order = ownedOrder(String(input.id), user.id);
      if (order.status === 'Cancelled') { json(200, { order }); return true; }
      if (order.items.some(i => ['Shipped', 'Delivered'].includes(i.status))) error('This order has shipped and can no longer be cancelled.', 409);
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const item of order.items) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.quantity, item.id);
        order.status = 'Cancelled'; order.items.forEach(i => { i.status = 'Cancelled'; }); order.cancelledAt = new Date().toISOString(); saveOrder(order); db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      json(200, { order }); return true;
    }
    if (path === '/api/seller/enroll' && req.method === 'POST') {
      const input = await body(req); const storeName = text(input.storeName, 'Store name', 3, 70);
      db.prepare('UPDATE users SET seller=1,store_name=? WHERE id=?').run(storeName, user.id);
      json(200, { user: publicUser(userById(user.id)) }); return true;
    }
    if (path === '/api/seller/image' && req.method === 'POST') {
      const input = await body(req, 3000000); const match = typeof input.image === 'string' && input.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!match) error('Upload a PNG, JPEG or WebP image.');
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 2 * 1024 * 1024 || buffer.length < 16) error('Image must be under 2 MB.');
      const valid = match[1] === 'png' ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
      if (!valid) error('That file is not a valid image.');
      const filename = `${randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`; const path = `/uploads/${filename}`;
      writeFileSync(resolve(uploadDir, filename), buffer, { flag: 'wx' }); db.prepare('INSERT INTO uploads VALUES(?,?)').run(path, user.id);
      json(201, { path }); return true;
    }
    if (path === '/api/seller/dashboard' && req.method === 'GET') {
      const listings = db.prepare('SELECT p.*,o.active FROM products p JOIN product_owners o ON o.product_id=p.id WHERE o.user_id=?').all(user.id).map(r => ({ ...JSON.parse(r.payload), stock: r.stock, price: r.price, active: Boolean(r.active) }));
      const orders = db.prepare('SELECT payload FROM orders ORDER BY created_at DESC').all().map(r => JSON.parse(r.payload)).map(o => {
        const items = o.items.filter(i => i.sellerId === user.id);
        return items.length ? { id: o.id, createdAt: o.createdAt, customer: { name: o.customer.name, phone: o.customer.phone, address: o.customer.address, city: o.customer.city, state: o.customer.state, pincode: o.customer.pincode }, status: o.status, items, merchandiseTotal: items.reduce((sum, i) => sum + i.lineTotal, 0) } : null;
      }).filter(Boolean);
      json(200, { listings, orders }); return true;
    }
    if (path === '/api/seller/products' && req.method === 'POST') {
      const input = await body(req); const id = input.id || `product-${randomUUID()}`;
      if (input.id) ownProduct(id, user.id);
      const product = listing(input, user.id, id);
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO products VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,price=excluded.price,stock=excluded.stock').run(id, JSON.stringify(product), product.price, product.stock);
        db.prepare('INSERT OR IGNORE INTO product_owners VALUES(?,?,1)').run(id, user.id); db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
      json(input.id ? 200 : 201, { product }); return true;
    }
    if (path === '/api/seller/visibility' && req.method === 'POST') {
      const input = await body(req); ownProduct(String(input.id), user.id);
      if (typeof input.active !== 'boolean') error('Invalid visibility.');
      db.prepare('UPDATE product_owners SET active=? WHERE product_id=?').run(input.active ? 1 : 0, input.id);
      json(200, { ok: true }); return true;
    }
    if (path === '/api/seller/fulfillment' && req.method === 'POST') {
      const input = await body(req); const row = db.prepare('SELECT payload FROM orders WHERE id=?').get(String(input.orderId));
      if (!row) error('Order not found.', 404);
      const order = JSON.parse(row.payload); const item = order.items.find(i => i.id === input.productId && i.sellerId === user.id);
      if (!item) error('Order item not found.', 404);
      const next = { Confirmed: 'Processing', Processing: 'Shipped', Shipped: 'Delivered' };
      if (order.status === 'Cancelled' || next[item.status || 'Confirmed'] !== input.status) error('That status change is not allowed.', 409);
      item.status = input.status; item.updatedAt = new Date().toISOString(); order.status = stateOf(order); saveOrder(order);
      json(200, { ok: true }); return true;
    }
    if (path === '/api/reviews' && req.method === 'POST') {
      const input = await body(req);
      if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) error('Choose a rating from 1 to 5.');
      const comment = text(input.comment, 'Review', 10, 1500);
      const orders = db.prepare('SELECT o.payload FROM orders o JOIN order_owners u ON o.id=u.order_id WHERE u.user_id=?').all(user.id).map(r => JSON.parse(r.payload));
      if (!orders.some(o => o.items.some(i => i.id === input.productId && i.status === 'Delivered' && i.sellerId !== user.id))) error('You can review products after your purchase is marked delivered.', 403);
      db.prepare('INSERT INTO reviews VALUES(?,?,?,?,?,?) ON CONFLICT(product_id,user_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,created_at=excluded.created_at').run(randomUUID(), input.productId, user.id, input.rating, comment, new Date().toISOString());
      json(200, { ok: true }); return true;
    }
    json(404, { error: 'Endpoint not found.' }); return true;
  }
  return { handle, identify, requireSession, enrichProducts, validateListing:listing, stateOf };
}
