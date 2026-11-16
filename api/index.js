import pg from 'pg';
import {randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {empty,fail,normalize,validateConsumptionChange,recordPriceEdits,sell,prepare,voidSale,upsertEvent,restock,recordWaste,updateLotExpiration,saveSupplier,saveLocation,createPurchaseOrder,receivePurchaseOrder,openCashShift,closeCashShift,reconcileLots,publicState} from '../lib/domain.js';
import {S3Client,PutObjectCommand,GetObjectCommand,ListObjectsV2Command,DeleteObjectCommand} from '@aws-sdk/client-s3';
const scrypt=promisify(scryptCallback);let pool,ready;
const digest=s=>createHash('sha256').update(s).digest('hex');
const safeUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role,enabled:u.enabled});
let backupClient;
function s3(){
 const {BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY, BACKUP_S3_ENDPOINT}=process.env;
 if(!BACKUP_S3_BUCKET||!BACKUP_S3_REGION||!BACKUP_S3_ACCESS_KEY_ID||!BACKUP_S3_SECRET_ACCESS_KEY)fail('Configura el almacenamiento S3 de respaldos en Vercel',503);
 if(!backupClient)backupClient=new S3Client({region:BACKUP_S3_REGION,endpoint:BACKUP_S3_ENDPOINT||undefined,forcePathStyle:Boolean(BACKUP_S3_ENDPOINT),credentials:{accessKeyId:BACKUP_S3_ACCESS_KEY_ID,secretAccessKey:BACKUP_S3_SECRET_ACCESS_KEY}});
 return {client:backupClient,bucket:BACKUP_S3_BUCKET};
}
async function createBackup(){
 const {client,bucket}=s3(),snapshot=await pool.connect();let store,images;
 try{await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');({rows:[store]}=await snapshot.query('SELECT revision,data,policy FROM sb_store WHERE id=1'));({rows:images}=await snapshot.query('SELECT id,mime,created,content FROM sb_images ORDER BY id'));await snapshot.query('COMMIT');}
 catch(error){await snapshot.query('ROLLBACK');throw error;}finally{snapshot.release();}
 const createdAt=new Date().toISOString(),key=`smartbod/${createdAt.slice(0,10)}/${createdAt.replace(/[:.]/g,'-')}-${randomBytes(4).toString('hex')}.json`;
 const payload=JSON.stringify({format:'smartbod-backup-v1',createdAt,revision:store.revision,data:store.data,policy:store.policy,images:images.map(image=>({id:image.id,mime:image.mime,created:image.created,content:Buffer.from(image.content).toString('base64')}))}),checksum=createHash('sha256').update(payload).digest('hex');
 await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:payload,ContentType:'application/json',ServerSideEncryption:'AES256',Metadata:{sha256:checksum}}));
 const downloaded=await client.send(new GetObjectCommand({Bucket:bucket,Key:key})),verified=Buffer.from(await downloaded.Body.transformToByteArray()).toString('utf8');
 if(createHash('sha256').update(verified).digest('hex')!==checksum)throw new Error('No se pudo verificar el respaldo subido a S3.');
 const listed=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:'smartbod/'}));
 const old=(listed.Contents||[]).filter(x=>x.Key&&x.Key!==key).sort((a,b)=>String(b.LastModified).localeCompare(String(a.LastModified))).slice(29);
 for(const item of old)await client.send(new DeleteObjectCommand({Bucket:bucket,Key:item.Key}));
 await pool.query('INSERT INTO sb_audit(user_id,action,revision) SELECT NULL,$1,revision FROM sb_store WHERE id=1',['backup']);
 return {key,createdAt,verified:true};
}
async function listBackups(){
 const {client,bucket}=s3(),listed=await client.send(new ListObjectsV2Command({Bucket:bucket,Prefix:'smartbod/'}));
 return (listed.Contents||[]).filter(item=>item.Key?.endsWith('.json')).sort((a,b)=>String(b.LastModified).localeCompare(String(a.LastModified))).slice(0,30).map(item=>({key:item.Key,createdAt:item.LastModified?.toISOString()||null,size:item.Size||0}));
}
async function restoreBackup(key,userId){
 if(typeof key!=='string'||!/^smartbod\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/[A-Za-z0-9._-]+\.json$/.test(key))fail('Identificador de respaldo inválido');
 const {client,bucket}=s3(),object=await client.send(new GetObjectCommand({Bucket:bucket,Key:key})),contents=Buffer.from(await object.Body.transformToByteArray()),checksum=createHash('sha256').update(contents).digest('hex');
 if(!object.Metadata?.sha256||object.Metadata.sha256!==checksum)fail('El respaldo no pasó la verificación de integridad');
 const backup=JSON.parse(contents.toString('utf8'));
 if(backup.format!=='smartbod-backup-v1'||!backup.data||!backup.policy)fail('El archivo no es un respaldo SMARTBOD válido');
 const data=normalize(backup.data);
 if(!backup.policy||!['admin','seller'].every(role=>typeof backup.policy[role]==='number'&&backup.policy[role]>=0&&backup.policy[role]<=100))fail('La política del respaldo no es válida');
 if(!Array.isArray(backup.images)||backup.images.some(image=>!image||typeof image.id!=='string'||!['image/jpeg','image/png','image/webp'].includes(image.mime)||typeof image.content!=='string'||Buffer.from(image.content,'base64').length>150000))fail('El respaldo contiene imágenes inválidas');
 const images=backup.images.map(image=>({id:image.id,mime:image.mime,created:image.created||new Date().toISOString(),content:Buffer.from(image.content,'base64')}));
 const clientDb=await pool.connect();
 try{await clientDb.query('BEGIN');await clientDb.query('SELECT id FROM sb_store WHERE id=1 FOR UPDATE');const {rows:[current]}=await clientDb.query('SELECT role,enabled FROM sb_users WHERE id=$1 FOR UPDATE',[userId]);if(!current?.enabled||current.role!=='admin')fail('Solo administradores restauran respaldos',403);const result=await clientDb.query('UPDATE sb_store SET data=$1,policy=$2,revision=revision+1 WHERE id=1 RETURNING revision',[data,backup.policy]);await clientDb.query('DELETE FROM sb_images');for(const image of images)await clientDb.query('INSERT INTO sb_images(id,content,mime,created) VALUES($1,$2,$3,$4)',[image.id,image.content,image.mime,image.created]);await clientDb.query('INSERT INTO sb_audit(user_id,action,revision) VALUES($1,$2,$3)',[userId,'backup-restore',result.rows[0].revision]);await clientDb.query('COMMIT');return {revision:result.rows[0].revision};}
 catch(error){await clientDb.query('ROLLBACK');throw error;}finally{clientDb.release();}
}
async function hash(password){if(typeof password!=='string'||password.length<12||password.length>200)fail('La contraseña requiere entre 12 y 200 caracteres');const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex');}
async function verify(password,encoded){if(typeof password!=='string'||password.length>200)return false;const [salt,h]=encoded.split(':');const candidate=await scrypt(password,salt,64);return timingSafeEqual(candidate,Buffer.from(h,'hex'));}
async function init(){
 if(!process.env.DATABASE_URL)fail('Falta conectar DATABASE_URL en Vercel',503);
 if(!pool)pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:10000});
 if(!ready)ready=(async()=>{await pool.query(await readFile(new URL('../lib/schema.sql',import.meta.url),'utf8'));})();
 try{await ready;}catch(e){ready=null;throw e;}
}
async function transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function seed(){await transaction(async c=>{await c.query('SELECT id FROM sb_store WHERE id=1 FOR UPDATE');const {rows}=await c.query('SELECT id FROM sb_users LIMIT 1');if(rows.length)return;if(!process.env.ADMIN_USERNAME||!process.env.ADMIN_PASSWORD)fail('Configura ADMIN_USERNAME y ADMIN_PASSWORD para crear el administrador inicial',503);await c.query('INSERT INTO sb_users VALUES($1,$2,$3,$4,true,$5)',[randomUUID(),process.env.ADMIN_USERNAME.toLowerCase(),'Administrador','admin',await hash(process.env.ADMIN_PASSWORD)]);});}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
 const imageId=req.method==='GET'?new URL(req.url,'https://localhost').searchParams.get('image'):null;
 const cronBackup=req.method==='GET'&&new URL(req.url,'https://localhost').searchParams.get('cron')==='backup';
 if(cronBackup){
  if(!process.env.CRON_SECRET||req.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)fail('No autorizado',401);
  await init();return res.json(await createBackup());
 }
 if(req.method!=='POST'&&!imageId)fail('Método no permitido',405);
 if(!imageId&&req.headers['x-smartbod']!=='1')fail('Solicitud no permitida',403);
 const origin=req.headers.origin;const host=req.headers['x-forwarded-host']||req.headers.host;
 if(origin&&new URL(origin).host!==host)fail('Origen no permitido',403);
 if(Buffer.byteLength(JSON.stringify(req.body||{}))>3000000)fail('Archivo demasiado grande',413);
 await init();const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};const action=b.action;
 const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('sb_session='))?.slice(11)||'';
 const cookie=t=>res.setHeader('Set-Cookie',`sb_session=${t}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${t?28800:0}`);
 if(action==='login'){
  await seed();const username=String(b.username||'').toLowerCase().trim();const key=digest(username+'|'+String(req.headers['x-forwarded-for']||'').split(',')[0]);
  const attempt=await pool.query("INSERT INTO sb_attempts VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN sb_attempts.until_time<now() THEN 1 ELSE sb_attempts.count+1 END,until_time=CASE WHEN sb_attempts.until_time<now() THEN now()+interval '15 minutes' ELSE sb_attempts.until_time END RETURNING count",[key]);if(attempt.rows[0].count>10)fail('Demasiados intentos. Espera 15 minutos.',429);
  const {rows}=await pool.query('SELECT * FROM sb_users WHERE username=$1 AND enabled',[username]);const u=rows[0];if(!u||!await verify(b.password,u.password))fail('Usuario o contraseña incorrectos',401);
  const t=randomBytes(32).toString('hex');await pool.query("INSERT INTO sb_sessions VALUES($1,$2,now()+interval '8 hours')",[digest(t),u.id]);await pool.query('DELETE FROM sb_attempts WHERE key=$1',[key]);cookie(t);return res.json({user:safeUser(u)});
 }
 const {rows}=await pool.query('SELECT u.* FROM sb_users u JOIN sb_sessions s ON s.user_id=u.id WHERE s.token=$1 AND s.expires>now() AND u.enabled',[digest(token)]);const user=rows[0];if(!user)fail('Inicia sesión para continuar',401);
 if(imageId){const {rows:[image]}=await pool.query('SELECT content,mime FROM sb_images WHERE id=$1',[imageId]);if(!image)fail('Imagen no encontrada',404);res.setHeader('Content-Type',image.mime);return res.send(image.content);}
 if(action==='logout'){await pool.query('DELETE FROM sb_sessions WHERE token=$1',[digest(token)]);cookie('');return res.json({ok:true});}
 if(action==='backupCreate'||action==='backupRestore'||action==='backupList'){
  const {rows:[currentUser]}=await pool.query('SELECT id,role FROM sb_users WHERE id=$1 AND enabled',[user.id]);
  if(currentUser?.role!=='admin')fail('Solo administradores gestionan respaldos',403);
  if(action==='backupCreate')return res.json({backup:await createBackup()});
  if(action==='backupList')return res.json({backups:await listBackups()});
  const restored=await restoreBackup(b.key,currentUser.id),{rows:[store]}=await pool.query('SELECT revision,data,policy FROM sb_store WHERE id=1');
  const {rows:[restoredUser]}=await pool.query('SELECT id,username,name,role,enabled FROM sb_users WHERE id=$1',[currentUser.id]);
  return res.json({revision:restored.revision,state:publicState(store.data,restoredUser),policy:store.policy,user:safeUser(restoredUser)});
 }
 const result=await transaction(async c=>{
  // Serialize profile changes and stock writes with sales; permissions are re-read inside lock.
  const {rows:[store]}=await c.query('SELECT * FROM sb_store WHERE id=1 FOR UPDATE');
  const {rows:[fresh]}=await c.query('SELECT * FROM sb_users WHERE id=$1 AND enabled',[user.id]);if(!fresh)fail('Cuenta desactivada',401);
  const admin=()=>{if(fresh.role!=='admin')fail('Solo administradores',403);};
  let data=store.data,revision=store.revision,policy=store.policy,receipt;
  if(action==='state'){
   if(Number(data.schemaVersion)!==2){data=normalize(data);revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  }
  else if(action==='users'){admin();return {users:(await c.query('SELECT * FROM sb_users ORDER BY name')).rows.map(safeUser)};}
  else if(action==='user'){
   admin();const u=b.user||{};if(!/^[a-zA-Z0-9._@-]{2,80}$/.test(u.username||'')||!String(u.name||'').trim()||!['admin','seller'].includes(u.role)||typeof u.enabled!=='boolean')fail('Perfil inválido');
   if(u.id===fresh.id&&(!u.enabled||u.role!=='admin'))fail('No puedes quitar tu propio acceso de administrador');
   const id=u.id||randomUUID();const {rows:[old]}=await c.query('SELECT * FROM sb_users WHERE id=$1',[id]);const pw=u.password?await hash(u.password):old?.password;if(!pw)fail('Introduce una contraseña de 12 caracteres como mínimo');
   await c.query('INSERT INTO sb_users VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET username=excluded.username,name=excluded.name,role=excluded.role,enabled=excluded.enabled,password=excluded.password',[id,u.username.toLowerCase(),String(u.name).slice(0,100),u.role,u.enabled,pw]);
   if(old&&(u.password||!u.enabled||old.role!==u.role))await c.query('DELETE FROM sb_sessions WHERE user_id=$1',[id]);
  }
  else if(action==='policy'){admin();policy=b.policy;if(!policy||!['admin','seller'].every(k=>typeof policy[k]==='number'&&policy[k]>=0&&policy[k]<=100))fail('Límites inválidos');await c.query('UPDATE sb_store SET policy=$1 WHERE id=1',[policy]);}
  else if(action==='save'){
   admin();if(b.revision!==revision)fail('Otro usuario actualizó los datos. Recarga antes de guardar.',409);const itemIds=new Set((b.state?.items||[]).map(item=>item.id));
   if(b.restore!==true&&store.data.purchaseOrders.some(order=>order.status==='Pendiente'&&order.lines.some(line=>!itemIds.has(line.productId))))fail('No se puede eliminar un producto incluido en una orden de compra pendiente.');
   const incoming=b.restore===true?b.state:{...store.data,...b.state,lots:store.data.lots.filter(lot=>itemIds.has(lot.productId)),lotProductIds:store.data.lotProductIds.filter(id=>itemIds.has(id)),suppliers:store.data.suppliers,purchaseOrders:store.data.purchaseOrders,cashShifts:store.data.cashShifts,locations:store.data.locations};const next=normalize(incoming);data=b.restore===true?next:reconcileLots(recordPriceEdits(data,validateConsumptionChange(data,next),safeUser(fresh)));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);
  }
  else if(action==='restock'){admin();data=restock(data,b.restock,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='event'){admin();if(b.revision!==revision)fail('Los datos cambiaron. Actualiza antes de guardar el evento.',409);data=upsertEvent(data,b.event,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='void'){admin();data=voidSale(data,b.void,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='waste'){admin();data=recordWaste(data,b.waste,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='lotExpiration'){admin();data=updateLotExpiration(data,b.lot,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='supplier'){admin();data=saveSupplier(data,b.supplier,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='location'){admin();data=saveLocation(data,b.location,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='purchaseOrder'){admin();data=createPurchaseOrder(data,b.order,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='purchaseReceive'){admin();data=receivePurchaseOrder(data,b.order,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='shiftOpen'){data=openCashShift(data,b.shift,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='shiftClose'){data=closeCashShift(data,b.shift,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='imageUpload'){admin();if(typeof b.image!=='string'||b.image.length>210000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(b.image))fail('Imagen inválida');const bytes=Buffer.from(b.image.split(',')[1],'base64');if(bytes.length>150000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)fail('Imagen inválida o demasiado grande');const id=randomUUID();await c.query('INSERT INTO sb_images(id,content,mime) VALUES($1,$2,$3)',[id,bytes,'image/jpeg']);return {url:'/api/index?image='+id};}
  else if(action==='prepare'){admin();if(b.production?.recipePatch&&b.production.revision!==revision&&!data.kardex.some(k=>k.productionId===b.production.requestId))fail('El inventario cambió. Actualiza los datos y vuelve a revisar la receta.',409);data=prepare(data,b.production,safeUser(fresh));revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);}
  else if(action==='sale'){
   const alreadyProcessed=data.receipts.some(x=>x.requestId===b.sale?.requestId);
   const shift=data.cashShifts.find(x=>x.id===b.sale?.cashShiftId&&x.cashierId===fresh.id&&x.status==='open');
   if(!alreadyProcessed&&!shift)fail('Abre un turno de caja antes de registrar ventas',409);
   if(shift&&b.sale.locationId&&b.sale.locationId!==shift.locationId)fail('La venta debe usar la ubicación del turno abierto',409);
   const sale=sell(data,{...b.sale,...(shift?{locationId:shift.locationId,cashShiftId:shift.id}:{})},safeUser(fresh),policy);data=sale.state;receipt=sale.receipt;revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);
  }else fail('Operación desconocida',404);
  if(action!=='state')await c.query('INSERT INTO sb_audit(user_id,action,revision) VALUES($1,$2,$3)',[fresh.id,action,revision]);
  return {user:safeUser(fresh),state:publicState(data,fresh),revision,policy,receipt:receipt&&fresh.role!=='admin'?{...receipt,costs:undefined}:receipt};
 });return res.json(result);
 }catch(e){const status=e.status||500;res.status(status).json({error:e.status?e.message:e.code==='23505'?'El usuario ya existe':'No se pudo completar la operación. Revisa la conexión y configuración del servidor.'});}
}
