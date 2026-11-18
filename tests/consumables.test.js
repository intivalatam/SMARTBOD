import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {empty,normalize,prepare,sell,stock,voidSale,secureSave} from '../lib/domain.js';
import {operate} from '../lib/operations.js';import {sellable} from '../public/inventory-math.js';import {actionScope,allowed} from '../lib/permissions.js';
const user={id:'a',name:'Admin',role:'admin'},policy={admin:100};
const op=(s,r)=>operate(s,{requestId:randomUUID(),...r},user);
function setup(){let s=op(empty(),{kind:'supplyCreate',name:'Guantes',sku:'CON-1',unit:'unidad',minStock:10});const id=s.items[0].id;s=op(s,{kind:'supplyPurchase',id,qty:100,total:25});return {s,id};}
function prepared(){let {s,id}=setup();s.items.push({id:'pan',sku:'PAN',nombre:'Pan',tipo:'producto',unidadesCompradas:40,costoTotal:40,precio:2,vendidos:0},{id:'h',sku:'H',nombre:'Hamburguesa',tipo:'elaborado',precio:10,recipeYield:1,vendidos:0,ingredientes:[{idInsumo:'pan',cantidad:1,consumeAt:'prepare'}]});s=prepare(s,{id:'h',qty:24,requestId:randomUUID()},user);s=op(s,{kind:'supplyAssign',id:'h',expectedLinks:'[]',links:[{id,qty:1}]});return {s,id};}
const sale=(s,qty=8,requestId=randomUUID())=>sell(s,{requestId,lines:[{id:'h',qty}],payMethod:'Efectivo',cash:qty*10},user,policy);
test('uso variable de 18 guantes conserva 82 y valor 20.50',()=>{const {s,id}=setup(),next=op(s,{kind:'supplyUse',id,mode:'use',qty:18,expectedStock:100,reason:'Turno mañana'});assert.equal(stock(next.items[0]),82);assert.equal(next.items[0].inventoryValue,20.5);assert.equal(next.kardex[0].expense,4.5);assert.equal(stock(s.items[0]),100);});
test('reposición promedia solo el valor restante, conserva precios históricos',()=>{let {s,id}=setup();s=op(s,{kind:'supplyUse',id,mode:'use',qty:20,expectedStock:100,reason:'Uso del turno'});s=op(s,{kind:'supplyPurchase',id,qty:20,total:10,supplier:'Proveedor',document:'F1'});assert.equal(stock(s.items[0]),100);assert.equal(s.items[0].inventoryValue,30);assert.equal(s.items[0].priceHistory.length,2);s=op(s,{kind:'supplyUse',id,mode:'use',qty:10,expectedStock:100,reason:'Segundo turno'});assert.equal(s.kardex[0].amount,3);assert.equal(s.items[0].inventoryValue,27);});
test('asignar no consume al preparar: vender 8 descuenta 8 del saldo y 2 soles de costo',()=>{const {s}=prepared(),r=sale(s);assert.equal(stock(s.items[0]),100);assert.equal(stock(r.state.items[0]),92);assert.equal(r.receipt.costs[0].unitCost,1.25);assert.equal(r.receipt.total,80);assert.equal(r.state.kardex.find(k=>k.type==='SUPPLY_AUTO').amount,2);assert.equal(r.state.kardex.find(k=>k.type==='SUPPLY_AUTO').expense,undefined);});
test('conteo después de ventas registra solo la diferencia, no repite uso automático',()=>{let {s,id}=prepared();s=sale(s).state;s=op(s,{kind:'supplyUse',id,mode:'count',qty:90,expectedStock:92,reason:'Conteo cierre'});assert.equal(stock(s.items[0]),90);assert.equal(s.kardex[0].qty,2);assert.equal(s.kardex[0].expense,.5);});
test('conteo obsoleto se rechaza y no pierde ventas concurrentes',()=>{const {s,id}=prepared(),sold=sale(s).state;assert.throws(()=>op(sold,{kind:'supplyUse',id,mode:'count',qty:90,expectedStock:100,reason:'Conteo cierre'}),/cambiaron/);assert.equal(stock(sold.items[0]),92);});
test('reintentos de compra, uso y venta no descuentan dos veces',()=>{const {s,id}=prepared(),requestId=randomUUID(),r=sale(s,8,requestId);assert.deepEqual(sale(r.state,8,requestId).state,r.state);const command={kind:'supplyUse',id,mode:'use',qty:5,expectedStock:92,reason:'Uso adicional',requestId:randomUUID()},first=op(r.state,command);assert.deepEqual(op(first,command),first);});
test('stock insuficiente bloquea la venta completa y la disponibilidad lo refleja',()=>{let {s,id}=prepared();s=op(s,{kind:'supplyUse',id,mode:'use',qty:95,expectedStock:100,reason:'Uso del turno'});assert.equal(sellable(s.items,s.items.at(-1)),5);assert.throws(()=>sale(s,8),/Stock insuficiente/);assert.equal(s.items.at(-1).preparedStock,24);});
test('anulación y devolución recuperable reintegran el costo histórico del consumible',()=>{let {s,id}=prepared();let r=sale(s);s=op(r.state,{kind:'supplyPurchase',id,qty:10,total:10});s=voidSale(s,{ticketNum:r.receipt.ticketNum,reason:'Venta anulada'},user);assert.equal(stock(s.items[0]),110);assert.equal(s.items[0].inventoryValue,35);assert.equal(s.kardex.find(k=>k.type==='SUPPLY_RETURN').amount,2);r=sale(prepared().s);const returned=op(r.state,{kind:'return',id:'h',ticketNum:r.receipt.ticketNum,qty:2,restock:true,payMethod:'Efectivo',reason:'Devuelto completo'});assert.equal(stock(returned.items[0]),94);assert.equal(returned.kardex.find(k=>k.type==='SUPPLY_RETURN').amount,.5);});
test('uso fraccionario por paquete, conteo positivo y estimado',()=>{let s=op(empty(),{kind:'supplyCreate',name:'Servilletas',unit:'paquete',minStock:1}),id=s.items[0].id;s=op(s,{kind:'supplyPurchase',id,qty:2,total:10});s=op(s,{kind:'supplyUse',id,mode:'use',qty:.5,expectedStock:2,reason:'Medio paquete',estimated:true});assert.equal(stock(s.items[0]),1.5);assert.equal(s.kardex[0].estimated,true);s=op(s,{kind:'supplyUse',id,mode:'count',qty:2,expectedStock:1.5,reason:'Conteo corregido'});assert.equal(s.kardex[0].expense,-2.5);assert.equal(s.items[0].inventoryValue,10);});
test('asignación valida referencias, duplicados y modificaciones simultáneas',()=>{const {s,id}=prepared();assert.throws(()=>op(s,{kind:'supplyAssign',id:'h',expectedLinks:'[]',links:[]}),/cambió/);assert.throws(()=>op(s,{kind:'supplyAssign',id:'h',expectedLinks:JSON.stringify(s.items.at(-1).consumables),links:[{id,qty:1},{id,qty:2}]}),/consumibles/);});
test('consumibles no se venden directamente ni se editan desde guardado general',()=>{const {s}=setup();assert.equal(sellable(s.items,s.items[0]),0);assert.throws(()=>sell(s,{requestId:randomUUID(),lines:[{id:s.items[0].id,qty:1}]},user,policy),/Producto/);const next=structuredClone(s);next.items[0].inventoryKind='merchandise';assert.throws(()=>secureSave(s,normalize(next),user),/módulo/);});
test('permisos de compras, ajustes y catálogo se aplican a cada operación',()=>{assert.equal(actionScope('operation',{operation:{kind:'supplyUse'}}),'adjust');assert.equal(actionScope('operation',{operation:{kind:'supplyAssign'}}),'catalog');assert.equal(actionScope('operation',{operation:{kind:'supplyPurchase'}}),'purchase');assert.equal(allowed({role:'admin',permissions:['reports']},'adjust'),false);assert.throws(()=>operate(empty(),{kind:'supplyCreate',requestId:randomUUID()},{role:'seller'}),/administradores/);});
test('anular consumibles gratuitos conserva su costo cero aunque una compra posterior tenga costo',()=>{let {s,id}=prepared();s.items[0].inventoryValue=0;s.items[0].lastPurchaseCost=0;const r=sale(s);s=op(r.state,{kind:'supplyPurchase',id,qty:10,total:10});s=voidSale(s,{ticketNum:r.receipt.ticketNum,reason:'Anulación completa'},user);assert.equal(s.items[0].inventoryValue,10);assert.equal(stock(s.items[0]),110);});
test('retirar asignación afecta ventas futuras, no el historial de la venta previa',()=>{let {s}=prepared();const r=sale(s);s=op(r.state,{kind:'supplyAssign',id:'h',expectedLinks:JSON.stringify(r.state.items.at(-1).consumables),links:[]});s=sale(s,1).state;assert.equal(stock(s.items[0]),92);s=voidSale(s,{ticketNum:r.receipt.ticketNum,reason:'Venta equivocada'},user);assert.equal(stock(s.items[0]),100);});
test('eliminar distingue material nuevo, saldo, asignaciones e historial',()=>{
  const fresh=op(empty(),{kind:'supplyCreate',name:'Vasos',unit:'paquete',minStock:1});
  assert.equal(op(fresh,{kind:'supplyRemove',id:fresh.items[0].id}).items.length,0);
  const {s,id}=prepared();
  assert.throws(()=>op(s,{kind:'supplyRemove',id}),/saldo/);
  const used=op(s,{kind:'supplyUse',id,mode:'use',expectedStock:100,qty:100,reason:'Uso del turno'});
  assert.throws(()=>op(used,{kind:'supplyRemove',id}),/asignación/);
  const unlinked=op(used,{kind:'supplyAssign',id:'h',expectedLinks:JSON.stringify([{id,qty:1}]),links:[]});
  const archived=op(unlinked,{kind:'supplyRemove',id});
  assert.equal(archived.items.find(p=>p.id===id).archived,true);
  assert.deepEqual(archived.kardex,unlinked.kardex);
});
test('dos paquetes de cien vasos permiten descontar unidades individuales',()=>{
 let state=op(empty(),{kind:'supplyCreate',name:'Vasos',unit:'unidad',minStock:10});
 const id=state.items[0].id;
 state=op(state,{kind:'supplyPurchase',id,qty:2,perPack:100,total:24});
 state=op(state,{kind:'supplyUse',id,mode:'use',expectedStock:200,qty:10,reason:'Uso del turno'});
 assert.equal(stock(state.items[0]),190);
 assert.equal(state.items[0].inventoryValue,22.8);
});
test('un saldo histórico de 50 paquetes admite definir contenido y descontar piezas',()=>{
 let state=op(empty(),{kind:'supplyCreate',name:'Bolsas',unit:'paquete',minStock:1});
 const id=state.items[0].id;
 state=op(state,{kind:'supplyPurchase',id,qty:50,total:100});
 state=op(state,{kind:'supplySettings',id,name:'Bolsas',minStock:1,packContents:100});
 assert.equal(stock(state.items[0]),50);
 state=op(state,{kind:'supplyUse',id,mode:'use',entryUnit:'piece',qty:25,expectedStock:50,reason:'Uso del turno'});
 assert.equal(stock(state.items[0]),49.75);
 assert.equal(state.items[0].inventoryValue,99.5);
 assert.throws(()=>op(state,{kind:'supplySettings',id,name:'Bolsas',minStock:1,packContents:50}),/presentación/);
});

