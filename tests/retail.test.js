import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {empty,normalize,sell,stock,restock,voidSale} from '../lib/domain.js';
import {operate} from '../lib/operations.js';
import {suggestion} from '../public/replenishment.js';
const admin={role:'admin',name:'Market',id:'a'};
const source=(qty=24,price=4)=>normalize({...empty(),items:[{id:'p',sku:'BOT',nombre:'Producto',tipo:'producto',unidadesCompradas:qty,costoTotal:qty,precio:price}]});
const op=(s,kind,props)=>operate(s,{kind,requestId:randomUUID(),...props},admin);
const sale=(s,lines)=>sell(s,{requestId:randomUUID(),payMethod:'Yape',lines},admin,{admin:100});
test('lectura de pack de seis y dos botellas mantiene 16 y cobra ambos precios',()=>{
 const s=op(source(),'retailSettings',{id:'p',code:'12345678',units:6,name:'Six pack',price:20,unit:'unidad'});
 const {state,receipt}=sale(s,[{id:'p',barcode:'12345678',qty:1},{id:'p',qty:2}]);
 assert.equal(stock(state.items[0]),16);assert.equal(receipt.total,28);assert.equal(receipt.lines[0].parts.length,2);
});
test('queso por kilo: 350 g a 28, devolución de 100 g y precisión de balanza',()=>{
 const s=op(source(2,28),'retailSettings',{id:'p',unit:'kg',step:0.001});
 const {state,receipt}=sale(s,[{id:'p',qty:0.350}]);assert.equal(receipt.total,9.8);
 const refund=op(state,'return',{id:'p',qty:0.1,ticketNum:receipt.ticketNum,payMethod:'Yape',reason:'Reembolso parcial',restock:true});
 assert.equal(refund.receipts[0].returns[0].amount,2.8);assert.equal(stock(refund.items[0]),1.75);
 assert.throws(()=>sale(s,[{id:'p',qty:0.0004}]),/precisión/);
});
test('dos cajas independientes concilian diferencias por medio',()=>{
 let s=op(source(),'cashOpen',{register:'A',cashier:'Ana',amount:5});
 s=op(s,'cashOpen',{register:'B',cashier:'Luis',amount:10});const id=s.cashSessions[1].id;
 s.receipts.push({cashSessionId:id,total:12,status:'completed',payments:[{method:'Yape',amount:12}]});
 s=op(s,'cashClose',{register:'B',amount:10,counts:{Yape:7,Plin:0,Tarjeta:0}});
 assert.equal(s.cashSessions[1].reconciliation.Yape.difference,-5);assert.equal(s.cashSessions[1].difference,0);assert.ok(!s.cashSessions[0].closedAt);
});
test('lotes FEFO, retiro selectivo y reintegro del lote original',()=>{
 let s=source(0);
 for(const [lot,expiry] of [['Z','2099-12-31'],['A','2099-01-01']])s=restock(s,{id:'p',lot,expiry,packages:1,units:10,cost:10,discount:0,price:4,supplier:'Productor',requestId:randomUUID()},admin);
 const {state,receipt}=sale(s,[{id:'p',qty:4}]);assert.deepEqual(state.items[0].purchaseLots.map(l=>l.qty),[10,6]);
 const restored=voidSale(state,{ticketNum:receipt.ticketNum,reason:'Prueba de anulación'},admin);assert.equal(restored.items[0].purchaseLots[1].qty,10);
 const after=op(state,'lotDiscard',{id:'p',lotId:state.items[0].purchaseLots[0].id,qty:3,reason:'Retiro del proveedor'});
 assert.deepEqual(after.items[0].purchaseLots.map(l=>l.qty),[7,6]);
});
test('reposición por velocidad, plazo, pedidos y último conteo',()=>{
 let s=op(source(40),'reorderPlan',{id:'p',leadDays:3,pending:0,pack:25});
 const movements=[{productId:'p',type:'OUT',qty:900,date:new Date().toISOString()}];
 assert.equal(suggestion(s.items[0],movements).packs,2);
 s=op(s,'retailCount',{id:'p',expected:40,qty:38,reason:'Inventario físico'});assert.equal(stock(s.items[0]),38);assert.ok(s.items[0].lastCount);
 assert.throws(()=>op(s,'retailCount',{id:'p',expected:40,qty:39,reason:'Conteo previo'}),/saldo cambió/);
});
