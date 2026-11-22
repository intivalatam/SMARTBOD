import test from 'node:test';import assert from 'node:assert/strict';import {empty,normalize,sell,prepare,publicState,stock,unitCost,secureSave} from '../lib/domain.js';
const admin={id:'a',name:'Admin',role:'admin'},seller={id:'v',name:'Vendedor',role:'seller'},policy={admin:100,seller:5};
const source=()=>({...empty(),items:[{id:'bread',sku:'PAN',nombre:'Pan',tipo:'producto',precio:2,unidadesCompradas:48,costoTotal:48,vendidos:0},{id:'meat',sku:'CARNE',nombre:'Carne',tipo:'producto',precio:3,unidadesCompradas:24,costoTotal:48,vendidos:0},{id:'recipe',sku:'HAMB',nombre:'Hamburguesa',tipo:'elaborado',precio:10,vendidos:0,recipeYield:24,ingredientes:[{idInsumo:'bread',cantidad:24},{idInsumo:'meat',cantidad:24}]}]});
const production=(qty=24,id='11111111-1111-1111-1111-111111111111')=>({id:'recipe',qty,requestId:id});const sale=(extra={})=>({requestId:'22222222-2222-2222-2222-222222222222',lines:[{id:'recipe',qty:1}],payMethod:'Efectivo',cash:100,discount:0,...extra});
test('costo unitario divide entre rendimiento',()=>assert.equal(unitCost(normalize(source()),normalize(source()).items[2]),3));
test('sin preparación no se permite vender',()=>assert.throws(()=>sell(source(),sale(),seller,policy),/preparadas insuficientes/));
test('preparar 24 consume 24 panes y carnes',()=>{const s=prepare(source(),production(),admin);assert.equal(stock(s.items[0]),24);assert.equal(stock(s.items[1]),0);assert.equal(s.items[2].preparedStock,24);assert.equal(s.items[2].preparedValue,72);});
test('venta descuenta preparados sin duplicar consumo',()=>{const r=sell(prepare(source(),production(),admin),sale(),seller,policy);assert.equal(r.state.items[2].preparedStock,23);assert.equal(r.state.items[0].consumed,24);assert.equal(r.state.items[2].preparedValue,69);assert.equal(r.state.items[2].historyCost,3);});
test('preparación parcial proporcional',()=>{const s=prepare(source(),production(6),admin);assert.equal(s.items[0].consumed,6);assert.equal(s.items[2].preparedValue,18);});
test('preparación insuficiente es atómica',()=>{const s=source();assert.throws(()=>prepare(s,production(25),admin),/Stock insuficiente/);assert.equal(s.items[0].consumed,undefined);});
test('preparación idempotente',()=>{const s=prepare(source(),production(),admin),t=prepare(s,production(),admin);assert.equal(t.items[2].preparedStock,24);assert.equal(t.kardex.length,3);});
test('vendedor no prepara ni sobrepasa descuento',()=>{assert.throws(()=>prepare(source(),production(),seller),/administradores/);assert.throws(()=>sell(prepare(source(),production(),admin),sale({discount:1}),seller,policy),/Descuento no autorizado/);});
test('venta idempotente',()=>{const a=sell(prepare(source(),production(),admin),sale(),seller,policy);const b=sell(a.state,sale(),seller,policy);assert.equal(b.state.items[2].preparedStock,23);assert.equal(b.state.receipts.length,1);});
test('no vende más preparado ni acepta precio cliente',()=>{const s=prepare(source(),production(1),admin);const a=sell(s,sale({lines:[{id:'recipe',qty:1,price:.01}]}),seller,policy);assert.equal(a.receipt.total,10);assert.throws(()=>sell(a.state,sale({requestId:'33333333-3333-3333-3333-333333333333'}),seller,policy),/preparadas insuficientes/);});
test('cambio receta no altera costo del lote preparado',()=>{const s=prepare(source(),production(),admin);s.items[2].recipeYield=1;s.items[0].costoTotal=999;const a=sell(s,sale(),seller,policy);assert.equal(a.state.items[2].historyCost,3);});
test('migración no inventa preparados ni duplica consumo histórico',()=>{const s=source();delete s.items[2].recipeYield;s.items[2].vendidos=1;const a=normalize(s),b=normalize(a);assert.equal(a.items[2].preparedStock,0);assert.equal(a.items[0].consumed,b.items[0].consumed);});
test('pago insuficiente y rendimiento inválido',()=>{assert.throws(()=>sell(prepare(source(),production(),admin),sale({cash:1}),seller,policy),/Efectivo insuficiente/);const s=source();s.items[2].recipeYield=0;assert.throws(()=>normalize(s),/Producción inválida/);});
test('datos financieros no expuestos al vendedor',()=>{const s=publicState(prepare(source(),production(),admin),seller);assert.deepEqual(s.kardex,[]);assert.equal(s.items[0].costoTotal,0);});

