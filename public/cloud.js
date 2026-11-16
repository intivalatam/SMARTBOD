window.Cloud={
 async api(action,data={}){
  if(!navigator.onLine)throw Error('Sin conexión. Activa Wi-Fi o datos móviles antes de guardar.');
  let response;try{response=await fetch('/api/index',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Smartbod':'1'},body:JSON.stringify({action,...data})});}catch{throw Error('No se pudo confirmar la respuesta. Revisa la conexión y reintenta la misma operación sin cambiar los datos.');}
  let body;try{body=await response.json();}catch{throw Error('El servidor no está disponible. Verifica el despliegue.');}
  if(!response.ok)throw Object.assign(Error(body.error||'Error de conexión'),{status:response.status});return body;
 },
 async start(){
  const $=id=>document.getElementById(id);$('auth-heading').textContent='Bienvenido a SMARTBOD';
  $('auth-toggle').onclick=()=>{const visible=$('auth-password').type==='password';$('auth-password').type=visible?'text':'password';$('auth-toggle').textContent=visible?'Ocultar':'Ver';$('auth-toggle').setAttribute('aria-pressed',String(visible));$('auth-toggle').setAttribute('aria-label',visible?'Ocultar contraseña':'Mostrar contraseña');};
  try{return await this.api('state');}catch(e){if(e.status!==401)$('auth-status').textContent=e.message;}
  return await new Promise(resolve=>{$('auth-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await this.api('login',{username:$('auth-user').value,password:$('auth-password').value});const boot=await this.api('state');$('auth-form').onsubmit=null;$('auth-password').value='';resolve(boot);}catch(err){$('auth-status').textContent=err.message;}finally{button.disabled=false;}};});
 }
};
