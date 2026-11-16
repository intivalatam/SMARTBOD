(() => {
  const button=document.getElementById('install-app'),dialog=document.getElementById('install-help');let promptEvent=null;
  const installed=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const refresh=()=>{button.hidden=installed();document.getElementById('connection-status').textContent=navigator.onLine?'Con conexión · Las operaciones se confirman en la nube':'Sin conexión · Las ventas quedan pendientes, sin ticket, hasta confirmarse en el servidor.';document.getElementById('connection-status').classList.toggle('offline',!navigator.onLine);};
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;button.textContent='Instalar SMARTBOD';});
  window.addEventListener('appinstalled',()=>{promptEvent=null;refresh();});
  window.addEventListener('online',refresh);window.addEventListener('offline',refresh);
  button.addEventListener('click',async()=>{if(promptEvent){const event=promptEvent;promptEvent=null;try{await event.prompt();await event.userChoice;}catch{dialog.showModal();}}else dialog.showModal();});
  document.getElementById('install-help-close').onclick=()=>dialog.close();
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{});
  refresh();
})();