import {voidSale} from '../lib/domain.js';
test('anular preparado restaura porciones y costo sin restaurar ingredientes',()=>{const state=prepare(source(),production(),admin),sold=sell(state,sale({discount:.5}),seller,policy);const v=voidSale(sold.state,{ticketNum:sold.receipt.ticketNum,reason:'Venta duplicada'},admin);assert.equal(v.items[2].preparedStock,24);assert.equal(v.items[2].preparedValue,72);assert.equal(v.items[2].historyRevenue,0);assert.equal(v.items[2].historyCost,0);assert.equal(v.items[0].consumed,24);assert.equal(v.receipts[0].status,'voided');assert.equal(v.kardex[0].amount,-9.5);});
test('repetir anulación no duplica devolución',()=>{const sold=sell(prepare(source(),production(),admin),sale(),seller,policy);const req={ticketNum:sold.receipt.ticketNum,reason:'Error de caja'};const a=voidSale(sold.state,req,admin),b=voidSale(a,req,admin);assert.deepEqual(a,b);});
test('vendedor no anula; motivo es obligatorio',()=>{const sold=sell(prepare(source(),production(),admin),sale(),seller,policy);assert.throws(()=>voidSale(sold.state,{ticketNum:sold.receipt.ticketNum,reason:'Error de caja'},seller),/administradores/);assert.throws(()=>voidSale(sold.state,{ticketNum:sold.receipt.ticketNum,reason:''},admin),/motivo/);});
test('producto directo recupera stock y conserva historial',()=>{const a=sell(source(),sale({lines:[{id:'bread',qty:2}]}),admin,policy);const b=voidSale(a.state,{ticketNum:a.receipt.ticketNum,reason:'Venta errónea'},admin);assert.equal(stock(b.items[0]),48);assert.equal(b.receipts.length,1);assert.equal(b.items[0].historyRevenue,0);});
test('anulación sigue ID aunque cambie el SKU',()=>{const a=sell(source(),sale({lines:[{id:'bread',qty:2}]}),admin,policy);a.state.items[0].sku='NUEVO';const b=voidSale(a.state,{ticketNum:a.receipt.ticketNum,reason:'Error de registro'},admin);assert.equal(stock(b.items[0]),48);});
test('venta antigua sin costos se rechaza sin tocar estado',()=>{const a=sell(source(),sale({lines:[{id:'bread',qty:1}]}),admin,policy);delete a.state.receipts[0].costs;assert.throws(()=>voidSale(a.state,{ticketNum:a.receipt.ticketNum,reason:'Error antiguo'},admin),/costos suficientes/);assert.equal(a.state.items[0].vendidos,1);});
test('anulación histórica de consumo directo devuelve insumos',()=>{const a=normalize(source());a.items[2].vendidos=1;a.items[2].historyRevenue=10;a.items[2].historyCost=3;a.items[0].consumed=1;a.items[1].consumed=1;a.receipts=[{ticketNum:'OLD',isoDate:'2020-01-01T00:00:00Z',total:10,payMethod:'Efectivo',lines:[{sku:'HAMB',qty:1,subtotal:10}],costs:[{sku:'HAMB',unitCost:3,recipe:[{idInsumo:'bread',cantidad:1},{idInsumo:'meat',cantidad:1}]}]}];const b=voidSale(a,{ticketNum:'OLD',reason:'Corrección histórica'},admin);assert.equal(b.items[0].consumed,0);assert.equal(b.items[2].preparedStock,0);});

