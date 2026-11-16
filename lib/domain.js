import {randomUUID} from 'node:crypto';
export const empty=()=>({schemaVersion:2,items:[],kardex:[],receipts:[],savedReports:[],events:[],lots:[],lotProductIds:[],suppliers:[],purchaseOrders:[],cashShifts:[],locations:[{id:'local',name:'Local'}],negocio:'SMARTBOD',telefono:''});
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
const number=(v)=>{const n=Number(v);if(!Number.isFinite(n))fail('Número inválido');return n;};
const cents=v=>Math.round(number(v)*100);
export function normalize(raw){
 const s={...empty(),...structuredClone(raw)};
 s.schemaVersion=2;
 if(!Array.isArray(s.items)||!Array.isArray(s.kardex)||!Array.isArray(s.receipts)||!Array.isArray(s.savedReports))fail('Respaldo inválido');
 for(const key of ['lots','lotProductIds','suppliers','purchaseOrders','cashShifts'])if(!Array.isArray(s[key]))s[key]=[];
 if(!Array.isArray(s.locations)||!s.locations.length)s.locations=[{id:'local',name:'Local'}];
 if(s.locations.length>100||s.locations.some(x=>!x||typeof x.id!=='string'||!x.id||typeof x.name!=='string'||!x.name.trim())||new Set(s.locations.map(x=>x.id)).size!==s.locations.length)fail('Ubicaciones inválidas');
 s.events=validateEvents(s.events);
 const ids=new Set(),skus=new Set();
 for(const p of s.items){
  if(typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.sku!=='string'||!p.sku||skus.has(p.sku)||typeof p.nombre!=='string'||!['producto','elaborado'].includes(p.tipo))fail('Productos o SKU inválidos');ids.add(p.id);skus.add(p.sku);
  if(p.priceHistory!==undefined&&(!Array.isArray(p.priceHistory)||p.priceHistory.some(h=>!h||typeof h.date!=='string'||!Number.isFinite(Date.parse(h.date))||!Number.isFinite(h.salePrice)||h.salePrice<0||(h.unitCost!=null&&(!Number.isFinite(h.unitCost)||h.unitCost<0))||!Number.isFinite(h.qty)||h.qty<0)))fail('Historial de precios inválido');
  configureConsumption(p);
  if(p.deductOnSale!==undefined&&typeof p.deductOnSale!=='boolean')fail('Configuración de consumo inválida');
  for(const key of ['presentation','contentDescription','productDetail']){if(p[key]!==undefined&&(typeof p[key]!=='string'||p[key].length>300))fail('Detalle del producto inválido');}
  if(p.deductOnSale){p.portionsPerUnit=number(p.portionsPerUnit);if(p.portionsPerUnit<=0)fail('Indica cuántas porciones rinde el envase');}
  for(const key of ['precio','vendidos','unidadesCompradas','costoTotal','consumed']){p[key]=number(p[key]??0);if(p[key]<0)fail('Cantidades negativas');}
 }
 for(const p of s.items.filter(p=>p.tipo==='elaborado')){p.recipeYield=number(p.recipeYield??1);p.preparedStock=number(p.preparedStock??0);p.preparedValue=number(p.preparedValue??0);if(!Number.isInteger(p.recipeYield)||p.recipeYield<=0||!Number.isInteger(p.preparedStock)||p.preparedStock<0||p.preparedValue<0)fail('Producción inválida');}
 const use={};for(const p of s.items.filter(p=>p.tipo==='elaborado')){
  if(!Array.isArray(p.ingredientes)||!p.ingredientes.length)fail('Receta vacía');
  for(const i of p.ingredientes){const source=s.items.find(x=>x.id===i.idInsumo);i.deductAtSale=!!source?.deductOnSale;if(i.deductAtSale){i.servingsPerUnit=number(source.portionsPerUnit);i.cantidad=p.recipeYield/i.servingsPerUnit;}else if(i.measureMode==='coverage'){i.servingsPerUnit=number(i.servingsPerUnit);if(i.servingsPerUnit<=0)fail('El rendimiento del envase debe ser mayor a cero');i.cantidad=p.recipeYield/i.servingsPerUnit;}const ins=s.items.find(x=>x.id===i.idInsumo);if(!ins||ins.tipo==='elaborado'||number(i.cantidad)<=0)fail('Ingrediente inválido');if(!p.frozenConsumption)use[ins.id]=(use[ins.id]||0)+i.cantidad*p.vendidos;}
 }
 for(const p of s.items){if(p.tipo==='producto')p.consumed+=(use[p.id]||0);else p.frozenConsumption=true;}
 for(const p of s.items){if(p.historyRevenue==null){p.historyRevenue=p.precio*p.vendidos;p.historyCost=unitCost(s,p)*p.vendidos;}if(!Number.isFinite(Number(p.historyRevenue))||!Number.isFinite(Number(p.historyCost)))fail('Totales inválidos');}
 if(s.lots.length>100000||s.lots.some(l=>!l||typeof l.id!=='string'||!l.id))fail('Lotes de inventario inválidos');
 const lotIds=new Set(s.lots.map(l=>l.id));
 if(lotIds.size!==s.lots.length||s.lots.some(l=>!s.items.some(p=>p.id===l.productId)||!Number.isFinite(Number(l.remainingQty))||l.remainingQty<0||!Number.isFinite(Number(l.initialQty))||l.initialQty<l.remainingQty||!validLotDate(l.expirationDate)))fail('Lotes de inventario inválidos');
 const tracked=new Set(s.lotProductIds);
 for(const p of s.items){
  if(tracked.has(p.id))continue;
  const quantity=p.tipo==='elaborado'?p.preparedStock:stock(p);
  if(quantity>0)s.lots.push({id:randomUUID(),productId:p.id,initialQty:quantity,remainingQty:quantity,receivedAt:new Date().toISOString(),expirationDate:null,source:'Existencia inicial'});
  tracked.add(p.id);
 }
 s.lotProductIds=[...tracked];
 if(!s.suppliers.every(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&x.name.trim()))fail('Proveedores inválidos');
 if(!s.purchaseOrders.every(x=>x&&typeof x.id==='string'&&Array.isArray(x.lines)))fail('Órdenes de compra inválidas');
 if(!s.cashShifts.every(x=>x&&typeof x.id==='string'&&['open','closed'].includes(x.status)))fail('Turnos de caja inválidos');
 return s;
}
export function unitCost(s,p){return p.tipo==='elaborado'?p.ingredientes.reduce((sum,i)=>sum+unitCost(s,s.items.find(x=>x.id===i.idInsumo))*Number(i.cantidad),0)/(p.recipeYield||1):(p.unidadesCompradas>0?p.costoTotal/p.unidadesCompradas:0);}
export function stock(p){return Math.max(0,p.unidadesCompradas-p.vendidos-p.consumed);}
function validLotDate(value){return value==null||value===''||(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);}
export function usableStock(state,product,date=peruDate(new Date())){return state.lots.filter(l=>l.productId===product.id&&(!l.expirationDate||l.expirationDate>=date)).reduce((sum,l)=>sum+Number(l.remainingQty),0);}
function allocateLots(state,product,quantity,date=peruDate(new Date()),includeExpired=false){
 let remaining=quantity;
 const lots=state.lots.filter(l=>l.productId===product.id&&(includeExpired||!l.expirationDate||l.expirationDate>=date)).sort((a,b)=>(a.expirationDate||'9999-12-31').localeCompare(b.expirationDate||'9999-12-31')||a.receivedAt.localeCompare(b.receivedAt));
 const allocations=[];
 for(const lot of lots){const amount=Math.min(remaining,Number(lot.remainingQty));if(amount<=0)continue;lot.remainingQty-=amount;remaining-=amount;allocations.push({lotId:lot.id,quantity:amount});if(remaining<=1e-9)break;}
 if(remaining>1e-9)fail('Stock insuficiente o vencido: '+product.nombre,409);
 return allocations;
}
function restoreLots(state,product,allocations,quantity){
 if(Array.isArray(allocations)&&allocations.length){
  for(const allocation of allocations){const lot=state.lots.find(x=>x.id===allocation.lotId);if(lot){lot.remainingQty+=Number(allocation.quantity);lot.initialQty+=Number(allocation.quantity);}}
  return;
 }
 state.lots.push({id:randomUUID(),productId:product.id,initialQty:quantity,remainingQty:quantity,receivedAt:new Date().toISOString(),expirationDate:null,source:'Devolución de venta'});
}
export function reconcileLots(state){
 for(const product of state.items){
  const expected=product.tipo==='elaborado'?Number(product.preparedStock):stock(product);
  const lots=state.lots.filter(l=>l.productId===product.id);
  let delta=expected-lots.reduce((sum,l)=>sum+Number(l.remainingQty),0);
  if(delta>1e-9)state.lots.push({id:randomUUID(),productId:product.id,initialQty:delta,remainingQty:delta,receivedAt:new Date().toISOString(),expirationDate:null,source:'Ajuste de inventario'});
  if(delta< -1e-9){
   for(const lot of [...lots].sort((a,b)=>(a.expirationDate||'9999-12-31').localeCompare(b.expirationDate||'9999-12-31'))){
    const reduction=Math.min(Number(lot.remainingQty),-delta);lot.remainingQty-=reduction;delta+=reduction;if(delta>=-1e-9)break;
   }
  }
 }
 return state;
}
export function sell(original,request,user,policy){
 const s=normalize(original);
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Identificador de operación inválido');
 const previous=s.receipts.find(r=>r.requestId===request.requestId);if(previous){if(previous.operatorId!==user.id)fail('Operación inválida',403);return {state:s,receipt:previous};}
 if(!Array.isArray(request.lines)||!request.lines.length||request.lines.length>500)fail('Carrito inválido');
 const needs={},seen=new Set();let subtotal=0;
 const lines=request.lines.map(l=>{const p=s.items.find(p=>p.id===l.id);if(!p||seen.has(p.id))fail('Producto inexistente o repetido');seen.add(p.id);const qty=number(l.qty);if(!Number.isInteger(qty)||qty<=0||qty>100000)fail('Cantidad inválida');const amount=cents(p.precio)*qty;subtotal+=amount;
 if(p.tipo==='elaborado'){if(qty>p.preparedStock||qty>usableStock(s,p))fail('Porciones preparadas insuficientes o vencidas: '+p.nombre,409);for(const i of p.ingredientes.filter(i=>i.deductAtSale))needs[i.idInsumo]=(needs[i.idInsumo]||0)+qty/i.servingsPerUnit;}else needs[p.id]=(needs[p.id]||0)+qty;
 const saleIngredients=p.tipo==='elaborado'?p.ingredientes.filter(i=>i.deductAtSale).map(i=>({idInsumo:i.idInsumo,quantity:qty/i.servingsPerUnit})):[];
 return {p,qty,amount,saleIngredients,cost:(p.tipo==='elaborado'?p.preparedValue/p.preparedStock:unitCost(s,p))*qty+saleIngredients.reduce((sum,i)=>sum+unitCost(s,s.items.find(p=>p.id===i.idInsumo))*i.quantity,0)};});
 for(const [id,qty] of Object.entries(needs)){const p=s.items.find(p=>p.id===id);if(qty>stock(p)+1e-9)fail('Stock insuficiente: '+p.nombre,409);if(qty>usableStock(s,p)+1e-9)fail('Stock vigente insuficiente por vencimiento: '+p.nombre,409);}
 const locationId=request.locationId||'local';if(!s.locations.some(location=>location.id===locationId))fail('Ubicación de venta inválida');
 const businessDate=peruDate(new Date());
 const eventId=request.eventId||null,event=eventId?s.events.find(e=>e.id===eventId):null;
 if(eventId&&(!event||!event.active||businessDate<event.startDate||businessDate>event.endDate))fail('El evento no está activo para la fecha de hoy',409);
 const discount=cents(request.discount??0),limit=number(policy[user.role]??0);
 if(discount<0||discount>subtotal||discount>Math.floor(subtotal*limit/100))fail('Descuento no autorizado para tu perfil',403);
 if(!['Efectivo','Yape','Plin','Tarjeta'].includes(request.payMethod))fail('Forma de pago inválida');
 const total=subtotal-discount;if(request.payMethod==='Efectivo'&&cents(request.cash??0)<total)fail('Efectivo insuficiente');
 const date=new Date().toISOString(),ticketNum='T-'+randomUUID(),receipt={requestId:request.requestId,ticketNum,isoDate:date,date:new Date(date).toLocaleString('es-PE',{timeZone:'America/Lima'}),bizName:s.negocio,bizTel:s.telefono,client:String(request.client||'Cliente General').slice(0,150),operator:user.name,operatorId:user.id,payMethod:request.payMethod,discount:discount/100,total:total/100,businessDate,locationId,locationName:s.locations.find(x=>x.id===locationId).name,cashShiftId:request.cashShiftId||null,saleChannel:event?'event':'daily',eventId:event?.id||null,eventSnapshot:event?structuredClone(event):null,inventoryMode:'prepared-v1',status:'completed',lines:[],costs:[]};
 let allocated=0;lines.forEach(({p,qty,amount,cost,saleIngredients},index)=>{const net=index===lines.length-1?total-allocated:Math.floor(amount*(subtotal?total/subtotal:0));allocated+=net;
 p.vendidos+=qty;p.historyRevenue=Number(p.historyRevenue)+net/100;p.historyCost=Number(p.historyCost)+cost;
 const lotAllocations=allocateLots(s,p,qty);
 const preparedCost=p.tipo==='elaborado'?(p.preparedValue/p.preparedStock)*qty:0;
 if(p.tipo==='elaborado'){p.preparedStock-=qty;p.preparedValue=Math.max(0,p.preparedValue-preparedCost);}
 for(const ing of saleIngredients){const ingredient=s.items.find(x=>x.id===ing.idInsumo);ingredient.consumed+=ing.quantity;ing.lotAllocations=allocateLots(s,ingredient,ing.quantity);}
 receipt.lines.push({productId:p.id,net:net/100,nombre:p.nombre,sku:p.sku,qty,unitPrice:p.precio,subtotal:amount/100});receipt.costs.push({productId:p.id,sku:p.sku,preparedCost,saleIngredients,lotAllocations,unitCost:cost/qty,recipe:structuredClone(p.ingredientes||[])});
 s.kardex.unshift({id:randomUUID(),date,sku:p.sku,name:p.nombre,type:'OUT',qty,detail:`Venta ${ticketNum} (${user.name}) · ${s.locations.find(x=>x.id===locationId).name}`,payMethod:request.payMethod,amount:net/100,locationId});});
 s.receipts.unshift(receipt);return {state:s,receipt};
}
export function publicState(s,user){if(user.role==='admin')return s;return {...empty(),events:s.events||[],locations:s.locations||empty().locations,lots:(s.lots||[]).map(({unitCost,...lot})=>lot),cashShifts:(s.cashShifts||[]).filter(shift=>shift.cashierId===user.id),negocio:s.negocio,telefono:s.telefono,items:s.items.map(p=>({...p,costoTotal:0,preparedValue:0,historyCost:0,historyRevenue:0,lastPurchaseCost:0,priceHistory:[]})),receipts:[]};}

