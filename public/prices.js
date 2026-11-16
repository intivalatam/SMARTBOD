/* Shared calculations: prices are per physical inventory unit, net of purchase discount. */
globalThis.PriceAnalytics={
 rows(items,{productId='all',from='',to=''}={}){
  return items.filter(p=>productId==='all'||p.id===productId).flatMap(p=>(p.priceHistory||[]).map(h=>({...h,productId:p.id,currentName:p.nombre}))).filter(h=>{const d=new Date(h.date);if(!Number.isFinite(d.getTime()))return false;const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);return(!from||day>=from)&&(!to||day<=to);}).sort((a,b)=>a.date.localeCompare(b.date));
 },
 change(previous,current){return Number.isFinite(previous)&&previous>0&&Number.isFinite(current)?(current/previous-1)*100:null;},
 summary(rows){
  const buys=rows.filter(h=>h.unitCost!=null&&h.qty>0),first=buys[0],last=buys.at(-1),qty=buys.reduce((n,h)=>n+h.qty,0),total=buys.reduce((n,h)=>n+h.total,0),costs=buys.map(h=>h.unitCost);
  return {purchases:buys.length,qty,total,weightedCost:qty?total/qty:null,min:costs.length?Math.min(...costs):null,max:costs.length?Math.max(...costs):null,lastCost:last?.unitCost??null,lastSale:rows.at(-1)?.salePrice??null,purchaseChange:buys.length>1?this.change(first.unitCost,last.unitCost):null,saleChange:rows.length>1?this.change(rows[0].salePrice,rows.at(-1).salePrice):null};
 }
};