import {upsertEvent,peruDate,validateEvents} from '../lib/domain.js';
const today=()=>peruDate(new Date());const event=()=>({id:'fair',name:'Feria escolar',activity:'Kermesse',startDate:today(),endDate:today(),active:true,location:'Colegio',notes:''});
test('evento de un día y varios días: duración inclusiva',()=>{assert.equal(validateEvents([event()])[0].days,1);assert.equal(validateEvents([{...event(),startDate:'2026-11-10',endDate:'2026-11-12'}])[0].days,3);});
test('rechaza fechas imposibles y orden invertido',()=>{assert.throws(()=>validateEvents([{...event(),startDate:'2026-02-30'}]));assert.throws(()=>validateEvents([{...event(),startDate:'2026-11-20',endDate:'2026-11-10'}]));});
test('solo administrador crea evento',()=>assert.throws(()=>upsertEvent(source(),event(),seller),/administradores/));
test('venta diaria conserva fecha Lima y no evento',()=>{const a=sell(source(),sale({lines:[{id:'bread',qty:1}]}),seller,policy);assert.equal(a.receipt.businessDate,today());assert.equal(a.receipt.saleChannel,'daily');assert.equal(a.receipt.eventId,null);});
test('venta de evento conserva snapshot aunque se edite',()=>{const s=upsertEvent(source(),event(),admin);const sold=sell(s,sale({eventId:'fair',lines:[{id:'bread',qty:1}]}),seller,policy);assert.equal(sold.receipt.eventSnapshot.name,'Feria escolar');const edited=upsertEvent(sold.state,{...event(),name:'Otro nombre'},admin);assert.equal(edited.receipts[0].eventSnapshot.name,'Feria escolar');assert.equal(edited.receipts[0].eventId,'fair');});
test('no permite vender en evento cerrado, inexistente o fuera de fecha',()=>{for(const e of [{...event(),active:false},{...event(),startDate:'2000-01-01',endDate:'2000-01-02'}]){const s=upsertEvent(source(),e,admin);assert.throws(()=>sell(s,sale({eventId:'fair',lines:[{id:'bread',qty:1}]}),seller,policy),/no está activo/);}assert.throws(()=>sell(source(),sale({eventId:'unknown',lines:[{id:'bread',qty:1}]}),seller,policy));});
test('anular venta de evento conserva asociación',()=>{const sold=sell(upsertEvent(source(),event(),admin),sale({eventId:'fair',lines:[{id:'bread',qty:1}]}),seller,policy);const v=voidSale(sold.state,{ticketNum:sold.receipt.ticketNum,reason:'Venta equivocada'},admin);assert.equal(v.receipts[0].eventId,'fair');assert.equal(v.receipts[0].status,'voided');});
test('vendedor recibe eventos sin datos financieros',()=>assert.equal(publicState(upsertEvent(source(),event(),admin),seller).events[0].id,'fair'));
test('fecha peruana respeta cambio de día UTC',()=>assert.equal(peruDate(new Date('2026-11-16T02:00:00Z')),'2026-11-15'));

