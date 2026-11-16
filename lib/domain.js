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
  for(const key of ['precio','vendidos','unidadesCompradas','costoTotal','consumed']){p[key]=number(p[key]??0);if(p[key]<0)fail('Cantidades negativas');}
 }
 for(const p of s.items.filter(p=>p.tipo==='elaborado')){p.recipeYield=number(p.recipeYield??1);p.preparedStock=number(p.preparedStock??0);p.preparedValue=number(p.preparedValue??0);if(!Number.isInteger(p.recipeYield)||p.recipeYield<=0||!Number.isInteger(p.preparedStock)||p.preparedStock<0||p.preparedValue<0)fail('Producción inválida');}
 const use={};for(const p of s.items.filter(p=>p.tipo==='elaborado')){
  if(!Array.isArray(p.ingredientes)||!p.ingredientes.length)fail('Receta vacía');
  for(const i of p.ingredientes){const ins=s.items.find(x=>x.id===i.idInsumo);if(!ins||ins.tipo==='elaborado'||number(i.cantidad)<=0)fail('Ingrediente inválido');if(!p.frozenConsumption)use[ins.id]=(use[ins.id]||0)+i.cantidad*p.vendidos;}
 }
 for(const p of s.items){if(p.tipo==='producto')p.consumed+=(use[p.id]||0);else p.frozenConsumption=true;}
 for(const p of s.items){if(p.historyRevenue==null){p.historyRevenue=p.precio*p.vendidos;p.historyCost=unitCost(s,p)*p.vendidos;}if(!Number.isFinite(Number(p.historyRevenue))||!Number.isFinite(Number(p.historyCost)))fail('Totales inválidos');}
 return s;
}
export function unitCost(s,p){return p.tipo==='elaborado'?p.ingredientes.reduce((sum,i)=>sum+unitCost(s,s.items.find(x=>x.id===i.idInsumo))*Number(i.cantidad),0)/(p.recipeYield||1):(p.unidadesCompradas>0?p.costoTotal/p.unidadesCompradas:0);}
export function stock(p){return Math.max(0,p.unidadesCompradas-p.vendidos-p.consumed);}
export function sell(original,request,user,policy){
 const s=normalize(original);
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Identificador de operación inválido');
 const previous=s.receipts.find(r=>r.requestId===request.requestId);if(previous){if(previous.operatorId!==user.id)fail('Operación inválida',403);return {state:s,receipt:previous};}
 if(!Array.isArray(request.lines)||!request.lines.length||request.lines.length>500)fail('Carrito inválido');
 const needs={},seen=new Set();let subtotal=0;
 const lines=request.lines.map(l=>{const p=s.items.find(p=>p.id===l.id);if(!p||seen.has(p.id))fail('Producto inexistente o repetido');seen.add(p.id);const qty=number(l.qty);if(!Number.isInteger(qty)||qty<=0||qty>100000)fail('Cantidad inválida');const amount=cents(p.precio)*qty;subtotal+=amount;
 if(p.tipo==='elaborado'){if(qty>p.preparedStock)fail('Porciones preparadas insuficientes: '+p.nombre,409);}else needs[p.id]=(needs[p.id]||0)+qty;
 return {p,qty,amount,cost:(p.tipo==='elaborado'?p.preparedValue/p.preparedStock:unitCost(s,p))*qty};});
 for(const [id,qty] of Object.entries(needs)){const p=s.items.find(p=>p.id===id);if(qty>stock(p)+1e-9)fail('Stock insuficiente: '+p.nombre,409);}
 const businessDate=peruDate(new Date());
 const eventId=request.eventId||null,event=eventId?s.events.find(e=>e.id===eventId):null;
 if(eventId&&(!event||!event.active||businessDate<event.startDate||businessDate>event.endDate))fail('El evento no está activo para la fecha de hoy',409);
 const discount=cents(request.discount??0),limit=number(policy[user.role]??0);
 if(discount<0||discount>subtotal||discount>Math.floor(subtotal*limit/100))fail('Descuento no autorizado para tu perfil',403);
 if(!['Efectivo','Yape','Plin','Tarjeta'].includes(request.payMethod))fail('Forma de pago inválida');
 const total=subtotal-discount;if(request.payMethod==='Efectivo'&&cents(request.cash??0)<total)fail('Efectivo insuficiente');
 const date=new Date().toISOString(),ticketNum='T-'+randomUUID(),receipt={requestId:request.requestId,ticketNum,isoDate:date,date:new Date(date).toLocaleString('es-PE',{timeZone:'America/Lima'}),bizName:s.negocio,bizTel:s.telefono,client:String(request.client||'Cliente General').slice(0,150),operator:user.name,operatorId:user.id,payMethod:request.payMethod,discount:discount/100,total:total/100,businessDate,saleChannel:event?'event':'daily',eventId:event?.id||null,eventSnapshot:event?structuredClone(event):null,inventoryMode:'prepared-v1',status:'completed',lines:[],costs:[]};
 let allocated=0;lines.forEach(({p,qty,amount,cost},index)=>{const net=index===lines.length-1?total-allocated:Math.floor(amount*(subtotal?total/subtotal:0));allocated+=net;
 p.vendidos+=qty;p.historyRevenue=Number(p.historyRevenue)+net/100;p.historyCost=Number(p.historyCost)+cost;
 if(p.tipo==='elaborado'){p.preparedStock-=qty;p.preparedValue=Math.max(0,p.preparedValue-cost);}
 receipt.lines.push({productId:p.id,net:net/100,nombre:p.nombre,sku:p.sku,qty,unitPrice:p.precio,subtotal:amount/100});receipt.costs.push({productId:p.id,sku:p.sku,unitCost:cost/qty,recipe:structuredClone(p.ingredientes||[])});
 s.kardex.unshift({id:randomUUID(),date,sku:p.sku,name:p.nombre,type:'OUT',qty,detail:`Venta ${ticketNum} (${user.name})`,payMethod:request.payMethod,amount:net/100});});
 s.receipts.unshift(receipt);return {state:s,receipt};
}
export function publicState(s,user){if(user.role==='admin')return s;return {...empty(),events:s.events||[],negocio:s.negocio,telefono:s.telefono,items:s.items.map(p=>({...p,costoTotal:0,preparedValue:0,historyCost:0,historyRevenue:0})),receipts:[]};}

