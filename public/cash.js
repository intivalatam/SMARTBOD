export function cashPart(receipt){
  return (receipt.payments || [{method:receipt.payMethod,amount:receipt.total}])
    .filter(p=>p.method==='Efectivo').reduce((sum,p)=>sum+Math.round(p.amount*100),0)/100;
}
export function cashExpected(state,shift){
  const belongs=(id,date)=>id ? id===shift.id : (shift.register||'Principal')==='Principal' && date>=shift.date && (!shift.closedAt || date<=shift.closedAt);
  let cents=Math.round(shift.opening*100);
  for(const r of state.receipts||[]){
    if(belongs(r.cashSessionId,r.isoDate)&&(r.status!=='voided'||r.cashVoidSessionId))cents+=Math.round(cashPart(r)*100);
    if(r.cashVoidSessionId===shift.id && shift.id)cents-=Math.round(cashPart(r)*100);
    for(const refund of r.returns||[])if(refund.payMethod==='Efectivo'&&belongs(refund.cashSessionId,refund.date))cents-=Math.round(refund.amount*100);
  }
  for(const movement of shift.movements)cents+=(movement.direction==='in'?1:-1)*Math.round(movement.amount*100);
  return cents/100;
}