import {restock} from '../lib/domain.js';
const refill=()=>({id:'bread',packages:2,units:12,cost:60,discount:6,price:6,requestId:'44444444-4444-4444-4444-444444444444'});
test('reponer paquetes suma al producto existente',()=>{const a=restock(source(),refill(),admin);assert.equal(a.items.length,3);assert.equal(a.items[0].unidadesCompradas,72);assert.equal(a.items[0].costoTotal,156);assert.equal(a.items[0].precio,6);assert.equal(a.kardex[0].qty,24);});
test('reposición repetida no duplica stock',()=>{const a=restock(source(),refill(),admin);assert.deepEqual(restock(a,refill(),admin),a);});
test('vendedor no repone y receta no se abastece como producto',()=>{assert.throws(()=>restock(source(),refill(),seller));assert.throws(()=>restock(source(),{...refill(),id:'recipe'},admin));});
test('descuento de compra inválido rechazado',()=>assert.throws(()=>restock(source(),{...refill(),discount:70},admin)));
test('reposiciones sucesivas conservan ambos ingresos',()=>{const a=restock(source(),refill(),admin);const b=restock(a,{...refill(),packages:1,units:1,cost:3,discount:0,requestId:'55555555-5555-5555-5555-555555555555'},admin);assert.equal(b.items[0].unidadesCompradas,73);assert.equal(b.items[0].costoTotal,159);});
function creams(){return {...empty(),items:[{id:'mayo',sku:'MAYO',nombre:'Mayonesa grande',tipo:'producto',unidadesCompradas:1,costoTotal:12,precio:15,vendidos:0},{id:'recipe',sku:'R',nombre:'Receta',tipo:'elaborado',precio:10,vendidos:0,recipeYield:24,ingredientes:[{idInsumo:'mayo',cantidad:1}]}]};}
test('un envase alcanza para receta completa de 24 porciones',()=>{const s=prepare(creams(),production(),admin);assert.equal(s.items[0].consumed,1);assert.equal(s.items[1].preparedStock,24);assert.equal(s.items[1].preparedValue,12);});
test('envase para 48: consume medio al preparar 24',()=>{const s=creams();s.items[1].ingredientes[0]={idInsumo:'mayo',cantidad:999,measureMode:'coverage',servingsPerUnit:48};const a=prepare(s,production(),admin);assert.equal(a.items[0].consumed,.5);assert.equal(stock(a.items[0]),.5);assert.equal(a.items[1].preparedValue,6);});
test('dos tandas consumen un envase y tercera se rechaza',()=>{const s=creams();s.items[1].ingredientes[0]={idInsumo:'mayo',cantidad:1,measureMode:'coverage',servingsPerUnit:48};const a=prepare(s,production(),admin),b=prepare(a,production(24,'66666666-6666-6666-6666-666666666666'),admin);assert.equal(stock(b.items[0]),0);assert.throws(()=>prepare(b,production(24,'77777777-7777-7777-7777-777777777777'),admin),/Stock insuficiente/);});
test('cantidad fraccionaria directa es válida',()=>{const s=creams();s.items[1].ingredientes[0].cantidad=.25;const a=prepare(s,production(),admin);assert.equal(a.items[0].consumed,.25);});
test('rendimiento de envase cero rechazado',()=>{const s=creams();s.items[1].ingredientes[0].measureMode='coverage';s.items[1].ingredientes[0].servingsPerUnit=0;assert.throws(()=>normalize(s),/rendimiento del envase/);});

test('guardar rendimiento y preparar es una sola operación',()=>{const s=creams();s.items[1].recipeYield=1;const a=prepare(s,{...production(),recipePatch:{recipeYield:24,precio:10,ingredientes:[{idInsumo:'mayo',cantidad:1}]}},admin);assert.equal(a.items[1].recipeYield,24);assert.equal(a.items[1].preparedStock,24);assert.equal(a.items[0].consumed,1);assert.equal(s.items[1].recipeYield,1);});
test('fallo al preparar no guarda cambios parciales de receta',()=>{const s=creams();const req={...production(),recipePatch:{recipeYield:24,ingredientes:[{idInsumo:'mayo',cantidad:2}]}};assert.throws(()=>prepare(s,req,admin),/Stock insuficiente/);assert.equal(s.items[1].ingredientes[0].cantidad,1);assert.equal(s.items[1].preparedStock,undefined);});
test('reintento con cambios de receta conserva un único lote',()=>{const req={...production(),recipePatch:{recipeYield:24,ingredientes:[{idInsumo:'mayo',cantidad:1}]}};const a=prepare(creams(),req,admin),b=prepare(a,req,admin);assert.deepEqual(a,b);});

