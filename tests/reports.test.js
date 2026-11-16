import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');const code=html.slice(html.indexOf('  function reportData(){'),html.indexOf('  function showReport('));
function report(type,origin='all'){
 const receipts=[{isoDate:'2026-11-15T15:00:00Z',businessDate:'2026-11-15',total:10,discount:1},{isoDate:'2026-11-15T16:00:00Z',businessDate:'2026-11-15',total:20,discount:2,eventId:'fair',eventSnapshot:{name:'Feria'}},{isoDate:'2026-11-15T17:00:00Z',businessDate:'2026-11-15',total:99,discount:3,eventId:'fair',eventSnapshot:{name:'Feria'},status:'voided'}];
 const ctx=vm.createContext({items:[],kardex:[],getConsumoElaborados:()=>({}),num:v=>Number(v)||0,lsGet:()=>JSON.stringify(receipts),el:id=>({value:({'report-type':type,'report-event':origin,'report-from':'2026-11-15','report-to':'2026-11-15'})[id],selectedOptions:[{textContent:origin}]}),limaDay:()=> '2026-11-15'});return JSON.parse(JSON.stringify(vm.runInContext(code+';reportData()',ctx)));
}
test('resumen diario concilia importes y anulaciones',()=>assert.deepEqual(report('daily').rows,[['2026-11-15',2,1,3,30]]));
test('resumen por evento separa local y feria',()=>{const r=report('eventSummary');assert.deepEqual(r.rows,[['Venta diaria / local',1,0,1,10],['Feria',1,1,2,20]]);});
test('filtro evento y diario excluye otros canales',()=>{assert.equal(report('daily','fair').rows[0][4],20);assert.equal(report('daily','daily').rows[0][4],10);});
