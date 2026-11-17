import {readFile} from 'node:fs/promises';

const tables=['sb_store','sb_users','sb_entities','sb_images','sb_backups','sb_audit'];
const sequences=['sb_backups','sb_audit'];

export async function captureDatabase(client){
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{
    const rows={};
    for(const table of tables){
      const result=await client.query('SELECT row_to_json(t)::text AS record FROM '+table+' t');
      rows[table]=result.rows.map(r=>JSON.parse(r.record));
    }
    await client.query('COMMIT');
    return {format:'smartbod-database-1',createdAt:new Date().toISOString(),tables:rows};
  }catch(error){await client.query('ROLLBACK');throw error;}
}

export async function restoreDatabase(client,backup){
  if(backup?.format!=='smartbod-database-1'||!tables.every(t=>Array.isArray(backup.tables?.[t]))||backup.tables.sb_store.length!==1)
    throw Error('Respaldo integral inválido');
  await client.query('BEGIN');
  try{
    const existing=await client.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND left(tablename,3)='sb_'");
    if(existing.rows.length)throw Error('El destino debe ser una base nueva sin tablas SMARTBOD');
    const schema=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
    for(const sql of schema.split(';').filter(s=>s.trim()))await client.query(sql);
    await client.query('DELETE FROM sb_store');
    for(const table of tables){
      const rows=backup.tables[table];
      for(let offset=0;offset<rows.length;offset+=100){
        await client.query('INSERT INTO '+table+' SELECT * FROM json_populate_recordset(NULL::'+table+',$1::json)',[JSON.stringify(rows.slice(offset,offset+100))]);
      }
    }
    for(const table of sequences)await client.query("SELECT setval(pg_get_serial_sequence('"+table+"','id'),COALESCE(MAX(id),1),COUNT(*)>0) FROM "+table);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
}
