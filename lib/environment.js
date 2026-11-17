export function databaseUrl(env=process.env){
 if(env.VERCEL_ENV==='preview'){
  if(!env.PREVIEW_DATABASE_URL||env.PREVIEW_DATABASE_URL===env.DATABASE_URL){
   throw Object.assign(new Error('Configura PREVIEW_DATABASE_URL con una base exclusiva de pruebas, distinta de DATABASE_URL.'),{status:503});
  }
  return env.PREVIEW_DATABASE_URL;
 }
 if(!env.DATABASE_URL)throw Object.assign(new Error('Falta conectar DATABASE_URL en Vercel'),{status:503});
 return env.DATABASE_URL;
}
