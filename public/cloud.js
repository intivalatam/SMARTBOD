window.Cloud={
 async api(action,data={}){
  const response=await fetch('/api/index',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Smartbod':'1'},body:JSON.stringify({action,...data})});
  let body;try{body=await response.json();}catch{throw Error('El servidor no está disponible. Verifica el despliegue.');}
  if(!response.ok)throw Object.assign(Error(body.error||'Error de conexión'),{status:response.status});return body;
 },
 async start(){
  const $=id=>document.getElementById(id);$('auth-heading').textContent='Accede a SMARTBOD';
  try{return await this.api('state');}catch(e){if(e.status!==401)$('auth-status').textContent=e.message;}
  return await new Promise(resolve=>{$('auth-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await this.api('login',{username:$('auth-user').value,password:$('auth-password').value});const boot=await this.api('state');$('auth-form').onsubmit=null;$('auth-password').value='';resolve(boot);}catch(err){$('auth-status').textContent=err.message;}finally{button.disabled=false;}};});
 }
};
