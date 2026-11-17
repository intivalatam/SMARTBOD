import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {captureDatabase,restoreDatabase} from '../lib/recovery.js';
const source=new PGlite(),target=new PGlite();
try{
 await source.exec(await readFile(new URL('../lib/schema.sql',import.meta.url),'utf8'));
 await source.query("INSERT INTO sb_images(id,content,mime) VALUES ('picture',$1,'image/jpeg')",[new Uint8Array([255,216,255])]);
 await source.query("INSERT INTO sb_audit(action,revision) VALUES ('sale',1)");
 const backup=await captureDatabase(source);
 await restoreDatabase(target,backup);
 assert.deepEqual((await captureDatabase(target)).tables,backup.tables);
 await assert.rejects(restoreDatabase(target,backup),/base nueva/);
 const {rows}=await target.query("INSERT INTO sb_audit(action,revision) VALUES ('sale',2) RETURNING id");
 assert.equal(Number(rows[0].id),2);
 console.log('Respaldo integral: restauración, imagen, auditoría y secuencias OK');
}finally{await source.close();await target.close();}
