import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,normalize,sell,stock,restock,recordWaste,updateLotExpiration,saveSupplier,saveLocation,createPurchaseOrder,receivePurchaseOrder,openCashShift,closeCashShift,usableStock,voidSale,peruDate} from '../lib/domain.js';

const admin={id:'admin-1',name:'Administradora',role:'admin'};
const seller={id:'seller-1',name:'Cajera',role:'seller'};
const source=()=>({...empty(),items:[{id:'bread',sku:'PAN',nombre:'Pan',tipo:'producto',precio:2,unidadesCompradas:48,costoTotal:48,vendidos:0}]});
const id=()=>crypto.randomUUID();
const addDays=days=>{const date=new Date();date.setDate(date.getDate()+days);return peruDate(date);};

test('migración crea lotes iniciales una sola vez y conserva existencias disponibles',()=>{
 const first=normalize(source()),second=normalize(first);
 assert.equal(first.lots.filter(lot=>lot.productId==='bread').length,1);
 assert.equal(first.lots[0].remainingQty,48);
 assert.deepEqual(second.lots,first.lots);
 assert.equal(usableStock(second,second.items[0]),48);
});

test('la venta consume primero el lote vigente más próximo a vencer y conserva su trazabilidad',()=>{
 let state=normalize(source());
 state.lots[0].expirationDate=addDays(20);
 state=restock(state,{id:'bread',packages:1,units:2,cost:2,discount:0,price:2,expirationDate:addDays(5),requestId:id()},admin);
 const result=sell(state,{requestId:id(),lines:[{id:'bread',qty:2}],payMethod:'Efectivo',cash:10},seller,{seller:0});
 const consumed=result.receipt.costs[0].lotAllocations[0];
 assert.equal(consumed.quantity,2);
 assert.equal(result.state.lots.find(lot=>lot.id===consumed.lotId).expirationDate,addDays(5));
 assert.equal(stock(result.state.items[0]),48);
});

test('un lote vencido no se vende aunque el stock contable siga disponible',()=>{
 const state=normalize(source());
 state.lots[0].expirationDate=addDays(-1);
 assert.equal(usableStock(state,state.items[0]),0);
 assert.throws(()=>sell(state,{requestId:id(),lines:[{id:'bread',qty:1}],payMethod:'Efectivo',cash:10},seller,{seller:0}),/vencimiento/);
 assert.equal(stock(state.items[0]),48);
});

test('la merma descuenta existencias y es idempotente por identificador',()=>{
 const state=normalize(source()),lot=state.lots[0],request={lotId:lot.id,quantity:3,reason:'Envase dañado',requestId:id()};
 const first=recordWaste(state,request,admin),again=recordWaste(first,request,admin);
 assert.equal(stock(first.items[0]),45);
 assert.equal(first.lots[0].remainingQty,45);
 assert.deepEqual(again,first);
 assert.throws(()=>recordWaste(state,{...request,quantity:49,requestId:id()},admin),/merma|lote/i);
});

test('el administrador asigna vencimiento a lotes de apertura y una fecha imposible se rechaza',()=>{
 const state=normalize(source()),lot=state.lots[0];
 const updated=updateLotExpiration(state,{lotId:lot.id,expirationDate:addDays(10)},admin);
 assert.equal(updated.lots[0].expirationDate,addDays(10));
 assert.throws(()=>updateLotExpiration(state,{lotId:lot.id,expirationDate:'2026-02-30'},admin),/Fecha/);
 assert.throws(()=>updateLotExpiration(state,{lotId:lot.id,expirationDate:addDays(10)},{...seller}),/Solo administradores/);
});

test('orden de compra crea un lote trazable y recibir dos veces no duplica stock',()=>{
 let state=saveSupplier(source(),{name:'Distribuidora Central',phone:'999'},admin);
 const supplierId=state.suppliers[0].id;
 state=createPurchaseOrder(state,{requestId:id(),supplierId,lines:[{productId:'bread',packages:2,units:6,cost:30,discount:2,price:3,expirationDate:addDays(30)}]},admin);
 const order=state.purchaseOrders[0];
 state=receivePurchaseOrder(state,{orderId:order.id},admin);
 const receivedStock=stock(state.items[0]);
 assert.equal(receivedStock,60);
 assert.equal(state.purchaseOrders[0].status,'Recibida');
 assert.equal(state.lots.find(lot=>lot.purchaseOrderId===order.id).remainingQty,12);
 state=receivePurchaseOrder(state,{orderId:order.id},admin);
 assert.equal(stock(state.items[0]),receivedStock);
});

test('una venta conserva ubicación y turno; el arqueo excluye tickets anulados',()=>{
 let state=saveLocation(source(),{name:'Feria Norte'},admin);
 const location=state.locations.find(item=>item.name==='Feria Norte');
 state=openCashShift(state,{locationId:location.id,openingAmount:20},seller);
 const shift=state.cashShifts[0],sale=sell(state,{requestId:id(),lines:[{id:'bread',qty:2}],payMethod:'Efectivo',cash:10,locationId:location.id,cashShiftId:shift.id},seller,{seller:0});
 assert.equal(sale.receipt.locationName,'Feria Norte');
 const reversed=voidSale(sale.state,{ticketNum:sale.receipt.ticketNum,reason:'Registro duplicado'},admin);
 const closed=closeCashShift(reversed,{shiftId:shift.id,closingAmount:20},seller);
 assert.equal(closed.cashShifts[0].cashSales,0);
 assert.equal(closed.cashShifts[0].expectedCash,20);
 assert.equal(closed.cashShifts[0].difference,0);
});

test('no se puede cerrar el turno de otro cajero',()=>{
 const state=openCashShift(source(),{locationId:'local',openingAmount:0},seller);
 assert.throws(()=>closeCashShift(state,{shiftId:state.cashShifts[0].id,closingAmount:0},{id:'other',name:'Otro',role:'seller'}),/Solo el cajero/);
});