export function prepare(original,request,user){
 if(user.role!=='admin')fail('Solo administradores',403);
 const state=normalize(original),p=state.items.find(x=>x.id===request.id);
 if(!p||p.tipo!=='elaborado')fail('Receta inexistente');
 const qty=Number(request.qty);if(!Number.isInteger(qty)||qty<=0||qty>100000)fail('Cantidad preparada inválida');
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Operación inválida');
 if(state.kardex.some(k=>k.productionId===request.requestId))return state;
 if(request.recipePatch){
  const patch=request.recipePatch;p.recipeYield=Number(patch.recipeYield);p.ingredientes=structuredClone(patch.ingredientes);
  if(patch.precio!==undefined){p.precio=Number(patch.precio);if(!Number.isFinite(p.precio)||p.precio<=0)fail('Precio inválido');}
  const checked=normalize(state);Object.assign(state,checked);
  Object.assign(p,state.items.find(x=>x.id===p.id));state.items[state.items.findIndex(x=>x.id===p.id)]=p;
 }
 const needs={};for(const ing of p.ingredientes.filter(i=>!i.deductAtSale))needs[ing.idInsumo]=(needs[ing.idInsumo]||0)+Number(ing.cantidad)*qty/p.recipeYield;
 let cost=0;const date=new Date().toISOString();
 if(!validLotDate(request.expirationDate)||request.expirationDate&&request.expirationDate<peruDate(new Date()))fail('La fecha de vencimiento no es válida o ya pasó');
 for(const [id,amount] of Object.entries(needs)){const ins=state.items.find(x=>x.id===id);if(amount>stock(ins)+1e-9)fail('Stock insuficiente: '+ins.nombre,409);if(amount>usableStock(state,ins)+1e-9)fail('Stock vigente insuficiente por vencimiento: '+ins.nombre,409);cost+=unitCost(state,ins)*amount;}
 for(const [id,amount] of Object.entries(needs)){const ins=state.items.find(x=>x.id===id);ins.consumed+=amount;const lotAllocations=allocateLots(state,ins,amount);state.kardex.unshift({id:randomUUID(),date,sku:ins.sku,name:ins.nombre,type:'PROD_OUT',qty:amount,amount:0,payMethod:'-',productionId:request.requestId,lotAllocations,detail:'Insumo para '+p.nombre});}
 p.preparedStock+=qty;p.preparedValue+=cost;
 state.lots.push({id:randomUUID(),productId:p.id,initialQty:qty,remainingQty:qty,receivedAt:date,expirationDate:request.expirationDate||null,source:'Preparación'});
 state.kardex.unshift({id:randomUUID(),date,sku:p.sku,name:p.nombre,type:'PROD_IN',qty,amount:cost,payMethod:'-',productionId:request.requestId,expirationDate:request.expirationDate||null,detail:`Preparación de ${qty} porciones; costo total ${cost.toFixed(2)}; responsable ${user.name}`});
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
  const prepared=r.inventoryMode==='prepared-v1'||(p.tipo==='elaborado'&&state.kardex.some(k=>k.type==='PROD_IN'&&k.sku===l.sku&&k.date<=(r.isoDate||'')));
  const ingredients=p.tipo==='elaborado'&&!prepared?(c.recipe||[]):[];
  if(p.tipo==='elaborado'&&!prepared&&!ingredients.length)fail('Falta receta histórica para devolver los insumos');
  return {p,qty:l.qty,cost:Number(c.unitCost)*l.qty,preparedCost:c.preparedCost??Number(c.unitCost)*l.qty,saleIngredients:c.saleIngredients||[],net:net/100,prepared,ingredients};
 });
 const returns={};for(const x of corrections){for(const ing of x.ingredients)returns[ing.idInsumo]=(returns[ing.idInsumo]||0)+Number(ing.cantidad)*x.qty;for(const ing of x.saleIngredients)returns[ing.idInsumo]=(returns[ing.idInsumo]||0)+Number(ing.quantity);}
 for(const [id,qty] of Object.entries(returns)){const p=state.items.find(p=>p.id===id);if(!p||!Number.isFinite(qty)||qty<=0||p.consumed+1e-9<qty)fail('No se puede devolver el consumo histórico; revisa el inventario');}
 for(const [id,qty] of Object.entries(returns))state.items.find(p=>p.id===id).consumed=Math.max(0,state.items.find(p=>p.id===id).consumed-qty);
 const date=new Date().toISOString();
 for(const x of corrections){x.p.vendidos-=x.qty;x.p.historyRevenue=Number(x.p.historyRevenue)-x.net;x.p.historyCost=Number(x.p.historyCost)-x.cost;const costRow=r.costs.find(c=>x.p.id===c.productId||x.p.sku===c.sku);restoreLots(state,x.p,costRow.lotAllocations,x.qty);if(x.p.tipo==='elaborado'&&x.prepared){x.p.preparedStock+=x.qty;x.p.preparedValue+=x.preparedCost;}
 for(const ingredient of costRow.saleIngredients||[]){const ins=state.items.find(i=>i.id===ingredient.idInsumo);if(ins)restoreLots(state,ins,ingredient.lotAllocations,Number(ingredient.quantity));}
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
 if(!p||p.tipo!=='producto')fail('Selecciona un producto registrado; las recetas se preparan');
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Operación inválida');
 if(state.kardex.some(k=>k.restockId===request.requestId))return state;
 const packages=Number(request.packages),units=Number(request.units),cost=Number(request.cost),discount=Number(request.discount),price=Number(request.price);
 if(![packages,units,cost,discount,price].every(Number.isFinite)||!Number.isInteger(packages)||!Number.isInteger(units)||packages<=0||units<=0||packages*units>1000000||cost<0||discount<0||discount>cost||price<=0)fail('Revisa cantidades, costo, descuento y precio');
 if(!validLotDate(request.expirationDate)||request.expirationDate&&request.expirationDate<peruDate(new Date()))fail('La fecha de vencimiento no es válida o ya pasó');
 if(request.supplierId&&!state.suppliers.some(supplier=>supplier.id===request.supplierId))fail('Proveedor no registrado');
 const qty=packages*units,total=Math.round(packages*(cost-discount)*100)/100;
 const previousSalePrice=p.precio,previousPurchaseCost=p.lastPurchaseCost??null;
 p.unidadesCompradas+=qty;p.costoTotal+=total;p.precio=price;p.lastPurchaseCost=total/qty;
 state.lots.push({id:randomUUID(),productId:p.id,initialQty:qty,remainingQty:qty,receivedAt:new Date().toISOString(),expirationDate:request.expirationDate||null,source:request.source==='purchase-order'?'Orden de compra':'Reposición',supplierId:request.supplierId||null,purchaseOrderId:request.purchaseOrderId||null});
 appendPrice(p,{source:'Reposición',requestId:request.requestId,qty,unitCost:total/qty,total,packages,units,grossPackageCost:cost,packageDiscount:discount,salePrice:price,previousSalePrice,previousPurchaseCost,operator:user.name});
 state.kardex.unshift({id:randomUUID(),date:new Date().toISOString(),sku:p.sku,name:p.nombre,type:'IN',qty,amount:total,payMethod:'-',restockId:request.requestId,purchaseOrderId:request.purchaseOrderId||null,expirationDate:request.expirationDate||null,detail:`Reposición: ${packages} x ${units} unidades; costo por paquete/unidad ${cost}; descuento ${discount}; responsable ${user.name}`});
 return state;
}

