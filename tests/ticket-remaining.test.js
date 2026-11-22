import test from 'node:test';
import assert from 'node:assert/strict';
import {ticketRemaining} from '../public/inventory-math.js';
const item={id:'coca',nombre:'Coca Cola',tipo:'producto',unidadesCompradas:20,vendidos:0,consumed:0};
test('14 bebidas seleccionadas muestran 6 restantes sin descontar stock real',()=>{
 const cart=[{item,qty:14,factor:1}];
 const result=ticketRemaining([item],cart,item.id);
 assert.deepEqual(result,{available:20,selected:14,remaining:6,shortage:false});
 assert.equal(item.unidadesCompradas,20);
});
test('presentaciones distintas del mismo producto se suman antes de mostrar el saldo',()=>{
 const cart=[{item,qty:2,factor:6},{item:{...item,nombre:'Coca Cola individual'},qty:3,factor:1}];
 const result=ticketRemaining([item],cart,item.id);
 assert.equal(result.remaining,5);assert.equal(result.selected,15);
});
test('productos preparados muestran las porciones restantes',()=>{
 const prepared={id:'hamburguesa',nombre:'Hamburguesa',tipo:'elaborado',preparedStock:18,ingredientes:[],consumables:[]};
 const result=ticketRemaining([prepared],[{item:prepared,qty:5,factor:1}],prepared.id);
 assert.equal(result.available,18);assert.equal(result.remaining,13);
});
test('producto pesado admite cantidades fraccionadas',()=>{
 const weighted={...item,id:'maiz',saleUnit:'kg',scaleStep:.1,unidadesCompradas:5};
 const result=ticketRemaining([weighted],[{item:weighted,qty:1.4,factor:1}],weighted.id);
 assert.equal(result.remaining,3.6);
});
