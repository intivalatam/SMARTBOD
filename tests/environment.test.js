import test from 'node:test';import assert from 'node:assert/strict';
import {databaseUrl} from '../lib/environment.js';
test('Preview requires its own database and does not fall back to production',()=>{
 assert.throws(()=>databaseUrl({VERCEL_ENV:'preview',DATABASE_URL:'production'}),/PREVIEW_DATABASE_URL/);
 assert.throws(()=>databaseUrl({VERCEL_ENV:'preview',DATABASE_URL:'production',PREVIEW_DATABASE_URL:'production'}),/PREVIEW_DATABASE_URL/);
 assert.equal(databaseUrl({VERCEL_ENV:'preview',DATABASE_URL:'production',PREVIEW_DATABASE_URL:'test'}),'test');
});
test('production and local environments retain DATABASE_URL',()=>{
 assert.equal(databaseUrl({VERCEL_ENV:'production',DATABASE_URL:'production'}),'production');
 assert.equal(databaseUrl({DATABASE_URL:'local'}),'local');
 assert.throws(()=>databaseUrl({}),/DATABASE_URL/);
});