export function recordWaste(original,request,user){
 if(user.role!=='admin')fail('Solo administradores registran mermas',403);
 const state=normalize(original),lot=state.lots.find(x=>x.id===request.lotId),product=lot&&state.items.find(x=>x.id===lot.productId);
 const quantity=Number(request.quantity),reason=String(request.reason||'').trim();
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Operación inválida');
 if(state.kardex.some(k=>k.wasteId===request.requestId))return state;
 if(!lot||!product||!Number.isFinite(quantity)||quantity<=0||quantity>lot.remainingQty||reason.length<3||reason.length>300)fail('Revisa el lote, la cantidad y el motivo de la merma');
 lot.remainingQty-=quantity;
 if(product.tipo==='elaborado'){
  if(quantity>product.preparedStock)fail('La merma supera las porciones disponibles',409);
  const costPerUnit=product.preparedStock?product.preparedValue/product.preparedStock:0;
  product.preparedStock-=quantity;product.preparedValue=Math.max(0,product.preparedValue-costPerUnit*quantity);
 }else{
  if(quantity>stock(product))fail('La merma supera las existencias',409);
  const costPerUnit=unitCost(state,product);
  product.unidadesCompradas-=quantity;product.costoTotal=Math.max(0,product.costoTotal-costPerUnit*quantity);
 }
 state.kardex.unshift({id:randomUUID(),date:new Date().toISOString(),sku:product.sku,name:product.nombre,type:'WASTE',qty:quantity,amount:0,payMethod:'-',wasteId:request.requestId,lotId:lot.id,expirationDate:lot.expirationDate,detail:`Merma: ${reason} · ${user.name}`});
 return state;
}

