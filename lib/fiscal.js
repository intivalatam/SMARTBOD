import {peruDate,fail} from './domain.js';
const round=n=>Math.round(n*100)/100;
const view=r=>({key:r.document_key,ticket:r.ticket,document:r.series+'-'+r.number,status:r.status,detail:r.detail||'',links:r.links||{}});
export function buildFiscal(sale,request,series,number,parent){
 const note=Boolean(parent),kind=note?3:Number(request.kind);
 const customer=note?parent.payload:null;
 const document=String(customer?.cliente_numero_de_documento||request.document||'').trim();
 const name=String(customer?.cliente_denominacion||request.name||'').trim();
 const identity=customer?.cliente_tipo_de_documento||(kind===1?'6':document.length===11?'6':'1');
 if(![1,2,3].includes(kind)||!name||!(identity==='6'?/^\d{11}$/:/^\d{8}$/).test(document))fail('Indica nombre y DNI de 8 dígitos o RUC de 11. La factura requiere RUC.');
 if(!note&&sale.status==='voided')fail('La venta ya está anulada');
 const refund=note&&sale.returns?.find(r=>r.id===request.refund);
 if(note&&!refund&&sale.status!=='voided')fail('Selecciona una devolución registrada');
 const selected=refund?sale.lines.filter(l=>l.productId===refund.productId):sale.lines;
 const rate=Number(customer?.porcentaje_de_igv??process.env.CPE_IGV);
 if(!Number.isFinite(rate)||rate<=0||rate>30)fail('Configura la tasa IGV de las operaciones gravadas');
 const items=selected.map(l=>{
  const qty=refund?refund.qty:l.qty,total=refund?refund.amount:l.net;
  if(!Number.isFinite(total)||total<=0)fail('Revisa importes y afectación tributaria de la venta');
  const base=round(total/(1+rate/100));
  return {unidad_de_medida:({kg:'KGM',L:'LTR'})[l.saleUnit]||'NIU',codigo:l.sku,descripcion:l.nombre,cantidad:qty,valor_unitario:Number((total/(1+rate/100)/qty).toFixed(8)),precio_unitario:Number((total/qty).toFixed(8)),subtotal:base,tipo_de_igv:1,igv:round(total-base),total};
 });
 const sum=k=>round(items.reduce((n,i)=>n+i[k],0)),date=peruDate(new Date()).split('-').reverse().join('-');
 return {operacion:'generar_comprobante',tipo_de_comprobante:kind,serie:series,numero:number,sunat_transaction:1,cliente_tipo_de_documento:identity,cliente_numero_de_documento:document,cliente_denominacion:name,cliente_direccion:customer?.cliente_direccion||String(request.address||''),fecha_de_emision:date,moneda:1,porcentaje_de_igv:rate,total_gravada:sum('subtotal'),total_igv:sum('igv'),total:sum('total'),enviar_automaticamente_a_la_sunat:true,items,...(note?{documento_que_se_modifica_tipo:parent.kind,documento_que_se_modifica_serie:parent.series,documento_que_se_modifica_numero:parent.number,tipo_de_nota_de_credito:refund?7:1,observaciones:refund?.reason||sale.voidReason}:{})};
}
export async function reserveFiscal(c,sale,r){
 await c.query('LOCK TABLE sb_fiscal IN SHARE ROW EXCLUSIVE MODE');
 const note=Number(r.kind)===3,key=sale.ticketNum+(note?':credit:'+(r.refund||'void'):':sale');
 const old=(await c.query('SELECT * FROM sb_fiscal WHERE document_key=$1',[key])).rows[0];if(old)return view(old);
 const parent=note?(await c.query('SELECT * FROM sb_fiscal WHERE document_key=$1',[sale.ticketNum+':sale'])).rows[0]:null;
 if(note&&parent?.status!=='Aceptado')fail('La nota requiere un comprobante de origen aceptado');
 const kind=Number(r.kind),series=process.env[note?(parent.kind===1?'CPE_NC_FACTURA':'CPE_NC_BOLETA'):(kind===1?'CPE_FACTURA':'CPE_BOLETA')];
 const prefix=(note?parent.kind:kind)===1?'F':'B';
 if(!series||!new RegExp('^'+prefix+'[A-Z0-9]{3}$').test(series))fail('Configura una serie exclusiva en el servidor');
 const {rows:[seq]}=await c.query('SELECT COALESCE(MAX(number),0)+1 AS next FROM sb_fiscal WHERE kind=$1 AND series=$2',[kind,series]);
 const payload=buildFiscal(sale,r,series,seq.next,parent);
 return view((await c.query('INSERT INTO sb_fiscal(document_key,ticket,kind,series,number,payload) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[key,sale.ticketNum,kind,series,seq.next,payload])).rows[0]);
}
export async function transmitFiscal(c,key,consult=false,transport=fetch){
 const row=(await c.query('SELECT * FROM sb_fiscal WHERE document_key=$1 FOR UPDATE',[key])).rows[0];
 if(!row)fail('Comprobante inexistente',404);
 if(row.status==='Aceptado')return view(row);
 const url=process.env.NUBEFACT_URL,token=process.env.NUBEFACT_TOKEN;
 if(!url||!token||!/^https:\/\/(?:api\.|www\.)?nubefact\.com\//.test(url))fail('Configura la ruta HTTPS y el token de NubeFact',503);
 const payload=consult?{operacion:'consultar_comprobante',tipo_de_comprobante:row.kind,serie:row.series,numero:row.number}:row.payload;
 let status='Por verificar',detail='',links=row.links||{};
 try{
  const response=await transport(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Token token="'+token+'"','Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json();
  if(response.ok&&result.aceptada_por_sunat===true)status='Aceptado';
  else if(result.errors)status='Revisar';
  for(const [key,value] of Object.entries({PDF:result.enlace_del_pdf,XML:result.enlace_del_xml,CDR:result.enlace_del_cdr})){
    if(typeof value==='string'&&value.startsWith('https://'))links[key]=value;
  }
  detail=String(result.errors||result.sunat_description||'Pendiente de confirmación del proveedor').slice(0,400);
 }catch{detail='Respuesta no confirmada. Consulta el estado antes de reenviar.';}
 return view((await c.query('UPDATE sb_fiscal SET status=$2,detail=$3,links=$4,updated_at=now() WHERE document_key=$1 RETURNING *',[key,status,detail,links])).rows[0]);
}
export async function fiscalList(c,ticket){return (await c.query('SELECT * FROM sb_fiscal WHERE ticket=$1 ORDER BY updated_at DESC',[ticket])).rows.map(view);}
