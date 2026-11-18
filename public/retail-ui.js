import {suggestion} from './replenishment.js';
function install(){
 const app=window.Smartbod;if(!app||document.getElementById('retail-tools')||!(app.user().role==='seller'||['purchase','catalog','cash','adjust'].some(app.can)))return;
 const dialog=document.createElement('dialog');dialog.id='retail-tools';
 dialog.innerHTML='<div class="tool-heading"><h2>Operaciones de market</h2><button type="button" class="btn ghost" id="retail-close">Cerrar</button></div><label>Operación<select id="retail-mode"></select></label><form><div class="supply-form-grid"></div><p class="help-note" id="retail-summary"></p><button class="btn" type="submit">Guardar</button></form><p role="status"></p><div id="fiscal-docs"></div>';
 document.body.append(dialog);
 const button=document.createElement('button');button.type='button';button.className='btn ghost';button.textContent='Operaciones de market';document.querySelector('.header-actions').append(button);button.hidden=app.user().role==='seller';
 let ownSale=null;
 const form=dialog.querySelector('form'),fields=form.querySelector('.supply-form-grid'),mode=dialog.querySelector('#retail-mode'),summary=dialog.querySelector('#retail-summary'),status=dialog.querySelector('[role=status]'),docs=dialog.querySelector('#fiscal-docs');
 const actions=[['retailSettings','Presentaciones, códigos y balanza','catalog'],['lotDiscard','Lotes y retiros','adjust'],['reorderPlan','Reposición sugerida','purchase'],['retailCount','Conteo físico','adjust'],['fiscal','Comprobantes electrónicos','cash']];
 for(const [key,label,scope] of actions)if(app.can(scope)||(key==='fiscal'&&app.user().role==='seller'))mode.add(new Option(label,key));
 function field(key,label,type,value='',options){
  const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement(options?'select':'input');input.name=key;
  if(options)for(const [v,t] of options)input.add(new Option(t,v));else{input.type=type;if(type==='number')input.step='any';}
  if(value!=='')input.value=value;wrap.append(input);fields.append(wrap);return input;
 }
 const select=(key,label,options,value='')=>field(key,label,'',value,options);
 function draw(selected){
  fields.replaceChildren();docs.replaceChildren();status.textContent='';summary.textContent='';
  form.querySelector('button').disabled=false;
  const state=app.state(),k=mode.value;
  if(k==='fiscal'){
   const sales=ownSale?[ownSale]:(state.receipts||[]);
   const ticket=select('ticket','Venta',sales.map(r=>[r.ticketNum,r.date+' · '+r.client+' · '+app.money(r.total)]),selected);
   const sale=sales.find(r=>r.ticketNum===ticket.value);
   if(!sale){summary.textContent='Sin ventas disponibles';form.querySelector('button').disabled=true;return;}
   ticket.onchange=()=>draw(ticket.value);
   select('kind','Documento',[['2','Boleta'],['1','Factura'],...(app.can('cash')?[['3','Nota de crédito']]:[])]);
   field('document','DNI o RUC del cliente','text');field('name','Nombre o razón social','text',sale.client);field('address','Dirección fiscal','text');
   select('refund','Para nota de crédito',[['','Anulación completa'],...(sale.returns||[]).map(x=>[x.id,x.reason+' · '+app.money(x.amount)])]);
   summary.textContent='Operaciones gravadas en soles. Guardar reserva el correlativo. Revisa los datos antes de enviar.';
   const lookup=ticket.value;
   Cloud.api('fiscalList',{ticket:lookup}).then(r=>{if(mode.value==='fiscal'&&form.elements.ticket?.value===lookup)showDocs(r.documents);}).catch(e=>status.textContent=e.message);
   return;
  }
  const products=state.items.filter(p=>!p.archived&&p.tipo==='producto'&&(k==='reorderPlan'||k==='retailCount'||p.inventoryKind!=='consumable'));
  const id=select('id','Producto',products.map(i=>[i.id,i.nombre+' · '+i.sku]),selected);
  id.onchange=()=>draw(id.value);const p=products.find(i=>i.id===id.value);
  if(!p){summary.textContent='Sin productos disponibles';form.querySelector('button').disabled=true;return;}
  if(k==='retailSettings'){
   select('unit','Unidad de venta',[['unidad','Unidad'],['kg','Kilogramo'],['L','Litro']],p.saleUnit||'unidad');
   select('step','Precisión en kg o litros',[['0.001','1 g / ml'],['0.01','10 g / ml'],['0.1','100 g / ml'],['1','Unidad entera']],String(p.scaleStep||0.001));
   field('code','Código de barras de la presentación','text');field('name','Nombre de presentación','text');field('units','Unidades base por presentación','number',1);field('price','Precio de la presentación (S/)','number');
   summary.textContent='El precio base del catálogo se aplica por unidad, kg o litro. '+(p.presentations||[]).map(v=>v.code+' · '+v.name+' × '+v.units+' · '+app.money(v.price)).join(' / ');
  }else if(k==='lotDiscard'){
   const lots=(p.purchaseLots||[]).filter(l=>l.qty>0).sort((a,b)=>a.expiry.localeCompare(b.expiry));
   select('lotId','Lote · vencimiento · proveedor · saldo',lots.map(l=>[l.id,[l.label,l.expiry,l.supplier,l.qty].join(' · ')]));
   field('qty','Cantidad a retirar','number');field('reason','Motivo del retiro','text');
   summary.textContent=lots.length?'Al vender se descuenta primero el lote vigente más próximo a vencer.':'Registra lote y vencimiento en Reponer producto.';
   form.querySelector('button').disabled=!lots.length;
  }else if(k==='retailCount'){
   const available=p.unidadesCompradas-p.vendidos-p.consumed;
   field('expected','Saldo del sistema','number',available).readOnly=true;field('qty','Saldo contado en unidad de control','number');field('reason','Responsable o motivo','text');
   summary.textContent='Último conteo: '+(p.lastCount?new Date(p.lastCount).toLocaleString('es-PE'):'Sin registro');
  }else{
   const rec=suggestion(p,state.kardex||[]);field('leadDays','Plazo del proveedor (días)','number',rec.leadDays);field('pending','Unidades pendientes de recibir','number',rec.pending);field('pack','Unidades de control por paquete de compra','number',rec.pack);
   const preview=()=>{const reorder=Object.fromEntries([...fields.querySelectorAll('input')].map(i=>[i.name,Number(i.value)]));const r=suggestion({...p,reorder},state.kardex||[]);summary.textContent='Promedio diario (30 días): '+r.daily.toFixed(2)+' · Saldo: '+r.stock+' · Compra sugerida: '+(Number.isFinite(r.packs)?r.packs:'—')+' paquetes';};
   fields.querySelectorAll('input').forEach(i=>i.oninput=preview);preview();
  }
 }
 function showDocs(list){
  docs.replaceChildren();for(const d of list){
   const row=document.createElement('p');row.textContent=d.document+' · '+d.status+' '+d.detail+' ';
   if(d.status!=='Aceptado')for(const [label,consult] of [['Consultar',true],['Enviar',false]]){
    const b=document.createElement('button');b.type='button';b.className='btn ghost small';b.textContent=label;
    b.onclick=async()=>{if(!consult&&!confirm('Enviar '+d.document+' al proveedor de facturación configurado?'))return;b.disabled=true;try{await Cloud.api('fiscalSend',{ticket:d.ticket,key:d.key,consult});draw(form.elements.ticket.value);}catch(e){status.textContent=e.message;}finally{b.disabled=false;}};row.append(b);
   }
   for(const [label,url] of Object.entries(d.links||{})){
    if(!String(url).startsWith('https://'))continue;
    const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label+' ';row.append(a);
   }docs.append(row);
  }
 }
 form.onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(form));const submit=form.querySelector('button');submit.disabled=true;
 try{if(mode.value==='fiscal'){await Cloud.api('fiscalReserve',data);draw(data.ticket);}
 else if(await app.run({...data,kind:mode.value})){draw(data.id);status.textContent='Guardado';}}
 catch(error){status.textContent=error.message;}finally{submit.disabled=false;}};
 window.addEventListener('smartbod-fiscal',e=>{
  ownSale=e.detail;mode.value='fiscal';draw(ownSale.ticketNum);dialog.showModal();
 });
 mode.onchange=()=>draw();button.onclick=()=>{ownSale=null;draw();dialog.showModal();};dialog.querySelector('#retail-close').onclick=()=>dialog.close();
}
window.addEventListener('smartbod-ready',install);install();
