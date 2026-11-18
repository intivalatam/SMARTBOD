import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {reserveFiscal,transmitFiscal} from '../lib/fiscal.js';
const db=new PGlite();await db.exec(await readFile(new URL('../lib/schema.sql',import.meta.url),'utf8'));
Object.assign(process.env,{CPE_IGV:'18',CPE_BOLETA:'B001',CPE_FACTURA:'F001',CPE_NC_FACTURA:'FC01',CPE_NC_BOLETA:'BC01',NUBEFACT_URL:'https://api.nubefact.com/api/test',NUBEFACT_TOKEN:'fixture'});
const sale={ticketNum:'test',returns:[],lines:[{productId:'p',nombre:'Queso',sku:'Q',qty:.35,saleUnit:'kg',net:9.8}]};
const tx=async fn=>{await db.query('BEGIN');try{const r=await fn();await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}};
try{
 for(const [kind,document] of [[1,'20123456789'],[2,'12345678']]){
  sale.ticketNum='test-'+kind;sale.status='completed';
  const data={kind,document,name:'Prueba'};const doc=await tx(()=>reserveFiscal(db,sale,data));
  assert.deepEqual(await tx(()=>reserveFiscal(db,sale,data)),doc);
  assert.equal((await tx(()=>transmitFiscal(db,doc.key,false,async()=>{throw Error('timeout')}))).status,'Por verificar');
  const ok=async(url,opts)=>{assert.equal(JSON.parse(opts.body).operacion,'consultar_comprobante');return {ok:true,json:async()=>({aceptada_por_sunat:true})};};
  assert.equal((await tx(()=>transmitFiscal(db,doc.key,true,ok))).status,'Aceptado');
  sale.status='voided';const credit=await tx(()=>reserveFiscal(db,sale,{kind:3}));assert.match(credit.document,/C01-1$/);
  const stored=(await db.query('SELECT payload FROM sb_fiscal WHERE document_key=$1',[credit.key])).rows[0].payload;
  assert.equal(stored.total,9.8);assert.equal(stored.documento_que_se_modifica_tipo,kind);
 }
 console.log('CPE: factura, boleta, notas, correlativos y consulta tras timeout OK (proveedor simulado)');
}finally{await db.close();}
