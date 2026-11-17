import {ensureBatches,takeBatches,returnBatches} from './batches.js';
import {ingredient,purchaseCost} from '../public/inventory-math.js';
import {randomUUID} from 'node:crypto';
export const empty=()=>({items:[],kardex:[],receipts:[],savedReports:[],events:[],negocio:'SMARTBOD',telefono:''});
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
const number=(v)=>{const n=Number(v);if(!Number.isFinite(n))fail('Número inválido');return n;};
const cents=v=>Math.round(number(v)*100);
export function normalize(raw){
 const s={...empty(),...structuredClone(raw)};
 if(!Array.isArray(s.items)||!Array.isArray(s.kardex)||!Array.isArray(s.receipts)||!Array.isArray(s.savedReports))fail('Respaldo inválido');
 s.events=validateEvents(s.events);
 const ids=new Set(),skus=new Set();
 for(const p of s.items){
  if(typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.sku!=='string'||!p.sku||skus.has(p.sku)||typeof p.nombre!=='string'||!['producto','elaborado'].includes(p.tipo))fail('Productos o SKU inválidos');ids.add(p.id);skus.add(p.sku);
  if(p.priceHistory!==undefined&&(!Array.isArray(p.priceHistory)||p.priceHistory.some(h=>!h||typeof h.date!=='string'||!Number.isFinite(Date.parse(h.date))||!Number.isFinite(h.salePrice)||h.salePrice<0||(h.unitCost!=null&&(!Number.isFinite(h.unitCost)||h.unitCost<0))||!Number.isFinite(h.qty)||h.qty<0)))fail('Historial de precios inválido');
  if(p.cat!=null&&(typeof p.cat!=='string'||p.cat.length>100))fail('Categoría inválida');
  configureConsumption(p);
  if(p.deductOnSale!==undefined&&typeof p.deductOnSale!=='boolean')fail('Configuración de consumo inválida');
  for(const key of ['presentation','contentDescription','productDetail']){if(p[key]!==undefined&&(typeof p[key]!=='string'||p[key].length>300))fail('Detalle del producto inválido');}
  if(p.deductOnSale){p.portionsPerUnit=number(p.portionsPerUnit);if(p.portionsPerUnit<=0)fail('Indica cuántas porciones rinde el envase');}
  for(const key of ['precio','vendidos','unidadesCompradas','costoTotal','consumed']){p[key]=number(p[key]??0);if(p[key]<0)fail('Cantidades negativas');}
 }
 for(const p of s.items.filter(p=>p.tipo==='elaborado')){p.recipeYield=number(p.recipeYield??1);p.preparedStock=number(p.preparedStock??0);p.preparedValue=number(p.preparedValue??0);if(!Number.isInteger(p.recipeYield)||p.recipeYield<=0||!Number.isInteger(p.preparedStock)||p.preparedStock<0||p.preparedValue<0)fail('Producción inválida');}
 for(const p of s.items.filter(p=>p.tipo==='elaborado'&&p.batches!==undefined)){if(!Array.isArray(p.batches)||p.batches.some(b=>!b||typeof b.id!=='string'||!Number.isInteger(b.qty)||b.qty<0)||p.batches.reduce((n,b)=>n+b.qty,0)!==p.preparedStock||new Set(p.batches.map(b=>b.id)).size!==p.batches.length)fail('Lotes y existencias no coinciden');}
 const use={};for(const p of s.items.filter(p=>p.tipo==='elaborado')){
  if(!Array.isArray(p.ingredientes)||!p.ingredientes.length)fail('Receta vacía');
  for(const i of p.ingredientes){const source=s.items.find(x=>x.id===i.idInsumo);if(!source)fail('Ingrediente inexistente');if(i.measureMode==='dose'&&source.consumptionMode!=='measure')fail('Registra contenido en gramos o ml');if(i.measureMode==='coverage'&&!(Number(i.servingsPerUnit)>0))fail('El rendimiento del envase debe ser mayor a cero');Object.assign(i,ingredient(source,i,p.recipeYield));if(!['prepare','sale'].includes(i.consumeAt)||!Number.isFinite(i.cantidad))fail('Consumo inválido');const ins=s.items.find(x=>x.id===i.idInsumo);if(!ins||ins.tipo==='elaborado'||number(i.cantidad)<=0)fail('Ingrediente inválido');if(!p.frozenConsumption)use[ins.id]=(use[ins.id]||0)+i.cantidad*p.vendidos;}
 }
 for(const p of s.items){if(p.tipo==='producto')p.consumed+=(use[p.id]||0);else p.frozenConsumption=true;}
 for(const p of s.items){if(p.historyRevenue==null){p.historyRevenue=p.precio*p.vendidos;p.historyCost=unitCost(s,p)*p.vendidos;}if(!Number.isFinite(Number(p.historyRevenue))||!Number.isFinite(Number(p.historyCost)))fail('Totales inválidos');}
 for(const p of s.items.filter(x=>x.tipo==='producto')){if(p.inventoryValue==null){p.inventoryValue=stock(p)*(p.unidadesCompradas>0?p.costoTotal/p.unidadesCompradas:0);p.costMigration='Saldo inicial estimado: verifica el valor con tus compras e inventario físico';}if(!Number.isFinite(p.inventoryValue)||p.inventoryValue<0)fail('Valor de inventario inválido');}
 return s;
}
export function unitCost(s,p){return p.tipo==='elaborado'?p.ingredientes.reduce((sum,i)=>sum+unitCost(s,s.items.find(x=>x.id===i.idInsumo))*Number(i.cantidad),0)/(p.recipeYield||1):purchaseCost(p);}
export function stock(p){return Math.max(0,p.unidadesCompradas-p.vendidos-p.consumed);}
export function sell(original,request,user,policy){
 const s=normalize(original);
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Identificador de operación inválido');
 const previous=s.receipts.find(r=>r.requestId===request.requestId);if(previous){if(previous.operatorId!==user.id)fail('Operación inválida',403);return {state:s,receipt:previous};}
 if(!Array.isArray(request.lines)||!request.lines.length||request.lines.length>500)fail('Carrito inválido');
 const needs={},seen=new Set();let subtotal=0;
 const lines=request.lines.map(l=>{const p=s.items.find(p=>p.id===l.id);if(!p||p.archived||seen.has(p.id))fail('Producto inexistente o repetido');seen.add(p.id);const qty=number(l.qty);if(!Number.isInteger(qty)||qty<=0||qty>100000)fail('Cantidad inválida');const amount=cents(p.precio)*qty;subtotal+=amount;
 if(p.tipo==='elaborado'){if(qty>p.preparedStock)fail('Porciones preparadas insuficientes: '+p.nombre,409);for(const i of p.ingredientes.filter(i=>i.deductAtSale))needs[i.idInsumo]=(needs[i.idInsumo]||0)+qty/i.servingsPerUnit;}else needs[p.id]=(needs[p.id]||0)+qty;
 const saleIngredients=p.tipo==='elaborado'?p.ingredientes.filter(i=>i.deductAtSale).map(i=>({idInsumo:i.idInsumo,quantity:qty/i.servingsPerUnit})):[];
 return {p,qty,amount,saleIngredients,cost:(p.tipo==='elaborado'?p.preparedValue/p.preparedStock:unitCost(s,p))*qty+saleIngredients.reduce((sum,i)=>sum+unitCost(s,s.items.find(p=>p.id===i.idInsumo))*i.quantity,0)};});
 for(const [id,qty] of Object.entries(needs)){const p=s.items.find(p=>p.id===id);if(qty>stock(p)+1e-9)fail('Stock insuficiente: '+p.nombre,409);}
 const businessDate=peruDate(new Date());
 const eventId=request.eventId||null,event=eventId?s.events.find(e=>e.id===eventId):null;
 if(eventId&&(!event||!event.active||businessDate<event.startDate||businessDate>event.endDate))fail('El evento no está activo para la fecha de hoy',409);
 const discount=cents(request.discount??0),limit=number(policy[user.role]??0);
 if(discount<0||discount>subtotal||discount>Math.floor(subtotal*limit/100))fail('Descuento no autorizado para tu perfil',403);
 if(!['Efectivo','Yape','Plin','Tarjeta','Mixto'].includes(request.payMethod))fail('Forma de pago inválida');
 const total=subtotal-discount;let payments=request.payMethod==='Mixto'?request.payments:[{method:request.payMethod,amount:total/100,reference:String(request.paymentReference||'').slice(0,100)}];if(!Array.isArray(payments)||!payments.length||payments.length>4)fail('Revisa el pago dividido');payments=payments.map(p=>{if(!['Efectivo','Yape','Plin','Tarjeta'].includes(p.method)||cents(p.amount)<0)fail('Pago inválido');return {method:p.method,amount:cents(p.amount)/100,reference:String(p.reference||'').slice(0,100)};});if(payments.reduce((a,p)=>a+cents(p.amount),0)!==total)fail('Los pagos deben sumar el total de la venta');if(request.payMethod==='Efectivo'&&cents(request.cash??0)<total)fail('Efectivo insuficiente');
 const date=new Date().toISOString(),ticketNum='T-'+randomUUID(),receipt={requestId:request.requestId,ticketNum,isoDate:date,date:new Date(date).toLocaleString('es-PE',{timeZone:'America/Lima'}),bizName:s.negocio,bizTel:s.telefono,client:String(request.client||'Cliente General').slice(0,150),operator:user.name,operatorId:user.id,payMethod:request.payMethod,payments,discount:discount/100,total:total/100,businessDate,saleChannel:event?'event':'daily',eventId:event?.id||null,eventSnapshot:event?structuredClone(event):null,inventoryMode:'prepared-v1',status:'completed',lines:[],costs:[]};
 let allocated=0;lines.forEach(({p,qty,amount,cost,saleIngredients},index)=>{const net=index===lines.length-1?total-allocated:Math.floor(amount*(subtotal?total/subtotal:0));allocated+=net;
 if(p.tipo==='producto')p.inventoryValue=Math.max(0,p.inventoryValue-cost);p.vendidos+=qty;p.historyRevenue=Number(p.historyRevenue)+net/100;p.historyCost=Number(p.historyCost)+cost;
 const preparedCost=p.tipo==='elaborado'?(p.preparedValue/p.preparedStock)*qty:0;
 let batchAllocations=[];if(p.tipo==='elaborado'){batchAllocations=takeBatches(p,qty,businessDate);p.preparedStock-=qty;p.preparedValue=Math.max(0,p.preparedValue-preparedCost);}
 for(const ing of saleIngredients){const ins=s.items.find(x=>x.id===ing.idInsumo),value=unitCost(s,ins)*ing.quantity;ins.inventoryValue=Math.max(0,ins.inventoryValue-value);ins.consumed+=ing.quantity;ing.value=value;}
 receipt.lines.push({productId:p.id,net:net/100,nombre:p.nombre,sku:p.sku,qty,unitPrice:p.precio,subtotal:amount/100});receipt.costs.push({productId:p.id,sku:p.sku,preparedCost,saleIngredients,batchAllocations,unitCost:cost/qty,recipe:structuredClone(p.ingredientes||[])});
 s.kardex.unshift({id:randomUUID(),date,sku:p.sku,name:p.nombre,type:'OUT',qty,detail:`Venta ${ticketNum} (${user.name})`,payMethod:request.payMethod,amount:net/100});});
 s.receipts.unshift(receipt);return {state:s,receipt};
}
export function publicState(s,user){if(user.role==='admin')return s;return {...empty(),events:s.events||[],negocio:s.negocio,telefono:s.telefono,items:s.items.map(p=>({...p,costoTotal:0,preparedValue:0,historyCost:0,historyRevenue:0,lastPurchaseCost:0,inventoryValue:0,recipeVersions:[],batches:(p.batches||[]).map(b=>({id:b.id,qty:b.qty,expiry:b.expiry})),priceHistory:[]})),receipts:[]};}

