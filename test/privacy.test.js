import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privatePath, secretTypes } from '../scripts/check-privacy.mjs';

test('repository privacy guard detects runtime files and credential formats without printing values', () => {
  for(const name of ['.env','.env.production','data/store.sqlite','backup/private.json','keys/signing.pem','credentials.json','.vercel/project.json','archive.zip','orders.db'])assert.equal(privatePath(name),true,name);
  for(const name of ['.env.example','server.js','public/images/real/iphone-16.png','test/store.test.js'])assert.equal(privatePath(name),false,name);
  assert.deepEqual(secretTypes('gh'+'p_'+'a'.repeat(36)),['GitHub token']);
  assert.deepEqual(secretTypes('postgres'+'://user:example'+'@db.example.test/store'),['database password URL']);
  assert.deepEqual(secretTypes('PUBLIC_ORIGIN=https://your-store.example'),[]);
});
