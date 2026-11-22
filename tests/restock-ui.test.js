import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const html=(readFileSync(new URL('../public/index.html',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../public/app.js',import.meta.url),'utf8'));const functions=html.slice(html.indexOf('  function stockKilogramReference('),html.indexOf("  ['restock-extra'"));const math=html.slice(html.indexOf('  function packageMath('),html.indexOf('  function packPreview('));
function setup(){const elements={},el=id=>elements[id]??={value:'',textContent:'',focus(){},showModal(){this.open=true;}},product={id:'a',sku:'A',nombre:'Mayonesa',precio:20,lastPurchaseCost:17};const ctx=vm.createContext({limaDay:()=>"2026-11-16",el,items:[product],calc:()=>({stock:5}),getConsumoElaborados:()=>({}),money:v=>'S/ '+Number(v).toFixed(2),content:p=>p.consumptionMode==='measure'?Number(p.contentAmount)*(p.contentUnit==='kg'?1000:1):1});vm.runInContext(math+functions,ctx);return {ctx,el,product};}
test('reposición pide costo nuevo y precio nuevo, conserva anteriores como referencia',()=>{const {ctx,el,product}=setup();ctx.product=product;vm.runInContext('openRestock(product)',ctx);assert.equal(el('restock-cost').value,'');assert.equal(el('restock-price').value,20);assert.equal(el('restock-price-mode').value,'total');assert.equal(el('restock-gross-total').value,'');assert.match(el('restock-previous').textContent,/17.00/);assert.match(el('restock-previous').textContent,/20.00/);assert.equal(el('restock-units-label').hidden,true);});
test('resumen claro de compra por paquete y stock después',()=>{const {ctx,el}=setup();for(const [id,value] of Object.entries({'restock-id':'a','restock-mode':'packages','restock-price-mode':'total','restock-count':'2','restock-units':'10','restock-gross-total':'400','restock-discount-choice':'yes','restock-discount-total':'40','restock-price':'25','restock-margin':'25'}))el(id).value=value;const result=vm.runInContext('restockPreview()',ctx);assert.equal(result.qty,20);assert.equal(result.total,360);assert.match(el('restock-preview').textContent,/Stock después 25/);assert.match(el('restock-preview').textContent,/Precio de venta S\/ 25.00/);});

test('modo tradicional sigue calculando costo y descuento por paquete',()=>{
 const {ctx,el}=setup();
 for(const [id,value] of Object.entries({'restock-id':'a','restock-price-mode':'unit','restock-mode':'packages','restock-count':'2','restock-units':'10','restock-cost':'200','restock-discount':'20','restock-price':'25','restock-margin':'25'}))el(id).value=value;
 const result=vm.runInContext('restockPreview()',ctx);
 assert.equal(result.qty,20);assert.equal(result.total,360);assert.equal(result.unit,18);
 assert.equal(el('restock-total-fields').hidden,true);
 assert.equal(el('restock-unit-fields').hidden,false);
});

test('sin descuento permite opción No aplica y cálculo con descuento cero',()=>{
 const {ctx,el}=setup();
 for(const [id,value] of Object.entries({'restock-id':'a','restock-price-mode':'total','restock-discount-choice':'none','restock-mode':'units','restock-count':'4','restock-gross-total':'39.60','restock-discount-total':'99','restock-price':'20','restock-margin':'25'}))el(id).value=value;
 const result=vm.runInContext('restockPreview()',ctx);
 assert.equal(result.total,39.60);assert.equal(result.qty,4);
 assert.equal(el('restock-discount-total-label').hidden,true);
 assert.equal(el('restock-discount-total').disabled,true);
});
test('descuento global opcional acepta explícitamente S/ 0.00',()=>{
 const {ctx,el}=setup();
 for(const [id,value] of Object.entries({'restock-id':'a','restock-price-mode':'total','restock-discount-choice':'yes','restock-mode':'units','restock-count':'2','restock-gross-total':'30','restock-discount-total':'0','restock-price':'20','restock-margin':'25'}))el(id).value=value;
 const result=vm.runInContext('restockPreview()',ctx);
 assert.equal(result.total,30);
 assert.equal(el('restock-discount-total-label').hidden,false);
});

test('reposición por bolsa de 3 kg muestra kg y equivalencia sin borrar stock previo',()=>{
 const {ctx,el,product}=setup();
 product.weightBaseKg=3;product.nombre='Maiz popcorn';ctx.product=product;
 vm.runInContext('openRestock(product)',ctx);
 for(const [id,value] of Object.entries({'restock-id':'a','restock-mode':'weight','restock-count':'1','restock-weight-kg':'3','restock-gross-total':'19.50','restock-price-mode':'total','restock-margin':'25'}))el(id).value=value;
 const result=vm.runInContext('restockPreview()',ctx);
 assert.equal(result.qty,1);assert.equal(result.total,19.50);
 assert.match(el('restock-preview').textContent,/Peso total: 3 kg/);
 assert.equal(el('restock-base-label').hidden,true);
 assert.equal(el('restock-weight-label').hidden,false);
});
test('bolsa de 5 kg exige confirmar equivalencia cuando existe stock antiguo',()=>{
 const {ctx,el,product}=setup();product.nombre='Maiz popcorn';ctx.product=product;
 vm.runInContext('openRestock(product)',ctx);
 for(const [id,value] of Object.entries({'restock-id':'a','restock-mode':'weight','restock-count':'1','restock-weight-kg':'5','restock-base-kg':'3','restock-gross-total':'30','restock-price-mode':'total','restock-margin':'25'}))el(id).value=value;
 assert.equal(vm.runInContext('restockPreview()',ctx),null);
 assert.match(el('restock-preview').textContent,/Confirma cuántos kg/);
 el('restock-base-confirm').checked=true;
 const result=vm.runInContext('restockPreview()',ctx);
 assert.ok(Math.abs(result.qty-5/3)<1e-10);
 assert.match(el('restock-preview').textContent,/Peso total: 5 kg/);
 assert.equal(el('restock-base-label').hidden,false);
});