export function prepare(original,request,user){
 if(user.role!=='admin')fail('Solo administradores',403);
 const state=normalize(original),p=state.items.find(x=>x.id===request.id);
 if(!p||p.archived||p.tipo!=='elaborado')fail('Receta inexistente');
 const qty=Number(request.qty);if(!Number.isInteger(qty)||qty<=0||qty>100000)fail('Cantidad preparada inválida');
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Operación inválida');
 if(state.kardex.some(k=>k.productionId===request.requestId))return state;
 if(request.recipePatch){
  const patch=request.recipePatch,beforeRecipe=structuredClone(p);validateRecipeEdit(p,patch);p.recipeYield=Number(patch.recipeYield);p.ingredientes=structuredClone(patch.ingredientes);
  if(patch.precio!==undefined){p.precio=Number(patch.precio);if(!Number.isFinite(p.precio)||p.precio<=0)fail('Precio inválido');}
  const checked=normalize(state);Object.assign(state,checked);
  Object.assign(p,state.items.find(x=>x.id===p.id));state.items[state.items.findIndex(x=>x.id===p.id)]=p;if(beforeRecipe.precio!==p.precio)appendPrice(p,{source:'Precio de receta',qty:0,unitCost:null,salePrice:p.precio,previousSalePrice:beforeRecipe.precio,operator:user.name});p.recipeVersions??=[];p.recipeVersions.push({date:new Date().toISOString(),operator:user.name,recipeYield:beforeRecipe.recipeYield,ingredientes:beforeRecipe.ingredientes});
 }
 const needs={};for(const ing of p.ingredientes.filter(i=>!i.deductAtSale))needs[ing.idInsumo]=(needs[ing.idInsumo]||0)+Number(ing.cantidad)*qty/p.recipeYield;
 let cost=0;const date=new Date().toISOString();
 for(const [id,amount] of Object.entries(needs)){const ins=state.items.find(x=>x.id===id);if(amount>stock(ins)+1e-9)fail('Stock insuficiente: '+ins.nombre,409);cost+=unitCost(state,ins)*amount;}
 for(const [id,amount] of Object.entries(needs)){const ins=state.items.find(x=>x.id===id);ins.inventoryValue=Math.max(0,ins.inventoryValue-unitCost(state,ins)*amount);ins.consumed+=amount;state.kardex.unshift({id:randomUUID(),date,sku:ins.sku,name:ins.nombre,type:'PROD_OUT',qty:amount,amount:0,payMethod:'-',productionId:request.requestId,detail:'Insumo para '+p.nombre});}
 ensureBatches(p);const expiry=request.expiry||null;if(expiry&&(!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!Number.isFinite(Date.parse(expiry))||new Date(expiry).toISOString().slice(0,10)!==expiry||expiry<peruDate(new Date())))fail('Vencimiento inválido');p.batches.push({id:request.requestId,qty,date,expiry,label:String(request.lot||request.requestId.slice(0,8)).slice(0,80),operator:user.name,recipeSnapshot:structuredClone(p.ingredientes)});p.preparedStock+=qty;p.preparedValue+=cost;
 state.kardex.unshift({id:randomUUID(),date,sku:p.sku,name:p.nombre,type:'PROD_IN',qty,amount:cost,payMethod:'-',productionId:request.requestId,detail:`Preparación de ${qty} porciones; costo total ${cost.toFixed(2)}; responsable ${user.name}`});
 return state;
}