test('el conteo erróneo de 400 paquetes desde 1 no suma 399 ni infla el valor',()=>{
 let state=op(empty(),{kind:'supplyCreate',name:'Servilletas',sku:'SERV',unit:'paquete',packContents:100,minStock:1});
 const id=state.items[0].id;state=op(state,{kind:'supplyPurchase',id,qty:1,total:13.20});
 assert.throws(()=>op(state,{kind:'supplyUse',id,mode:'count',qty:400,expectedStock:1,reason:'Conteo estimado',estimated:true}),/conteo físico exacto/);
 assert.throws(()=>op(state,{kind:'supplyUse',id,mode:'count',qty:400,expectedStock:1,reason:'Conteo incorrecto'}),/confirma el ajuste/);
 assert.equal(stock(state.items[0]),1);assert.equal(state.items[0].inventoryValue,13.2);
});
test('70 paquetes de vasos desde 1 requieren conteo exacto y confirmación',()=>{
 let state=op(empty(),{kind:'supplyCreate',name:'Vasos',sku:'VAS',unit:'paquete',packContents:50,minStock:1});
 const id=state.items[0].id;state=op(state,{kind:'supplyPurchase',id,qty:1,total:4.80});
 assert.throws(()=>op(state,{kind:'supplyUse',id,mode:'count',qty:70,expectedStock:1,estimated:true,reason:'Conteo estimado',confirmLargeCount:true}),/conteo físico exacto/);
 const next=op(state,{kind:'supplyUse',id,mode:'count',qty:70,expectedStock:1,estimated:false,reason:'Conteo físico exacto',confirmLargeCount:true});
 assert.equal(stock(next.items[0]),70);assert.equal(next.kardex[0].delta,69);
});
test('reponer una caja no genera una diferencia de conteo',()=>{
 let state=op(empty(),{kind:'supplyCreate',name:'Vasos',sku:'VASC',unit:'paquete',packContents:100,minStock:1});
 const id=state.items[0].id;state=op(state,{kind:'supplyPurchase',id,qty:1,total:10});
 assert.equal(stock(state.items[0]),1);assert.equal(state.kardex[0].type,'SUPPLY_BUY');
});

