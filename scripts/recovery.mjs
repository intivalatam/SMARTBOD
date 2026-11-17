import pg from 'pg';
import {readFile,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {captureDatabase,restoreDatabase} from '../lib/recovery.js';
const [mode,path]=process.argv.slice(2);
if(!['backup','restore'].includes(mode)||!path)throw Error('Uso: node scripts/recovery.mjs backup|restore archivo.gz');
const url=process.env[mode==='backup'?'DATABASE_URL':'RESTORE_DATABASE_URL'];
if(!url)throw Error('Configura la conexión para la operación seleccionada');
const client=new pg.Client({connectionString:url});
await client.connect();
try{
  if(mode==='backup'){
    const snapshot=await captureDatabase(client);
    await writeFile(path,gzipSync(JSON.stringify(snapshot)),{flag:'wx',mode:0o600});
    console.log('Respaldo integral creado');
  }else{
    await restoreDatabase(client,JSON.parse(gunzipSync(await readFile(path))));
    console.log('Restauración completada');
  }
}finally{await client.end();}
