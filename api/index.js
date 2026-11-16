import pg from 'pg';
import {randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {empty,fail,normalize,sell,publicState} from '../lib/domain.js';
const scrypt=promisify(scryptCallback);let pool,ready;
const digest=s=>createHash('sha256').update(s).digest('hex');
const safeUser=u=>({id:u.id,username:u.username,name:u.name,role:u.role,enabled:u.enabled});
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
 if(req.method!=='POST')fail('Método no permitido',405);
 if(req.headers['x-smartbod']!=='1')fail('Solicitud no permitida',403);
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
 if(action==='logout'){await pool.query('DELETE FROM sb_sessions WHERE token=$1',[digest(token)]);cookie('');return res.json({ok:true});}
 const result=await transaction(async c=>{
  // Serialize profile changes and stock writes with sales; permissions are re-read inside lock.
  const {rows:[store]}=await c.query('SELECT * FROM sb_store WHERE id=1 FOR UPDATE');
  const {rows:[fresh]}=await c.query('SELECT * FROM sb_users WHERE id=$1 AND enabled',[user.id]);if(!fresh)fail('Cuenta desactivada',401);
  const admin=()=>{if(fresh.role!=='admin')fail('Solo administradores',403);};
  let data=store.data,revision=store.revision,policy=store.policy,receipt;
  if(action==='state'){}
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
   admin();if(b.revision!==revision)fail('Otro usuario actualizó los datos. Recarga antes de guardar.',409);data=normalize(b.state);revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);
  }
  else if(action==='sale'){
   const sale=sell(data,b.sale,safeUser(fresh),policy);data=sale.state;receipt=sale.receipt;revision++;await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[data,revision]);
  }else fail('Operación desconocida',404);
  if(action!=='state')await c.query('INSERT INTO sb_audit(user_id,action,revision) VALUES($1,$2,$3)',[fresh.id,action,revision]);
  return {user:safeUser(fresh),state:publicState(data,fresh),revision,policy,receipt:receipt&&fresh.role!=='admin'?{...receipt,costs:undefined}:receipt};
 });return res.json(result);
 }catch(e){const status=e.status||500;res.status(status).json({error:e.status?e.message:e.code==='23505'?'El usuario ya existe':'No se pudo completar la operación. Revisa la conexión y configuración del servidor.'});}
}