test('compra por importe total aplica descuento global y calcula costo unitario exacto',()=>{
 
 const request={id:'bread',packages:24,units:1,purchaseMode:'total',grossTotal:86.40,discountTotal:17.28,price:5,requestId:'88888888-8888-8888-8888-888888888888'};
 const result=restock(source(),request,admin),product=result.items.find(p=>p.id==='bread');
 assert.equal(product.unidadesCompradas,72);
 assert.ok(Math.abs(product.lastPurchaseCost-2.88)<1e-10);
 assert.equal(result.kardex[0].amount,69.12);
 assert.equal(product.priceHistory.at(-1).grossTotal,86.40);
 assert.equal(product.priceHistory.at(-1).discountTotal,17.28);
 assert.deepEqual(restock(result,request,admin),result);
});
test('paquetes y descuento total sin redondeo intermedio conservan centavos',()=>{
 
 const r=restock(source(),{id:'bread',packages:4,units:12,purchaseMode:'total',grossTotal:39.60,discountTotal:0,price:2,requestId:'99999999-9999-9999-9999-999999999999'},admin);
 assert.equal(r.kardex[0].qty,48);assert.equal(r.kardex[0].amount,39.60);
});
test('descuento total superior al subtotal se rechaza sin modificar inventario',()=>{
 
 assert.throws(()=>restock(source(),{id:'bread',packages:4,units:12,purchaseMode:'total',grossTotal:39.60,discountTotal:40,price:2,requestId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},admin),/subtotal y descuento global/i);
});

test('nuevo producto registra descuento global y costo neto con historial trazable',()=>{
 const product={id:'nuevo-1',sku:'NVO-1',nombre:'Galletas',tipo:'producto',precio:2,unidadesCompradas:20,costoTotal:12.9,vendidos:0,initialPurchase:{qty:20,grossTotal:13.9,discountTotal:1,netTotal:12.9,discountMode:'global'}};
 const saved=secureSave(empty(),{...empty(),items:[product]},admin);
 assert.equal(saved.items[0].costoTotal,12.9);
 assert.equal(saved.items[0].inventoryValue,12.9);
 assert.equal(saved.items[0].priceHistory[0].grossTotal,13.9);
 assert.equal(saved.items[0].priceHistory[0].discountTotal,1);
 assert.equal(saved.items[0].priceHistory[0].unitCost,12.9/20);
 assert.equal(saved.items[0].initialPurchase,undefined);
});
test('nuevo producto acepta descuento por unidad, incluido cero',()=>{
 const item={id:'nuevo-2',sku:'NVO-2',nombre:'Bebidas',tipo:'producto',precio:5,unidadesCompradas:10,costoTotal:37,vendidos:0,initialPurchase:{qty:10,grossTotal:40,discountTotal:3,netTotal:37,discountMode:'unit'}};
 const saved=secureSave(empty(),{...empty(),items:[item]},admin);
 assert.equal(saved.items[0].priceHistory[0].discountTotal,3);
 const noDiscount={...item,id:'nuevo-3',sku:'NVO-3',costoTotal:40,initialPurchase:{qty:10,grossTotal:40,discountTotal:0,netTotal:40,discountMode:'none'}};
 const clean=secureSave(empty(),{...empty(),items:[noDiscount]},admin);
 assert.equal(clean.items[0].priceHistory[0].discountTotal,0);
});
test('rechaza descuentos falsos o superiores al total en alta inicial',()=>{
 const product={id:'nuevo-4',sku:'NVO-4',nombre:'Bebida',tipo:'producto',precio:5,unidadesCompradas:10,costoTotal:10,vendidos:0,initialPurchase:{qty:10,grossTotal:40,discountTotal:50,netTotal:10,discountMode:'global'}};
 assert.throws(()=>secureSave(empty(),{...empty(),items:[product]},admin),/descuento inicial/i);
});