export function updateLotExpiration(original,request,user){
 if(user.role!=='admin')fail('Solo administradores actualizan vencimientos',403);
 const state=normalize(original),lot=state.lots.find(x=>x.id===request.lotId);
 if(!lot)fail('Lote no encontrado',404);
 if(!validLotDate(request.expirationDate))fail('Fecha de vencimiento inválida');
 lot.expirationDate=request.expirationDate||null;
 return state;
}

export function saveSupplier(original,request,user){
 if(user.role!=='admin')fail('Solo administradores gestionan proveedores',403);
 const state=normalize(original),name=String(request.name||'').trim();
 if(!name||name.length>120)fail('El nombre del proveedor es obligatorio (máximo 120 caracteres)');
 const id=request.id||randomUUID(),supplier={id,name,contact:String(request.contact||'').trim().slice(0,120),phone:String(request.phone||'').trim().slice(0,40),email:String(request.email||'').trim().slice(0,150),notes:String(request.notes||'').trim().slice(0,500)};
 const index=state.suppliers.findIndex(x=>x.id===id);
 if(state.suppliers.some(x=>x.id!==id&&x.name.toLowerCase()===name.toLowerCase()))fail('Ya existe un proveedor con ese nombre');
 if(index<0)state.suppliers.push(supplier);else state.suppliers[index]=supplier;
 return state;
}