export function voidSale(original,request,user){
 if(user.role!=='admin')fail('Solo administradores pueden anular ventas',403);
 const state=normalize(original),r=state.receipts.find(r=>r.ticketNum===request.ticketNum);
 if(!r)fail('Venta inexistente',404);
 if(r.status==='voided')return state;
 const reason=String(request.reason||'').trim();if(reason.length<5||reason.length>500)fail('Indica un motivo de 5 a 500 caracteres');
 if(!Array.isArray(r.costs)||!r.lines?.length)fail('Este ticket antiguo no conserva costos suficientes para una anulación automática');
 const subtotal=r.lines.reduce((a,l)=>a+cents(l.subtotal),0),total=cents(r.total);let allocated=0;
 const corrections=r.lines.map((l,index)=>{
  const p=state.items.find(p=>l.productId?p.id===l.productId:p.sku===l.sku),c=r.costs.find(c=>l.productId?c.productId===l.productId:c.sku===l.sku);
  if(!p||!c||!Number.isFinite(Number(c.unitCost))||Number(c.unitCost)<0||!Number.isInteger(l.qty)||l.qty<=0||p.vendidos<l.qty)fail('No se puede reconstruir la venta: revisa productos y respaldo histórico');
  const net=l.net!=null?cents(l.net):(index===r.lines.length-1?total-allocated:Math.floor(cents(l.subtotal)*(subtotal?total/subtotal:0)));allocated+=net;
  if(r.returns?.length)fail('Registra la devolución restante: esta venta ya tiene devoluciones parciales');const prepared=r.inventoryMode==='prepared-v1'||(p.tipo==='elaborado'&&state.kardex.some(k=>k.type==='PROD_IN'&&k.sku===l.sku&&k.date<=(r.isoDate||'')));
  const ingredients=p.tipo==='elaborado'&&!prepared?(c.recipe||[]):[];
  if(p.tipo==='elaborado'&&!prepared&&!ingredients.length)fail('Falta receta histórica para devolver los insumos');
  return {p,qty:l.qty,cost:Number(c.unitCost)*l.qty,preparedCost:c.preparedCost??Number(c.unitCost)*l.qty,saleIngredients:c.saleIngredients||[],net:net/100,prepared,ingredients,batchAllocations:c.batchAllocations||[]};
 });
 const returns={};for(const x of corrections){for(const ing of x.ingredients)returns[ing.idInsumo]=(returns[ing.idInsumo]||0)+Number(ing.cantidad)*x.qty;for(const ing of x.saleIngredients)returns[ing.idInsumo]=(returns[ing.idInsumo]||0)+Number(ing.quantity);}
 for(const [id,qty] of Object.entries(returns)){const p=state.items.find(p=>p.id===id);if(!p||!Number.isFinite(qty)||qty<=0||p.consumed+1e-9<qty)fail('No se puede devolver el consumo histórico; revisa el inventario');}
 for(const [id,qty] of Object.entries(returns)){const p=state.items.find(p=>p.id===id);const value=corrections.reduce((sum,x)=>sum+x.saleIngredients.filter(i=>i.idInsumo===id).reduce((n,i)=>n+Number(i.value??unitCost(state,p)*i.quantity),0),0);p.inventoryValue+=value||unitCost(state,p)*qty;p.consumed=Math.max(0,p.consumed-qty);}
 const date=new Date().toISOString();
 for(const x of corrections){if(x.p.tipo==='producto')x.p.inventoryValue+=x.cost;x.p.vendidos-=x.qty;x.p.historyRevenue=Number(x.p.historyRevenue)-x.net;x.p.historyCost=Number(x.p.historyCost)-x.cost;if(x.p.tipo==='elaborado'&&x.prepared){returnBatches(x.p,x.batchAllocations,x.qty);x.p.preparedStock+=x.qty;x.p.preparedValue+=x.preparedCost;}
 state.kardex.unshift({id:randomUUID(),date,sku:x.p.sku,name:x.p.nombre,type:'VOID',qty:x.qty,amount:-x.net,payMethod:r.payMethod,detail:'Anulación '+r.ticketNum+': '+reason,ticketNum:r.ticketNum});}
 r.status='voided';r.voidedAt=date;r.voidedBy=user.id;r.voidedByName=user.name;r.voidReason=reason;return state;
}

