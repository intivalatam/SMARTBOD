import {purchaseCost,ingredient,sellable,quantityLabel,content,recipeNeeds} from '../public/inventory-math.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const html=(readFileSync(new URL('../public/index.html',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../public/app.js',import.meta.url),'utf8'));const code=html.slice(html.indexOf('  function reportData(){'),html.indexOf('  function showReport('));
function report(type,origin='all'){
 const receipts=[{isoDate:'2026-11-15T15:00:00Z',businessDate:'2026-11-15',total:10,discount:1},{isoDate:'2026-11-15T16:00:00Z',businessDate:'2026-11-15',total:20,discount:2,eventId:'fair',eventSnapshot:{name:'Feria'}},{isoDate:'2026-11-15T17:00:00Z',businessDate:'2026-11-15',total:99,discount:3,eventId:'fair',eventSnapshot:{name:'Feria'},status:'voided'}];
 const ctx=vm.createContext({purchaseCost,ingredient,sellable,quantityLabel,content,recipeNeeds,extraState:{},getCategoryVisual:()=>"",items:[],kardex:[],getConsumoElaborados:()=>({}),num:v=>Number(v)||0,lsGet:()=>JSON.stringify(receipts),el:id=>({value:({'report-type':type,'report-event':origin,'report-from':'2026-11-15','report-to':'2026-11-15'})[id],selectedOptions:[{textContent:origin}]}),limaDay:()=> '2026-11-15'});return JSON.parse(JSON.stringify(vm.runInContext(code+';reportData()',ctx)));
}
test('resumen diario concilia importes y anulaciones',()=>assert.deepEqual(report('daily').rows,[['2026-11-15',2,1,3,30]]));
test('resumen por evento separa local y feria',()=>{const r=report('eventSummary');assert.deepEqual(r.rows,[['Venta diaria / local',1,0,1,10],['Feria',1,1,2,20]]);});
test('filtro evento y diario excluye otros canales',()=>{assert.equal(report('daily','fair').rows[0][4],20);assert.equal(report('daily','daily').rows[0][4],10);});
import '../public/prices.js';
test('reporte de historial filtra producto y exporta precio nuevo y variaciones',()=>{const ctx=vm.createContext({purchaseCost,ingredient,sellable,quantityLabel,content,recipeNeeds,extraState:{},getCategoryVisual:()=>"",PriceAnalytics,items:[{id:'a',priceHistory:[{date:'2026-11-15T15:00:00Z',sku:'A',productName:'Mayonesa',source:'Reposición',qty:2,total:40,unitCost:20,previousPurchaseCost:10,salePrice:25,previousSalePrice:20,operator:'Admin'}]}],kardex:[],getConsumoElaborados:()=>({}),num:v=>Number(v)||0,lsGet:()=> '[]',el:id=>({value:({'report-type':'prices','report-product':'a','report-event':'all','report-from':'2026-11-15','report-to':'2026-11-15'})[id]}),limaDay:()=> '2026-11-15'});const report=vm.runInContext(code+';reportData()',ctx);assert.equal(report.rows[0][5],20);assert.equal(report.rows[0][6],25);assert.equal(report.rows[0][7],'100.00');assert.equal(report.rows[0][8],'25.00');assert.equal(report.priceRows.length,1);});
test('resultado cuenta el uso manual una vez y no duplica compras ni consumibles ya incluidos en ventas',()=>{
 const date='2026-11-15T15:00:00Z',receipts=[{isoDate:date,total:80,lines:[{productId:'h',qty:8}],costs:[{productId:'h',unitCost:1.25}]}],kardex=[{type:'SUPPLY_BUY',date,amount:25},{type:'SUPPLY_AUTO',date,amount:2},{type:'SUPPLY_USE',date,amount:4.5,expense:4.5},{type:'SUPPLY_COUNT_IN',date,amount:.5,expense:-.5}];
 const ctx=vm.createContext({extraState:{receipts},items:[],kardex,getConsumoElaborados:()=>({}),num:v=>Number(v)||0,lsGet:()=>JSON.stringify(receipts),el:id=>({value:({'report-type':'result','report-event':'all','report-from':'2026-11-15','report-to':'2026-11-15'})[id]}),limaDay:()=> '2026-11-15'});
 const r=vm.runInContext(code+';reportData()',ctx);assert.equal(r.rows.find(x=>x[0]==='Costo vendido')[1],10);assert.equal(r.rows.find(x=>x[0].startsWith('Consumibles:'))[1],4);assert.equal(r.rows.at(-1)[1],66);
});

test('gastos por periodo muestra registros reales y respeta fechas y origen',()=>{
 const expenses=[
  {id:'g1',date:'2026-11-15T16:00:00Z',reason:'Movilidad',amount:22.5},
  {id:'g2',date:'2026-11-15T17:00:00Z',reason:'Limpieza',amount:35,eventId:'feria'},
  {id:'g3',date:'2026-11-01T16:00:00Z',reason:'Fuera de periodo',amount:100}
 ];
 const ctx=vm.createContext({extraState:{expenses,events:[{id:'feria',name:'Feria escolar'}]},
  items:[],kardex:[],getConsumoElaborados:()=>({}),num:v=>Number(v)||0,lsGet:()=> '[]',
  el:id=>({value:({'report-type':'expenses','report-event':'all','report-from':'2026-11-15','report-to':'2026-11-15'})[id],
   selectedOptions:[{textContent:'Todas las ventas'}]}),
  limaDay:d=>new Date(d).toISOString().slice(0,10)
 });
 const result=vm.runInContext(code+';reportData()',ctx);
 assert.equal(result.type,'expenses');assert.equal(result.rows.length,2);
 assert.equal(result.rows[0][3],22.5);assert.equal(result.rows[1][2],'Feria escolar');
 assert.equal(result.rows.reduce((a,row)=>a+row[3],0),57.5);
});
test('reporte sin gastos no inventa importes y ofrece vista con cero registros',()=>{
 const r=report('expenses');
 assert.deepEqual(r.headers,['Fecha','Motivo','Evento','Importe S/']);
 assert.equal(r.rows.length,0);
});
test('documento HTML incluye tarjetas, estado vacío y exportaciones',()=>{
 assert.match(html,/id="report-kpis"/);
 assert.match(html,/id="report-empty-detail"/);
 assert.match(html,/id="report-csv"/);
 assert.match(html,/reportDownload/);
 assert.match(html,/No se encontraron gastos registrados en Caja y gestión/);
});