export function saveLocation(original,request,user){
 if(user.role!=='admin')fail('Solo administradores gestionan ubicaciones',403);
 const state=normalize(original),name=String(request.name||'').trim();
 if(!name||name.length>100)fail('El nombre de la ubicación es obligatorio');
 if(state.locations.some(x=>x.name.toLowerCase()===name.toLowerCase()))fail('Ya existe una ubicación con ese nombre');
 state.locations.push({id:randomUUID(),name});
 return state;
}

export function createPurchaseOrder(original,request,user){
 if(user.role!=='admin')fail('Solo administradores crean órdenes de compra',403);
 const state=normalize(original),supplier=state.suppliers.find(x=>x.id===request.supplierId);
 if(!supplier)fail('Selecciona un proveedor registrado');
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Identificador de orden inválido');
 const previous=state.purchaseOrders.find(x=>x.requestId===request.requestId);if(previous)return state;
 if(!Array.isArray(request.lines)||!request.lines.length||request.lines.length>100)fail('Agrega al menos un producto a la orden');
 const lines=request.lines.map(line=>{
  const product=state.items.find(x=>x.id===line.productId),packages=Number(line.packages),units=Number(line.units),cost=Number(line.cost),discount=Number(line.discount||0),price=Number(line.price);
  if(!product||product.tipo!=='producto'||!Number.isInteger(packages)||packages<=0||!Number.isInteger(units)||units<=0||packages*units>1000000||![cost,discount,price].every(Number.isFinite)||cost<0||discount<0||discount>cost||price<=0||!validLotDate(line.expirationDate)||line.expirationDate&&line.expirationDate<peruDate(new Date()))fail('Revisa los productos, precios y vencimientos de la orden');
  return {id:randomUUID(),productId:product.id,sku:product.sku,name:product.nombre,packages,units,cost,discount,price,expirationDate:line.expirationDate||null,quantity:packages*units};
 });
 state.purchaseOrders.unshift({id:randomUUID(),requestId:request.requestId,supplierId:supplier.id,supplierName:supplier.name,createdBy:user.id,createdByName:user.name,createdAt:new Date().toISOString(),status:'Pendiente',lines});
 return state;
}