export function peruDate(date){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function validateEvents(events){
 if(!Array.isArray(events)||events.length>1000)fail('Lista de eventos inválida');const seen=new Set();
 return events.map(e=>{if(!e||typeof e.id!=='string'||!e.id||seen.has(e.id))fail('Evento duplicado o inválido');seen.add(e.id);
 const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 if(typeof e.name!=='string'||!e.name.trim()||e.name.length>120||typeof e.activity!=='string'||!e.activity.trim()||e.activity.length>80||!date(e.startDate)||!date(e.endDate)||e.startDate>e.endDate||typeof e.active!=='boolean')fail('Revisa nombre, actividad y fechas del evento');
 return {id:e.id,name:e.name.trim(),activity:e.activity.trim(),startDate:e.startDate,endDate:e.endDate,days:Math.round((Date.parse(e.endDate+'T00:00:00Z')-Date.parse(e.startDate+'T00:00:00Z'))/86400000)+1,location:String(e.location||'').slice(0,200),notes:String(e.notes||'').slice(0,500),active:e.active};});
}
export function upsertEvent(original,event,user){if(user.role!=='admin')fail('Solo administradores gestionan eventos',403);const state=normalize(original);const clean=validateEvents([{...event,id:event.id||randomUUID()}])[0];state.events=state.events.filter(e=>e.id!==clean.id);state.events.push(clean);return state;}

export function restock(original,request,user){
 if(user.role!=='admin')fail('Solo administradores reponen stock',403);
 const state=normalize(original),p=state.items.find(p=>p.id===request.id);
 if(!p||p.archived||p.tipo!=='producto')fail('Selecciona un producto registrado; las recetas se preparan');
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Operación inválida');
 if(state.kardex.some(k=>k.restockId===request.requestId))return state;
 const packages=Number(request.packages),units=Number(request.units),cost=Number(request.cost),discount=Number(request.discount),price=Number(request.price);
 if(![packages,units,cost,discount,price].every(Number.isFinite)||!Number.isInteger(packages)||!Number.isInteger(units)||packages<=0||units<=0||packages*units>1000000||cost<0||discount<0||discount>cost||price<=0)fail('Revisa cantidades, costo, descuento y precio');
 const extra=number(request.extraCost||0);if(extra<0)fail('Gasto inválido');const qty=packages*units,total=Math.round((packages*(cost-discount)+extra)*100)/100;const supplier=String(request.supplier||'').trim().slice(0,150),document=String(request.document||'').trim().slice(0,100),purchaseDate=String(request.purchaseDate||new Date().toISOString().slice(0,10));if(!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)||!Number.isFinite(Date.parse(purchaseDate))||new Date(purchaseDate).toISOString().slice(0,10)!==purchaseDate)fail('Fecha inválida');if(document&&p.priceHistory?.some(h=>h.document===document&&h.supplier===supplier))fail('Documento de compra ya registrado para este producto');
 const previousSalePrice=p.precio,previousPurchaseCost=p.lastPurchaseCost??null;
 if(stock(p)<=1e-9)delete p.costMigration;p.inventoryValue+=total;p.unidadesCompradas+=qty;p.costoTotal+=total;p.precio=price;p.lastPurchaseCost=total/qty;
 appendPrice(p,{source:'Reposición',supplier,document,purchaseDate,extraCost:extra,requestId:request.requestId,qty,unitCost:total/qty,total,packages,units,grossPackageCost:cost,packageDiscount:discount,salePrice:price,previousSalePrice,previousPurchaseCost,operator:user.name});
 state.kardex.unshift({id:randomUUID(),date:new Date().toISOString(),sku:p.sku,name:p.nombre,type:'IN',qty,amount:total,payMethod:'-',restockId:request.requestId,detail:`Reposición: ${packages} x ${units} unidades; costo por paquete/unidad ${cost}; descuento ${discount}; responsable ${user.name}`});
 return state;
}

