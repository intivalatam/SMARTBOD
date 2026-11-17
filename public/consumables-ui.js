export function installConsumables(app){
 const $=id=>document.getElementById(id),qty=p=>Math.max(0,p.unidadesCompradas-p.vendidos-p.consumed),cost=p=>qty(p)>1e-9?p.inventoryValue/qty(p):Number(p.lastPurchaseCost||0),fmt=n=>Number(Number(n).toFixed(4));
 const nav=document.createElement('button');nav.type='button';nav.className='tab';nav.dataset.tab='supplies';nav.setAttribute('role','tab');nav.setAttribute('aria-selected','false');nav.textContent='Empaques y consumibles';nav.hidden=app.user().role!=='admin';document.querySelector('.tabs').append(nav);
 const view=document.createElement('section');view.id='v-supplies';view.className='view';view.hidden=true;view.innerHTML=`<div class="panel"><h2>Empaques y consumibles</h2><div class="supply-toolbar"><input type="search" id="material-search" aria-label="Buscar por material o SKU" placeholder="Buscar material o SKU"><label><input type="checkbox" id="material-low"> Solo por reponer</label><button class="btn" id="material-new">+ Registrar material</button></div><p id="supply-summary" class="help-note"></p><div class="clean-table-container"><table class="clean-table"><thead><tr><th>Material / SKU</th><th>Contenido del paquete</th><th>Existencias</th><th>Mínimo</th><th>Costo promedio</th><th>Valor disponible</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="supply-stock"></tbody></table></div></div>
 <div class="panel"><h3>Registrar movimiento</h3><button id="supply-refresh" class="btn ghost" type="button">Actualizar saldos y formulario</button><label>¿Qué necesitas hacer?<select id="supply-mode"><option value="supplyCreate">Registrar un consumible</option><option value="supplyPurchase">Comprar / reponer</option><option value="supplyUse">Registrar uso o conteo</option><option value="supplyAssign">Asignar a un preparado</option><option value="supplySettings">Editar material y presentación</option></select></label><form id="supply-form"><div id="supply-fields" class="supply-form-grid"></div><p id="supply-help" class="help-note"></p><div id="supply-links"></div><button id="supply-submit" class="btn" type="submit">Guardar</button><p id="supply-status" role="status" aria-live="polite"></p></form></div>
 <div class="panel"><h3>Compras y consumo del periodo</h3><div class="report-controls"><label>Desde<input id="supply-from" type="date"></label><label>Hasta<input id="supply-to" type="date"></label><button class="btn ghost" id="supply-export">Descargar CSV</button></div><p id="supply-period-summary" class="help-note"></p><p>El costo del descuento automático ya está incluido en el costo de la venta. El uso manual y las diferencias de conteo se incluyen por separado en el resultado operativo. Las compras aumentan las existencias.</p><div class="clean-table-container"><table class="clean-table"><thead><tr><th>Fecha</th><th>Material</th><th>Movimiento</th><th>Entrada / salida</th><th>Valor S/</th><th>Responsable</th><th>Detalle</th></tr></thead><tbody id="supply-history"></tbody></table></div></div>`;
 document.querySelector('.workspace-main').insertBefore(view,document.querySelector('.workspace-footer'));
 let expectedStock=0,expectedLinks='[]',busy=false;
 const materials=()=>app.state().items.filter(p=>p.inventoryKind==='consumable'&&!p.archived);
 const scope=k=>({supplyCreate:'catalog',supplySettings:'catalog',supplyAssign:'catalog',supplyPurchase:'purchase',supplyUse:'adjust'})[k];
 function field(name,label,type='text',options){const l=document.createElement('label');l.textContent=label;const i=document.createElement(options?'select':'input');i.name=name;i.id='supply-field-'+name;if(options)for(const [v,t] of options)i.add(new Option(t,v));else{i.type=type;i.required=true;if(type==='number'){i.min='0';i.step='any';}}l.append(i);$('supply-fields').append(l);return i;}
 function packField(){
  const input=field('packContents','Contenido de un paquete (piezas o pares)','number');
  input.min='1';input.step='1';input.required=false;input.placeholder='Ej. 100';
  return input;
 }
 function chosen(){return materials().find(p=>p.id===$('supply-field-id')?.value);}
 function form(){
  const k=$('supply-mode').value;$('supply-fields').replaceChildren();$('supply-links').replaceChildren();$('supply-status').textContent='';$('supply-submit').disabled=!app.can(scope(k));
  if(k==='supplyCreate'){field('name','Nombre del material');field('sku','SKU (opcional)').required=false;field('unit','Unidad de control','text',[['unidad','Unidad'],['paquete','Paquete (admite fracciones)'],['par','Par']]);const size=packField();const unit=$('supply-field-unit');unit.onchange=()=>{size.required=unit.value==='paquete';};unit.onchange();field('minStock','Mínimo para alertar','number').value=5;$('supply-help').textContent='Ejemplo: para bolsas, registra 100 piezas por paquete. Al reponer, el saldo se calcula en la unidad de control elegida.';return;}
  if(k==='supplyAssign'){
   const recipes=app.state().items.filter(p=>p.tipo==='elaborado'&&!p.archived);const recipe=field('id','Producto preparado','text',recipes.map(p=>[p.id,p.nombre]));field('supplyId','Consumible','text',materials().map(p=>[p.id,p.nombre+' · '+p.supplyUnit]));field('qty','Cantidad por cada unidad vendida','number').min='0.000001';
   const links=()=>{const p=recipes.find(p=>p.id===recipe.value);expectedLinks=JSON.stringify(p?.consumables||[]);$('supply-links').replaceChildren();for(const a of p?.consumables||[]){const row=document.createElement('p');row.textContent=(app.state().items.find(x=>x.id===a.id)?.nombre||a.id)+' · '+fmt(a.qty)+' por venta ';const b=document.createElement('button');b.type='button';b.className='btn ghost small';b.textContent='Quitar asignación';b.disabled=!app.can('catalog');b.onclick=()=>submit({kind:k,id:p.id,expectedLinks,links:p.consumables.filter(x=>x.id!==a.id)});row.append(b);$('supply-links').append(row);}};recipe.onchange=links;links();$('supply-help').textContent='Opcional: se descuenta de las existencias al vender este preparado y se suma al costo, no al precio cobrado. Guardar actualiza la cantidad si el material ya está asignado. No repitas ese descuento en el uso manual. Quitar afecta solo ventas futuras.';return;
  }
  const selected=field('id','Consumible','text',materials().map(p=>[p.id,p.nombre+' · '+p.supplyUnit]));
  if(k==='supplyPurchase'){field('qty','Cantidad de paquetes o envases comprados','number').min='0.000001';field('perPack','Unidades de control por paquete o envase','number').value=1;field('total','Costo total de la compra (S/)','number');field('supplier','Proveedor (opcional)').required=false;field('document','Documento (opcional)').required=false;}
  if(k==='supplyUse'){field('mode','Tipo de registro','text',[['use','Uso adicional del turno'],['waste','Desperdicio'],['count','Conteo físico: cantidad que queda']]);field('entryUnit','Registrar cantidad en','text',[['control','Unidad de control'],['piece','Piezas sueltas']]);field('qty','Cantidad utilizada o saldo contado','number');field('reason','Motivo / turno / referencia');field('estimated','Medición','text',[['false','Conteo exacto'],['true','Estimado']]);field('eventId','Origen','text',[['','Local / uso general'],...(app.state().events||[]).map(e=>[e.id,e.name])]);field('unitCost','Costo unitario para sobrante si no había stock (S/)','number').value=0;}
  if(k==='supplySettings'){field('name','Nombre');packField();field('minStock','Mínimo para alertar','number');}
  const update=()=>{const p=chosen();expectedStock=p?qty(p):0;if(k==='supplySettings'&&p){$('supply-field-name').value=p.nombre;$('supply-field-packContents').value=p.packContents??'';$('supply-field-packContents').required=p.supplyUnit==='paquete';$('supply-field-minStock').value=p.minStock;}$('supply-help').textContent=p?'Disponible: '+fmt(expectedStock)+' '+p.supplyUnit+' · Costo promedio: '+app.money(cost(p))+(k==='supplyUse'?'. El saldo ya incluye descuentos de ventas. Registra solo uso adicional, o elige Conteo físico para ingresar cuánto queda. Actualiza si hubo movimientos mientras contabas.':k==='supplyPurchase'?'. El costo nuevo se promedia con el valor de lo que queda. No se exige precio de venta.':''):'Registra primero un consumible.';};const preview=()=>{
   const p=chosen();if(!p)return;
   let quantity=Number($('supply-field-qty')?.value||0);if($('supply-field-entryUnit')?.value==='piece'&&p.supplyUnit==='paquete')quantity/=p.packContents;
   if(k==='supplyPurchase'){
    const units=quantity*Number($('supply-field-perPack').value);
    $('supply-help').textContent='Ingreso: '+fmt(units)+' '+p.supplyUnit+' · Saldo: '+fmt(expectedStock)+' → '+fmt(expectedStock+units)+' '+p.supplyUnit+(p.supplyUnit==='paquete'&&p.packContents?' · '+fmt((expectedStock+units)*p.packContents)+' piezas en total':'');
   }
   if(k==='supplyUse'){
    const after=$('supply-field-mode').value==='count'?quantity:expectedStock-quantity;
    $('supply-help').textContent='Saldo: '+fmt(expectedStock)+' → '+fmt(after)+' '+p.supplyUnit+(after<0?' · Supera las existencias disponibles':'');
   }
  };
  selected.onchange=()=>{update();const material=chosen();
  if(k==='supplyPurchase'){
   const factor=$('supply-field-perPack');factor.value=material?.supplyUnit==='paquete'?1:(material?.packContents||material?.lastPackSize||1);
   factor.readOnly=material?.supplyUnit==='paquete';factor.parentNode.hidden=factor.readOnly;
  }if(k==='supplyUse'){const unit=$('supply-field-entryUnit');unit.value='control';unit.parentNode.hidden=!(material?.supplyUnit==='paquete'&&material.packContents);}
  preview();};selected.onchange();$('supply-fields').oninput=preview;
 }
 const labels={SUPPLY_BUY:'Compra',SUPPLY_USE:'Uso manual',SUPPLY_WASTE:'Desperdicio',SUPPLY_COUNT_OUT:'Diferencia de conteo (-)',SUPPLY_COUNT_IN:'Diferencia de conteo (+)',SUPPLY_AUTO:'Descuento por venta',SUPPLY_RETURN:'Devolución / anulación'};
 function movements(){const from=$('supply-from').value,to=$('supply-to').value;return (app.state().kardex||[]).filter(k=>labels[k.type]).filter(k=>{const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date(k.date));return (!from||day>=from)&&(!to||day<=to);});}
 function cells(body,values){const tr=document.createElement('tr');for(const v of values){const td=document.createElement('td');td.textContent=v;tr.append(td);}body.append(tr);return tr;}
 function history(){const list=movements(),sum=t=>list.filter(k=>k.type===t).reduce((a,k)=>a+Number(k.amount||0),0);$('supply-history').replaceChildren();for(const k of list)cells($('supply-history'),[new Date(k.date).toLocaleString('es-PE',{timeZone:'America/Lima'}),k.name,labels[k.type]+(k.estimated?' (estimado)':''),(k.delta>0?'+':'')+fmt(k.delta)+' '+k.unit,app.money(k.amount),k.operator||'—',k.detail||'']);$('supply-period-summary').textContent='Compras: '+app.money(sum('SUPPLY_BUY'))+' · Uso manual y ajustes netos: '+app.money(list.reduce((a,k)=>a+Number(k.expense||0),0))+' · Automático por ventas: '+app.money(sum('SUPPLY_AUTO'))+' · Recuperado: '+app.money(sum('SUPPLY_RETURN'))+(list.length?'':' · Sin movimientos');}
 function render(){const all=materials(),low=all.filter(p=>qty(p)<=p.minStock);nav.textContent='Empaques y consumibles'+(low.length?' ('+low.length+' alertas)':'');$('supply-stock').replaceChildren();const query=$('material-search').value.trim().toLocaleLowerCase();
 const visible=($('material-low').checked?low:all).filter(p=>(p.nombre+' '+p.sku).toLocaleLowerCase().includes(query));
 for(const p of visible){
  const lowStock=qty(p)<=p.minStock;
  const row=cells($('supply-stock'),[p.nombre+' / '+p.sku,p.packContents?fmt(p.packContents)+(p.supplyUnit==='par'?' pares':' piezas'):'Por definir',fmt(qty(p))+' '+p.supplyUnit+(p.supplyUnit==='paquete'&&p.packContents?' · '+fmt(qty(p)*p.packContents)+' piezas':''),fmt(p.minStock),app.money(cost(p)),app.money(p.inventoryValue),lowStock?'Reponer':'Disponible']);
  ['Material / SKU','Contenido del paquete','Existencias','Mínimo','Costo promedio','Valor disponible','Estado'].forEach((label,index)=>row.cells[index].dataset.label=label);
  row.cells[6].className=lowStock?'stock-low':'stock-ok';
  const actions=row.insertCell(),group=document.createElement('div');group.className='material-actions';actions.append(group);
  for(const [label,kind,permission] of [['Reponer','supplyPurchase','purchase'],['Descontar','supplyUse','adjust'],['Editar','supplySettings','catalog'],['Eliminar','supplyRemove','catalog']]){
   if(!app.can(permission))continue;
   const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label',label+' '+p.nombre);group.append(button);
   button.onclick=()=>{
    if(kind!=='supplyRemove')return openForm(kind,p.id);
    if(confirm('¿Retirar '+p.nombre+'? Si tiene movimientos se archivará con su historial.'))submit({kind,id:p.id});
   };
  }
 }
 if(!visible.length){const row=cells($('supply-stock'),[query?'Ningún material coincide con la búsqueda.':'Aún no hay materiales registrados.']);row.cells[0].colSpan=8;}
 $('supply-summary').textContent=all.length+' materiales · '+low.length+' por reponer · Valor disponible: '+app.money(all.reduce((a,p)=>a+p.inventoryValue,0));history();}
 function openForm(kind,id){
  $('supply-mode').value=kind;form();
  const selector=$('supply-field-id');
  if(id&&selector){selector.value=id;selector.onchange();}
  const input=$('supply-field-qty')||$('supply-field-name');
  input?.focus();
 }
 $('material-search').oninput=render;$('material-low').onchange=render;
 $('material-new').hidden=!app.can('catalog');
 $('material-new').onclick=()=>openForm('supplyCreate');
 async function submit(r){if(busy)return;busy=true;$('supply-submit').disabled=true;try{if(await app.run(r)){render();form();$('supply-status').textContent='Registrado. Existencias y costos actualizados.';}else $('supply-status').textContent='No se confirmó. Revisa el aviso antes de reintentar.';}finally{busy=false;$('supply-submit').disabled=!app.can(scope($('supply-mode').value));}}
 $('supply-form').onsubmit=e=>{e.preventDefault();const r=Object.fromEntries(new FormData(e.target));r.kind=$('supply-mode').value;if(r.kind==='supplyUse'){r.expectedStock=expectedStock;r.estimated=r.estimated==='true';}if(r.kind==='supplyAssign'){r.expectedLinks=expectedLinks;const links=JSON.parse(expectedLinks).filter(a=>a.id!==r.supplyId);links.push({id:r.supplyId,qty:Number(r.qty)});r.links=links;delete r.supplyId;delete r.qty;}submit(r);};
 nav.addEventListener('click',()=>{render();for(const o of $('supply-mode').options)o.disabled=!app.can(scope(o.value));const first=[...$('supply-mode').options].find(o=>!o.disabled);if(first)$('supply-mode').value=first.value;form();});$('supply-mode').onchange=form;$('supply-refresh').onclick=async()=>{if(busy)return;try{app.apply(await Cloud.api('state'));render();form();$('supply-status').textContent='Saldos actualizados. Ingresa el uso o conteo nuevamente.';}catch(e){$('supply-status').textContent=e.message;}};$('supply-from').onchange=history;$('supply-to').onchange=history;
 $('supply-export').onclick=()=>{const rows=[['Fecha','Material','Movimiento','Cantidad','Unidad','Valor','Responsable','Detalle'],...movements().map(k=>[k.date,k.name,labels[k.type],k.delta,k.unit,k.amount,k.operator,k.detail])];const csv='\ufeff'+rows.map(row=>row.map(v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='consumibles.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 app.openLowSupplies=()=>{nav.click();$('material-search').value='';$('material-low').checked=true;render();};app.openSupplyPurchase=id=>{nav.click();openForm('supplyPurchase',id);};app.refreshSupplies=render;app.openSupplies=()=>nav.click();render();form();
}
