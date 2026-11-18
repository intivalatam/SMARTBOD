import {purchaseCost,ingredient,sellable,quantityLabel,content,recipeNeeds} from '../public/inventory-math.js';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {empty,prepare,sell} from '../lib/domain.js';
const html=(readFileSync(new URL('../public/index.html',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../public/app.js',import.meta.url),'utf8'));
const photos=html.slice(html.indexOf('  const photoNames'),html.indexOf('  // ==================== CATÁLOGO MAESTRO'));
const calculations=html.slice(html.indexOf('  function getConsumoElaborados()'),html.indexOf('  // Freeze legacy totals once;'));
const pos=html.slice(html.indexOf('  function renderPOS()'),html.indexOf('  function getCartTotal()'));
const apply=html.slice(html.indexOf('  function applyCloud('),html.indexOf('  async function save('));
function fixture(){return {...empty(),items:[{id:'m',sku:'M',nombre:'Mayonesa',tipo:'producto',precio:12,unidadesCompradas:1,costoTotal:12,vendidos:0},{id:'h',sku:'H',nombre:'Hamburguesa',tipo:'elaborado',precio:10,recipeYield:24,vendidos:0,ingredientes:[{idInsumo:'m',cantidad:1}]}]};}
function context(){const grid={children:[],set innerHTML(v){this.children=[];},appendChild(c){this.children.push(c);}},search={value:''};const ctx=vm.createContext({purchaseCost,ingredient,sellable,quantityLabel,content,recipeNeeds,extraState:{},getCategoryVisual:()=>"",items:[],cart:[],activePosCat:'ALL',cloudRevision:0,currentPolicy:{},activeUser:null,num:v=>Number(v)||0,esc:String,money:String,hydrate:()=>{},accountUI:()=>{},renderEvents:()=>{},renderCart:()=>{},showToast:()=>{},document:{getElementById:id=>id==='pos-grid'?grid:search,createElement:()=>({addEventListener(name,fn){this[name]=fn;}})}});vm.runInContext(photos+calculations+pos+apply+';function renderApp(){renderPOS();}',ctx);return {ctx,grid};}
const admin={id:'a',role:'admin',name:'Admin'};
test('respuesta de preparación actualiza Caja y permite agregar al carrito',()=>{const {ctx,grid}=context();const state=prepare(fixture(),{id:'h',qty:24,requestId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},admin);ctx.result={state,revision:1,user:admin,policy:{admin:100}};vm.runInContext('applyCloud(result)',ctx);const card=grid.children.find(c=>c.innerHTML.includes('Hamburguesa'));assert.match(card.innerHTML,/24 porc\./);assert.ok(!card.className.includes('disabled'));card.click();assert.equal(ctx.cart[0].item.id,'h');assert.equal(ctx.cart[0].qty,1);assert.equal(vm.runInContext('calc(items[1],getConsumoElaborados()).stock',ctx),24);});
test('respuesta de venta actualiza de 24 a 23 sin volver a consumir ingredientes',()=>{const {ctx,grid}=context();const state=prepare(fixture(),{id:'h',qty:24,requestId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'},admin);const sold=sell(state,{requestId:'cccccccc-cccc-cccc-cccc-cccccccccccc',lines:[{id:'h',qty:1}],discount:0,payMethod:'Efectivo',cash:10},admin,{admin:100});ctx.result={state:sold.state,revision:2,user:admin,policy:{admin:100}};vm.runInContext('applyCloud(result)',ctx);assert.match(grid.children.find(c=>c.innerHTML.includes('Hamburguesa')).innerHTML,/23 porc\./);assert.equal(ctx.items[0].consumed,1);});
test('interfaz muestra costo de crema por venta sin cargarla al valor preparado',()=>{const s=fixture();s.items[0].deductOnSale=true;s.items[0].portionsPerUnit=40;const state=prepare(s,{id:'h',qty:24,requestId:'dddddddd-dddd-dddd-dddd-dddddddddddd'},admin);const {ctx}=context();ctx.result={state,revision:1,user:admin,policy:{admin:100}};vm.runInContext('applyCloud(result)',ctx);assert.equal(vm.runInContext('calc(items[1],getConsumoElaborados()).cu',ctx),.3);assert.equal(vm.runInContext('calc(items[0],getConsumoElaborados()).stock',ctx),1);});

test('el catálogo distingue insumos, platos, sabores y fotos propias',()=>{
  const {ctx}=context();
  const visual=(nombre,extra={})=>{
    ctx.item={nombre,imgUrl:'data:image/svg+xml;utf8,antiguo',...extra};
    return vm.runInContext('productVisual(item)',ctx);
  };
  assert.match(visual('Hotdog'),/salchicha.webp$/);
  assert.match(visual('Hotdog',{tipo:'elaborado'}),/hotdog.webp$/);
  assert.match(visual('Galleta Tentación Chocolate'),/tentacion-chocolate.webp$/);
  assert.match(visual('Agua Cielo Chupón'),/cielo-sport.webp$/);
  assert.equal(visual('Coca Cola',{imgUrl:'data:image/jpeg;base64,ABC'}),'data:image/jpeg;base64,ABC');
  assert.equal(visual('Coca Cola Zero'),'data:image/svg+xml;utf8,antiguo');
});
