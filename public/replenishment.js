export function suggestion(item,movements,now=Date.now()){
 const cutoff=now-30*86400000;
 const rows=movements.filter(k=>(k.productId===item.id||k.sku===item.sku)&&Date.parse(k.date)>=cutoff);
 const consumed=rows.reduce((sum,k)=>sum+(['OUT','SUPPLY_USE','SUPPLY_AUTO','SUPPLY_WASTE','PROD_OUT','WASTE'].includes(k.type)?Number(k.qty)||0:['VOID','RETURN','SUPPLY_RETURN'].includes(k.type)?-Number(k.qty)||0:0),0);
 const daily=Math.max(0,consumed)/30,plan=item.reorder||{leadDays:1,pending:0,pack:item.supplyUnit==='paquete'?1:item.packContents||1};
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima'}).format(new Date(now));
 const expired=(item.purchaseLots||[]).filter(l=>l.expiry<day).reduce((sum,l)=>sum+l.qty,0);
 const stock=Math.max(0,item.unidadesCompradas-item.vendidos-item.consumed-expired);
 const required=Math.max(0,daily*plan.leadDays+(item.minStock||0)-stock-plan.pending);
 return {daily,stock,...plan,packs:Math.ceil(required/plan.pack),lastCount:item.lastCount||null};
}