// A prepared batch already has its preparation-time ingredients charged to stock.
// Do not switch accounting modes while such a batch remains available.
export function validateConsumptionChange(original,next){
 for(const p of original.items.filter(p=>p.tipo==='producto')){
  const updated=next.items.find(x=>x.id===p.id);
  if(updated&&!!updated.deductOnSale!==!!p.deductOnSale&&original.items.some(r=>r.tipo==='elaborado'&&Number(r.preparedStock)>0&&r.ingredientes.some(i=>i.idInsumo===p.id)))fail('Hay porciones preparadas que usan '+p.nombre+'. Véndelas antes de cambiar el momento de descuento para evitar consumir el insumo dos veces.',409);
 }
 for(const p of original.items.filter(x=>x.tipo==='elaborado')){const n=next.items.find(x=>x.id===p.id);if(n)validateRecipeEdit(p,n);}
 return next;
}

export function configureConsumption(p){
 if(p.consumptionMode===undefined)return p;
 if(!['unit','portions','measure'].includes(p.consumptionMode))fail('Selecciona la clasificación del insumo');
 p.deductOnSale=p.consumptionMode!=='unit';
 if(p.consumptionMode==='measure'){
  const units={g:1,kg:1000,ml:1,l:1000};
  if(!Object.hasOwn(units,p.contentUnit)||!['g','ml'].includes(p.doseUnit)||((['g','kg'].includes(p.contentUnit))!==(p.doseUnit==='g')))fail('Usa unidades compatibles: kg/g o l/ml');
  p.contentAmount=number(p.contentAmount);p.doseAmount=number(p.doseAmount);
  if(p.contentAmount<=0||p.doseAmount<=0||p.doseAmount>p.contentAmount*units[p.contentUnit])fail('Revisa el contenido del envase y la cantidad por porción');
  p.portionsPerUnit=p.contentAmount*units[p.contentUnit]/p.doseAmount;
 }
 if(p.deductOnSale&&number(p.portionsPerUnit)<=0)fail('Indica cuántas porciones rinde el envase');
 return p;
}