export function receivePurchaseOrder(original,request,user){
 if(user.role!=='admin')fail('Solo administradores reciben órdenes de compra',403);
 const state=normalize(original),order=state.purchaseOrders.find(x=>x.id===request.orderId);
 if(!order)fail('Orden de compra no encontrada',404);
 if(order.status==='Recibida')return state;
 let updated=state;
 for(const line of order.lines)updated=restock(updated,{id:line.productId,packages:line.packages,units:line.units,cost:line.cost,discount:line.discount,price:line.price,expirationDate:line.expirationDate,supplierId:order.supplierId,purchaseOrderId:order.id,source:'purchase-order',requestId:line.id},user);
 const received=updated.purchaseOrders.find(x=>x.id===order.id);received.status='Recibida';received.receivedAt=new Date().toISOString();received.receivedBy=user.id;received.receivedByName=user.name;
 return updated;
}

export function openCashShift(original,request,user){
 const state=normalize(original),locationId=request.locationId||'local',openingAmount=Number(request.openingAmount);
 if(!state.locations.some(x=>x.id===locationId)||!Number.isFinite(openingAmount)||openingAmount<0)fail('Indica un fondo inicial válido y una ubicación');
 if(state.cashShifts.some(x=>x.cashierId===user.id&&x.status==='open'))fail('Ya tienes un turno abierto. Ciérralo antes de iniciar otro.',409);
 state.cashShifts.unshift({id:randomUUID(),cashierId:user.id,cashierName:user.name,locationId,openedAt:new Date().toISOString(),openingAmount,status:'open'});
 return state;
}

