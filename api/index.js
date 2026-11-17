import {databaseUrl} from '../lib/environment.js';
import {operate} from '../lib/operations.js';
import {load,persist,diff,cashierState,writeCashierSale} from '../lib/repository.js';
import {allowed,actionScope,profiles} from '../lib/permissions.js';
import pg from 'pg';
import {cashPart,cashExpected} from '../public/cash.js';
import {randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {empty,fail,normalize,secureSave,validateConsumptionChange,recordPriceEdits,sell,prepare,voidSale,upsertEvent,restock,publicState} from '../lib/domain.js';
const scrypt=promisify(scryptCallback);let pool,ready;
const digest=s=>createHash('sha256').update(s).digest('hex');
function visible(state,user){
 const view=publicState(state,user);
 if(view.cashSessions)view.cashSessions=view.cashSessions.map(c=>c.closedAt?c:{...c,expectedLive:cashExpected(state,c)});
 return view;
}
function requireShift(data){
 const shift=data.cashSessions?.find(c=>!c.closedAt);
 if(!shift)fail('Abre un turno de caja antes de registrar efectivo.',409);
 return shift.id;
}
const safeUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role,enabled:u.enabled,permissions:u.permissions||null});
async function hash(password){if(typeof password!=='string'||password.length<12||password.length>200)fail('La contraseña requiere entre 12 y 200 caracteres');const salt=randomBytes(16).toString('hex');return salt+':'+(await scrypt(password,salt,64)).toString('hex');}
async function verify(password,encoded){if(typeof password!=='string'||password.length>200)return false;const [salt,h]=encoded.split(':');const candidate=await scrypt(password,salt,64);return timingSafeEqual(candidate,Buffer.from(h,'hex'));}
async function init(){
 const connectionString=databaseUrl();
 if(!pool)pool=new pg.Pool({connectionString,max:3,connectionTimeoutMillis:10000});
 if(!ready)ready=(async()=>{await pool.query(await readFile(new URL('../lib/schema.sql',import.meta.url),'utf8'));})();
 try{await ready;}catch(e){ready=null;throw e;}
}
async function transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
async function seed(){await transaction(async c=>{await c.query('SELECT id FROM sb_store WHERE id=1 FOR UPDATE');const {rows}=await c.query('SELECT id FROM sb_users LIMIT 1');if(rows.length)return;if(!process.env.ADMIN_USERNAME||!process.env.ADMIN_PASSWORD)fail('Configura ADMIN_USERNAME y ADMIN_PASSWORD para crear el administrador inicial',503);await c.query('INSERT INTO sb_users(id,username,name,role,enabled,password) VALUES($1,$2,$3,$4,true,$5)',[randomUUID(),process.env.ADMIN_USERNAME.toLowerCase(),'Administrador','admin',await hash(process.env.ADMIN_PASSWORD)]);});}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
 const imageId=req.method==='GET'?new URL(req.url,'https://localhost').searchParams.get('image'):null;
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
 if(action==='myTickets'){
  const page=Number(b.page??0),size=20;
  if(!Number.isSafeInteger(page)||page<0||page>1000000)fail('Página inválida');
  const {rows:[store]}=await pool.query('SELECT data FROM sb_store WHERE id=1');
  const rows=store.data.entityStorage
   ?(await pool.query("SELECT payload FROM sb_entities WHERE kind='receipts' AND payload->>'operatorId'=$1 ORDER BY payload->>'isoDate' DESC,id DESC LIMIT $2 OFFSET $3",[user.id,size+1,page*size])).rows.map(row=>row.payload)
   :(store.data.receipts||[]).filter(r=>r.operatorId===user.id).slice(page*size,(page+1)*size+1);
  return res.json({more:rows.length>size,tickets:rows.slice(0,size).map(r=>({ticket:r.ticketNum,date:r.isoDate||r.date,total:r.total,status:r.status,refund:(r.returns||[]).reduce((sum,x)=>sum+x.amount,0)}))});
 }
 if(action==='state'){const c=await pool.connect();try{await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const {rows:[store]}=await c.query('SELECT * FROM sb_store WHERE id=1');const data=user.role==="seller"&&store.data.entityStorage?await cashierState(c,store):await load(c,store);await c.query('COMMIT');return res.json({user:safeUser(user),state:visible(normalize(data),user),revision:store.revision,policy:store.policy});}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 const result=await transaction(async c=>{
  // Serialize profile changes and stock writes with sales; permissions are re-read inside lock.
  const {rows:[store]}=await c.query('SELECT * FROM sb_store WHERE id=1 FOR UPDATE');
  const {rows:[fresh]}=await c.query('SELECT * FROM sb_users WHERE id=$1 AND enabled',[user.id]);if(!fresh)fail('Cuenta desactivada',401);
  const admin=()=>{if(!allowed(fresh,actionScope(action,b)))fail('Tu perfil no tiene permiso para esta operación',403);};
  const fastSale=action==='sale'&&store.data.entityStorage;
  let data=fastSale?await cashierState(c,store,b.sale?.requestId):await load(c,store),revision=store.revision,policy=store.policy,receipt;const before=structuredClone(data);
  if(action==='backups'){admin();return {backups:(await c.query('SELECT id,at,revision,reason FROM sb_backups ORDER BY at DESC LIMIT 50')).rows};}
 else if(action==='backupDownload'){admin();const {rows:[backup]}=await c.query('SELECT data FROM sb_backups WHERE id=$1',[b.id]);if(!backup)fail('Respaldo inexistente',404);return {state:backup.data};}
 else if(action==='audit'){admin();return {audit:(await c.query('SELECT * FROM sb_audit ORDER BY at DESC LIMIT 100')).rows};}
 else if(action==='requestStatus'){const id=String(b.requestId||''),receipt=data.receipts.find(r=>r.requestId===id&&(fresh.role==='admin'||r.operatorId===fresh.id)),movement=fresh.role==='admin'?data.kardex.find(k=>k.productionId===id||k.restockId===id):null,operation=fresh.role==='admin'?data.operations?.find(o=>o.id===id):null;return {found:!!(receipt||movement||operation),ticketNum:receipt?.ticketNum};}
  else if(action==='users'){admin();return {users:(await c.query('SELECT * FROM sb_users ORDER BY name')).rows.map(safeUser)};}
  else if(action==='user'){
   admin();const u=b.user||{};if(!/^[a-zA-Z0-9._@-]{2,80}$/.test(u.username||'')||!String(u.name||'').trim()||!['admin','seller'].includes(u.role)||typeof u.enabled!=='boolean')fail('Perfil inválido');
   if(u.id===fresh.id&&(!u.enabled||u.role!=='admin'))fail('No puedes quitar tu propio acceso de administrador');
   const permissions=profiles[u.profile||'all'];if(!permissions)fail('Perfil inválido');if(u.id===fresh.id&&u.profile&&u.profile!=='all')fail('No puedes reducir tus propios permisos');const id=u.id||randomUUID();const {rows:[old]}=await c.query('SELECT * FROM sb_users WHERE id=$1',[id]);const pw=u.password?await hash(u.password):old?.password;if(!pw)fail('Introduce una contraseña de 12 caracteres como mínimo');
   await c.query('INSERT INTO sb_users(id,username,name,role,enabled,password,permissions) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET username=excluded.username,name=excluded.name,role=excluded.role,enabled=excluded.enabled,password=excluded.password,permissions=excluded.permissions',[id,u.username.toLowerCase(),String(u.name).slice(0,100),u.role,u.enabled,pw,JSON.stringify(permissions)]);
   if(old&&(u.password||!u.enabled||old.role!==u.role||JSON.stringify(old.permissions)!==JSON.stringify(permissions)))await c.query('DELETE FROM sb_sessions WHERE user_id=$1',[id]);
  }
  else if(action==='policy'){admin();policy=b.policy;if(!policy||!['admin','seller'].every(k=>typeof policy[k]==='number'&&policy[k]>=0&&policy[k]<=100))fail('Límites inválidos');await c.query('UPDATE sb_store SET policy=$1 WHERE id=1',[policy]);}
  else if(action==='save'){
   admin();if(b.revision!==revision)fail('Otro usuario actualizó los datos. Recarga antes de guardar.',409);if(b.restore===true)await c.query('INSERT INTO sb_backups(revision,data,reason) VALUES($1,$2,$3)',[revision,data,'Antes de restaurar']);const next=normalize({...(b.restore===true?{}:data),...b.state,events:b.state.events??data.events??[]});if(!allowed(fresh,'users')){
 next.negocio=data.negocio;next.telefono=data.telefono;next.savedReports=data.savedReports;next.events=data.events;
 for(const item of next.items){const old=data.items.find(p=>p.id===item.id);if(old){item.historyRevenue=old.historyRevenue;item.historyCost=old.historyCost;}}
 }
 data=b.restore===true?next:secureSave(data,next,safeUser(fresh));revision++;await persist(c,data,revision);
  }
  else if(action==='operation'){admin();if(b.operation?.kind==='return'&&b.operation.payMethod==='Efectivo'&&!data.operations?.some(o=>o.id===b.operation.requestId))requireShift(data);data=operate(data,b.operation,safeUser(fresh));revision++;await persist(c,data,revision);}
 else if(action==='restock'){admin();data=restock(data,b.restock,safeUser(fresh));revision++;await persist(c,data,revision);}
  else if(action==='event'){admin();if(b.revision!==revision)fail('Los datos cambiaron. Actualiza antes de guardar el evento.',409);data=upsertEvent(data,b.event,safeUser(fresh));revision++;await persist(c,data,revision);}
  else if(action==='void'){admin();const previous=data.receipts.find(r=>r.ticketNum===b.void?.ticketNum);
 const shiftId=previous&&previous.status!=='voided'&&cashPart(previous)>0?requireShift(data):null;
 data=voidSale(data,b.void,safeUser(fresh));if(shiftId)data.receipts.find(r=>r.ticketNum===previous.ticketNum).cashVoidSessionId=shiftId;revision++;await persist(c,data,revision);}
  else if(action==='imageUpload'){admin();if(typeof b.image!=='string'||b.image.length>210000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(b.image))fail('Imagen inválida');const bytes=Buffer.from(b.image.split(',')[1],'base64');if(bytes.length>150000||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)fail('Imagen inválida o demasiado grande');const id=randomUUID();await c.query('INSERT INTO sb_images(id,content,mime) VALUES($1,$2,$3)',[id,bytes,'image/jpeg']);return {url:'/api/index?image='+id};}
  else if(action==='prepare'){admin();if(b.production?.recipePatch&&b.production.revision!==revision&&!data.kardex.some(k=>k.productionId===b.production.requestId))fail('El inventario cambió. Actualiza los datos y vuelve a revisar la receta.',409);data=prepare(data,b.production,safeUser(fresh));revision++;await persist(c,data,revision);}
  else if(action==='sale'){
   if(!allowed(fresh,'sale')&&fresh.role==='admin'&&!allowed(fresh,'cash'))fail('Tu perfil no puede vender',403);
   const repeated=data.receipts.some(r=>r.requestId===b.sale?.requestId);
   const sale=sell(data,b.sale,safeUser(fresh),policy);data=sale.state;receipt=sale.receipt;if(!repeated&&cashPart(receipt)>0)receipt.cashSessionId=requireShift(data);
   if(!repeated){revision++;if(fastSale)await writeCashierSale(c,before,data,revision);else await persist(c,data,revision);}
  }else fail('Operación desconocida',404);
  await c.query('INSERT INTO sb_audit(user_id,action,revision,detail) VALUES($1,$2,$3,$4)',[fresh.id,action,revision,{changes:diff(before,data),kind:b.operation?.kind||null}]);const recent=await c.query("SELECT 1 FROM sb_backups WHERE at>now()-interval '24 hours' LIMIT 1");
  if(!recent.rows.length)await c.query("INSERT INTO sb_backups(revision,data,reason) VALUES($1,$2,'Copia diaria')",[revision,fastSale?await load(c,store):data]);await c.query("DELETE FROM sb_backups WHERE at<now()-interval '30 days' AND reason='Copia diaria'");
  if(fastSale&&fresh.role!=='seller')data=await load(c,store);
  return {user:safeUser(fresh),state:visible(data,fresh),revision,policy,receipt:receipt&&fresh.role!=='admin'?{...receipt,costs:undefined}:receipt};
 });return res.json(result);
 }catch(e){if(!e.status)console.error('SMARTBOD',{code:e.code,message:e.message});const status=e.status||500;res.status(status).json({error:e.status?e.message:e.code==='23505'?'El usuario ya existe':'No se pudo completar la operación. Revisa la conexión y configuración del servidor.'});}
}
