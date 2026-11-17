import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {empty,normalize,restock,prepare,sell,stock} from '../lib/domain.js';
import {operate} from '../lib/operations.js';
const admin={id:'admin',role:'admin',name:'Admin'};
test('un bidón de 5 L abastece dos recetas con distintas dosis',()=>{
  const oil={id:'oil',sku:'A',nombre:'Aceite',tipo:'producto',precio:10,consumptionMode:'measure',contentAmount:1,contentUnit:'l',doseAmount:20,doseUnit:'ml'};
  const recipe=(id,dose)=>({id,sku:id,nombre:id,tipo:'elaborado',precio:5,ingredientes:[{idInsumo:'oil',consumeAt:'prepare',measureMode:'dose',dose,cantidad:dose/1000}]});
  let state=normalize({...empty(),items:[oil,recipe('r1',20),recipe('r2',30)]});
  state=restock(state,{id:'oil',packages:1,units:1,receivedContent:5000,cost:50,price:12,discount:0,requestId:randomUUID()},admin);
  for(const id of ['r1','r2'])state=prepare(state,{id,qty:10,requestId:randomUUID()},admin);
  assert.equal(stock(state.items[0]),4.5);
  assert.equal(state.items[0].inventoryValue,45);
});
test('ocho devoluciones de una línea de veinte céntimos reembolsan veinte céntimos',()=>{
  let state=normalize({...empty(),items:[{id:'p',sku:'P',nombre:'P',tipo:'producto',precio:0.05,unidadesCompradas:8,costoTotal:0.08}]});
  const sale=sell(state,{requestId:randomUUID(),lines:[{id:'p',qty:8}],discount:0.2,payMethod:'Yape'},admin,{admin:100});
  state=sale.state;
  for(let i=0;i<8;i++)state=operate(state,{kind:'return',requestId:randomUUID(),ticketNum:sale.receipt.ticketNum,id:'p',qty:1,restock:true,payMethod:'Yape',reason:'Prueba parcial'},admin);
  assert.equal(state.receipts[0].returns.reduce((sum,r)=>sum+Math.round(r.amount*100),0),20);
});