test('conciliación de 1 paquete de 500 servilletas, consume 400 sin borrar el asiento equivocado',()=>{
 let state=op(empty(),{kind:'supplyCreate',name:'SERVILLETAS',sku:'SERV-CORR',unit:'paquete',packContents:500,minStock:1});
 const id=state.items[0].id;
 state=op(state,{kind:'supplyPurchase',id,qty:1,total:13.20});
 state=op(state,{kind:'supplyUse',id,mode:'count',qty:400,expectedStock:1,reason:'Conteo erroneo',estimated:true,confirmLargeCount:true});
 const old=state.kardex[0],originalId=old.id;
 assert.equal(stock(state.items[0]),400);
 assert.equal(state.items[0].inventoryValue,5280);
 state=op(state,{kind:'supplyReconcile',id,movementId:originalId,expectedStock:400,purchasedPackages:1,packContents:500,usedPieces:400,confirmText:'CONCILIAR',reason:'Conciliación de compra real de 500 servilletas'});
 assert.ok(Math.abs(stock(state.items[0])-.2)<1e-8);
 assert.ok(Math.abs(state.items[0].inventoryValue-2.64)<1e-8);
 assert.ok(Math.abs(state.items[0].consumed-.8)<1e-8);
 assert.equal(state.kardex.find(x=>x.id===originalId).reconciledOperationId,state.kardex[0].operationId);
 assert.equal(state.kardex[0].type,'SUPPLY_USE');
 assert.equal(state.kardex[1].type,'SUPPLY_REVERSAL');
 assert.equal(state.kardex[2].type,'SUPPLY_COUNT_IN');
 assert.ok(Math.abs(state.kardex[0].amount-10.56)<1e-8);
});
test('conciliación de 1 paquete de 100 vasos, consume 30 y conserva 70',()=>{
 let state=op(empty(),{kind:'supplyCreate',name:'VASOS DESCARTABLES',sku:'VAS-CORR',unit:'paquete',packContents:100,minStock:1});
 const id=state.items[0].id;
 state=op(state,{kind:'supplyPurchase',id,qty:1,total:4.80});
 state=op(state,{kind:'supplyUse',id,mode:'count',qty:70,expectedStock:1,reason:'Conteo estimado',estimated:true});
 const mistaken=state.kardex[0].id;
 state=op(state,{kind:'supplyReconcile',id,movementId:mistaken,expectedStock:70,purchasedPackages:1,packContents:100,usedPieces:30,confirmText:'CONCILIAR',reason:'Conciliación de vasos utilizados en ventas'});
 assert.ok(Math.abs(stock(state.items[0])-.7)<1e-8);
 assert.ok(Math.abs(state.items[0].inventoryValue-3.36)<1e-8);
 assert.ok(Math.abs(state.kardex[0].amount-1.44)<1e-8);
});
test('conciliación rechaza saldos modificados y segunda reversión',()=>{
 let state=op(empty(),{kind:'supplyCreate',name:'Servilletas',sku:'S-REJ',unit:'paquete',packContents:500,minStock:1});
 const id=state.items[0].id;state=op(state,{kind:'supplyPurchase',id,qty:1,total:13.2});
 state=op(state,{kind:'supplyUse',id,mode:'count',qty:400,expectedStock:1,estimated:true,reason:'Conteo equivocado',confirmLargeCount:true});
 const old=state.kardex[0].id;
 const request={kind:'supplyReconcile',id,movementId:old,expectedStock:400,purchasedPackages:1,packContents:500,usedPieces:400,confirmText:'CONCILIAR',reason:'Corrección física documentada'};
 assert.throws(()=>op(state,{...request,expectedStock:399}),/saldo cambió/i);
 const next=op(state,request);
 assert.throws(()=>op(next,request),/último movimiento/i);
});
