import {content,purchaseCost,remaining} from '../public/inventory-math.js';

function reject(message){throw Object.assign(Error(message),{status:400});}
export function positive(value){
 const n=Number(value);if(!Number.isFinite(n)||n<=0||n>1e9)reject('Cantidad o precio inválido');return n;
}
export function commercialLine(p,input){
 const count=positive(input.qty);
 const pack=input.barcode?p.presentations?.find(x=>x.code===input.barcode):null;
 if(input.barcode&&!pack)reject('Presentación desconocida');
 const step=pack?1:(p.scaleStep||1);
 if(Math.abs(count/step-Math.round(count/step))>0.000001)reject('Cantidad inválida para la precisión del producto');
 const price=pack?pack.price:p.precio;
 if(input.expectedPrice!=null&&Number(input.expectedPrice)!==price)reject('El precio cambió. Actualiza el carrito.');
 return {qty:count*(pack?.units||1),amount:Math.round(Math.round(price*100)*count),description:pack?.name||p.nombre,count,price,barcode:pack?.code||null};
}
export function receiveLot(p,r,qty,date){
 if(!r.lot&&!r.expiry)return;
 if(!String(r.lot||'').trim()||!/^\d{4}-\d{2}-\d{2}$/.test(r.expiry)||!Number.isFinite(Date.parse(r.expiry))||new Date(r.expiry).toISOString().slice(0,10)!==r.expiry||r.expiry<date)reject('Indica lote y vencimiento válidos');
 (p.purchaseLots??=[]).push({id:r.requestId,label:String(r.lot).trim().slice(0,80),expiry:r.expiry,supplier:String(r.supplier||'').slice(0,150),qty});
}
export function consumeLots(p,qty,date){
 if(!p.purchaseLots?.length)return [];
 let left=qty;
 const tracked=p.purchaseLots.reduce((sum,l)=>sum+l.qty,0);
 const free=Math.max(0,remaining(p)-tracked);
 const used=[];
 for(const lot of [...p.purchaseLots].sort((a,b)=>a.expiry.localeCompare(b.expiry))){
  if(lot.expiry<date||lot.qty<=0)continue;
  const take=Math.min(left,lot.qty);if(take<=0)break;
  lot.qty-=take;left-=take;used.push({id:lot.id,qty:take});
 }
 if(left>free+1e-8)reject('Existencias vendibles insuficientes por vencimiento del lote');
 return used;
}
export function restoreLots(p,allocations,offset,qty){
 for(const a of allocations||[]){
  const skip=Math.min(a.qty,offset);offset-=skip;
  const take=Math.min(qty,a.qty-skip);
  if(take>0){const lot=p.purchaseLots?.find(l=>l.id===a.id);if(!lot)reject('Falta el lote original');lot.qty+=take;qty-=take;}
 }
}
export function retailOperation(s,r,user){
 const p=s.items.find(i=>i.id===r.id&&!i.archived);if(!p)reject('Producto inexistente');
 if(r.kind==='retailSettings'){
  if(p.tipo!=='producto'||p.inventoryKind==='consumable')reject('Selecciona mercadería de venta directa');
  const unit=r.unit||'unidad';
  if(!['unidad','kg','L'].includes(unit))reject('Unidad comercial inválida');
  if(unit!=='unidad'&&p.consumptionMode==='measure'){
   const kg=['kg','g'].includes(p.contentUnit);
   if((kg?'kg':'L')!==unit||content(p)!==1000)reject('La unidad base de este insumo es su envase. Para venta directa por kg o L utiliza un SKU con referencia de 1 kg o 1 L.');
  }
  const step=unit==='unidad'?1:positive(r.step);
  if(![1,0.1,0.01,0.001].includes(step))reject('Precisión inválida');
  const packs=p.presentations||[];
  if(r.code){
   const code=String(r.code).trim(),name=String(r.name||'').trim(),units=positive(r.units),price=positive(r.price);
   if(!name||!code||code.length>80||name.length>100||!Number.isInteger(units)||s.items.some(i=>i.sku.toLowerCase()===code.toLowerCase()||i.id!==p.id&&i.presentations?.some(v=>v.code.toLowerCase()===code.toLowerCase())))reject('Código repetido o presentación inválida');
   p.presentations=[...packs.filter(v=>v.code.toLowerCase()!==code.toLowerCase()),{code,name,units,price}];
  }
  p.saleUnit=unit;p.scaleStep=step;
 }else if(r.kind==='lotDiscard'){
  const lot=p.purchaseLots?.find(x=>x.id===r.lotId),qty=positive(r.qty);
  if(!lot||qty>lot.qty||qty>remaining(p)||String(r.reason||'').trim().length<5)reject('Revisa lote, saldo y motivo');
  const value=qty*p.inventoryValue/remaining(p);lot.qty-=qty;p.consumed+=qty;p.inventoryValue-=value;
  s.kardex.unshift({id:r.requestId,type:'WASTE',date:new Date().toISOString(),sku:p.sku,name:p.nombre,qty,amount:value,detail:lot.label+' · '+r.reason,operator:user.name});
 }else if(r.kind==='retailCount'){
  if(p.tipo!=='producto'||r.qty===''||r.qty==null||!Number.isFinite(Number(r.qty))||Number(r.qty)<0||String(r.reason||'').trim().length<5)reject('Revisa cantidad contada y motivo');
  const expected=remaining(p),delta=Number(r.qty)-expected;
  if(Math.abs(expected-Number(r.expected))>1e-8)reject('El saldo cambió. Actualiza y vuelve a contar.');
  if(p.purchaseLots?.some(l=>l.qty>0)&&delta)reject('Ajusta por lote desde Retiros o Reponer y luego confirma el conteo.');
  const value=purchaseCost(p)*delta;
  if(delta>0){p.unidadesCompradas+=delta;p.costoTotal+=value;}else p.consumed-=delta;
  p.inventoryValue=Math.max(0,p.inventoryValue+value);p.lastCount=new Date().toISOString();
  s.kardex.unshift({id:r.requestId,date:p.lastCount,type:p.inventoryKind==='consumable'?(delta>=0?'SUPPLY_COUNT_IN':'SUPPLY_COUNT_OUT'):'COUNT',sku:p.sku,name:p.nombre,unit:p.supplyUnit||p.saleUnit||'unidad',qty:Math.abs(delta),delta,amount:Math.abs(value),expense:-value,operator:user.name,productId:p.id,detail:r.reason});
 }else if(r.kind==='reorderPlan'){
  const lead=Number(r.leadDays),pending=Number(r.pending),pack=positive(r.pack);
  if(!Number.isInteger(lead)||lead<0||lead>365||!Number.isFinite(pending)||pending<0)reject('Revisa plazo y cantidad pendiente');
  p.reorder={leadDays:lead,pending,pack};
 }
 return {productId:p.id};
}