function appendPrice(product,entry){
 product.priceHistory??=[];
 product.priceHistory.push({id:randomUUID(),date:new Date().toISOString(),sku:product.sku,productName:product.nombre,...entry});
}
export function recordPriceEdits(original,next,user){
 for(const p of next.items){
  const before=original.items.find(x=>x.id===p.id);
  // History is server-owned; normal edits cannot erase or replace it.
  p.priceHistory=structuredClone(before?.priceHistory||[]);
  if(before?.lastPurchaseCost!==undefined)p.lastPurchaseCost=before.lastPurchaseCost;else delete p.lastPurchaseCost;
  if(p.tipo==='elaborado'){if(before&&p.precio!==before.precio)appendPrice(p,{source:'Precio de receta',qty:0,unitCost:null,salePrice:p.precio,previousSalePrice:before.precio,operator:user.name});continue;}
  const qty=p.unidadesCompradas-(before?.unidadesCompradas||0),total=p.costoTotal-(before?.costoTotal||0);
  const purchase=qty>0&&total>=0;
  const changed=!before||p.precio!==before.precio||qty!==0||total!==0;
  if(!changed)continue;
  appendPrice(p,{source:purchase?'Compra / carga':(!before?'Registro':'Edición / ajuste'),qty:purchase?qty:0,total:purchase?total:null,unitCost:purchase?total/qty:null,salePrice:p.precio,previousSalePrice:before?.precio??null,previousPurchaseCost:before?.lastPurchaseCost??null,operator:user.name});
  if(purchase){p.lastPurchaseCost=total/qty;p.inventoryValue=(before?.inventoryValue??(before?stock(before)*unitCost(original,before):0))+total;}
 }
 return next;
}

