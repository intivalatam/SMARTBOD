import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {randomUUID} from 'node:crypto';
import {empty} from '../lib/domain.js';
import {operate} from '../lib/operations.js';

test('apertura rápida desde caja muestra un solo importe y conserva el responsable en el servidor', async()=>{
 const dom=new JSDOM('<!doctype html><html><body><div class="header-actions"></div></body></html>',{url:'https://smartbod.test'});
 const previous={window:global.window,document:global.document,Option:global.Option,Cloud:global.Cloud};
 global.window=dom.window;global.document=dom.window.document;global.Option=dom.window.Option;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const admin={id:'a',role:'admin',name:'Administrador'};
 let state=empty(),requests=[];
 dom.window.Smartbod={
   user:()=>admin,
   can:scope=>['cash','adjust','returns','expenses','catalog','users','restore'].includes(scope),
   state:()=>state,
   money:n=>'S/ '+Number(n).toFixed(2),
   run:async request=>{requests.push(request);state=operate(state,{...request,requestId:randomUUID()},admin);return true;}
 };
 try{
   await import('../public/operations-ui.js?cashquick='+randomUUID());
   const button=dom.window.document.querySelector('.header-actions button');
   assert.equal(button.textContent,'Caja y gestión');
   button.click();
   const panel=dom.window.document.getElementById('cash-quick-panel');
   assert.equal(panel.hidden,false);
   const form=dom.window.document.getElementById('cash-quick-form');
   assert.equal(form.hidden,false);
   const cash=dom.window.document.getElementById('cash-quick-amount');
   assert.equal(cash.value,'0.00');
   form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal(requests.length,1);
   assert.equal(requests[0].kind,'cashOpen');
   assert.equal(requests[0].register,'Principal');
   assert.equal(requests[0].amount,0);
   assert.equal(state.cashSessions.length,1);
   assert.equal(state.cashSessions[0].operator,'Administrador');
   assert.equal(state.cashSessions[0].opening,0);
   assert.equal(form.hidden,true);
   assert.match(dom.window.document.getElementById('cash-quick-description').textContent,/Turno activo/);
   form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
   assert.equal(requests.length,1);
 }finally{
   dom.window.close();
   for(const [key,value] of Object.entries(previous)){if(value===undefined)delete global[key];else global[key]=value;}
 }
});

test('la caja rápida rechaza importes negativos y más de dos decimales',async()=>{
 const html=new JSDOM('<!doctype html><html><body><div class="header-actions"></div></body></html>',{url:'https://smartbod.test'});
 const previous={window:global.window,document:global.document,Option:global.Option};
 global.window=html.window;global.document=html.window.document;global.Option=html.window.Option;
 html.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 let called=0;
 html.window.Smartbod={user:()=>({role:'admin'}),can:()=>true,state:()=>({cashSessions:[],items:[],receipts:[],operations:[],expenses:[],events:[]}),money:n=>'S/ '+n,run:async()=>{called++;return true;}};
 try{
  await import('../public/operations-ui.js?cashquick='+randomUUID());
  const form=html.window.document.getElementById('cash-quick-form');
  const amount=html.window.document.getElementById('cash-quick-amount');
  for(const invalid of ['-2','0.001','']){amount.value=invalid;form.dispatchEvent(new html.window.Event('submit',{bubbles:true,cancelable:true}));}
  assert.equal(called,0);
 }finally{
  html.window.close();for(const [key,value] of Object.entries(previous)){if(value===undefined)delete global[key];else global[key]=value;}
 }
});
