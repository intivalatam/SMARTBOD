const collections=['items','receipts','kardex','events','savedReports','cashSessions','expenses','imports','operations'];
const key=(kind,p,index)=>String(p.id||p.requestId||p.ticketNum||`${kind}-${index}`);
export async function load(c,store){if(!store.data.entityStorage)return store.data;const data={...store.data};delete data.entityStorage;for(const k of collections)data[k]=[];const {rows}=await c.query('SELECT kind,payload FROM sb_entities ORDER BY kind,position');for(const r of rows)if(data[r.kind])data[r.kind].push(r.payload);return data;}
export async function persist(c,data,revision){const {rows}=await c.query('SELECT kind,id,position,payload FROM sb_entities');const previous=new Map(rows.map(r=>[r.kind+'|'+r.id,r])),present=new Set();for(const kind of collections)for(const [index,p] of (data[kind]||[]).entries()){const id=key(kind,p,index),k=kind+'|'+id,old=previous.get(k);if(present.has(k))throw Error('Duplicate entity');present.add(k);if(!old||old.position!==index||JSON.stringify(old.payload)!==JSON.stringify(p))await c.query('INSERT INTO sb_entities(kind,id,position,payload) VALUES($1,$2,$3,$4) ON CONFLICT(kind,id) DO UPDATE SET position=excluded.position,payload=excluded.payload',[kind,id,index,p]);}for(const [k,r] of previous)if(!present.has(k))await c.query('DELETE FROM sb_entities WHERE kind=$1 AND id=$2',[r.kind,r.id]);const meta={...data,entityStorage:true};for(const kind of collections)delete meta[kind];await c.query('UPDATE sb_store SET data=$1,revision=$2 WHERE id=1',[meta,revision]);}
export function diff(before,after){const changes=[];for(const p of after.items||[]){const old=before.items?.find(x=>x.id===p.id),fields={};for(const k of ['nombre','precio','unidadesCompradas','consumed','vendidos','inventoryValue','preparedStock','preparedValue','archived','ingredientes','consumables','inventoryKind','supplyUnit','minStock'])if(JSON.stringify(old?.[k])!==JSON.stringify(p[k]))fields[k]={before:old?.[k]??null,after:p[k]??null};if(Object.keys(fields).length)changes.push({productId:p.id,fields});}return changes;}

// For a cashier, stock and the requested ticket suffice. Historical journals stay in SQL.
export async function cashierState(client,store,requestId){
 const state={...store.data,items:[],events:[],receipts:[],kardex:[],savedReports:[],cashSessions:[]};
 delete state.entityStorage;
 const {rows}=await client.query("SELECT kind,payload FROM sb_entities WHERE kind IN ('items','events') OR (kind='cashSessions' AND payload->>'closedAt' IS NULL) OR (kind='receipts' AND id=$1) ORDER BY kind,position",[requestId||'']);
 for(const row of rows)state[row.kind].push(row.payload);
 return state;
}

export async function writeCashierSale(client,before,after,revision){
 const old=new Map(before.items.map(item=>[item.id,item]));
 for(const item of after.items){
   if(JSON.stringify(item)!==JSON.stringify(old.get(item.id)))await client.query("UPDATE sb_entities SET payload=$2 WHERE kind='items' AND id=$1",[item.id,item]);
 }
 for(const kind of ['receipts','kardex']){
   const entries=after[kind];
   const {rows:[{first}]}=await client.query('SELECT COALESCE(MIN(position),0) AS first FROM sb_entities WHERE kind=$1',[kind]);
   for(const [index,entry] of entries.entries())await client.query('INSERT INTO sb_entities(kind,id,position,payload) VALUES($1,$2,$3,$4)',[kind,key(kind,entry,index),first-entries.length+index,entry]);
 }
 await client.query('UPDATE sb_store SET revision=$1 WHERE id=1',[revision]);
}
