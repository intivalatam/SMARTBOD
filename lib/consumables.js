import {randomUUID} from 'node:crypto';
import {remaining,purchaseCost} from '../public/inventory-math.js';
const fail=m=>{throw Object.assign(Error(m),{status:400});};
const num=(v,min=0)=>{if(v===''||v==null)fail('Completa la cantidad o importe');v=Number(v);if(!Number.isFinite(v)||v<min||v>1e9)fail('Cantidad o importe inválido');return v;};
const text=(v,max=150)=>String(v||'').trim().slice(0,max);
function packCount(value){
 const n=num(value,1);
 if(!Number.isSafeInteger(n))fail('Indica una cantidad entera por paquete');
 return n;
}
export function supplyMovement(s,p,type,delta,value,user,extra={}){
 s.kardex.unshift({id:randomUUID(),date:new Date().toISOString(),sku:p.sku,name:p.nombre,productId:p.id,type,qty:Math.abs(delta),delta,amount:value,operator:user.name,operatorId:user.id,unit:p.supplyUnit||'unidad',payMethod:'-',...extra});
}
export function validateSupplies(s){
 for(const p of s.items){
  if(p.inventoryKind!=null&&!['merchandise','consumable'].includes(p.inventoryKind))fail('Clase de inventario inválida');
  if(p.inventoryKind==='consumable'){
   if(p.packContents!=null)packCount(p.packContents);
   if(p.tipo!=='producto'||p.consumptionMode!=='unit'||p.precio!==0||!['unidad','paquete','par'].includes(p.supplyUnit)||!Number.isFinite(p.minStock)||p.minStock<0)fail('Consumible inválido');
  }
  if(p.consumables!==undefined){
   if(p.tipo!=='elaborado'||!Array.isArray(p.consumables)||p.consumables.length>100)fail('Asignación de consumibles inválida');
   const ids=new Set();for(const a of p.consumables){const ins=s.items.find(x=>x.id===a.id);if(!ins||ins.inventoryKind!=='consumable'||ids.has(a.id)||!Number.isFinite(a.qty)||a.qty<=0||a.qty>100000)fail('Revisa los consumibles asignados');ids.add(a.id);}
  }
 }
}
export function supplyOperation(s,r,user){
 const now=new Date().toISOString();
 if(r.kind==='supplyCreate'){
  const nombre=text(r.name),sku=text(r.sku,80)||'CON-'+randomUUID().slice(0,8).toUpperCase();
  if(!nombre||s.items.some(p=>p.sku.toLowerCase()===sku.toLowerCase()))fail('Nombre obligatorio y SKU único');
  if(!['unidad','paquete','par'].includes(r.unit))fail('Unidad inválida');
  const p={id:randomUUID(),sku,nombre,cat:'Empaques y consumibles',tipo:'producto',inventoryKind:'consumable',supplyUnit:r.unit,consumptionMode:'unit',deductOnSale:false,precio:0,minStock:num(r.minStock),unidadesCompradas:0,costoTotal:0,inventoryValue:0,consumed:0,vendidos:0,historyRevenue:0,historyCost:0,priceHistory:[]};if(r.packContents!=null&&r.packContents!=='')p.packContents=packCount(r.packContents);s.items.push(p);return {productId:p.id,name:p.nombre};
 }
 if(r.kind==='supplyAssign'){
  const p=s.items.find(x=>x.id===r.id);if(!p||p.tipo!=='elaborado'||p.archived)fail('Selecciona un producto preparado activo');
  if(JSON.stringify(p.consumables||[])!==r.expectedLinks)fail('La asignación cambió. Actualiza antes de guardar.');
  const before=structuredClone(p.consumables||[]);p.consumables=structuredClone(r.links);validateSupplies(s);
  if(p.consumables.some(a=>s.items.find(x=>x.id===a.id).archived))fail('No puedes asignar un consumible archivado');
  return {productId:p.id,before,after:p.consumables};
 }
 const p=s.items.find(x=>x.id===r.id);if(!p||p.inventoryKind!=='consumable'||p.archived)fail('Selecciona un consumible activo');
 if(r.kind==='supplyRemove'){
  if(remaining(p)>1e-9)fail('Registra la salida o el conteo del saldo antes de eliminar.');
  if(s.items.some(item=>item.consumables?.some(link=>link.id===p.id)))fail('Quita primero la asignación al preparado.');
  const used=p.unidadesCompradas>0||p.priceHistory?.length||s.kardex.some(k=>k.productId===p.id||k.sku===p.sku);
  if(used)p.archived=true;
  else s.items=s.items.filter(item=>item.id!==p.id);
  return {productId:p.id,name:p.nombre,archived:Boolean(used)};
 }
 if(r.kind==='supplySettings'){const before={name:p.nombre,minStock:p.minStock};const name=text(r.name);if(!name)fail('Nombre obligatorio');if(r.packContents!=null&&r.packContents!==''){
   const size=packCount(r.packContents);
   if(p.supplyUnit==='paquete'&&p.packContents&&p.packContents!==size&&(remaining(p)>0||s.items.some(item=>item.consumables?.some(link=>link.id===p.id))))fail('Esta presentación tiene saldo o asignaciones. Registra otro material para el nuevo tamaño.');
   p.packContents=size;
  }p.nombre=name;p.minStock=num(r.minStock);return {productId:p.id,before,name,minStock:p.minStock};}
 if(r.kind==='supplyPurchase'){
  const perPack=num(r.perPack??1,0.000001);
  const qty=num(num(r.qty,0.000001)*perPack,0.000001),total=Math.round(num(r.total)*100)/100,supplier=text(r.supplier),document=text(r.document,100);
  if(document&&p.priceHistory.some(h=>h.document===document&&h.supplier===supplier))fail('Documento ya registrado para este consumible');
  const previous=p.lastPurchaseCost??null;if(p.reorder)p.reorder.pending=Math.max(0,p.reorder.pending-qty);p.unidadesCompradas+=qty;p.costoTotal+=total;p.inventoryValue+=total;p.lastPurchaseCost=total/qty;
  p.lastPackSize=perPack;p.priceHistory.push({id:randomUUID(),date:now,packages:Number(r.qty),perPack,source:'Compra de consumible',qty,total,unitCost:total/qty,salePrice:0,previousPurchaseCost:previous,supplier,document,operator:user.name});
  supplyMovement(s,p,'SUPPLY_BUY',qty,total,user,{detail:'Compra · '+supplier+' · '+document,operationId:r.requestId,supplier,document});return {productId:p.id,qty,total};
 }
 const before=remaining(p);if(Math.abs(num(r.expectedStock)-before)>1e-8)fail('Las existencias cambiaron. Actualiza y vuelve a contar o registrar el uso.');
 const reason=text(r.reason,500);if(reason.length<5)fail('Escribe un motivo de al menos 5 caracteres');
 if(!['use','waste','count'].includes(r.mode))fail('Movimiento inválido');
 if(r.eventId&&!s.events.some(e=>e.id===r.eventId))fail('Evento inexistente');
 const divisor=r.entryUnit==='piece'&&p.supplyUnit==='paquete'?packCount(p.packContents):1;
 if(r.mode==='count')p.lastCount=now;
 const amount=num(r.qty,r.mode==='count'?0:0.000001)/divisor,delta=r.mode==='count'?amount-before:-amount;
 // Conteos positivos desproporcionados suelen ser compras introducidas como saldo.
 // Se permiten solo tras confirmación explícita, por administrador y con medición exacta.
 const unusualCountIncrease=r.mode==='count'&&delta>Math.max(5,before*2);
 if(unusualCountIncrease&&(r.estimated===true||r.estimated==='true'))fail('Un aumento tan grande requiere conteo físico exacto. Si compraste paquetes, usa Reponer.');
 if(unusualCountIncrease&&(user.role!=='admin'||r.confirmLargeCount!==true))fail('El conteo aumenta las existencias de forma excepcional. Verifica si corresponde a una compra y confirma el ajuste.');
 if(delta< -before-1e-8)fail('El uso supera las existencias');
 let unit=purchaseCost(p);if(delta>0&&before<=1e-9)unit=num(r.unitCost);
 const value=Math.abs(delta)*unit;
 if(delta>0){p.unidadesCompradas+=delta;p.costoTotal+=value;p.inventoryValue+=value;}else{p.consumed-=delta;p.inventoryValue=Math.max(0,p.inventoryValue-value);}
 const type=r.mode==='count'?(delta>=0?'SUPPLY_COUNT_IN':'SUPPLY_COUNT_OUT'):r.mode==='waste'?'SUPPLY_WASTE':'SUPPLY_USE';
 supplyMovement(s,p,type,delta,value,user,{detail:reason,operationId:r.requestId,eventId:r.eventId||null,estimated:!!r.estimated,expense:delta>0?-value:value,before,after:remaining(p)});
 return {productId:p.id,before,after:remaining(p),delta,value,reason,estimated:!!r.estimated};
}
