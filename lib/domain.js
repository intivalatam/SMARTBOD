import {randomUUID} from 'node:crypto';
export const empty=()=>({items:[],kardex:[],receipts:[],savedReports:[],negocio:'SMARTBOD',telefono:''});
export function fail(message,status=400){throw Object.assign(new Error(message),{status});}
const number=(v)=>{const n=Number(v);if(!Number.isFinite(n))fail('Número inválido');return n;};
const cents=v=>Math.round(number(v)*100);
export function normalize(raw){
 const s={...empty(),...structuredClone(raw)};
 if(!Array.isArray(s.items)||!Array.isArray(s.kardex)||!Array.isArray(s.receipts)||!Array.isArray(s.savedReports))fail('Respaldo inválido');
 const ids=new Set(),skus=new Set();
 for(const p of s.items){
  if(typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.sku!=='string'||!p.sku||skus.has(p.sku)||typeof p.nombre!=='string'||!['producto','elaborado'].includes(p.tipo))fail('Productos o SKU inválidos');ids.add(p.id);skus.add(p.sku);
  for(const key of ['precio','vendidos','unidadesCompradas','costoTotal','consumed']){p[key]=number(p[key]??0);if(p[key]<0)fail('Cantidades negativas');}
 }
 const use={};for(const p of s.items.filter(p=>p.tipo==='elaborado')){
  if(!Array.isArray(p.ingredientes)||!p.ingredientes.length)fail('Receta vacía');
  for(const i of p.ingredientes){const ins=s.items.find(x=>x.id===i.idInsumo);if(!ins||ins.tipo==='elaborado'||number(i.cantidad)<=0)fail('Ingrediente inválido');if(!p.frozenConsumption)use[ins.id]=(use[ins.id]||0)+i.cantidad*p.vendidos;}
 }
 for(const p of s.items){if(p.tipo==='producto')p.consumed+=(use[p.id]||0);else p.frozenConsumption=true;}
 for(const p of s.items){if(p.historyRevenue==null){p.historyRevenue=p.precio*p.vendidos;p.historyCost=unitCost(s,p)*p.vendidos;}if(!Number.isFinite(Number(p.historyRevenue))||!Number.isFinite(Number(p.historyCost)))fail('Totales inválidos');}
 return s;
}
export function unitCost(s,p){return p.tipo==='elaborado'?p.ingredientes.reduce((sum,i)=>sum+unitCost(s,s.items.find(x=>x.id===i.idInsumo))*Number(i.cantidad),0):(p.unidadesCompradas>0?p.costoTotal/p.unidadesCompradas:0);}
export function stock(p){return Math.max(0,p.unidadesCompradas-p.vendidos-p.consumed);}
export function sell(original,request,user,policy){
 const s=normalize(original);
 if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))fail('Identificador de operación inválido');
 const previous=s.receipts.find(r=>r.requestId===request.requestId);if(previous){if(previous.operatorId!==user.id)fail('Operación inválida',403);return {state:s,receipt:previous};}
 if(!Array.isArray(request.lines)||!request.lines.length||request.lines.length>500)fail('Carrito inválido');
 const needs={},seen=new Set();let subtotal=0;
 const lines=request.lines.map(l=>{const p=s.items.find(p=>p.id===l.id);if(!p||seen.has(p.id))fail('Producto inexistente o repetido');seen.add(p.id);const qty=number(l.qty);if(!Number.isInteger(qty)||qty<=0||qty>100000)fail('Cantidad inválida');const amount=cents(p.precio)*qty;subtotal+=amount;
 if(p.tipo==='elaborado')for(const i of p.ingredientes)needs[i.idInsumo]=(needs[i.idInsumo]||0)+Number(i.cantidad)*qty;else needs[p.id]=(needs[p.id]||0)+qty;
 return {p,qty,amount,cost:unitCost(s,p)*qty};});
 for(const [id,qty] of Object.entries(needs)){const p=s.items.find(p=>p.id===id);if(qty>stock(p)+1e-9)fail('Stock insuficiente: '+p.nombre,409);}
 const discount=cents(request.discount??0),limit=number(policy[user.role]??0);
 if(discount<0||discount>subtotal||discount>Math.floor(subtotal*limit/100))fail('Descuento no autorizado para tu perfil',403);
 if(!['Efectivo','Yape','Plin','Tarjeta'].includes(request.payMethod))fail('Forma de pago inválida');
 const total=subtotal-discount;if(request.payMethod==='Efectivo'&&cents(request.cash??0)<total)fail('Efectivo insuficiente');
 const date=new Date().toISOString(),ticketNum='T-'+randomUUID(),receipt={requestId:request.requestId,ticketNum,isoDate:date,date:new Date(date).toLocaleString('es-PE',{timeZone:'America/Lima'}),bizName:s.negocio,bizTel:s.telefono,client:String(request.client||'Cliente General').slice(0,150),operator:user.name,operatorId:user.id,payMethod:request.payMethod,discount:discount/100,total:total/100,lines:[],costs:[]};
 let allocated=0;lines.forEach(({p,qty,amount,cost},index)=>{const net=index===lines.length-1?total-allocated:Math.floor(amount*(subtotal?total/subtotal:0));allocated+=net;
 p.vendidos+=qty;p.historyRevenue=Number(p.historyRevenue)+net/100;p.historyCost=Number(p.historyCost)+cost;
 if(p.tipo==='elaborado')for(const i of p.ingredientes)s.items.find(x=>x.id===i.idInsumo).consumed+=Number(i.cantidad)*qty;
 receipt.lines.push({nombre:p.nombre,sku:p.sku,qty,unitPrice:p.precio,subtotal:amount/100});receipt.costs.push({sku:p.sku,unitCost:cost/qty,recipe:structuredClone(p.ingredientes||[])});
 s.kardex.unshift({id:randomUUID(),date,sku:p.sku,name:p.nombre,type:'OUT',qty,detail:`Venta ${ticketNum} (${user.name})`,payMethod:request.payMethod,amount:net/100});});
 s.receipts.unshift(receipt);return {state:s,receipt};
}
export function publicState(s,user){if(user.role==='admin')return s;return {...empty(),negocio:s.negocio,telefono:s.telefono,items:s.items.map(p=>({...p,costoTotal:0,historyCost:0,historyRevenue:0})),receipts:[]};}