function validateRecipeEdit(p,n){const clean=x=>JSON.stringify({yield:x.recipeYield||1,ingredients:(x.ingredientes||[]).map(i=>({id:i.idInsumo,q:Number(i.cantidad),at:i.consumeAt||(i.deductAtSale?'sale':'prepare')}))});if(p.preparedStock>0&&clean(p)!==clean(n))fail('Hay porciones preparadas: termina o registra la merma del lote antes de cambiar la receta',409);}
export function secureSave(original,next,user){
 const old=normalize(original);
 for(const p of next.items.filter(x=>!old.items.some(y=>y.id===x.id))){if(p.vendidos||p.consumed||p.preparedStock||p.preparedValue||p.historyRevenue||p.historyCost)fail('El producto nuevo debe empezar sin ventas ni preparaciones');if(p.tipo==='producto'){p.inventoryValue=p.costoTotal;delete p.costMigration;}}
 for(const p of old.items){const n=next.items.find(x=>x.id===p.id);if(!n){if(p.vendidos||p.consumed||stock(p)>0||p.preparedStock||old.receipts.some(r=>r.lines?.some(l=>l.productId===p.id))||old.kardex.some(k=>k.sku===p.sku))fail('Archiva el producto para conservar su historial');continue;}
 for(const key of ['vendidos','consumed','historyRevenue','historyCost','preparedStock','preparedValue'])if(Number(n[key]||0)!==Number(p[key]||0))fail('Cambia existencias mediante operaciones, no edición');
 if(p.tipo==='producto'&&(n.unidadesCompradas!==p.unidadesCompradas||n.costoTotal!==p.costoTotal))fail('Utiliza Reponer o Ajustar para cantidades y costos');
 if(p.tipo==='producto'){n.inventoryValue=p.inventoryValue;n.costMigration=p.costMigration;}
 if(p.batches)n.batches=structuredClone(p.batches);else delete n.batches;n.recipeVersions=structuredClone(p.recipeVersions||[]);if(p.tipo==='elaborado'&&JSON.stringify(p.ingredientes)!==JSON.stringify(n.ingredientes))n.recipeVersions.push({date:new Date().toISOString(),operator:user.name,recipeYield:p.recipeYield,ingredientes:p.ingredientes});
 }
 for(const key of ['receipts','kardex','cashSessions','expenses','imports','operations'])next[key]=structuredClone(old[key]||[]);
 return recordPriceEdits(old,validateConsumptionChange(old,next),user);
}