export function prepare(original,request,user){
 if(user.role!=='admin')fail('Solo administradores',403);
 const state=normalize(original),p=state.items.find(x=>x.id===request.id);
 if(!p||p.tipo!=='elaborado')fail('Receta inexistente');
 const qty=Number(request.qty);if(!Number.isInteger(qty)||qty<=0||qty>100000)fail('Cantidad preparada inválida');
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Operación inválida');
 if(state.kardex.some(k=>k.productionId===request.requestId))return state;
 const needs={};for(const ing of p.ingredientes)needs[ing.idInsumo]=(needs[ing.idInsumo]||0)+Number(ing.cantidad)*qty/p.recipeYield;
 let cost=0;const date=new Date().toISOString();
 for(const [id,amount] of Object.entries(needs)){const ins=state.items.find(x=>x.id===id);if(amount>stock(ins)+1e-9)fail('Stock insuficiente: '+ins.nombre,409);cost+=unitCost(state,ins)*amount;}
 for(const [id,amount] of Object.entries(needs)){const ins=state.items.find(x=>x.id===id);ins.consumed+=amount;state.kardex.unshift({id:randomUUID(),date,sku:ins.sku,name:ins.nombre,type:'PROD_OUT',qty:amount,amount:0,payMethod:'-',productionId:request.requestId,detail:'Insumo para '+p.nombre});}
 p.preparedStock+=qty;p.preparedValue+=cost;
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
  const prepared=r.inventoryMode==='prepared-v1'||(p.tipo==='elaborado'&&state.kardex.some(k=>k.type==='PROD_IN'&&k.sku===l.sku&&k.date<=(r.isoDate||'')));
  const ingredients=p.tipo==='elaborado'&&!prepared?(c.recipe||[]):[];
  if(p.tipo==='elaborado'&&!prepared&&!ingredients.length)fail('Falta receta histórica para devolver los insumos');
  return {p,qty:l.qty,cost:Number(c.unitCost)*l.qty,net:net/100,prepared,ingredients};
 });
 const returns={};for(const x of corrections)for(const ing of x.ingredients)returns[ing.idInsumo]=(returns[ing.idInsumo]||0)+Number(ing.cantidad)*x.qty;
 for(const [id,qty] of Object.entries(returns)){const p=state.items.find(p=>p.id===id);if(!p||!Number.isFinite(qty)||qty<=0||p.consumed+1e-9<qty)fail('No se puede devolver el consumo histórico; revisa el inventario');}
 for(const [id,qty] of Object.entries(returns))state.items.find(p=>p.id===id).consumed-=qty;
 const date=new Date().toISOString();
 for(const x of corrections){x.p.vendidos-=x.qty;x.p.historyRevenue=Number(x.p.historyRevenue)-x.net;x.p.historyCost=Number(x.p.historyCost)-x.cost;if(x.p.tipo==='elaborado'&&x.prepared){x.p.preparedStock+=x.qty;x.p.preparedValue+=x.cost;}
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