export function closeCashShift(original,request,user){
 const state=normalize(original),shift=state.cashShifts.find(x=>x.id===request.shiftId),closingAmount=Number(request.closingAmount);
 if(!shift)fail('Turno de caja no encontrado',404);
 if(shift.cashierId!==user.id&&user.role!=='admin')fail('Solo el cajero o un administrador pueden cerrar este turno',403);
 if(shift.status==='closed')return state;
 if(!Number.isFinite(closingAmount)||closingAmount<0)fail('Indica el efectivo contado al cierre');
 const cashSales=state.receipts.filter(r=>r.cashShiftId===shift.id&&r.status!=='voided'&&r.payMethod==='Efectivo').reduce((sum,r)=>sum+Number(r.total),0);
 shift.cashSales=Math.round(cashSales*100)/100;shift.expectedCash=Math.round((shift.openingAmount+cashSales)*100)/100;shift.closingAmount=Math.round(closingAmount*100)/100;shift.difference=Math.round((shift.closingAmount-shift.expectedCash)*100)/100;shift.closedAt=new Date().toISOString();shift.closedBy=user.id;shift.status='closed';
 return state;
}

// A prepared batch already has its preparation-time ingredients charged to stock.
// Do not switch accounting modes while such a batch remains available.
export function validateConsumptionChange(original,next){
 for(const p of original.items.filter(p=>p.tipo==='producto')){
  const updated=next.items.find(x=>x.id===p.id);
  if(updated&&!!updated.deductOnSale!==!!p.deductOnSale&&original.items.some(r=>r.tipo==='elaborado'&&Number(r.preparedStock)>0&&r.ingredientes.some(i=>i.idInsumo===p.id)))fail('Hay porciones preparadas que usan '+p.nombre+'. Véndelas antes de cambiar el momento de descuento para evitar consumir el insumo dos veces.',409);
 }
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
  if(p.tipo!=='producto')continue;
  const qty=p.unidadesCompradas-(before?.unidadesCompradas||0),total=p.costoTotal-(before?.costoTotal||0);
  const purchase=qty>0&&total>=0;
  const changed=!before||p.precio!==before.precio||qty!==0||total!==0;
  if(!changed)continue;
  appendPrice(p,{source:purchase?'Compra / carga':(!before?'Registro':'Edición / ajuste'),qty:purchase?qty:0,total:purchase?total:null,unitCost:purchase?total/qty:null,salePrice:p.precio,previousSalePrice:before?.precio??null,previousPurchaseCost:before?.lastPurchaseCost??null,operator:user.name});
  if(purchase)p.lastPurchaseCost=total/qty;
 }
 return next;
}
