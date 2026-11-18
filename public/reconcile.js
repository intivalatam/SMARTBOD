import {cashExpected} from './cash.js';
export function byMethod(state,shift){
 const methods={Efectivo:cashExpected(state,shift),Yape:0,Plin:0,Tarjeta:0};
 for(const receipt of state.receipts||[]){
  for(const pay of receipt.payments||[{method:receipt.payMethod,amount:receipt.total}]){
   if(pay.method==='Efectivo'||!(pay.method in methods))continue;
   if(receipt.cashSessionId===shift.id&&(receipt.status!=='voided'||receipt.cashVoidSessionId))methods[pay.method]+=pay.amount;
   if(receipt.cashVoidSessionId===shift.id)methods[pay.method]-=pay.amount;
  }
  for(const ret of receipt.returns||[])if(ret.cashSessionId===shift.id&&ret.payMethod!=='Efectivo')methods[ret.payMethod]-=ret.amount;
 }
 for(const k of Object.keys(methods))methods[k]=Math.round(methods[k]*100)/100;
 return methods;
}
