import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

test('hosted mode enforces the configured host/origin and secure sessions', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'volt-hosting-test-'));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, HOST:'127.0.0.1', PORT:'3103', NODE_ENV:'production', PUBLIC_ORIGIN:'https://shop.example.test', DB_PATH:join(folder, 'store.sqlite') },
    stdio:['ignore','pipe','pipe']
  });
  const call = (path, data, extra = {}) => new Promise((resolve, reject) => {
    const req = request({hostname:'127.0.0.1', port:3103, path, method:data ? 'POST' : 'GET', headers:{Host:'shop.example.test', 'Content-Type':'application/json', ...extra}}, res => {
      let content=''; res.on('data', b => content+=b); res.on('end', () => resolve({status:res.statusCode, headers:res.headers, body:JSON.parse(content)}));
    });
    req.on('error', reject); req.end(data ? JSON.stringify(data) : undefined);
  });
  try {
    await new Promise((resolve, reject) => {
      const timer=setTimeout(() => reject(new Error('Startup timeout')),10000);
      server.stdout.on('data', b => {if(b.toString().includes('VOLT is ready')){clearTimeout(timer);resolve();}});
      server.once('error', reject);
    });
    assert.equal((await call('/api/health')).status,200);
    assert.equal((await call('/api/health',undefined,{Host:'attacker.example.test'})).status,403);
    const details={name:'Hosted Test',email:'hosting@volt.test',password:'OnlyForTesting2026!'};
    assert.equal((await call('/api/auth/register',details,{Origin:'https://attacker.example.test'})).status,403);
    const registered=await call('/api/auth/register',details,{Origin:'https://shop.example.test'});
    assert.equal(registered.status,201);
    const cookie=registered.headers['set-cookie'][0];
    for(const attribute of ['Secure','HttpOnly','SameSite=Strict'])assert.ok(cookie.includes(attribute));
    const session={Cookie:cookie.split(';')[0],Origin:'https://shop.example.test','X-CSRF-Token':registered.body.csrf};
    assert.equal((await call('/api/auth/me',undefined,session)).body.user.email,details.email);
    const logout=await call('/api/auth/logout',{},session);
    assert.equal(logout.status,200);
    assert.ok(logout.headers['set-cookie'][0].includes('Secure'));
  } finally {
    const stopped=once(server,'exit');server.kill();await stopped;
    rmSync(folder,{recursive:true,force:true});
  }
});
