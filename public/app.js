(async function () {
  const {purchaseCost,quantityLabel,content,ingredient,recipeNeeds,sellable}=await import("/inventory-math.js");
  const boot=await Cloud.start();
  let cloudRevision=boot.revision;
  const memory=new Map();
  const LS_KEY = "smartbod-items-v2";
  const KARDEX_KEY = "smartbod-kardex-v2";
  const NEG_KEY = "smartbod-negocio-v2";
  const NEG_TEL_KEY = "smartbod-negocio-tel-v2";
  const THEME_KEY = "smartbod-theme-v2";

  function lsGet(key,fallback){return memory.has(key)?memory.get(key):fallback;}
  function lsSet(key,value){memory.set(key,value);}
  function hydrate(state){
    lsSet('smartbod-events-v1',JSON.stringify(state.events||[]));
    lsSet(LS_KEY,JSON.stringify(state.items));lsSet(KARDEX_KEY,JSON.stringify(state.kardex));
    lsSet(NEG_KEY,state.negocio||'SMARTBOD');lsSet(NEG_TEL_KEY,state.telefono||'');
    lsSet('smartbod-receipts-v1',JSON.stringify(state.receipts||[]));lsSet('smartbod-saved-reports-v1',JSON.stringify(state.savedReports||[]));
  }
  let extraState=boot.state;
  hydrate(boot.state);
  // Generate crisp SVG thumbnail Data URI (zero external placeholder dependencies)
  function svgThumb(label, bgHex, fgHex, iconEmoji) {
    const clean = String(label || "Item").slice(0, 14);
    const emoji = iconEmoji || "📦";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">
      <rect width="160" height="120" rx="14" fill="${bgHex || '#ecfdf5'}"/>
      <circle cx="80" cy="46" r="26" fill="${fgHex || '#059669'}" fill-opacity="0.14"/>
      <text x="80" y="55" font-size="26" text-anchor="middle" font-family="sans-serif">${emoji}</text>
      <text x="80" y="98" font-size="12" font-weight="700" fill="${fgHex || '#065f46'}" text-anchor="middle" font-family="Inter, sans-serif">${clean}</text>
    </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  function getCategoryVisual(cat, nombre) {
    const map = {
      "Abarrotes": { bg: "#fef3c7", fg: "#b45309", icon: "🌾" },
      "Bebidas": { bg: "#dbeafe", fg: "#1d4ed8", icon: "🥤" },
      "Limpieza": { bg: "#e0e7ff", fg: "#4338ca", icon: "🧼" },
      "Insumos": { bg: "#fce7f3", fg: "#be185d", icon: "🥖" },
      "Snacks": { bg: "#ffedd5", fg: "#c2410c", icon: "🍪" },
      "Elaborado": { bg: "#d1fae5", fg: "#047857", icon: "🍔" }
    };
    const v = map[cat] || { bg: "#ecfdf5", fg: "#059669", icon: "📦" };
    return svgThumb(nombre, v.bg, v.fg, v.icon);
  }

  // Match complete names so another flavor, brand or size keeps its own image.
  const photoNames = new Map();
  function photoKey(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  for (const [file, names] of Object.entries({
    cielo: ['Agua Cielo'], 'cielo-sport': ['Agua Cielo Chupón', 'Agua Cielo Sport'],
    'cielo-25': ['Agua Cielo Sin Gas 2.5L'], 'coca-cola': ['Coca Cola'],
    'coca-cola-225': ['Coca Cola Original 2.25L'], 'inca-kola': ['Inca Kola', 'Inka Cola', 'Inka Kola'],
    'inca-kola-15': ['Inca Kola Sabor Original 1.5L'], 'gatorade-rojo': ['Gatorade Rojo'],
    'gatorade-azul': ['Gatorade Azul'], 'casino-fresa': ['Galleta Casino Fresa', 'Casino Fresa'],
    'casino-alfajor': ['Galleta Casino Alfajor', 'Casino Alfajor'],
    'tentacion-vainilla': ['Galleta Tentación Vainilla', 'Tentación Vainilla'],
    'tentacion-chocolate': ['Galleta Tentación Chocolate', 'Tentación Chocolate'],
    ritz: ['Galleta Ritz', 'Ritz'], margarita: ['Galleta Margarita'],
    'pan-hamburguesa': ['Pan Hamburguesa', 'Pan de Hamburguesa (Unid.)'],
    'carne-hamburguesa': ['Carne de hamburguesa', 'Carne de Hamburguesa Res (Unid.)'],
    mayonesa: ['Mayonesa'], ketchup: ['Ketchup'], 'papas-al-hilo': ['Papas al hilo'],
    primor: ['Aceite Primor'], hielo: ['Hielo'], tari: ['Ají Tarí'], 'san-luis': ['Agua San Luis'],
    'pan-hotdog': ['Pan Hotdog', 'Pan Hot Dog', 'Pan de Hotdog (Unid.)'],
    'maiz-popcorn': ['Maíz popcorn', 'Maíz pop corn'], popcorn: ['Popcorn', 'Pop corn'],
    'gelatina-fresa': ['Gelatina de Fresa'], 'gelatina-vaso': ['Gelatina en vaso'],
    hamburguesa: ['Hamburguesas de Carne', 'Hamburguesa de Carne']
  })) {
    for (const name of names) photoNames.set(photoKey(name), file);
  }
  function productVisual(item) {
    const stored = item.imgUrl || '';
    if (stored && !stored.startsWith('data:image/svg+xml;utf8,') && !stored.includes('placehold.co')) return stored;
    const name = photoKey(item.nombre);
    const prepared = item.tipo === 'elaborado' || ['elaborado','especialidad'].includes(photoKey(item.cat));
    const file = ['hotdog','hot dog'].includes(name) ? (prepared ? 'hotdog' : 'salchicha') : photoNames.get(name);
    return file ? '/assets/productos/' + file + '.webp' : stored && !stored.includes('placehold.co') ? stored : getCategoryVisual(item.cat,item.nombre);
  }

  // ==================== CATÁLOGO MAESTRO ====================
  const masterCatalog = [
    { sku: 'ABA-001', nombre: 'Aceite Primor Premium 1L', cat: 'Abarrotes', icon: '🫒', precioSug: 11.50, costoSug: 8.80 },
    { sku: 'ABA-002', nombre: 'Aceite Sao Vegetal 1L', cat: 'Abarrotes', icon: '🫒', precioSug: 10.00, costoSug: 7.60 },
    { sku: 'ABA-003', nombre: 'Arroz Costeño Extra 1kg', cat: 'Abarrotes', icon: '🍚', precioSug: 5.80, costoSug: 4.30 },
    { sku: 'ABA-004', nombre: 'Azúcar Rubia Cartavio 1kg', cat: 'Abarrotes', icon: '🧂', precioSug: 4.50, costoSug: 3.40 },
    { sku: 'ABA-005', nombre: 'Leche Gloria Azul 400g', cat: 'Abarrotes', icon: '🥛', precioSug: 4.80, costoSug: 3.80 },
    { sku: 'ABA-006', nombre: 'Fideos Nicolini Spaghetti 500g', cat: 'Abarrotes', icon: '🍝', precioSug: 3.20, costoSug: 2.30 },
    { sku: 'ABA-007', nombre: 'Atún Florida Filete 170g', cat: 'Abarrotes', icon: '🐟', precioSug: 6.50, costoSug: 4.90 },
    { sku: 'LIM-001', nombre: 'Detergente Ace Floral 800g', cat: 'Limpieza', icon: '🧼', precioSug: 9.50, costoSug: 7.20 },
    { sku: 'LIM-002', nombre: 'Detergente Ariel Concentrado 800g', cat: 'Limpieza', icon: '🫧', precioSug: 11.00, costoSug: 8.50 },
    { sku: 'LIM-003', nombre: 'Lejía Clorox Tradicional 1L', cat: 'Limpieza', icon: '🧴', precioSug: 4.00, costoSug: 2.80 },
    { sku: 'BEB-001', nombre: 'Agua San Mateo S/G 2.5L', cat: 'Bebidas', icon: '💧', precioSug: 4.50, costoSug: 3.00 },
    { sku: 'BEB-002', nombre: 'Agua Cielo Sin Gas 2.5L', cat: 'Bebidas', icon: '💧', precioSug: 3.50, costoSug: 2.20 },
    { sku: 'BEB-003', nombre: 'Coca Cola Original 2.25L', cat: 'Bebidas', icon: '🥤', precioSug: 10.50, costoSug: 8.00 },
    { sku: 'BEB-004', nombre: 'Inca Kola Sabor Original 1.5L', cat: 'Bebidas', icon: '💛', precioSug: 7.50, costoSug: 5.50 },
    { sku: 'INS-001', nombre: 'Pan de Hamburguesa (Unid.)', cat: 'Insumos', icon: '🍔', precioSug: 1.00, costoSug: 0.50 },
    { sku: 'INS-002', nombre: 'Pan de Hotdog (Unid.)', cat: 'Insumos', icon: '🌭', precioSug: 0.80, costoSug: 0.40 },
    { sku: 'INS-003', nombre: 'Pan Francés Fresco (Unid.)', cat: 'Insumos', icon: '🥖', precioSug: 0.40, costoSug: 0.25 },
    { sku: 'INS-004', nombre: 'Carne de Hamburguesa Res (Unid.)', cat: 'Insumos', icon: '🥩', precioSug: 3.50, costoSug: 2.00 },
    { sku: 'INS-005', nombre: 'Filete de Pollo Empanizado (Unid.)', cat: 'Insumos', icon: '🍗', precioSug: 3.50, costoSug: 1.90 },
    { sku: 'INS-006', nombre: 'Chorizo Parrillero Artesanal (Unid.)', cat: 'Insumos', icon: '🌭', precioSug: 3.00, costoSug: 1.60 },
    { sku: 'INS-007', nombre: 'Hotdog Ahumado Premium (Unid.)', cat: 'Insumos', icon: '🌭', precioSug: 2.00, costoSug: 1.00 },
    { sku: 'INS-009', nombre: 'Queso Edam Tajada (Unid.)', cat: 'Insumos', icon: '🧀', precioSug: 1.20, costoSug: 0.65 }
  ].map(item => ({
    ...item,
    imgUrl: svgThumb(item.nombre.split(' ').slice(0, 2).join(' '),
      item.cat === 'Bebidas' ? '#dbeafe' : item.cat === 'Limpieza' ? '#e0e7ff' : item.cat === 'Insumos' ? '#fce7f3' : '#fef3c7',
      item.cat === 'Bebidas' ? '#1d4ed8' : item.cat === 'Limpieza' ? '#4338ca' : item.cat === 'Insumos' ? '#be185d' : '#b45309',
      item.icon)
  }));

  // Default Demo Inventory if storage is empty
  function getInitialDemoData() {
    const pPan = { id: 'demo-pan-hamb', tipo: 'producto', sku: 'INS-001', cat: 'Insumos', nombre: 'Pan de Hamburguesa (Unid.)', imgUrl: masterCatalog.find(x => x.sku === 'INS-001').imgUrl, unidadesCompradas: 40, costoTotal: 20.00, precio: 1.00, vendidos: 4, minStock: 10 };
    const pCarne = { id: 'demo-carne-res', tipo: 'producto', sku: 'INS-004', cat: 'Insumos', nombre: 'Carne de Hamburguesa Res (Unid.)', imgUrl: masterCatalog.find(x => x.sku === 'INS-004').imgUrl, unidadesCompradas: 30, costoTotal: 60.00, precio: 3.50, vendidos: 2, minStock: 8 };
    const pQueso = { id: 'demo-queso-edam', tipo: 'producto', sku: 'INS-009', cat: 'Insumos', nombre: 'Queso Edam Tajada (Unid.)', imgUrl: masterCatalog.find(x => x.sku === 'INS-009').imgUrl, unidadesCompradas: 30, costoTotal: 19.50, precio: 1.20, vendidos: 2, minStock: 8 };
    const pAceite = { id: 'demo-aceite', tipo: 'producto', sku: 'ABA-001', cat: 'Abarrotes', nombre: 'Aceite Primor Premium 1L', imgUrl: masterCatalog.find(x => x.sku === 'ABA-001').imgUrl, unidadesCompradas: 15, costoTotal: 132.00, precio: 11.50, vendidos: 6, minStock: 4 };
    const pArroz = { id: 'demo-arroz', tipo: 'producto', sku: 'ABA-003', cat: 'Abarrotes', nombre: 'Arroz Costeño Extra 1kg', imgUrl: masterCatalog.find(x => x.sku === 'ABA-003').imgUrl, unidadesCompradas: 25, costoTotal: 107.50, precio: 5.80, vendidos: 11, minStock: 6 };
    const pCoca = { id: 'demo-coca', tipo: 'producto', sku: 'BEB-003', cat: 'Bebidas', nombre: 'Coca Cola Original 2.25L', imgUrl: masterCatalog.find(x => x.sku === 'BEB-003').imgUrl, unidadesCompradas: 18, costoTotal: 144.00, precio: 10.50, vendidos: 15, minStock: 5 };
    const pInca = { id: 'demo-inca', tipo: 'producto', sku: 'BEB-004', cat: 'Bebidas', nombre: 'Inca Kola Sabor Original 1.5L', imgUrl: masterCatalog.find(x => x.sku === 'BEB-004').imgUrl, unidadesCompradas: 20, costoTotal: 110.00, precio: 7.50, vendidos: 8, minStock: 5 };
    const pBurger = {
      id: 'demo-elab-cheeseburger',
      tipo: 'elaborado',
      sku: 'ELAB-101',
      cat: 'Elaborado',
      nombre: 'Hamburguesa Clásica con Queso',
      imgUrl: svgThumb('Cheese Burger', '#d1fae5', '#047857', '🍔'),
      precio: 9.50,
      vendidos: 8,
      ingredientes: [
        { id: 'i1', idInsumo: 'demo-pan-hamb', cantidad: 1 },
        { id: 'i2', idInsumo: 'demo-carne-res', cantidad: 1 },
        { id: 'i3', idInsumo: 'demo-queso-edam', cantidad: 1 }
      ]
    };
    return [pPan, pCarne, pQueso, pAceite, pArroz, pCoca, pInca, pBurger];
  }

  function getInitialDemoKardex() {
    const now = Date.now();
    return [
      { id: 'k1', date: new Date(now - 3600000 * 5).toISOString(), sku: 'ABA-001', name: 'Aceite Primor Premium 1L', type: 'IN', qty: 15, detail: 'Compra inicial proveedor', payMethod: '-' },
      { id: 'k2', date: new Date(now - 3600000 * 3).toISOString(), sku: 'ELAB-101', name: 'Hamburguesa Clásica con Queso', type: 'OUT', qty: 4, detail: 'Venta POS (Yape)', payMethod: 'Yape', amount: 38.00 },
      { id: 'k3', date: new Date(now - 3600000 * 2).toISOString(), sku: 'BEB-003', name: 'Coca Cola Original 2.25L', type: 'OUT', qty: 5, detail: 'Venta POS (Efectivo)', payMethod: 'Efectivo', amount: 52.50 },
      { id: 'k4', date: new Date(now - 3600000 * 1).toISOString(), sku: 'ABA-003', name: 'Arroz Costeño Extra 1kg', type: 'OUT', qty: 6, detail: 'Venta POS (Plin)', payMethod: 'Plin', amount: 34.80 }
    ];
  }

  let items=boot.state.items, kardex=boot.state.kardex;
  // Ensure all items have valid SVG thumb (replace legacy placehold.co if present)
  items.forEach(item => {
    if (!item.cat) item.cat = item.tipo === 'elaborado' ? 'Elaborado' : 'Abarrotes';
    if (!item.imgUrl || item.imgUrl.includes('placehold.co')) {
      item.imgUrl = getCategoryVisual(item.cat, item.nombre);
    }
  });

  let cart = [];
  let neg = lsGet(NEG_KEY, "SMARTBOD");
  let negTel = lsGet(NEG_TEL_KEY, "");
  let currentTheme = lsGet(THEME_KEY, "light");
  let selectedMasterItem = null;
  let tempIngredients = [];
  let activeInvCat = "ALL";
  let activePosCat = "ALL";
  let selectedPayMethod = "Efectivo";
  let lastReceiptData = null;
  let confirmCallback = null;

  let chartGanancias = null, chartStock = null, chartCategorias = null, chartPagos = null;

  // Apply theme
  document.documentElement.setAttribute("data-theme", currentTheme);

  // ==================== UTILS ====================
  const uuid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const num = v => isFinite(parseFloat(v)) ? parseFloat(v) : 0;
  const money = n => "S/ " + num(n).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function showToast(title, msg, type = 'info') {
    const cont = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<div style="font-weight:700;font-size:13.5px;">${esc(title)}</div><div style="font-size:12.5px;color:var(--muted);margin-top:2px;">${esc(msg)}</div>`;
    cont.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(40px)';
      t.style.transition = 'all 0.25s ease';
      setTimeout(() => t.remove(), 260);
    }, 3200);
  }

  function askConfirm(title, message, onYes) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = message;
    confirmCallback = onYes;
    document.getElementById('modal-confirm').hidden = false;
  }

  document.getElementById('btn-confirm-no').addEventListener('click', () => {
    document.getElementById('modal-confirm').hidden = true;
    confirmCallback = null;
  });
  document.getElementById('btn-confirm-yes').addEventListener('click', () => {
    document.getElementById('modal-confirm').hidden = true;
    if (typeof confirmCallback === 'function') confirmCallback();
    confirmCallback = null;
  });

  let saving=false;
  function captureState(){return {...extraState,items,kardex,events:JSON.parse(lsGet('smartbod-events-v1','[]')),receipts:JSON.parse(lsGet('smartbod-receipts-v1','[]')),savedReports:JSON.parse(lsGet('smartbod-saved-reports-v1','[]')),negocio:neg,telefono:negTel};}
  function applyCloud(result){extraState=result.state;cloudRevision=result.revision;hydrate(result.state);items=result.state.items;kardex=result.state.kardex;neg=result.state.negocio;negTel=result.state.telefono;currentPolicy=result.policy;activeUser=result.user;renderApp();accountUI();renderEvents();if(typeof window!=='undefined')window.Smartbod?.refreshSupplies?.();}
  async function save(options={}){
    if(saving)throw Error('Espera a que termine el guardado');
    saving=true;document.getElementById('app').inert=true;document.getElementById('cloud-status').textContent='Guardando en la nube…';
    try{const result=await Cloud.api('save',{revision:cloudRevision,state:options.restore===true?captureState():{items,negocio:neg,telefono:negTel,savedReports:JSON.parse(lsGet('smartbod-saved-reports-v1','[]'))},restore:options.restore===true});applyCloud(result);document.getElementById('cloud-status').textContent='Guardado en la nube';return true;}
    catch(e){document.getElementById('cloud-status').textContent='No guardado: '+e.message;showToast('No se confirmó el guardado',e.message+' Los cambios siguen en pantalla. Si otro usuario modificó datos, exporta antes de actualizar.','error');return false;}
    finally{saving=false;document.getElementById('app').inert=false;}
  }
  // ==================== CORE CALCULATIONS ====================
  function getConsumoElaborados() {
    const uso = {};
    items.forEach(p => { if(p.consumed) uso[p.id] = num(p.consumed); });
    items.filter(p => p.tipo === "elaborado" && !p.frozenConsumption).forEach(p => {
      (p.ingredientes || []).forEach(ing => {
        if (ing.idInsumo) {
          uso[ing.idInsumo] = (uso[ing.idInsumo] || 0) + (num(ing.cantidad) * num(p.vendidos));
        }
      });
    });
    return uso;
  }

  function calcMaxPortions(elabItem, usoGlobal) {
    const ings = elabItem.ingredientes || [];
    if (ings.length === 0) return 0;
    let minPortions = Infinity;
    ings.forEach(ing => {
      const ins = items.find(x => x.id === ing.idInsumo);
      const req = num(ing.cantidad);
      if (!ins || req <= 0) {
        minPortions = 0;
      } else {
        const consumido = (usoGlobal && usoGlobal[ins.id]) ? usoGlobal[ins.id] : 0;
        const disp = Math.max(0, num(ins.unidadesCompradas) - (num(ins.vendidos) + consumido));
        const possible = Math.floor(disp / req);
        if (!ins.deductOnSale && possible < minPortions) minPortions = possible;
      }
    });
    return isFinite(minPortions) ? minPortions*Math.max(1,num(document.getElementById('el-yield').value)) : 0;
  }

  function calc(p, usoGlobal) {
    if(p.historyRevenue != null) {
      const legacy = calcLegacy(p, usoGlobal);
      legacy.ingreso = num(p.historyRevenue); legacy.ganancia = num(p.historyRevenue)-num(p.historyCost);
      return legacy;
    }
    return calcLegacy(p, usoGlobal);
  }
  function calcLegacy(p, usoGlobal) {
    const vend = num(p.vendidos);
    const precio = num(p.precio);
    if (p.tipo === "elaborado") {
      let costoReceta = 0;
      (p.ingredientes || []).forEach(ing => {
        const insumo = items.find(x => x.id === ing.idInsumo);
        if (insumo) {
          const cuIns = purchaseCost(insumo);
          costoReceta += cuIns * ingredient(insumo,ing,p.recipeYield||1).cantidad;
        }
      });
      costoReceta/=Math.max(1,num(p.recipeYield)||1);
      const maxPortions = num(p.preparedStock);
      if(maxPortions>0)costoReceta=num(p.preparedValue)/maxPortions+(p.ingredientes||[]).reduce((sum,ing)=>{const ins=items.find(x=>x.id===ing.idInsumo);return sum+(ins&&ingredient(ins,ing,p.recipeYield||1).deductAtSale?purchaseCost(ins)*ingredient(ins,ing,p.recipeYield||1).cantidad/(p.recipeYield||1):0);},0);
      costoReceta+=(p.consumables||[]).reduce((sum,a)=>{const ins=items.find(x=>x.id===a.id);return sum+(ins?purchaseCost(ins)*a.qty:0);},0);
      const margenPct = precio > 0 ? ((precio - costoReceta) / precio) * 100 : 0;
      return {
        cu: costoReceta,
        stock: maxPortions,
        total: vend,
        ingreso: precio * vend,
        ganancia: (precio - costoReceta) * vend,
        inversion: 0,
        valorStock: num(p.preparedValue),
        margenPct,
        estado: maxPortions<=0?"Agotado":(maxPortions<=(num(p.minStock)||5)?"Stock bajo":"Ok")
      };
    }

    const uCompradas = num(p.unidadesCompradas);
    const cTotal = num(p.costoTotal);
    const cu = purchaseCost(p);
    const consumido = (usoGlobal && usoGlobal[p.id]) ? usoGlobal[p.id] : 0;
    const stock = Math.max(0, uCompradas - (vend + consumido));
    const minAlert = p.minStock==null?5:num(p.minStock);
    const estado = stock <= 0 ? "Agotado" : (stock <= minAlert ? "Stock bajo" : "Ok");
    const margenPct = precio > 0 ? ((precio - cu) / precio) * 100 : 0;

    return {
      cu,
      stock,
      total: uCompradas,
      ingreso: precio * vend,
      ganancia: (precio - cu) * vend,
      inversion: cTotal,
      valorStock: stock * cu,
      margenPct,
      estado
    };
  }

  // Freeze legacy totals once; past transactions cannot be reconstructed from legacy aggregates.
  const initialUse = getConsumoElaborados();
  items.forEach(p => {
    const c = calc(p, initialUse);
    if(p.historyRevenue == null) {p.historyRevenue=c.ingreso; p.historyCost=c.ingreso-c.ganancia;}
    if(p.tipo !== 'elaborado') p.consumed=num(initialUse[p.id]);
  });
  items.filter(p=>p.tipo==='elaborado').forEach(p=>p.frozenConsumption=true);

  function logMovement(product, type, qty, detail, payMethod = '-', amount = 0) {
    kardex.unshift({
      id: uuid(),
      date: new Date().toISOString(),
      sku: product.sku || '-',
      name: product.nombre,
      type,
      qty,
      detail,
      payMethod,
      amount
    });
    lsSet(KARDEX_KEY, JSON.stringify(kardex));
  }

  // ==================== HEADER & THEME EVENTS ====================
  document.getElementById('btn-theme-toggle').addEventListener('click', () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    lsSet(THEME_KEY, currentTheme);
    renderStats(getConsumoElaborados());
  });

  document.getElementById('chip-low-stock').addEventListener('click', () => {
    switchTab('inv');
    document.getElementById('inv-status-filter').value = 'Stock bajo';
    renderApp();
  });

  // ==================== AUTOCOMPLETE (ABASTECER STOCK) ====================
  const acInput = document.getElementById('ac-input');
  const acList = document.getElementById('ac-list');
  const formStock = document.getElementById('stock-form');

  function getCombinedCatalog() {
    const combined = [...masterCatalog];
    items.filter(i => i.tipo !== 'elaborado'&&i.inventoryKind!=='consumable').forEach(invItem => {
      if (!combined.some(m => m.sku === invItem.sku)) {
        combined.push({
          sku: invItem.sku,
          nombre: invItem.nombre,
          cat: invItem.cat || 'Abarrotes',
          imgUrl: invItem.imgUrl,
          precioSug: invItem.precio,
          costoSug: num(invItem.unidadesCompradas) > 0 ? (num(invItem.costoTotal) / num(invItem.unidadesCompradas)) : 0
        });
      }
    });
    return combined;
  }

  function showAutocompleteMatches(query) {
    const val = (query || '').toLowerCase().trim();
    acList.innerHTML = '';
    const catalog = getCombinedCatalog();
    const matches = val
      ? catalog.filter(p => p.nombre.toLowerCase().includes(val) || p.sku.toLowerCase().includes(val) || p.cat.toLowerCase().includes(val))
      : catalog.slice(0, 8);

    if (matches.length > 0) {
      acList.hidden = false;
      matches.forEach(match => {
        const exist = items.find(i => i.sku === match.sku);
        const div = document.createElement('div');
        div.className = 'ac-item';
        div.innerHTML = `
          <div class="ac-item-left">
            <img src="${esc(productVisual(match))}" alt="${esc(match.nombre)}">
            <div class="ac-item-info">
              <span class="ac-item-name">${esc(match.nombre)}</span>
              <span class="ac-item-cat">${match.cat} · ${match.sku}</span>
            </div>
          </div>
          <span class="badge ${exist ? 'stock-ok' : 'insumo'}">${exist ? 'En almacén' : 'Catálogo'}</span>
        `;
        div.addEventListener('click', () => selectStockItem(match));
        acList.appendChild(div);
      });
    } else {
      acList.hidden = true;
    }
  }

  function selectStockItem(match) {
    selectedMasterItem = match;
    acInput.value = match.nombre;
    acList.hidden = true;
    document.getElementById('sf-img').src = productVisual(match);
    document.getElementById('sf-name').textContent = match.nombre;
    document.getElementById('sf-sku').textContent = `${match.cat} · ${match.sku}`;

    const exist = items.find(i => i.sku === match.sku);
    document.getElementById('sf-qty').value = 10;
    const unitCost = exist && num(exist.unidadesCompradas) > 0
      ? (num(exist.costoTotal) / num(exist.unidadesCompradas))
      : (match.costoSug || 2.5);
    document.getElementById('sf-cost').value = (unitCost * 10).toFixed(2);
    document.getElementById('sf-price').value = exist ? exist.precio : (match.precioSug || 4.00);
    updateStockFormMarginPreview();
    formStock.style.display = 'flex';
  }

  function updateStockFormMarginPreview() {
    const qty = Math.max(1, num(document.getElementById('sf-qty').value));
    const cost = num(document.getElementById('sf-cost').value);
    const price = num(document.getElementById('sf-price').value);
    const cu = cost / qty;
    const util = price - cu;
    document.getElementById('sf-preview-margin').innerHTML =
      `Costo unitario: <b>${money(cu)}</b> · Ganancia por unidad: <b style="color:${util >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(util)}</b>`;
  }

  ['sf-qty', 'sf-cost', 'sf-price'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateStockFormMarginPreview);
  });

  acInput.addEventListener('input', function () {
    showAutocompleteMatches(this.value);
  });
  acInput.addEventListener('focus', function () {
    showAutocompleteMatches(this.value);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-container')) {
      acList.hidden = true;
    }
  });

  document.getElementById('btn-cancel-stock').addEventListener('click', () => {
    formStock.style.display = 'none';
    acInput.value = '';
    selectedMasterItem = null;
  });

  document.getElementById('btn-save-stock').addEventListener('click', async () => {
    if (!selectedMasterItem) return;
    const qty = num(document.getElementById('sf-qty').value);
    const cost = num(document.getElementById('sf-cost').value);
    const price = num(document.getElementById('sf-price').value);

    if (qty <= 0 || cost < 0 || price <= 0) {
      return showToast("Datos incompletos", "Ingresa una cantidad y precio mayores a cero.", "error");
    }

    const exist = items.find(i => i.sku === selectedMasterItem.sku);
    if(exist){try{applyCloud(await Cloud.api('restock',{restock:{id:exist.id,packages:1,units:qty,cost,discount:0,price,requestId:crypto.randomUUID()}}));document.getElementById('btn-cancel-stock').click();showToast('Compra guardada','Stock actualizado.');}catch(e){showToast('No se guardó',e.message,'error');}return;
    } else {
      const newItem = {
        id: uuid(),
        tipo: 'producto',
        sku: selectedMasterItem.sku,
        cat: selectedMasterItem.cat || 'Abarrotes',
        nombre: selectedMasterItem.nombre,
        imgUrl: selectedMasterItem.imgUrl,
        unidadesCompradas: qty,
        costoTotal: cost,
        precio: price,
        vendidos: 0,
        minStock: 5
      };
      items.push(newItem);
      logMovement(newItem, 'IN', qty, `Stock inicial (${money(cost)})`);
    }

    if(await save()){document.getElementById('btn-cancel-stock').click();showToast('Compra confirmada','Stock actualizado.');}
  });

  // ==================== CREAR ELABORADO (RECETAS EN VIVO) ====================
  function updateRecipeLivePreview(){const y=Number(document.getElementById('el-yield').value)||1,p={recipeYield:y,ingredientes:tempIngredients};let cost=0,max=Infinity;for(const [id,q] of Object.entries(recipeNeeds(items,p,1))){const ins=items.find(x=>x.id===id);cost+=purchaseCost(ins)*q;max=Math.min(max,Math.floor((calc(ins,getConsumoElaborados()).stock+1e-9)/q));}document.getElementById('recipe-live-cost').textContent='Costo por porción: '+money(cost);document.getElementById('el-util-val').textContent=money(Number(document.getElementById('el-price').value)-cost);document.getElementById('el-max-portions').textContent=Number.isFinite(max)?max:0;}
  document.getElementById('el-yield').addEventListener('input',updateRecipeLivePreview);
  document.getElementById('el-price').addEventListener('input', updateRecipeLivePreview);

  function renderIngredientsSelector() {
    const select = document.getElementById('el-insumo-select');
    const uso = getConsumoElaborados();
    select.innerHTML = '<option value="">Seleccionar insumo del inventario...</option>';
    items.filter(i => i.tipo !== 'elaborado'&&i.inventoryKind!=='consumable').forEach(i => {
      const c = calc(i, uso);
      select.innerHTML += `<option value="${esc(i.id)}">${esc(i.nombre)} (Stock: ${c.stock} · Costo: ${money(c.cu)})</option>`;
    });
  }

  function renderTempIngredients() {
    const list = document.getElementById('el-ingredients-list');
    list.innerHTML = '';
    if (tempIngredients.length === 0) {
      list.innerHTML = '<div class="empty-state" style="padding:10px;">Añade los insumos que componen este plato o combo.</div>';
      updateRecipeLivePreview();
      return;
    }
    tempIngredients.forEach((ing, idx) => {
      const insumo = items.find(i => i.id === ing.idInsumo);
      const normalized=insumo?ingredient(insumo,ing,Number(document.getElementById('el-yield').value)||1):ing;const cu=insumo?purchaseCost(insumo)*normalized.cantidad:0;
      const div = document.createElement('div');
      div.style.cssText = "display:flex; justify-content:space-between; align-items:center; background:var(--surface); padding:7px 10px; border-radius:6px; border:1px solid var(--line); font-size:12.5px;";
      div.innerHTML = `
        <span><b>${insumo?quantityLabel(insumo,normalized.cantidad):''} · ${normalized.consumeAt==='sale'?'Al servir':'Al preparar'}</b> ${insumo ? esc(insumo.nombre) : 'Desconocido'} <span style="color:var(--muted);">(${money(cu)})</span></span>
        <button type="button" class="btn danger small btn-rm-ing" data-idx="${idx}" style="padding:2px 7px;">✕</button>
      `;
      list.appendChild(div);
    });
    updateRecipeLivePreview();
  }

  document.getElementById('el-insumo-select').addEventListener('change',()=>{const p=items.find(x=>x.id===el('el-insumo-select').value);el('el-insumo-mode').value=p?.consumptionMode==='measure'?'dose':p?.portionsPerUnit?'coverage':'batch';el('el-insumo-qty').value=p?.consumptionMode==='measure'?p.doseAmount:p?.portionsPerUnit||1;});
  document.getElementById('btn-add-insumo').addEventListener('click',()=>{const ins=items.find(x=>x.id===el('el-insumo-select').value),v=Number(el('el-insumo-qty').value),mode=el('el-insumo-mode').value;if(!ins||!Number.isFinite(v)||v<=0)return showToast('Revisa ingrediente','Selecciona insumo y cantidad.','error');if(mode==='dose'&&ins.consumptionMode!=='measure')return showToast('Contenido pendiente','Registra gramos o ml del envase.','error');tempIngredients=tempIngredients.filter(x=>x.idInsumo!==ins.id);tempIngredients.push(ingredient(ins,{idInsumo:ins.id,measureMode:mode,cantidad:v,dose:v,servingsPerUnit:v,consumeAt:el('el-insumo-at').value},Number(el('el-yield').value)||1));renderTempIngredients();});
  document.getElementById('el-ingredients-list').addEventListener('click', e => {
    const btn = e.target.closest('.btn-rm-ing');
    if (btn) {
      tempIngredients.splice(Number(btn.dataset.idx), 1);
      renderTempIngredients();
    }
  });

  document.getElementById('btn-save-elab').addEventListener('click', async () => {
    const name = document.getElementById('el-name').value.trim();
    const price = num(document.getElementById('el-price').value);
    if (!name || price <= 0 || tempIngredients.length === 0) {
      return showToast("Datos incompletos", "Ingresa el nombre del plato, su precio de venta y al menos 1 insumo.", "error");
    }

    const newItem = {
      id: uuid(),
      tipo: 'elaborado',
      sku: 'ELAB-' + String(items.length + 101),
      cat: 'Elaborado',
      nombre: name,
      imgUrl: getCategoryVisual('Elaborado', name),
      precio: price,
      vendidos: 0,
      recipeYield: Math.max(1,num(document.getElementById('el-yield').value)), preparedStock:0,preparedValue:0,frozenConsumption:true,
      ingredientes: [...tempIngredients]
    };
    items.push(newItem);
    logMovement(newItem, 'IN', 1, 'Creación de receta elaborada');

    if(!await save())return;showToast('Receta guardada','Ahora puedes preparar porciones.');
    document.getElementById('el-name').value = '';
    document.getElementById('el-price').value = '';
    tempIngredients = [];
    renderTempIngredients();
  });

  // ==================== MODAL: PRODUCTO PROPIO / EDITAR ====================
  const modalProduct = document.getElementById('modal-product');

  let productImage='',imageLoading=false;
  function openProductModal(editItem = null) {
    productImage=editItem?.imgUrl||'';document.getElementById('mp-image-preview').src=editItem ? productVisual(editItem) : getCategoryVisual('Abarrotes','Producto');document.getElementById('mp-image-file').value='';document.getElementById('mp-image-status').textContent='';
    document.getElementById('mp-id').value = editItem ? editItem.id : '';
    document.getElementById('modal-prod-title').textContent = editItem ? `✏️ Editar: ${editItem.nombre}` : '➕ Nuevo Producto Personalizado';
    document.getElementById('mp-name').value = editItem ? editItem.nombre : '';
    document.getElementById('mp-sku').value = editItem ? editItem.sku : 'SKU-' + Math.floor(100 + Math.random() * 899);
    document.getElementById('mp-cat').value = editItem && editItem.cat ? editItem.cat : 'Abarrotes';
    document.getElementById('mp-min-stock').value = editItem && editItem.minStock ? editItem.minStock : 5;

    document.getElementById('mp-consumption').hidden=editItem?.tipo==='elaborado';
    document.getElementById('mp-presentation').value=editItem?.presentation||'';document.getElementById('mp-content').value=editItem?.contentDescription||'';document.getElementById('mp-detail').value=editItem?.productDetail||'';document.getElementById('mp-deduct-sale').checked=!!editItem?.deductOnSale;document.getElementById('mp-portions').value=editItem?.portionsPerUnit||'';
    document.getElementById('mp-consumption-mode').value=editItem?.consumptionMode||(editItem?.deductOnSale?'portions':'');document.getElementById('mp-content-amount').value=editItem?.contentAmount||'';document.getElementById('mp-content-unit').value=editItem?.contentUnit||'kg';document.getElementById('mp-dose-amount').value=editItem?.doseAmount||'';
    document.getElementById('mp-recipe').hidden=editItem?.tipo!=='elaborado';
    document.getElementById('mp-cat').disabled=editItem?.tipo==='elaborado';
    if(![...document.getElementById('mp-cat').options].some(o=>o.value==='Elaborado'))document.getElementById('mp-cat').add(new Option('Elaborado','Elaborado'));
    if(editItem?.tipo==='elaborado'){
      document.getElementById('mp-cat').value='Elaborado';
      document.getElementById('mp-yield').value=editItem.recipeYield||1;document.getElementById('mp-recipe-price').value=editItem.precio;document.getElementById('mp-price').value=editItem.precio;document.getElementById('mp-ready').textContent='Porciones listas para vender: '+num(editItem.preparedStock);
      const list=document.getElementById('mp-ingredients');list.replaceChildren();
      (editItem.ingredientes||[]).forEach((ing,index)=>{
        const row=document.createElement('div');row.className='ingredient-setting';const name=document.createElement('strong');name.textContent=items.find(x=>x.id===ing.idInsumo)?.nombre||'Insumo';row.append(name);
        const mode=document.createElement('select');mode.dataset.ingredientMode=index;mode.add(new Option('Cantidad para toda la receta','batch'));mode.add(new Option('Un envase rinde X porciones','coverage'));mode.add(new Option('Gramos/ml por porción','dose'));mode.value=ing.measureMode||'batch';mode.setAttribute('aria-label','Forma de medir '+name.textContent);row.append(mode);
        const label=document.createElement('label');const text=document.createElement('span');const input=document.createElement('input');input.type='number';input.min='0.000001';input.step='any';input.value=ing.measureMode==='dose'?ing.dose:ing.measureMode==='coverage'?ing.servingsPerUnit:ing.cantidad;input.dataset.ingredientIndex=index;
        const update=()=>{text.textContent=mode.value==='coverage'?'Porciones por envase':mode.value==='dose'?'Gramos/ml por porción':'Unidades/envases para receta';checkPreparation();};mode.onchange=update;input.oninput=()=>checkPreparation();text.textContent=mode.value==='coverage'?'Porciones por envase':mode.value==='dose'?'Gramos/ml por porción':'Unidades/envases para receta';const source=items.find(x=>x.id===ing.idInsumo);const at=document.createElement('select');at.dataset.ingredientAt=index;at.add(new Option('Al preparar','prepare'));at.add(new Option('Al servir','sale'));at.value=ing.consumeAt||(source?.deductOnSale?'sale':'prepare');at.onchange=checkPreparation;at.setAttribute('aria-label','Momento de consumo');row.append(at);label.append(text,input);row.append(label);const fiscal=document.createElement('button');fiscal.className='btn ghost small';fiscal.textContent='Comprobante';
        fiscal.onclick=()=>{el('ticket-history').close();window.dispatchEvent(new CustomEvent('smartbod-fiscal',{detail:{ticketNum:r.ticket,date:r.date,total:r.total,client:'',returns:[]}}));};
        row.append(fiscal);list.append(row);
      });
      checkPreparation();
    }
    const stockFields = document.getElementById('mp-stock-fields');
    if (editItem && editItem.tipo === 'elaborado') {
      stockFields.style.display = 'none';
    } else {
      stockFields.style.display = 'grid';
      document.getElementById('mp-qty').value = editItem ? num(editItem.unidadesCompradas) : 12;
      document.getElementById('mp-cost').value = editItem ? num(editItem.costoTotal) : 36.00;
      document.getElementById('mp-price').value = editItem ? num(editItem.precio) : 4.50;
    }
    document.getElementById('mp-qty').disabled=!!editItem;document.getElementById('mp-cost').disabled=!!editItem;updateConsumptionPreview();
    modalProduct.hidden = false;
  }

  function consumptionDetails(){
    const mode=document.getElementById('mp-consumption-mode').value,unit=document.getElementById('mp-content-unit').value;
    const details={consumptionMode:mode,presentation:document.getElementById('mp-presentation').value.trim(),contentDescription:document.getElementById('mp-content').value.trim(),productDetail:document.getElementById('mp-detail').value.trim(),deductOnSale:mode==='portions'||mode==='measure',portionsPerUnit:num(document.getElementById('mp-portions').value),contentAmount:num(document.getElementById('mp-content-amount').value),contentUnit:unit,doseAmount:num(document.getElementById('mp-dose-amount').value),doseUnit:['g','kg'].includes(unit)?'g':'ml'};
    if(mode==='measure'){details.portionsPerUnit=details.doseAmount>0?details.contentAmount*(['kg','l'].includes(unit)?1000:1)/details.doseAmount:0;details.contentDescription=details.contentAmount+' '+unit;}
    return details;
  }
  function updateConsumptionPreview(){
    const d=consumptionDetails(),unitMode=d.consumptionMode==='unit',measured=d.consumptionMode==='measure';
    document.getElementById('mp-portions-label').hidden=unitMode||!d.consumptionMode;document.getElementById('mp-portions').disabled=measured;
    document.getElementById('mp-measure-fields').hidden=!measured;document.getElementById('mp-dose-unit').textContent=d.doseUnit+' por porción';document.getElementById('mp-deduct-sale').checked=d.deductOnSale;
    if(measured)document.getElementById('mp-portions').value=Number.isFinite(d.portionsPerUnit)&&d.portionsPerUnit>0?Number(d.portionsPerUnit.toFixed(6)):'';
    document.getElementById('mp-classification-hint').textContent='Cremas y bolsas grandes no equivalen a una hamburguesa. Indica su rendimiento real o la dosis por porción. No se asigna un rendimiento automático por el nombre.';
    const quantity=num(document.getElementById('mp-qty').value),cost=num(document.getElementById('mp-cost').value),perPack=quantity>0?cost/quantity:0;
    document.getElementById('mp-yield-preview').textContent=!d.consumptionMode?'Selecciona la clasificación antes de guardar.':unitMode?'Se usa la cantidad indicada en la receta al preparar. Venta directa: una unidad por unidad vendida.':d.portionsPerUnit>=1&&Number.isFinite(d.portionsPerUnit)?'1 envase = '+Number(d.portionsPerUnit.toFixed(4))+' porciones · Costo por porción: '+money(perPack/d.portionsPerUnit)+' · 24 ventas usan '+Number((24/d.portionsPerUnit).toFixed(4))+' envases (costo '+money(24*perPack/d.portionsPerUnit)+'). El momento de consumo se configura en cada receta.':'Completa un rendimiento válido. En peso/volumen, la dosis no puede superar el contenido del envase.';
  }
  ['mp-consumption-mode','mp-portions','mp-content-amount','mp-content-unit','mp-dose-amount','mp-qty','mp-cost'].forEach(id=>document.getElementById(id).addEventListener('input',updateConsumptionPreview));
  document.getElementById('mp-image-remove').onclick=()=>{productImage='';document.getElementById('mp-image-file').value='';document.getElementById('mp-image-preview').src=getCategoryVisual('Abarrotes','Producto');};
  document.getElementById('mp-image-file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    imageLoading=true;document.getElementById('btn-save-prod-modal').disabled=true;
    try{
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Selecciona JPG, PNG o WebP de hasta 10 MB.');
      const bitmap=await createImageBitmap(file);const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      let quality=.85,url=canvas.toDataURL('image/jpeg',quality);while(url.length>195000&&quality>.25){quality-=.1;url=canvas.toDataURL('image/jpeg',quality);}if(url.length>195000)throw Error('La imagen no se pudo optimizar; utiliza una imagen más sencilla.');
      productImage=url;document.getElementById('mp-image-preview').src=url;document.getElementById('mp-image-status').textContent='Imagen lista. Pulsa Guardar producto para conservarla.';
    }catch(err){document.getElementById('mp-image-status').textContent=err.message;}finally{imageLoading=false;document.getElementById('btn-save-prod-modal').disabled=false;}
  };
  document.getElementById('btn-open-custom-prod').addEventListener('click', () => openProductModal(null));
  document.getElementById('btn-quick-custom').addEventListener('click', () => openProductModal(null));
  document.getElementById('btn-close-prod-modal').addEventListener('click', () => { modalProduct.hidden = true; });
  document.getElementById('btn-cancel-prod-modal').addEventListener('click', () => { modalProduct.hidden = true; });

  document.getElementById('btn-save-prod-modal').addEventListener('click', async () => {
    if(imageLoading||saving)return;
    const id = document.getElementById('mp-id').value;
    const nombre = document.getElementById('mp-name').value.trim();
    const sku = document.getElementById('mp-sku').value.trim().toUpperCase();
    const cat = document.getElementById('mp-cat').value;
    const minStock = Math.max(1, num(document.getElementById('mp-min-stock').value));
    const qty = Math.max(0, num(document.getElementById('mp-qty').value));
    const cost = Math.max(0, num(document.getElementById('mp-cost').value));
    const editingRecipe=items.find(p=>p.id===id)?.tipo==='elaborado';
    const details=consumptionDetails();
    if(!editingRecipe&&!details.consumptionMode)return showToast('Clasificación pendiente','Selecciona cómo se utiliza este producto: unidades, porciones o peso/volumen.','error');
    if(!editingRecipe&&details.deductOnSale&&(!Number.isFinite(details.portionsPerUnit)||details.portionsPerUnit<=0||(details.consumptionMode==='measure'&&(details.contentAmount<=0||details.doseAmount<=0||details.portionsPerUnit<1))))return showToast('Rendimiento inválido','Revisa cuántas porciones rinde el envase o su contenido y dosis.','error');
    const previousMode=items.find(p=>p.id===id);if(previousMode&&!!previousMode.deductOnSale!==details.deductOnSale&&items.some(p=>p.tipo==='elaborado'&&num(p.preparedStock)>0&&p.ingredientes.some(i=>i.idInsumo===id)))return showToast('Hay preparaciones pendientes','Vende las porciones ya preparadas antes de cambiar el momento de descuento de este insumo. Así evitamos descontarlo dos veces.','error');
    const price = num(document.getElementById(editingRecipe?'mp-recipe-price':'mp-price').value);
    const recipeYield=num(document.getElementById('mp-yield').value);
    const recipeEntries=[...document.querySelectorAll('[data-ingredient-index]')].map((input,index)=>({value:num(input.value),mode:document.querySelector('[data-ingredient-mode="'+index+'"]').value}));
    const recipeAmounts=recipeEntries.map(i=>i.mode==='coverage'?recipeYield/i.value:i.value);
    if(editingRecipe && (!Number.isInteger(recipeYield)||recipeYield<1||recipeEntries.some(i=>i.value<=0)||recipeAmounts.some(q=>!Number.isFinite(q)||q<=0)))return showToast('Receta inválida','Revisa rendimiento e ingredientes.','error');

    if (!nombre || !sku) {
      return showToast("Error", "Completa el nombre y el código SKU.", "error");
    }

    if(items.some(p=>p.sku===sku && p.id!==id)) return showToast('SKU duplicado','Utiliza un código único.','error');
    if(price<=0) return showToast('Precio inválido','El precio debe ser mayor a cero.','error');
    if(productImage.startsWith('data:image/jpeg;base64,')){
      const button=document.getElementById('btn-save-prod-modal');button.disabled=true;imageLoading=true;
      try{productImage=(await Cloud.api('imageUpload',{image:productImage})).url;}catch(e){showToast('Imagen no guardada',e.message,'error');return;}finally{button.disabled=false;imageLoading=false;}
    }
    if (id) {
      const previous=items.find(p=>p.id===id);
      if(previous && previous.tipo!=='elaborado' && qty < num(previous.vendidos)+num(previous.consumed)) return showToast('Cantidad inválida','No puede ser menor que las salidas acumuladas.','error');
      const target = items.find(x => x.id === id);
      if (target) {
        target.nombre = nombre;
        target.sku = sku;
        target.cat = target.tipo === 'elaborado' ? 'Elaborado' : cat;
        target.minStock = minStock;
        target.precio=price;
        if(editingRecipe)Object.assign(target,productionRecipePatch());
        target.imgUrl = productImage || getCategoryVisual(target.cat, nombre);
        if (target.tipo !== 'elaborado') {
          Object.assign(target,details);
          target.unidadesCompradas = qty;
          target.costoTotal = cost;
          target.precio = price;
        }

      }
    } else {
      const newProd = {
        id: uuid(),
        tipo: 'producto',
        ...details,
        sku,
        cat,
        nombre,
        imgUrl: productImage || getCategoryVisual(cat, nombre),
        unidadesCompradas: qty,
        costoTotal: cost,
        precio: price > 0 ? price : 1.00,
        vendidos: 0,
        minStock
      };
      items.push(newProd);
      logMovement(newProd, 'IN', qty, `Creación SKU propio (${money(cost)})`);

    }

    if(await save()){modalProduct.hidden=true;showToast('Producto guardado','Confirmado en el servidor.');}
  });

  // ==================== MODAL: AJUSTE DE INVENTARIO ====================
  const modalAdjust = document.getElementById('modal-adjust');
  document.getElementById('btn-open-adjust').addEventListener('click', () => {
    const sel = document.getElementById('adj-product');
    const uso = getConsumoElaborados();
    sel.innerHTML = '';
    items.filter(i => i.tipo !== 'elaborado'&&i.inventoryKind!=='consumable').forEach(i => {
      sel.innerHTML += `<option value="${esc(i.id)}">${esc(i.nombre)} (Disponible: ${quantityLabel(i,calc(i,uso).stock)})</option>`;
    });
    document.getElementById('adj-qty').value = 1;
    document.getElementById('adj-reason').value = '';
    modalAdjust.hidden = false;
  });
  document.getElementById('btn-close-adjust-modal').addEventListener('click', () => { modalAdjust.hidden = true; });
  document.getElementById('btn-cancel-adjust-modal').addEventListener('click', () => { modalAdjust.hidden = true; });

  document.getElementById('btn-save-adjust-modal').addEventListener('click',async()=>{const p=items.find(x=>x.id===el('adj-product').value);if(!p)return;const ok=await runOperation({kind:'adjust',id:p.id,direction:el('adj-type').value==='ADD'?'in':'out',qty:Number(el('adj-qty').value)/content(p),unitCost:purchaseCost(p),reason:el('adj-reason').value});if(ok)modalAdjust.hidden=true;});
  // ==================== FILTROS INVENTARIO ====================
  document.getElementById('inv-search').addEventListener('input', renderApp);
  document.getElementById('inv-status-filter').addEventListener('change', renderApp);
  document.getElementById('inv-sort').addEventListener('change', renderApp);
  document.getElementById('inv-cat-pills').addEventListener('click', e => {
    const btn = e.target.closest('.pill');
    if (btn) {
      activeInvCat = btn.dataset.cat;
      document.querySelectorAll('#inv-cat-pills .pill').forEach(p => p.classList.toggle('active', p === btn));
      renderApp();
    }
  });

  // ==================== RENDERIZADO PRINCIPAL ====================
  let inventoryPage=0,lastInventoryQuery='';const inventoryPager=document.createElement('div');inventoryPager.className='report-controls';inventoryPager.innerHTML='<button class="btn ghost" id="inventory-prev">Anterior</button><span id="inventory-page"></span><button class="btn ghost" id="inventory-next">Siguiente</button>';document.getElementById('inventory-tbody').closest('.clean-table-container').after(inventoryPager);document.getElementById('inventory-prev').onclick=()=>{inventoryPage--;renderApp();};document.getElementById('inventory-next').onclick=()=>{inventoryPage++;renderApp();};
  function renderApp() {
    const uso = getConsumoElaborados();
    const tbody = document.getElementById('inventory-tbody');tbody.closest('table').classList.add('inventory-table');
    tbody.innerHTML = '';

    let invTot = 0, valorAlmacen = 0, ingTot = 0, ganTot = 0, unidVendidas = 0;
    let countLow = 0, countOut = 0;

    items.forEach(p => {
      const c = calc(p, uso);
      invTot += c.inversion;
      valorAlmacen += c.valorStock;
      ingTot += c.ingreso;
      ganTot += c.ganancia;
      unidVendidas += num(p.vendidos);
      {
        if (c.estado === 'Stock bajo') countLow++;
        if (c.estado === 'Agotado') countOut++;
      }
    });

    // Filter & sort items for table
    const q = document.getElementById('inv-search').value.toLowerCase().trim();
    const statusFilter = document.getElementById('inv-status-filter').value;
    const sortBy = document.getElementById('inv-sort').value;

    let filtered = items.filter(p => {
      const c = calc(p, uso);
      const matchQ = !q || p.nombre.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.cat || '').toLowerCase().includes(q);
      const matchCat = activeInvCat === 'ALL' || (activeInvCat === 'Elaborado' ? p.tipo === 'elaborado' : p.cat === activeInvCat);
      const matchStatus = statusFilter === 'ALL' || c.estado === statusFilter;
      return matchQ && matchCat && matchStatus && !p.archived;
    });

    if (sortBy === 'recent') filtered.reverse();
    else if (sortBy === 'name') filtered.sort((a, b) => a.nombre.localeCompare(b.nombre));
    else if (sortBy === 'stock-asc') filtered.sort((a, b) => num(calc(a, uso).stock) - num(calc(b, uso).stock));
    else if (sortBy === 'profit-desc') filtered.sort((a, b) => calc(b, uso).ganancia - calc(a, uso).ganancia);

    const queryKey=JSON.stringify([q,statusFilter,sortBy,activeInvCat]);if(queryKey!==lastInventoryQuery){inventoryPage=0;lastInventoryQuery=queryKey;}const pages=Math.max(1,Math.ceil(filtered.length/25));inventoryPage=Math.max(0,Math.min(inventoryPage,pages-1));document.getElementById('inventory-page').textContent='Página '+(inventoryPage+1)+' de '+pages+' · '+filtered.length+' productos';document.getElementById('inventory-prev').disabled=inventoryPage===0;document.getElementById('inventory-next').disabled=inventoryPage>=pages-1;filtered=filtered.slice(inventoryPage*25,(inventoryPage+1)*25);
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No se encontraron productos con los filtros actuales.</td></tr>';
    } else {
      filtered.forEach(p => {
        const c = calc(p, uso);
        const isElab = p.tipo === 'elaborado';
        const badgeClass = isElab ? 'elab' : 'insumo';
        const stockBadge = isElab
          ? (c.stock > 0 ? 'stock-ok' : 'stock-out')
          : (c.estado === 'Agotado' ? 'stock-out' : (c.estado === 'Stock bajo' ? 'stock-low' : 'stock-ok'));

        const tr=document.createElement('tr');const summary=(p.ingredientes||[]).map(raw=>{const ins=items.find(x=>x.id===raw.idInsumo);if(!ins)return '';const i=ingredient(ins,raw,p.recipeYield||1);return esc(ins.nombre)+': '+quantityLabel(ins,i.cantidad/(p.recipeYield||1))+' por porción · '+(i.consumeAt==='sale'?'al servir':'al preparar');}).join('<br>');
        tr.innerHTML=`<td data-label="Producto"><div class="product-cell"><img src="${esc(productVisual(p))}" class="thumb" alt=""><div><strong class="item-name">${esc(p.nombre)}</strong><span class="item-sku">${esc(p.sku)}</span><span class="sub-t">${esc(isElab?'Preparado':p.cat||'Insumo')}</span></div></div></td><td data-label="Costo"><strong>${money(c.cu)}</strong><small>Disponible${p.lastPurchaseCost!=null?' · Última compra '+money(p.lastPurchaseCost):''}</small></td><td data-label="Venta / margen"><strong>${money(p.precio)}</strong><small>${money(p.precio-c.cu)} · ${c.margenPct.toFixed(1)}% bruto</small>${c.cu===0||c.margenPct>90?'<small class="cost-warning">Revisar costo registrado</small>':''}</td><td data-label="Existencias"><strong>${isElab?c.stock+' preparadas':quantityLabel(p,c.stock)}</strong><small>${isElab?sellable(items,p)+' vendibles con complementos':p.portionsPerUnit?Math.floor(c.stock*p.portionsPerUnit+1e-9)+' porciones estimadas':esc(c.estado)}</small></td><td data-label="Vendidos"><strong>${num(p.vendidos)}</strong><small>Acumulados</small></td><td data-label="Margen bruto"><strong>${money(c.ganancia)}</strong><small>Acumulado</small></td><td data-label="Acciones"><div class="inventory-actions"><button class="btn small ${isElab?'btn-quick-production':'btn-restock'}" data-id="${esc(p.id)}">${isElab?'Preparar':'Reponer'}</button><button class="btn ghost small btn-edit-item" data-id="${esc(p.id)}">Editar</button><button class="btn ghost small" data-detail="${esc(p.id)}" aria-expanded="false">Ver detalle</button></div></td>`;
        if(p.inventoryKind==='consumable'){tr.children[2].textContent='Uso interno';tr.children[4].textContent='—';tr.children[5].textContent='Consumo en su módulo';tr.children[6].innerHTML='<button type="button" class="btn small" data-supply-open>Gestionar consumible</button>';}
        tbody.appendChild(tr);const detail=document.createElement('tr');detail.hidden=true;detail.className='inventory-detail';detail.dataset.productDetail=p.id;const td=document.createElement('td');td.colSpan=7;td.innerHTML=`<div class="detail-grid"><section><h3>${esc(p.nombre)}</h3><p>${esc([p.presentation,p.contentDescription,p.productDetail].filter(Boolean).join(' · '))}</p><p>${summary}</p>${(p.batches||[]).filter(b=>b.qty>0).map(b=>'<p>Lote '+esc(b.label||b.id)+' · '+b.qty+' porciones · Vence: '+esc(b.expiry||'Sin fecha')+'</p>').join('')}<p>Valor disponible: ${money(isElab?p.preparedValue:c.valorStock)}</p>${p.costMigration?'<p class="cost-warning">'+esc(p.costMigration)+'</p>':''}</section><section><h3>Últimos cambios de precio</h3>${(p.priceHistory||[]).slice(-5).reverse().map(h=>'<p>'+new Date(h.date).toLocaleDateString('es-PE')+' · '+esc(h.source)+' · '+money(h.salePrice)+'</p>').join('')||'<p>Sin cambios registrados.</p>'}<button class="btn ghost" data-archive="${esc(p.id)}">Archivar producto</button></section></div>`;detail.append(td);tbody.append(detail);

      });
    }

    // Update Summary KPIs
    document.getElementById('s-inv').textContent = money(invTot);
    document.getElementById('s-inv-sub').textContent = `Valor actual en almacén: ${money(valorAlmacen)}`;
    document.getElementById('s-ing').textContent = money(ingTot);
    document.getElementById('s-ing-sub').textContent = `${unidVendidas} unidades vendidas`;
    document.getElementById('s-gan').textContent = money(ganTot);
    document.getElementById('s-gan').className = "v " + (ganTot >= 0 ? "pos" : "neg");
    const globalMargin = ingTot > 0 ? ((ganTot / ingTot) * 100).toFixed(1) : "0.0";
    document.getElementById('s-margen-sub').textContent = `Margen bruto sobre ventas: ${globalMargin}%`;

    const totalAlerts = countLow + countOut;
    document.getElementById('s-alertas').textContent = `${totalAlerts} Alertas`;
    document.getElementById('s-alertas-sub').textContent = `${countOut} agotados · ${countLow} stock bajo`;
    document.getElementById('low-stock-count').textContent = totalAlerts;
    
    
    document.getElementById('header-biz-name').textContent = neg || "SMARTBOD";

    renderIngredientsSelector();
    updateRecipeLivePreview();
    renderPOS();
    renderKardex();
    renderCatalog();
    renderStats(uso);accountUI();
  }

  document.getElementById('inventory-tbody').addEventListener('click',async e=>{const more=e.target.closest('[data-detail]');if(more){const row=[...document.querySelectorAll('[data-product-detail]')].find(x=>x.dataset.productDetail===more.dataset.detail);row.hidden=!row.hidden;more.setAttribute('aria-expanded',String(!row.hidden));return;}const archive=e.target.closest('[data-archive]');if(archive){await runOperation({kind:'archive',id:archive.dataset.archive,archived:true});return;}
    const prepareBtn=e.target.closest('.btn-quick-production');if(prepareBtn){const product=items.find(p=>p.id===prepareBtn.dataset.id);if(product)openQuickProduction(product);return;}
    const supplyBtn=e.target.closest('[data-supply-open]');if(supplyBtn){window.Smartbod.openSupplies();return;}
    const restockBtn=e.target.closest('.btn-restock');if(restockBtn){const product=items.find(p=>p.id===restockBtn.dataset.id);if(product)openRestock(product);return;}
    const editBtn = e.target.closest('.btn-edit-item');
    if (editBtn) {
      const item = items.find(i => i.id === editBtn.dataset.id);
      if (item) openProductModal(item);
      return;
    }
    const delBtn = e.target.closest('.btn-del-item');
    if (delBtn) {
      const item = items.find(i => i.id === delBtn.dataset.id);
      if (!item) return;
      if(num(item.preparedStock)>0 || num(item.vendidos)>0 || num(item.consumed)>0 || items.some(p=>(p.ingredientes||[]).some(i=>i.idInsumo===item.id))) return showToast('Producto vinculado','No se puede eliminar un producto vendido o utilizado en recetas.','warn');
      askConfirm(
        "Eliminar Producto",
        `¿Estás seguro de eliminar "${esc(item.nombre)}" del inventario?`,
        () => {
          items = items.filter(i => i.id !== item.id);
          cart = cart.filter(c => c.item.id !== item.id);
          save();
          showToast("Producto Eliminado", `${esc(item.nombre)} fue retirado del inventario.`);
        }
      );
    }
  });

  // ==================== POS (CAJA REGISTRADORA) ====================
  document.getElementById('pos-cat-pills').addEventListener('click', e => {
    const btn = e.target.closest('.pill');
    if (btn) {
      activePosCat = btn.dataset.poscat;
      document.querySelectorAll('#pos-cat-pills .pill').forEach(p => p.classList.toggle('active', p === btn));
      renderPOS();
    }
  });

  function renderPOS() {
    const grid = document.getElementById('pos-grid');
    grid.innerHTML = '';
    const q = document.getElementById('pos-search').value.toLowerCase().trim();
    const uso = getConsumoElaborados();

    const filtered = items.filter(p => {
      const matchQ = !q || p.nombre.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
      const matchCat = activePosCat === 'ALL' || (activePosCat === 'Elaborado' ? p.tipo === 'elaborado' : p.cat === activePosCat);
      return matchQ && matchCat && !p.archived && p.inventoryKind!=='consumable';
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No hay productos que coincidan con la búsqueda.</div>';
      return;
    }

    filtered.forEach(p => {
      const c = calc(p, uso);
      const available = sellable(items,p);
      const isOut = available <= 0;
      const div = document.createElement('div');
      div.className = 'pos-item' + (isOut ? ' disabled' : '');
      div.innerHTML = `
        <span class="pos-item-stock-tag" style="background:${isOut ? '#dc2626' : 'rgb(15 23 42 / 0.78)'}">
          ${p.tipo === 'elaborado' ? `${available} porc.` : `Stock: ${available}`}
        </span>
        <img class="thumb" src="${esc(productVisual(p))}" alt="${esc(p.nombre)}">
        <div style="font-weight:600; font-size:13px; line-height:1.25;">${esc(p.nombre)}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:auto;">
          <span style="font-family:var(--font-display); color:var(--accent); font-weight:700; font-size:16px;">${money(num(p.precio))}</span>
          <span style="font-size:10.5px; color:var(--muted);">${esc(p.sku)}</span>
        </div>
      `;
      div.addEventListener('click', () => {
        if (isOut) {
          return showToast("Sin Stock Disponible", `No hay stock suficiente para vender ${esc(p.nombre)}.`, "warn");
        }
        addToCart(p, available);
      });
      grid.appendChild(div);
    });
    renderCart();
  }

  function addToCart(item,maxStock,pack=null){
    const step=pack?1:(item.scaleStep||1),factor=pack?.units||1;
    const quantity=!pack&&item.saleUnit&&item.saleUnit!=='unidad'?Number(el('pos-weight').value):1;
    const used=cart.filter(c=>c.item.id===item.id).reduce((sum,c)=>sum+c.qty*(c.factor||1),0);
    if(!(quantity>0)||Math.abs(quantity/step-Math.round(quantity/step))>0.000001||used+quantity*factor>maxStock+1e-8){
      showToast('Cantidad inválida','Revisa el peso, la precisión y el stock disponible.','warn');return false;
    }
    const existing=cart.find(c=>c.item.id===item.id&&c.barcode===(pack?.code||null));
    if(existing)existing.qty=Number((existing.qty+quantity).toFixed(6));
    else cart.push({item:{...item,precio:pack?.price??item.precio,nombre:pack?item.nombre+' · '+pack.name:item.nombre},qty:quantity,barcode:pack?.code||null,factor,step});
    renderCart();return true;
  }

  function getCartTotal() {
    const subtotal = cart.reduce((acc, c) => acc + Math.round(Math.round(num(c.item.precio)*100)*c.qty)/100, 0);
    const disc = Math.max(0, num(document.getElementById('pos-discount').value));
    return Math.max(0, subtotal - disc);
  }

  function updateCashChange() {
    const total = getCartTotal();
    const rec = num(document.getElementById('pos-cash-received').value);
    const changeEl = document.getElementById('pos-change-val');
    if (rec <= 0 || rec < total) {
      changeEl.textContent = "S/ 0.00";
    } else {
      changeEl.textContent = money(rec - total);
    }
  }

  function renderCart() {
    const list = document.getElementById('cart-items');
    list.innerHTML = '';
    const totalQty = cart.reduce((a, b) => a + b.qty, 0);
    

    if (cart.length === 0) {
      list.innerHTML = '<div class="empty-state" style="padding:24px 10px;">Tu ticket está vacío. Busca un producto por nombre o SKU, o selecciónalo en el catálogo para comenzar.</div>';
    } else {
      cart.forEach((c, idx) => {
        const line = num(c.item.precio) * c.qty;
        const div = document.createElement('div');
        div.style.cssText = "display:flex; justify-content:space-between; align-items:center; border-bottom:1px dashed var(--line); padding-bottom:8px; gap:8px;";
        div.innerHTML = `
          <div style="flex:1;">
            <div style="font-weight:600;font-size:13px;">${esc(c.item.nombre)}</div>
            <div style="font-size:11px;color:var(--muted);">${money(num(c.item.precio))} c/u</div>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <button type="button" class="btn ghost small btn-cart-dec" data-idx="${idx}" style="padding:3px 8px;">-</button>
            <span style="font-weight:700; min-width:24px; text-align:center;">${c.qty}</span>
            <button type="button" class="btn ghost small btn-cart-inc" data-idx="${idx}" style="padding:3px 8px;">+</button>
          </div>
          <div style="text-align:right; min-width:75px;">
            <div style="font-weight:700;">${money(line)}</div>
            <button type="button" class="btn ghost small btn-rm-cart" data-idx="${idx}" style="color:var(--bad); padding:0; border:0; font-size:11px;">Quitar</button>
          </div>
        `;
        list.appendChild(div);
      });
    }

    const total = getCartTotal();
    document.getElementById('cart-total-val').textContent = money(total);
    updateCashChange();
  }

  function addSearchToTicket(){
    const input=document.getElementById('pos-search'),q=input.value.trim().toLowerCase(),status=document.getElementById('pos-search-status');
    if(!q){status.textContent='Escribe un nombre o SKU antes de añadir.';input.focus();return;}
    const products=items.filter(p=>!p.archived&&p.inventoryKind!=='consumable'),exact=products.filter(p=>String(p.sku||'').toLowerCase()===q);
    const packaged=products.find(p=>p.presentations?.some(x=>x.code.toLowerCase()===q));
    if(packaged){const pack=packaged.presentations.find(x=>x.code.toLowerCase()===q);if(addToCart(packaged,sellable(items,packaged),pack)){status.textContent=pack.name+' añadido';input.value='';renderPOS();}return;}
    const matches=exact.length?exact:products.filter(p=>p.nombre.toLowerCase().includes(q)||String(p.sku||'').toLowerCase().includes(q));
    if(matches.length!==1){status.textContent=matches.length?'Hay varias coincidencias. Selecciona la tarjeta del producto.':'No se encontró ese nombre o SKU.';activePosCat='ALL';document.querySelectorAll('#pos-cat-pills .pill').forEach(b=>b.classList.toggle('active',b.dataset.poscat==='ALL'));renderPOS();return;}
    const p=matches[0],available=sellable(items,p),current=cart.find(c=>c.item.id===p.id)?.qty||0;
    if(!p.scaleStep&&current+1>available){status.textContent='No hay stock suficiente de '+p.nombre+'.';return;}
    if(!addToCart(p,available))return;status.textContent=p.nombre+' añadido al ticket.';input.value='';renderPOS();input.focus();
  }
  document.getElementById('pos-add-search').addEventListener('click',addSearchToTicket);
  document.getElementById('pos-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addSearchToTicket();}});
  document.getElementById('pos-search').addEventListener('input', renderPOS);
  document.getElementById('pos-discount').addEventListener('input', renderCart);
  document.getElementById('pos-cash-received').addEventListener('input', updateCashChange);

  document.getElementById('btn-clear-cart').addEventListener('click', () => {
    cart = [];
    document.getElementById('pos-discount').value = 0;
    document.getElementById('pos-cash-received').value = '';
    renderCart();
  });

  document.getElementById('cart-items').addEventListener('click', e => {
    const uso = getConsumoElaborados();
    const inc = e.target.closest('.btn-cart-inc');
    if (inc) {
      const idx = Number(inc.dataset.idx);
      const entry = cart[idx];
      const maxStock = sellable(items,items.find(p=>p.id===entry.item.id)||entry.item);
      const used=cart.filter(c=>c.item.id===entry.item.id).reduce((sum,c)=>sum+c.qty*(c.factor||1),0);if (used+(entry.step||1)*(entry.factor||1)>maxStock+1e-8) {
        return showToast("Límite de Stock", `Stock máximo disponible: ${maxStock}`, "warn");
      }
      entry.qty=Number((entry.qty+(entry.step||1)).toFixed(6));
      renderCart();
      return;
    }
    const dec = e.target.closest('.btn-cart-dec');
    if (dec) {
      const idx = Number(dec.dataset.idx);
      if (cart[idx].qty > (cart[idx].step||1)) cart[idx].qty=Number((cart[idx].qty-(cart[idx].step||1)).toFixed(6));
      else cart.splice(idx, 1);
      renderCart();
      return;
    }
    const rm = e.target.closest('.btn-rm-cart');
    if (rm) {
      cart.splice(Number(rm.dataset.idx), 1);
      renderCart();
    }
  });

  document.getElementById('pay-methods').addEventListener('click', e => {
    const btn = e.target.closest('.pay-btn');
    if (btn) {
      selectedPayMethod = btn.dataset.pay;
      document.querySelectorAll('#pay-methods .pay-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.getElementById('cash-calc-section').style.display = selectedPayMethod === 'Efectivo' ? 'flex' : 'none';
    }
  });

  document.querySelector('.quick-cash').addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const val = btn.dataset.cash;
    const total = getCartTotal();
    document.getElementById('pos-cash-received').value = val === 'exact' ? total.toFixed(2) : val;
    updateCashChange();
  });

  const mixed=document.createElement('button');mixed.type='button';mixed.className='pay-btn';mixed.dataset.pay='Mixto';mixed.textContent='Pago dividido';document.getElementById('pay-methods').append(mixed);const payExtras=document.createElement('div');payExtras.innerHTML='<label>Referencia de pago<input id="payment-reference" maxlength="100"></label><div id="split-payments" hidden><p>Los importes deben sumar el total. En efectivo indica lo aplicado a la venta.</p>'+['Efectivo','Yape','Plin','Tarjeta'].map((m,i)=>'<label>'+m+'<input id="split-'+i+'" type="number" min="0" step="0.01" value="0"></label>').join('')+'</div>';document.getElementById('pay-methods').after(payExtras);document.getElementById('pay-methods').addEventListener('click',()=>{document.getElementById('split-payments').hidden=selectedPayMethod!=='Mixto';});
  let saleAttempt=null;
  document.getElementById('btn-process-sale').addEventListener('click',async()=>{
    if(!cart.length||saving)return;
    const input={register:el('pos-register').value||undefined,eventId:document.getElementById('pos-event').value||null,lines:cart.map(c=>({id:c.item.id,qty:c.qty,barcode:c.barcode||undefined,expectedPrice:c.item.precio})),discount:num(document.getElementById('pos-discount').value),cash:num(document.getElementById('pos-cash-received').value),payMethod:selectedPayMethod,paymentReference:document.getElementById('payment-reference').value,payments:selectedPayMethod==='Mixto'?['Efectivo','Yape','Plin','Tarjeta'].map((method,i)=>({method,amount:Number(document.getElementById('split-'+i).value)||0,reference:document.getElementById('payment-reference').value})).filter(p=>p.amount>0):undefined,client:document.getElementById('pos-client').value};
    const signature=JSON.stringify(input);if(!saleAttempt||saleAttempt.signature!==signature)saleAttempt={signature,id:crypto.randomUUID()};
    saving=true;document.getElementById('app').inert=true;
    try{
      const result=await Cloud.api('sale',{sale:{...input,requestId:saleAttempt.id}});
      cart=[];applyCloud(result);lastReceiptData=result.receipt;showReceiptModal(lastReceiptData);saleAttempt=null;
      document.getElementById('pos-discount').value=0;document.getElementById('pos-cash-received').value='';renderCart();
      document.getElementById('cloud-status').textContent='Venta confirmada en la nube';
    }catch(e){showToast('Venta no confirmada',esc(e.message)+' Reintenta con el mismo carrito para comprobarla.','error');}
    finally{saving=false;document.getElementById('app').inert=false;}
  });

  function showReceiptModal(r) {
    const linesHtml = r.lines.flatMap(l=>l.parts?.length?l.parts.map(p=>({nombre:p.description,qty:p.count,subtotal:p.amount/100})): [l]).map(l =>
      `<div style="display:flex; justify-content:space-between; margin:4px 0;">
        <span>${l.qty}x ${esc(l.nombre.slice(0, 22))}</span>
        <b>${money(l.subtotal)}</b>
      </div>`
    ).join('');

    document.getElementById('receipt-content').innerHTML = `
      <div style="text-align:center; border-bottom:1px dashed #94a3b8; padding-bottom:10px; margin-bottom:10px;">
        <div style="font-weight:700; font-size:15px;">${esc(r.bizName)}</div>
        <div style="font-size:11px; color:#475569;">Tel: ${esc(r.bizTel)}</div>
        <div style="font-weight:700; margin-top:4px;">TICKET DE VENTA: ${r.ticketNum}</div>
        <div style="font-size:11px;">${r.date}</div>
      </div>
      <div style="margin-bottom:8px; font-size:11.5px;">
        <div><b>Origen:</b> ${esc(r.eventSnapshot?.name||'Venta diaria / local')}</div><div><b>Cliente:</b> ${esc(r.client)}</div>
        <div><b>Pago:</b> ${esc(r.payMethod)}</div>
      </div>
      <div style="border-top:1px dashed #94a3b8; border-bottom:1px dashed #94a3b8; padding:8px 0; margin:8px 0;">
        ${linesHtml}
      </div>
      ${r.discount > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Descuento:</span><span>- ${money(r.discount)}</span></div>` : ''}
      <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:700; margin-top:6px;">
        <span>TOTAL PAGADO:</span>
        <span>${money(r.total)}</span>
      </div>
      <div style="text-align:center; font-size:11px; color:#64748b; margin-top:12px;">
        ¡Gracias por su preferencia!
      </div>
    `;
    document.getElementById('modal-receipt').hidden = false;
  }

  document.getElementById('receipt-fiscal').onclick=()=>{document.getElementById('modal-receipt').hidden=true;window.dispatchEvent(new CustomEvent('smartbod-fiscal',{detail:lastReceiptData}));};
  document.getElementById('btn-close-receipt').addEventListener('click', () => {
    document.getElementById('modal-receipt').hidden = true;
  });
  document.getElementById('btn-done-receipt').addEventListener('click', () => {
    document.getElementById('modal-receipt').hidden = true;
  });
  document.getElementById('btn-download-receipt-pdf').addEventListener('click', () => {
    if (!lastReceiptData || !window.jspdf) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: [80, 160] });
    let y = 10;
    doc.setFontSize(11);
    doc.text(lastReceiptData.bizName, 40, y, { align: 'center' });
    y += 5;
    doc.setFontSize(8);
    doc.text(`Ticket: ${lastReceiptData.ticketNum}`, 40, y, { align: 'center' });
    y += 4;
    doc.text(lastReceiptData.date, 40, y, { align: 'center' });
    y += 5;
    doc.text(`Cliente: ${lastReceiptData.client}`, 6, y);
    y += 4;
    doc.text(`Pago: ${lastReceiptData.payMethod}`, 6, y);
    y += 5;
    doc.line(6, y, 74, y);
    y += 5;
    lastReceiptData.lines.forEach(l => {
      doc.text(`${l.qty}x ${l.nombre.slice(0, 18)}`, 6, y);
      doc.text(money(l.subtotal), 74, y, { align: 'right' });
      y += 4.5;
    });
    doc.line(6, y, 74, y);
    y += 5;
    doc.setFontSize(10);
    doc.text(`TOTAL: ${money(lastReceiptData.total)}`, 74, y, { align: 'right' });
    doc.save(`Ticket_${lastReceiptData.ticketNum}.pdf`);
  });

  // ==================== KARDEX ====================
  document.getElementById('kardex-search').addEventListener('input', renderKardex);
  document.getElementById('kardex-type-filter').addEventListener('change', renderKardex);

  function renderKardex() {
    const tb = document.getElementById('kardex-tbody');
    tb.innerHTML = '';
    const q = document.getElementById('kardex-search').value.toLowerCase().trim();
    const tFilter = document.getElementById('kardex-type-filter').value;

    const filtered = kardex.filter(k => {
      const matchQ = !q || (k.name || '').toLowerCase().includes(q) || (k.sku || '').toLowerCase().includes(q) || (k.detail || '').toLowerCase().includes(q);
      const matchT = tFilter === 'ALL' || k.type === tFilter;
      return matchQ && matchT;
    });

    if (filtered.length === 0) {
      tb.innerHTML = '<tr><td colspan="6" class="empty-state">No hay movimientos registrados para este filtro.</td></tr>';
      return;
    }

    filtered.forEach(k => {
      const d = new Date(k.date);
      const badgeClass = k.type === 'IN' ? 'stock-ok' : (k.type === 'ADJ' ? 'stock-low' : 'stock-out');
      const label = ({IN:'Entrada',OUT:'Venta',ADJ:'Ajuste',VOID:'Anulación',PROD_IN:'Preparación',PROD_OUT:'Consumo de receta'})[k.type]||k.type;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${d.toLocaleDateString('es-PE')} ${d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</td>
        <td><span class="item-sku">${esc(k.sku)}</span></td>
        <td style="font-weight:600;">${esc(k.name)}</td>
        <td><span class="badge ${badgeClass}">${label}</span></td>
        <td><strong>${k.qty}</strong></td>
        <td><span style="font-size:12.5px; color:var(--ink-2);">${esc(k.detail)}</span></td>
      `;
      tb.appendChild(tr);
    });
  }

  // ==================== CATÁLOGO DIGITAL ====================
  const negInput = document.getElementById('negocio');
  const negTelInput = document.getElementById('negocio-tel');
  negInput.value = neg;
  negTelInput.value = negTel;

  negInput.addEventListener('input', function () {
    neg = this.value;
    lsSet(NEG_KEY, neg);
    document.getElementById('header-biz-name').textContent = neg || "SMARTBOD";
  });
  document.getElementById('save-business').onclick=()=>save();
  negTelInput.addEventListener('input', function () {
    negTel = this.value;
    lsSet(NEG_TEL_KEY, negTel);
  });
  document.getElementById('cat-filter-select').addEventListener('change', renderCatalog);

  function renderCatalog() {
    const grid = document.getElementById('catgrid');
    grid.innerHTML = '';
    const catFilter = document.getElementById('cat-filter-select').value;
    const uso = getConsumoElaborados();

    const filtered = items.filter(p => {
      if(p.inventoryKind==='consumable')return false;
      if (catFilter === 'ALL') return true;
      if (catFilter === 'Elaborado') return p.tipo === 'elaborado';
      return p.cat === catFilter;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">No hay productos en esta categoría.</div>';
      return;
    }

    filtered.forEach(p => {
      const c = calc(p, uso);
      const disp = num(c.stock) > 0;
      const div = document.createElement('div');
      div.className = 'pos-item';
      div.style.cursor = 'default';
      div.innerHTML = `
        <img class="thumb" src="${esc(productVisual(p))}" alt="${esc(p.nombre)}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="badge ${p.tipo === 'elaborado' ? 'elab' : 'insumo'}">${p.tipo === 'elaborado' ? 'Especialidad' : (p.cat || 'Producto')}</span>
          <span class="badge ${disp ? 'stock-ok' : 'stock-out'}">${disp ? 'Disponible' : 'Agotado'}</span>
        </div>
        <div style="font-weight:700; font-size:14.5px; margin-top:4px;">${esc(p.nombre)}</div>
        <div style="font-family:var(--font-display); color:var(--accent); font-weight:700; font-size:20px; margin-top:auto;">
          ${money(num(p.precio))}
        </div>
      `;
      grid.appendChild(div);
    });
  }

  // ==================== ESTADÍSTICAS & CHARTS ====================
  function renderStats(uso) {
    if(!window.Chart)return;
    if (!window.Chart) return;
    if (chartGanancias) chartGanancias.destroy();
    if (chartStock) chartStock.destroy();
    if (chartCategorias) chartCategorias.destroy();
    if (chartPagos) chartPagos.destroy();

    const textColor = currentTheme === 'dark' ? '#cbd5e1' : '#334155';

    // 1. Top Ganancias & Ingresos
    const top = [...items].sort((a, b) => calc(b, uso).ganancia - calc(a, uso).ganancia).slice(0, 6);
    chartGanancias = new Chart(document.getElementById('chart-ganancias'), {
      type: 'bar',
      data: {
        labels: top.map(p => p.nombre.slice(0, 18)),
        datasets: [
          { label: 'Margen bruto (S/)', data: top.map(p => Number(calc(p, uso).ganancia.toFixed(2))), backgroundColor: '#10b981', borderRadius: 6 },
          { label: 'Facturación (S/)', data: top.map(p => Number(calc(p, uso).ingreso.toFixed(2))), backgroundColor: '#3b82f6', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: textColor } },
          y: { ticks: { color: textColor } }
        }
      }
    });

    // 2. Salud de Stock
    let sOK = 0, sLow = 0, sOut = 0;
    items.filter(i => i.tipo !== 'elaborado'&&i.inventoryKind!=='consumable').forEach(i => {
      const e = calc(i, uso).estado;
      if (e === 'Ok') sOK++;
      else if (e === 'Stock bajo') sLow++;
      else sOut++;
    });
    chartStock = new Chart(document.getElementById('chart-stock'), {
      type: 'doughnut',
      data: {
        labels: ['Stock Óptimo', 'Stock Bajo', 'Agotado'],
        datasets: [{
          data: [sOK, sLow, sOut],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: textColor } } }
      }
    });

    // 3. Ingresos por Categoría
    const catTotals = {};
    items.forEach(p => {
      const catName = p.tipo === 'elaborado' ? 'Platos/Combos' : (p.cat || 'Otros');
      catTotals[catName] = (catTotals[catName] || 0) + calc(p, uso).ingreso;
    });
    chartCategorias = new Chart(document.getElementById('chart-categorias'), {
      type: 'polarArea',
      data: {
        labels: Object.keys(catTotals),
        datasets: [{
          data: Object.values(catTotals).map(v => Number(v.toFixed(2))),
          backgroundColor: ['#059669cc', '#3b82f6cc', '#f59e0bcc', '#8b5cf6cc', '#ec4899cc']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: textColor } } }
      }
    });

    // 4. Ventas por Método de Pago
    const payTotals = { 'Efectivo': 0, 'Yape': 0, 'Plin': 0, 'Tarjeta': 0 };
    kardex.filter(k => k.type === 'OUT'||k.type === 'VOID').forEach(k => {
      const method = k.payMethod && payTotals[k.payMethod] !== undefined ? k.payMethod : 'Efectivo';
      payTotals[method] += num(k.amount);
    });
    chartPagos = new Chart(document.getElementById('chart-pagos'), {
      type: 'bar',
      data: {
        labels: Object.keys(payTotals),
        datasets: [{
          label: 'Total Cobrado (S/)',
          data: Object.values(payTotals).map(v => Number(v.toFixed(2))),
          backgroundColor: ['#059669', '#7c3aed', '#0284c7', '#f59e0b'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor } },
          y: { ticks: { color: textColor } }
        }
      }
    });

    // Profitability Ranking Table
    const stbody = document.getElementById('stats-profit-tbody');
    stbody.innerHTML = '';
    [...items].sort((a, b) => calc(b, uso).ganancia - calc(a, uso).ganancia).forEach(p => {
      const c = calc(p, uso);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${esc(p.nombre)}</strong> <span class="item-sku">${esc(p.sku)}</span></td>
        <td>${money(c.cu)}</td>
        <td>${money(num(p.precio))}</td>
        <td><span class="badge ${c.margenPct >= 25 ? 'stock-ok' : 'stock-low'}">${c.margenPct.toFixed(1)}%</span></td>
        <td>${num(p.vendidos)}</td>
        <td>${money(c.ingreso)}</td>
        <td style="font-weight:700; color:var(--good);">${money(c.ganancia)}</td>
      `;
      stbody.appendChild(tr);
    });
  }

  // ==================== REPORTES (EXCEL, PDF, BACKUP JSON) ====================
  function handleReportExport(repType) {
    const uso = getConsumoElaborados();
    const bizTitle = neg || 'SMARTBOD';
    const dateStr = new Date().toLocaleDateString('es-PE');

    if (repType === 'xlsx') {
      if (!window.XLSX) return showToast("Error", "Librería Excel no disponible.", "error");
      const wb = XLSX.utils.book_new();

      const invRows = items.map(p => {
        const c = calc(p, uso);
        return {
          SKU: p.sku,
          Producto: p.nombre,
          Categoria: p.tipo === 'elaborado' ? 'Plato/Combo' : (p.cat || 'Abarrotes'),
          Costo_Unitario: Number(c.cu.toFixed(2)),
          Precio_Venta: num(p.precio),
          Margen_Pct: Number(c.margenPct.toFixed(1)),
          Stock_Actual: c.stock,
          Unidades_Vendidas: num(p.vendidos),
          Ingresos_Totales: Number(c.ingreso.toFixed(2)),
          Margen_Bruto: Number(c.ganancia.toFixed(2)),
          Estado: c.estado
        };
      });
      const wsInv = XLSX.utils.json_to_sheet(invRows);
      XLSX.utils.book_append_sheet(wb, wsInv, "Inventario_y_Rentabilidad");

      const kardexRows = kardex.map(k => ({
        Fecha: new Date(k.date).toLocaleString('es-PE'),
        SKU: k.sku,
        Producto: k.name,
        Tipo: k.type,
        Cantidad: k.qty,
        Metodo_Pago: k.payMethod || '-',
        Detalle: k.detail
      }));
      const wsKar = XLSX.utils.json_to_sheet(kardexRows);
      XLSX.utils.book_append_sheet(wb, wsKar, "Kardex_Movimientos");

      XLSX.writeFile(wb, `SMARTBOD_Reporte_${dateStr.replace(/\//g, '-')}.xlsx`);
      showToast("Excel Exportado", "Se descargó el archivo .XLSX con todas las hojas.");
      return;
    }

    if (!window.jspdf) return showToast("Error", "Librería PDF no disponible.", "error");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.setTextColor(5, 150, 105);
    doc.text(bizTitle, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);

    if (repType === 'pdf-stock') {
      doc.text(`Reporte de Control de Inventario y Stock — Fecha: ${dateStr}`, 14, 25);
      const body = items.map(p => {
        const c = calc(p, uso);
        return [p.sku, p.nombre, p.tipo === 'elaborado' ? 'Elaborado' : (p.cat || '-'), money(c.cu), money(p.precio), String(c.stock), c.estado];
      });
      doc.autoTable({
        startY: 30,
        head: [['SKU', 'Producto', 'Categoría', 'Costo Unid.', 'Precio', 'Stock', 'Estado']],
        body,
        headStyles: { fillColor: [5, 150, 105] }
      });
      doc.save(`Reporte_Stock_${dateStr.replace(/\//g, '-')}.pdf`);
      showToast("PDF Generado", "Reporte de Stock descargado correctamente.");
    } else if (repType === 'pdf-prod') {
      doc.text(`Balance Financiero de Ventas y Ganancias — Fecha: ${dateStr}`, 14, 25);
      let totIng = 0, totGan = 0;
      const body = items.map(p => {
        const c = calc(p, uso);
        totIng += c.ingreso;
        totGan += c.ganancia;
        return [p.sku, p.nombre, String(num(p.vendidos)), `${c.margenPct.toFixed(1)}%`, money(c.ingreso), money(c.ganancia)];
      });
      body.push(['-', 'TOTAL ACUMULADO', '-', '-', money(totIng), money(totGan)]);
      doc.autoTable({
        startY: 30,
        head: [['SKU', 'Producto', 'Vendidos', 'Margen %', 'Facturación', 'Margen bruto']],
        body,
        headStyles: { fillColor: [5, 150, 105] }
      });
      doc.save(`Balance_Financiero_${dateStr.replace(/\//g, '-')}.pdf`);
      showToast("PDF Financiero", "Balance financiero descargado correctamente.");
    } else if (repType === 'pdf-cat') {
      doc.text(`Catálogo Oficial de Precios — Pedidos: ${negTel || '-'} — ${dateStr}`, 14, 25);
      const body = items.map(p => {
        const c = calc(p, uso);
        return [p.sku, p.nombre, p.tipo === 'elaborado' ? 'Especialidad' : (p.cat || 'Producto'), money(p.precio), num(c.stock) > 0 ? 'Disponible' : 'Agotado'];
      });
      doc.autoTable({
        startY: 30,
        head: [['Código', 'Producto / Especialidad', 'Categoría', 'Precio Público', 'Disponibilidad']],
        body,
        headStyles: { fillColor: [5, 150, 105] }
      });
      doc.save(`Catalogo_${bizTitle.replace(/\s+/g, '_')}.pdf`);
      showToast("Catálogo PDF", "Catálogo comercial descargado correctamente.");
    }
  }

  document.addEventListener('click', e => {
    const repBtn = e.target.closest('[data-rep]');
    if (repBtn) {
      handleReportExport(repBtn.dataset.rep);
    }
  });

  // Backup JSON export/import & Reset
  document.getElementById('btn-export-json').addEventListener('click', () => {
    const payload = {
      ...captureState(),version: "4.0",
      exportDate: new Date().toISOString(),
      negocio: neg,
      telefono: negTel,
      savedReports:JSON.parse(lsGet('smartbod-saved-reports-v1','[]')),
      events:JSON.parse(lsGet("smartbod-events-v1","[]")),
      receipts:JSON.parse(lsGet("smartbod-receipts-v1","[]")),
      items,
      kardex
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SMARTBOD_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Backup Descargado", "Archivo JSON guardado exitosamente.");
  });

  document.getElementById('input-import-json').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data.items)) {
          if(!data.items.every(p=>p && typeof p.id==='string' && typeof p.nombre==='string' && typeof p.sku==='string' && ['producto','elaborado'].includes(p.tipo))) throw Error('Invalid');
          if(new Set(data.items.map(p=>p.id)).size!==data.items.length || new Set(data.items.map(p=>p.sku)).size!==data.items.length) throw Error('Duplicates');
          if(!confirm('Se reemplazarán los datos actuales. ¿Ya exportaste un respaldo?')) return;
          lsSet('smartbod-receipts-v1',JSON.stringify(Array.isArray(data.receipts)?data.receipts:[]));
          lsSet('smartbod-saved-reports-v1',JSON.stringify(Array.isArray(data.savedReports)?data.savedReports:[]));
          lsSet('smartbod-events-v1',JSON.stringify(Array.isArray(data.events)?data.events:[]));
          extraState=data;items = data.items;
          kardex = Array.isArray(data.kardex) ? data.kardex : [];
          if (data.negocio) { neg = data.negocio; negInput.value = neg; lsSet(NEG_KEY, neg); }
          if (data.telefono) { negTel = data.telefono; negTelInput.value = negTel; lsSet(NEG_TEL_KEY, negTel); }
          if(await save({restore:true})) location.reload();
        } else {
          showToast("Archivo inválido", "El archivo JSON no tiene el formato de SMARTBOD.", "error");
        }
      } catch (err) {
        showToast("Error de lectura", "No se pudo leer el archivo JSON.", "error");
      }
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-reset-all').hidden=true;
  // ==================== TABS NAVIGATION ====================
  function switchTab(tabKey) {
    if(!activeUser || !permittedTab(tabKey))return;
    ["inv", "pos", "kardex", "cat", "est", "rep", "events", "supplies"].forEach(k => {
      if(document.getElementById("v-" + k))document.getElementById("v-" + k).hidden = (k !== tabKey);
    });
    document.querySelectorAll(".tab").forEach(t => {
      t.setAttribute("aria-selected", t.dataset.tab === tabKey ? "true" : "false");
    });
    if(tabKey==='rep'){document.getElementById('report-generate').click();renderSaleManager();}
    if (tabKey === 'est') {
      renderStats(getConsumoElaborados());
    }
  }

  document.querySelector(".tabs").addEventListener("click", e => {
    const b = e.target.closest(".tab");
    if (b) {
      switchTab(b.dataset.tab);
      document.getElementById('menu-toggle').setAttribute('aria-expanded','false');
      document.getElementById('side-menu').classList.remove('menu-open');
    }
  });

  // Initialize
  let activeUser=boot.user,currentPolicy=boot.policy,usersCache=[];
  const accounts=()=>usersCache;
  const policy=()=>currentPolicy;
  const el=id=>document.getElementById(id);
  const can=scope=>activeUser?.role==='admin'&&(!activeUser.permissions||activeUser.permissions.includes('*')||activeUser.permissions.includes(scope));
  el('menu-toggle').onclick=()=>{
    const open=el('side-menu').classList.toggle('menu-open');
    el('menu-toggle').setAttribute('aria-expanded',String(open));
  };
  function permittedTab(tab){
    if(activeUser.role==='seller')return ['cat','pos'].includes(tab);
    if(can('users')||can('cash'))return true;
    return ['cat','inv','supplies'].includes(tab)||(tab==='kardex'&&can('purchase'));
  }
  function roleOverview(){
    const box=el('role-overview');box.replaceChildren();
    const card=(label,value,action)=>{
      const node=document.createElement(action?'button':'div');node.className='overview-metric';
      const title=document.createElement('small'),detail=document.createElement('strong');
      title.textContent=label;detail.textContent=value;node.append(title,detail);box.append(node);
      if(action){node.type='button';node.onclick=action;}
    };
    const shifts=(extraState.cashSessions||[]).filter(c=>!c.closedAt);
    if(activeUser.role==='seller'){card('Turno de caja',extraState.cashOpen?'Abierto':'Cerrado · solicita apertura para cobrar efectivo');return;}
    if(can('cash')){
      const today=limaDay(new Date()),sales=extraState.receipts||[];
      const income=sales.filter(r=>r.status!=='voided'&&r.businessDate===today).reduce((sum,r)=>sum+num(r.total),0);
      const refunds=sales.flatMap(r=>r.returns||[]).filter(r=>limaDay(new Date(r.date))===today).reduce((sum,r)=>sum+r.amount,0);
      card('Ventas netas de hoy',money(income-refunds),()=>switchTab('rep'));
      card(shifts.length>1?shifts.length+' cajas · efectivo esperado':'Caja · efectivo esperado',shifts.length?money(shifts.reduce((sum,c)=>sum+(c.expectedLive??c.opening),0)):'Abrir turno',()=>document.querySelector('.header-actions .btn.soft')?.click());
    }
    if(can('production')&&!can('purchase')){
      for(const recipe of items.filter(p=>p.tipo==='elaborado'&&!p.archived)){
        let limit=Infinity,source='';
        for(const [id,needed] of Object.entries(recipeNeeds(items,recipe,1,'prepare'))){
          const item=items.find(p=>p.id===id),available=calc(item,getConsumoElaborados()).stock;
          const count=Math.floor((available+1e-9)/needed);
          if(count<limit){limit=count;source=item.nombre;}
        }
        card(recipe.nombre,Number.isFinite(limit)?limit+' porciones · '+source:'Preparar por pedido',()=>openQuickProduction(recipe));
      }
      if(!box.children.length)card('Producción','Aún no hay recetas activas');
    }
    if(can('purchase')){
      const low=items.filter(i=>i.inventoryKind==='consumable'&&!i.archived&&i.unidadesCompradas-i.vendidos-i.consumed<=i.minStock);
      card('Empaques por reponer',low.length+' materiales',()=>window.Smartbod.openLowSupplies());
    }
  }
  function accountUI(){
    const register=el('pos-register'),previous=register.value;
    const registers=extraState.openRegisters||(extraState.cashSessions||[]).filter(c=>!c.closedAt).map(c=>c.register||'Principal');
    register.replaceChildren(...(registers.length?registers:['']).map(n=>new Option(n||'Sin turno abierto',n)));
    if(registers.includes(previous))register.value=previous;

    const admin=activeUser?.role==='admin';
    el('account-label').textContent=activeUser ? activeUser.name+' · '+(admin?'Administrador':'Vendedor'):'';
    el('manage-users').hidden=!can('users');document.querySelectorAll('.btn-restock').forEach(b=>b.disabled=!can('purchase'));document.querySelectorAll('.btn-quick-production').forEach(b=>b.disabled=!can('production'));document.querySelectorAll('.btn-edit-item').forEach(b=>b.disabled=!can('catalog'));
    ['negocio','negocio-tel','save-business'].forEach(id=>el(id).disabled=!admin);
    document.querySelectorAll('[data-admin-guide]').forEach(b=>b.hidden=!admin);
    document.querySelectorAll('[data-tab]').forEach(b=>b.hidden=!permittedTab(b.dataset.tab));
    ['btn-load-demo','chip-low-stock'].forEach(id=>{if(el(id))el(id).hidden=!admin;});
    el('guide-sell').hidden=!permittedTab('pos');el('guide-restock').hidden=!can('purchase');el('btn-open-custom-prod').hidden=!can('catalog');
    el('guide-prices').hidden=!permittedTab('rep');el('my-tickets').hidden=!permittedTab('pos');el('btn-reset-all').closest('.panel').hidden=!can('restore');
    ['negocio','negocio-tel','save-business'].forEach(id=>el(id).disabled=!can('users'));el('manage-users').hidden=!can('users');
    roleOverview();
    el('discount-policy-note').textContent='Descuento autorizado: hasta '+policy()[activeUser?.role||'seller']+'% del subtotal';
  }
  async function lock(){try{await Cloud.api('logout');sessionStorage.removeItem('smartbod-pending');location.reload();}catch(e){alert('No se pudo cerrar sesión: '+e.message);}}
  document.addEventListener('click',e=>{
    if(!e.target.closest('#app'))return;
    const restricted=e.target.closest('#v-inv,#v-kardex,#v-est,#v-rep,#v-events,#v-supplies,#manage-users,#btn-load-demo,#chip-low-stock');
    if(!activeUser || (activeUser.role!=='admin' && restricted)){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  el('logout').onclick=lock;
  let ticketPage=0;
  async function loadTicketPage(page){
    const back=el('tickets-back'),next=el('tickets-next'),list=el('ticket-list');
    back.disabled=true;next.disabled=true;el('ticket-list-status').textContent='Cargando…';
    try{
      const result=await Cloud.api('myTickets',{page});
      ticketPage=page;list.replaceChildren();
      for(const r of result.tickets){
        const row=document.createElement('p');
        row.textContent=[new Date(r.date).toLocaleString('es-PE',{timeZone:'America/Lima'}),r.ticket,r.status==='voided'?'Anulado':money(r.total-r.refund)].join(' · ');
        const fiscal=document.createElement('button');fiscal.className='btn ghost small';fiscal.textContent='Comprobante';
        fiscal.onclick=()=>{el('ticket-history').close();window.dispatchEvent(new CustomEvent('smartbod-fiscal',{detail:{ticketNum:r.ticket,date:r.date,total:r.total,client:'',returns:[]}}));};
        row.append(fiscal);list.append(row);
      }
      el('ticket-list-status').textContent=result.tickets.length?'Página '+(page+1):'Aún no hay ventas registradas por tu cuenta.';
      next.disabled=!result.more;
    }catch(error){el('ticket-list-status').textContent=error.message;}
    finally{back.disabled=ticketPage===0;}
  }
  el('my-tickets').onclick=()=>{el('ticket-history').showModal();loadTicketPage(0);};
  el('tickets-back').onclick=()=>loadTicketPage(ticketPage-1);
  el('tickets-next').onclick=()=>loadTicketPage(ticketPage+1);
  el('tickets-close').onclick=()=>el('ticket-history').close();
  el('cloud-refresh').onclick=async()=>{try{if(saving)return;if(cart.length&&!confirm('Se actualizarán las existencias. El carrito se conservará.'))return;applyCloud(await Cloud.api('state'));}catch(e){alert(e.message);}};
  el('manage-users').onclick=async()=>{if(activeUser?.role!=='admin')return;try{usersCache=(await Cloud.api('users')).users;el('users-dialog').showModal();renderUsers();}catch(e){alert(e.message);}};
  el('users-close').onclick=()=>el('users-dialog').close();
  function renderUsers(){
    el('limit-admin').value=policy().admin;el('limit-seller').value=policy().seller;
    const body=el('users-list');body.replaceChildren();
    for(const u of accounts()){
      const row=document.createElement('tr');
      for(const val of [u.name,u.username,u.role==='admin'?'Administrador':'Vendedor',u.enabled?'Activo':'Desactivado']){const td=document.createElement('td');td.textContent=val;row.append(td);}
      const td=document.createElement('td'),button=document.createElement('button');button.className='btn ghost small';button.textContent='Editar';button.onclick=()=>{el('user-id').value=u.id;el('user-name').value=u.name;el('user-login').value=u.username;el('user-role').value=u.role;el('user-profile').value=!u.permissions||u.permissions.includes('*')?'all':u.permissions.includes('cash')?'supervisor':u.permissions.includes('purchase')?'warehouse':'production';el('user-enabled').checked=u.enabled;el('user-password').value='';};td.append(button);row.append(td);body.append(row);
    }
  }
  el('user-new').onclick=()=>{el('user-form').reset();el('user-id').value='';};
  el('user-form').onsubmit=async e=>{
    e.preventDefault();try{await Cloud.api('user',{user:{id:el('user-id').value||undefined,username:el('user-login').value,name:el('user-name').value,role:el('user-role').value,profile:el('user-profile').value,enabled:el('user-enabled').checked,password:el('user-password').value||undefined}});usersCache=(await Cloud.api('users')).users;renderUsers();el('user-form').reset();el('user-id').value='';el('users-status').textContent='Usuario guardado en el servidor.';}catch(err){el('users-status').textContent=err.message;}
  };
  el('policy-form').onsubmit=async e=>{e.preventDefault();try{const r=await Cloud.api('policy',{policy:{admin:Number(el('limit-admin').value),seller:Number(el('limit-seller').value)}});currentPolicy=r.policy;accountUI();el('users-status').textContent='Límites guardados en el servidor.';}catch(err){el('users-status').textContent=err.message;}};

  function showNeeds(p,qty,body){let valid=Number.isInteger(qty)&&qty>0;body.replaceChildren();for(const [id,need] of Object.entries(recipeNeeds(items,p,qty,'prepare'))){const ins=items.find(x=>x.id===id),available=calc(ins,getConsumoElaborados()).stock,enough=Number.isFinite(need)&&need>0&&need<=available+1e-9;if(!enough)valid=false;const line=document.createElement('p');line.textContent=ins.nombre+' · Disponible: '+quantityLabel(ins,available)+' → Consumo: '+quantityLabel(ins,need)+' → Sobrante: '+quantityLabel(ins,available-need);line.className=enough?'':'cost-warning';body.append(line);}return valid;}
  function checkPreparation(){const p=items.find(x=>x.id===document.getElementById('mp-id').value);if(!p||p.tipo!=='elaborado')return;const patch=productionRecipePatch(),qty=Number(document.getElementById('mp-prepare-qty').value),valid=Number.isInteger(patch.recipeYield)&&patch.recipeYield>0&&showNeeds({...p,...patch},qty,document.getElementById('mp-sufficiency'));document.getElementById('mp-sufficiency-status').textContent=valid?'Revisa consumo y sobrantes. Los ingredientes al servir se descuentan al vender.':'Revisa cantidades o existencias';document.getElementById('mp-prepare').disabled=!valid||saving;}
  document.getElementById('mp-prepare-qty').oninput=checkPreparation;document.getElementById('mp-yield').oninput=checkPreparation;
  function showPreparedStock(id){const p=items.find(p=>p.id===id);if(!p)return;document.getElementById('inv-status-filter').value='ALL';document.getElementById('inv-search').value=p.sku;activeInvCat='ALL';document.querySelectorAll('#inv-cat-pills .pill').forEach(b=>b.classList.toggle('active',b.dataset.cat==='ALL'));document.getElementById('pos-search').value='';activePosCat='ALL';document.querySelectorAll('#pos-cat-pills .pill').forEach(b=>b.classList.toggle('active',b.dataset.poscat==='ALL'));renderApp();}
  let preparationAttempt=null;
  function preparePayload(id,qty,patch){const signature=JSON.stringify({id,qty,patch});if(preparationAttempt?.signature!==signature)preparationAttempt={signature,requestId:crypto.randomUUID()};return {id,qty,requestId:preparationAttempt.requestId,...(patch?{recipePatch:patch,revision:cloudRevision}:{})};}
  function productionRecipePatch(){const p=items.find(x=>x.id===el('mp-id').value),y=Number(el('mp-yield').value);return {recipeYield:y,precio:Number(el('mp-recipe-price').value),ingredientes:[...document.querySelectorAll('[data-ingredient-index]')].map((input,index)=>{const mode=document.querySelector('[data-ingredient-mode="'+index+'"]').value,v=Number(input.value),ins=items.find(x=>x.id===p.ingredientes[index].idInsumo);return ingredient(ins,{idInsumo:ins.id,measureMode:mode,cantidad:v,dose:v,servingsPerUnit:v,consumeAt:document.querySelector('[data-ingredient-at="'+index+'"]').value},y);})};}
  el('mp-prepare').onclick=async()=>{
    if(saving)return;const id=el('mp-id').value,qty=num(el('mp-prepare-qty').value),request=preparePayload(id,qty,productionRecipePatch());saving=true;el('mp-prepare').disabled=true;
    try{const result=await Cloud.api('prepare',{production:request});preparationAttempt=null;applyCloud(result);showPreparedStock(id);modalProduct.hidden=true;const ready=num(items.find(p=>p.id===id)?.preparedStock);showToast('Stock de venta actualizado',qty+' unidades preparadas. Disponibles: '+ready);el('cloud-status').textContent='Preparación confirmada · '+ready+' unidades listas para vender';}
    catch(e){el('mp-sufficiency-status').textContent=e.message;showToast('No se confirmó la preparación',e.message,'error');}finally{saving=false;el('mp-prepare').disabled=false;}
  };
  function openQuickProduction(p){
    el('quick-production-id').value=p.id;el('quick-production-title').textContent='Preparar: '+p.nombre;el('quick-production-qty').value=p.recipeYield||1;el('quick-production-status').textContent='';el('production-lot').value='';el('production-expiry').value='';preparationAttempt=null;quickProductionPreview();el('quick-production').showModal();
  }
  function quickProductionPreview(){const p=items.find(x=>x.id===el('quick-production-id').value);if(!p)return;const qty=Number(el('quick-production-qty').value),valid=showNeeds(p,qty,el('quick-production-needs'));el('quick-production-before').textContent='Preparadas: '+num(p.preparedStock);el('quick-production-after').textContent='Después de preparar: '+(valid?num(p.preparedStock)+qty:'—');el('quick-production-status').textContent=valid?'Cada ingrediente se descuenta una sola vez. Revisa los sobrantes.':'Faltan ingredientes o cantidad inválida';el('quick-production-submit').disabled=!valid||saving;}
  const lotFields=document.createElement('div');lotFields.className='report-controls';lotFields.innerHTML='<label>Lote (opcional)<input id="production-lot" maxlength="80"></label><label>Vencimiento (opcional)<input id="production-expiry" type="date"></label>';el('quick-production-qty').parentElement.after(lotFields);
  el('quick-production-qty').oninput=quickProductionPreview;el('quick-production-close').onclick=()=>el('quick-production').close();
  el('quick-production-form').onsubmit=async e=>{e.preventDefault();if(saving)return;const id=el('quick-production-id').value,qty=num(el('quick-production-qty').value),request={...preparePayload(id,qty,{lot:el('production-lot').value,expiry:el('production-expiry').value}),recipePatch:undefined,lot:el('production-lot').value,expiry:el('production-expiry').value};saving=true;el('quick-production-submit').disabled=true;el('quick-production-status').textContent='Guardando preparación…';
    try{const result=await Cloud.api('prepare',{production:request});preparationAttempt=null;applyCloud(result);showPreparedStock(id);const ready=num(items.find(p=>p.id===id)?.preparedStock);el('quick-production-before').textContent='Stock confirmado en la nube: '+ready+' unidades';el('quick-production-after').textContent='Disponible en Inventario y Caja';el('quick-production-status').textContent='Preparación registrada correctamente. Puedes cerrar esta ventana y vender.';el('quick-production-qty').value='';el('cloud-status').textContent='Stock actualizado: '+ready+' unidades listas para vender';}
    catch(err){el('quick-production-status').textContent='No confirmado: '+err.message+' Puedes reintentar la misma operación.';el('quick-production-submit').disabled=false;}finally{saving=false;}
  };
  function renderSaleManager(){
    const query=el('sale-search').value.toLowerCase(),body=el('sale-manager');body.replaceChildren();
    const receipts=JSON.parse(lsGet('smartbod-receipts-v1','[]')).filter(r=>[r.ticketNum,r.client,r.operator].join(' ').toLowerCase().includes(query));
    el('sale-manager-status').textContent=receipts.length+' ventas encontradas';
    receipts.forEach(r=>{const tr=document.createElement('tr');[r.date,r.ticketNum,r.client,money(r.total),r.status==='voided'?'Anulada: '+r.voidReason:'Vigente'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});const td=document.createElement('td');const button=document.createElement('button');button.className='btn danger small';button.textContent='Anular venta';button.disabled=r.status==='voided';button.onclick=async()=>{
      const reason=prompt('Motivo de la anulación (mínimo 5 caracteres):');if(reason===null)return;
      if(!confirm('Se anulará '+r.ticketNum+' y se devolverán las existencias. Confirma que es una venta errónea y que los productos siguen disponibles. Si hubo un cobro, devuelve el dinero por separado.'))return;
      button.disabled=true;try{const result=await Cloud.api('void',{void:{ticketNum:r.ticketNum,reason,register:el('pos-register').value||undefined}});applyCloud(result);renderSaleManager();el('report-generate').click();showToast('Venta anulada','Stock e importes corregidos en la nube.');}catch(e){showToast('No se pudo anular',e.message,'error');button.disabled=false;}
    };td.append(button);tr.append(td);body.append(tr);});
  }
  el('sale-search').oninput=renderSaleManager;
  let currentReport=null;
  function reportData(){
    const type=el('report-type').value,from=el('report-from').value,to=el('report-to').value;
    if(from&&to&&from>to)throw Error('La fecha inicial debe ser anterior a la final.');
    const inRange=date=>{if(!from&&!to)return true;const parsed=new Date(date);if(!Number.isFinite(parsed.getTime()))return false;const d=limaDay(parsed);return (!from||d>=from)&&(!to||d<=to);};
    const origin=el('report-event').value;
    const selectedReceipts=JSON.parse(lsGet('smartbod-receipts-v1','[]')).filter(r=>inRange(r.isoDate||r.date)&&(origin==='all'||(origin==='daily'?!r.eventId:r.eventId===origin)));
    const usage=getConsumoElaborados();let headers,rows,title;
    if(type==='stock'){title='Existencias actuales';headers=['SKU','Producto','Stock','Última compra S/','Costo promedio / preparado S/','Precio de venta S/'];rows=items.map(p=>{const c=calc(p,usage);return[p.sku,p.nombre,c.stock,p.lastPurchaseCost??'Sin historial',+c.cu.toFixed(2),num(p.precio)];});}
    if(type==='profit'){title='Margen bruto por periodo y origen';headers=['SKU','Producto','Ingresos netos S/','Costo vendido S/','Margen bruto S/'];const groups=new Map();for(const r of selectedReceipts.filter(x=>x.status!=='voided'))for(const l of r.lines){const c=r.costs?.find(x=>x.productId===l.productId||x.sku===l.sku),id=l.productId||l.sku;if(!groups.has(id))groups.set(id,[l.sku,l.nombre,0,0,0]);const row=groups.get(id);row[2]+=num(l.net??l.subtotal);row[3]+=num(c?.unitCost)*l.qty;}for(const r of JSON.parse(lsGet('smartbod-receipts-v1','[]')).filter(r=>origin==='all'||(origin==='daily'?!r.eventId:r.eventId===origin)))for(const ret of r.returns||[]){if(!inRange(ret.date))continue;const l=r.lines.find(x=>x.productId===ret.productId),c=r.costs.find(x=>x.productId===ret.productId);if(!groups.has(ret.productId))groups.set(ret.productId,[l.sku,l.nombre,0,0,0]);const row=groups.get(ret.productId);row[2]-=ret.amount;if(ret.restock)row[3]-=c.unitCost*ret.qty;}rows=[...groups.values()].map(r=>[r[0],r[1],+r[2].toFixed(2),+r[3].toFixed(2),+(r[2]-r[3]).toFixed(2)]);}
    if(type==='expenses'){title='Gastos por periodo';headers=['Fecha','Motivo','Evento','Importe S/'];rows=(extraState.expenses||[]).filter(x=>inRange(x.date)&&(origin==='all'||(origin==='daily'?!x.eventId:x.eventId===origin))).map(x=>[new Date(x.date).toLocaleString('es-PE'),x.reason,extraState.events?.find(e=>e.id===x.eventId)?.name||'Venta diaria',x.amount]);}
    if(type==='result'){title='Resultado operativo de costos y gastos registrados';headers=['Concepto','Importe S/'];let revenue=0,cost=0;for(const r of selectedReceipts.filter(x=>x.status!=='voided')){revenue+=r.total;for(const l of r.lines)cost+=(r.costs?.find(c=>c.productId===l.productId||c.sku===l.sku)?.unitCost||0)*l.qty;}for(const r of extraState.receipts||[]){if(origin!=='all'&&(origin==='daily'?!!r.eventId:r.eventId!==origin))continue;for(const ret of r.returns||[])if(inRange(ret.date)){revenue-=ret.amount;if(ret.restock)cost-=(r.costs.find(c=>c.productId===ret.productId)?.unitCost||0)*ret.qty;}}const expenses=(extraState.expenses||[]).filter(x=>inRange(x.date)&&(origin==='all'||(origin==='daily'?!x.eventId:x.eventId===origin))).reduce((a,x)=>a+x.amount,0),waste=origin==='all'?kardex.filter(k=>k.type==='WASTE'&&inRange(k.date)).reduce((a,k)=>a+num(k.amount),0):0;const supplies=kardex.filter(k=>k.type?.startsWith('SUPPLY_')&&inRange(k.date)&&(origin==='all'||(origin==='daily'?!k.eventId:k.eventId===origin))).reduce((a,k)=>a+num(k.expense),0);rows=[['Ventas netas de reembolsos',revenue],['Costo vendido',cost],['Margen bruto',revenue-cost],['Gastos registrados',expenses],['Consumibles: uso manual y ajustes netos',supplies],['Mermas (solo todos los orígenes)',waste],['Resultado registrado; no incluye gastos omitidos',revenue-cost-expenses-waste-supplies]].map(([l,v])=>[l,+v.toFixed(2)]);}
    if(type==='sales'){title='Ventas por ticket';headers=['Fecha','Ticket','Vendedor','Pago','Descuento S/','Total original S/','Estado','Importe vigente S/','Origen / Evento'];rows=selectedReceipts.map(r=>[r.isoDate?new Date(r.isoDate).toLocaleString('es-PE',{timeZone:'America/Lima'}):r.date,r.ticketNum,r.operator||'Sin registro',r.payMethod,num(r.discount),num(r.total),r.status==='voided'?'Anulada':r.returns?.length?'Con devolución':'Vigente',r.status==='voided'?0:num(r.total)-(r.returns||[]).reduce((a,x)=>a+x.amount,0),r.eventSnapshot?.name||'Venta diaria / local']);}
    if(type==='daily'||type==='eventSummary'){
      title=type==='daily'?'Ventas por día':'Ventas por evento';headers=['Fecha / Evento','Tickets vigentes','Tickets anulados','Descuentos vigentes S/','Ventas vigentes S/'];
      const groups=new Map();selectedReceipts.forEach(r=>{let day=r.businessDate;if(!day){const d=new Date(r.isoDate||r.date);day=Number.isFinite(d.getTime())?limaDay(d):'Fecha histórica no disponible';}const key=type==='daily'?day:(r.eventId||'daily');if(!groups.has(key))groups.set(key,[type==='daily'?day:(r.eventSnapshot?.name||'Venta diaria / local'),0,0,0,0]);const row=groups.get(key);if(r.status==='voided')row[2]++;else{row[1]++;row[3]+=Math.round(num(r.discount)*100);row[4]+=Math.round(num(r.total)*100);}});
      for(const r of JSON.parse(lsGet('smartbod-receipts-v1','[]'))){if(origin!=='all'&&(origin==='daily'?!!r.eventId:r.eventId!==origin))continue;for(const ret of r.returns||[]){if(!inRange(ret.date))continue;const key=type==='daily'?limaDay(new Date(ret.date)):(r.eventId||'daily');if(!groups.has(key))groups.set(key,[type==='daily'?key:r.eventSnapshot?.name||'Venta diaria / local',0,0,0,0]);groups.get(key)[4]-=Math.round(ret.amount*100);}}
      rows=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([,r])=>[r[0],r[1],r[2],r[3]/100,r[4]/100]);
    }
    if(type==='movements'){title='Movimientos de inventario';headers=['Fecha','SKU','Producto','Tipo','Cantidad','Importe S/'];rows=kardex.filter(k=>inRange(k.date)).map(k=>[new Date(k.date).toLocaleString('es-PE',{timeZone:'America/Lima'}),k.sku,k.name,k.type,num(k.qty),num(k.amount)]);}
    if(type==='production'){title='Preparaciones registradas';headers=['Fecha','SKU','Producto','Porciones preparadas','Costo total S/'];rows=kardex.filter(k=>k.type==='PROD_IN'&&inRange(k.date)).map(k=>[new Date(k.date).toLocaleString('es-PE',{timeZone:'America/Lima'}),k.sku,k.name,num(k.qty),num(k.amount)]);}
    if(type==='prices'){const history=PriceAnalytics.rows(items,{productId:el('report-product').value,from,to});return {title:'Historial de precios',headers:['Fecha','SKU','Producto','Movimiento','Unidades','Compra neta por unidad S/','Venta por unidad S/','Cambio compra %','Cambio venta %','Responsable'],rows:history.map(h=>[new Date(h.date).toLocaleString('es-PE',{timeZone:'America/Lima'}),h.sku,h.productName,h.source,h.qty,h.unitCost==null?'—':Number(h.unitCost.toFixed(4)),h.salePrice,PriceAnalytics.change(h.previousPurchaseCost,h.unitCost)?.toFixed(2)??'—',PriceAnalytics.change(h.previousSalePrice,h.salePrice)?.toFixed(2)??'—',h.operator]),priceRows:history,priceProduct:el('report-product').value,created:new Date().toISOString(),period:(from||'Inicio')+' a '+(to||'Hoy')};}
    return {title,headers,rows,created:new Date().toISOString(),period:['expenses','result','profit','sales','daily','eventSummary','movements','production'].includes(type)?`${from||'Inicio'} a ${to||'Hoy'}${['sales','daily','eventSummary'].includes(type)?' · '+el('report-event').selectedOptions[0].textContent:''}`:'Las fechas no se aplican: existencias actuales / rentabilidad acumulada'};
  }
  function showReport(r){currentReport=r;showPriceAnalytics(r);el('report-title').textContent=r.title;el('report-meta').textContent=`${r.period} · ${r.rows.length} registros · Generado ${new Date(r.created).toLocaleString('es-PE')}`;const table=el('report-table');table.replaceChildren();const thead=document.createElement('thead'),tr=document.createElement('tr');r.headers.forEach(v=>{const c=document.createElement('th');c.textContent=v;tr.append(c);});thead.append(tr);table.append(thead);const body=document.createElement('tbody');r.rows.forEach(row=>{const tr=document.createElement('tr');row.forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});body.append(tr);});table.append(body);el('report-empty').hidden=r.rows.length>0;}
  el('report-generate').onclick=()=>{try{showReport(reportData());}catch(e){showToast('Reporte',e.message,'error');}};
  el('report-type').onchange=()=>{el('report-product-label').hidden=el('report-type').value!=='prices';refreshPriceProducts();el('report-event').disabled=['prices','stock','profit','production','movements'].includes(el('report-type').value);el('report-from').disabled=['stock','profit'].includes(el('report-type').value);el('report-to').disabled=el('report-from').disabled;el('report-generate').click();};
  el('report-excel').onclick=()=>{if(!currentReport)return;if(!window.XLSX)return showToast('Excel','No se pudo cargar la biblioteca. Revisa tu conexión.','error');const r=currentReport,wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([[r.title],[r.period],r.headers,...r.rows]),'Reporte');XLSX.writeFile(wb,'SMARTBOD_reporte.xlsx');};
  el('report-pdf').onclick=()=>{if(!currentReport)return;if(!window.jspdf)return showToast('PDF','No se pudo cargar la biblioteca. Revisa tu conexión.','error');const r=currentReport,doc=new window.jspdf.jsPDF({orientation:'landscape'});doc.setFontSize(18);doc.text('SMARTBOD | '+r.title,14,18);doc.setFontSize(10);doc.text(r.period,14,27);doc.autoTable({startY:34,head:[r.headers],body:r.rows,headStyles:{fillColor:[8,127,107]}});doc.save('SMARTBOD_reporte.pdf');};
  el('report-print').onclick=()=>{if(!currentReport)return;document.body.classList.add('printing-report');window.print();document.body.classList.remove('printing-report');};
  const savedReports=()=>JSON.parse(lsGet('smartbod-saved-reports-v1','[]'));
  function savedOptions(){el('saved-reports').replaceChildren(new Option('Selecciona un reporte guardado',''));savedReports().forEach((r,i)=>el('saved-reports').add(new Option(r.title+' · '+new Date(r.created).toLocaleString('es-PE'),String(i))));}
  el('report-save').onclick=async()=>{if(!currentReport)return;const reports=savedReports();reports.unshift(currentReport);lsSet('smartbod-saved-reports-v1',JSON.stringify(reports));if(await save()){savedOptions();showToast('Reporte guardado','Disponible en la nube.');}};
  el('saved-reports').onchange=()=>{if(el('saved-reports').value!=='')showReport(savedReports()[Number(el('saved-reports').value)]);};
  const importColumns=['SKU','Producto','Categoria','Paquetes','UnidadesPorPaquete','CostoPaquete','DescuentoPaquete','MargenPct','PrecioVenta'];
  function packageMath(packages,units,cost,discount,margin){
    if(![packages,units,cost,discount,margin].every(Number.isFinite)||packages<=0||units<=0||!Number.isInteger(packages)||!Number.isInteger(units)||cost<0||discount<0||discount>cost||margin<0||margin>=100)throw Error('Revisa paquetes y unidades enteras positivas, descuento entre 0 y costo, y margen entre 0 y 99.99%.');
    const qty=packages*units,total=Math.round(packages*(cost-discount)*100)/100,unit=total/qty;
    return {qty,total,unit,price:Math.ceil(unit/(1-margin/100)*100)/100};
  }
  function packPreview(){try{const c=packageMath(...['pack-count','pack-units','pack-cost','pack-discount','pack-margin'].map(id=>Number(el(id).value)));el('pack-result').textContent=`${c.qty} unidades · Compra neta ${money(c.total)} · Costo unitario ${money(c.unit)} · Precio sugerido ${money(c.price)}`;return c;}catch(e){el('pack-result').textContent=e.message;return null;}}
  ['pack-count','pack-units','pack-cost','pack-discount','pack-margin'].forEach(id=>el(id).oninput=packPreview);
  el('pack-apply').onclick=()=>{const c=packPreview();if(!c)return;el('sf-qty').value=c.qty;el('sf-cost').value=c.total;el('sf-price').value=c.price;updateStockFormMarginPreview();};packPreview();
  el('inventory-template').onclick=()=>{if(!window.XLSX)return showToast('Excel','Revisa tu conexión para cargar Excel.','error');const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet([importColumns]);ws['!cols']=importColumns.map(()=>({wch:23}));XLSX.utils.book_append_sheet(wb,ws,'Carga');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['INSTRUCCIONES'],['Una fila por SKU. La carga suma compras; no reemplaza existencias.'],['CostoPaquete y DescuentoPaquete: soles por cada paquete.'],['MargenPct: margen sobre precio de venta, de 0 a menos de 100.'],['PrecioVenta: opcional. Si está vacío se calcula con MargenPct.'],['Ejemplo de cálculo (NO se importa):'],importColumns,['EJEMPLO','Producto de ejemplo','Abarrotes',2,12,60,6,25,''],['Resultado: 24 unidades, S/108 netos, S/4.50 unitario, precio S/6.00.']]),'Instrucciones');XLSX.writeFile(wb,'SMARTBOD_plantilla_compras.xlsx');};
  el('inventory-excel').onclick=()=>handleReportExport('xlsx');el('inventory-pdf').onclick=()=>handleReportExport('pdf-stock');
  let pendingImport=[],importFingerprint='';
  el('inventory-file').onchange=async e=>{
    pendingImport=[];el('inventory-confirm').disabled=true;el('inventory-import-status').textContent='Leyendo archivo…';el('inventory-preview').replaceChildren();
    try{
      const file=e.target.files[0];if(!file)return;if(file.size>8*1024*1024)throw Error('El archivo supera 8 MB.');const bytes=await file.arrayBuffer();importFingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');let rows;
      if(/\.pdf$/i.test(file.name)){
        const pdf=await PDFLib.PDFDocument.load(bytes);const form=pdf.getForm();if(!form.getFields().some(f=>f.getName()==='r1_SKU'))throw Error('Usa la plantilla PDF rellenable SMARTBOD. No se admiten escaneos ni facturas libres.');
        rows=[];for(let i=1;i<=5;i++){const r={};for(const col of importColumns)r[col]=form.getTextField(`r${i}_${col}`).getText()||'';if(Object.values(r).some(v=>String(v).trim()))rows.push(r);}
      }else{if(!window.XLSX)throw Error('Excel no está disponible. Revisa tu conexión.');const wb=XLSX.read(bytes,{type:'array'});if(!wb.Sheets.Carga)throw Error('Usa una hoja llamada Carga con las columnas de la plantilla.');rows=XLSX.utils.sheet_to_json(wb.Sheets.Carga,{defval:''});}
      if(!rows.length)throw Error('La plantilla no tiene productos.');if(rows.length>1000)throw Error('Máximo 1000 filas por carga.');
      const seen=new Set();
      pendingImport=rows.map((r,i)=>{try{
        const sku=String(r.SKU||'').trim().toUpperCase(),name=String(r.Producto||'').trim();if(!sku||!name)throw Error('SKU y producto obligatorios.');if(seen.has(sku))throw Error('SKU repetido en el archivo.');seen.add(sku);
        const existing=items.find(p=>p.sku===sku);if(existing?.tipo==='elaborado')throw Error('No se pueden cargar compras a una receta.');
        const n=v=>typeof v==='number'?v:Number(String(v).trim().replace(',','.'));
        for(const key of ['Paquetes','UnidadesPorPaquete','CostoPaquete'])if(r[key]===''||r[key]==null)throw Error('Falta '+key);
        const c=packageMath(n(r.Paquetes),n(r.UnidadesPorPaquete),n(r.CostoPaquete),n(r.DescuentoPaquete||0),n(r.MargenPct||0));const price=r.PrecioVenta===''||r.PrecioVenta==null?c.price:n(r.PrecioVenta);if(!Number.isFinite(price)||price<=0)throw Error('Precio de venta inválido.');
        return {sku,name,cat:String(r.Categoria||'Abarrotes'),...c,price,packages:n(r.Paquetes),units:n(r.UnidadesPorPaquete),cost:n(r.CostoPaquete),discount:n(r.DescuentoPaquete||0)};
      }catch(err){throw Error(`Fila ${i+2}: ${err.message}`);}});
      const table=el('inventory-preview');const head=document.createElement('tr');['SKU','Producto','Unidades a sumar','Compra neta S/','Costo unitario S/','Precio S/'].forEach(t=>{const th=document.createElement('th');th.textContent=t;head.append(th);});table.append(head);
      pendingImport.forEach(r=>{const tr=document.createElement('tr');[r.sku,r.name,r.qty,r.total.toFixed(2),r.unit.toFixed(4),r.price.toFixed(2)].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});table.append(tr);});el('inventory-import-status').textContent=`${pendingImport.length} filas validadas. Revisa antes de sumar estas compras.`;el('inventory-confirm').disabled=false;
    }catch(err){pendingImport=[];el('inventory-import-status').textContent=err.message;}
  };
  el('inventory-confirm').onclick=async()=>{if(!pendingImport.length)return;el('inventory-confirm').disabled=true;if(await runOperation({kind:'import',fingerprint:importFingerprint,rows:pendingImport})){pendingImport=[];el('inventory-file').value='';el('inventory-import-status').textContent='Compra confirmada. Archivo registrado para evitar duplicados.';}else el('inventory-confirm').disabled=false;};
  const limaDay=d=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const val=k=>parts.find(p=>p.type===k).value;return `${val('year')}-${val('month')}-${val('day')}`;};
  el('report-period').onchange=()=>{const now=new Date(),end=limaDay(now);let start=end;const mode=el('report-period').value;if(mode==='all'){el('report-from').value='';el('report-to').value='';}else if(mode!=='custom'){if(mode==='month')start=end.slice(0,7)+'01';if(mode==='week')start=limaDay(new Date(now.getTime()-6*86400000));el('report-from').value=start;el('report-to').value=end;}el('report-generate').click();};
  ['report-from','report-to'].forEach(id=>el(id).onchange=()=>{el('report-period').value='custom';el('report-generate').click();});

  const events=()=>JSON.parse(lsGet('smartbod-events-v1','[]'));
  function renderEvents(){
    const current=el('pos-event').value,filter=el('report-event').value,today=limaDay(new Date());
    el('pos-event').replaceChildren(new Option('Venta diaria / local',''));
    events().filter(e=>e.active&&e.startDate<=today&&e.endDate>=today).forEach(e=>el('pos-event').add(new Option(e.name+' · '+e.activity,e.id)));
    if([...el('pos-event').options].some(o=>o.value===current))el('pos-event').value=current;
    el('report-event').replaceChildren(new Option('Todas las ventas','all'),new Option('Solo venta diaria','daily'));
    const known=new Map(events().map(e=>[e.id,e.name]));JSON.parse(lsGet('smartbod-receipts-v1','[]')).forEach(r=>{if(r.eventId&&!known.has(r.eventId))known.set(r.eventId,r.eventSnapshot?.name||'Evento histórico');});
    known.forEach((name,id)=>el('report-event').add(new Option(name,id)));if([...el('report-event').options].some(o=>o.value===filter))el('report-event').value=filter;
    const body=el('events-list');body.replaceChildren();events().sort((a,b)=>b.startDate.localeCompare(a.startDate)).forEach(e=>{const tr=document.createElement('tr');[e.name,e.activity,e.startDate+' → '+e.endDate,e.days+' días',e.location,e.active?'Habilitado':'Cerrado'].forEach(v=>{const td=document.createElement('td');td.textContent=v;tr.append(td);});const td=document.createElement('td'),btn=document.createElement('button');btn.className='btn ghost small';btn.textContent='Editar';btn.onclick=()=>{el('event-id').value=e.id;el('event-name').value=e.name;el('event-activity').value=e.activity;el('event-start').value=e.startDate;el('event-end').value=e.endDate;el('event-location').value=e.location;el('event-notes').value=e.notes;el('event-active').checked=e.active;eventDuration();};td.append(btn);tr.append(td);body.append(tr);});
  }
  function eventDuration(){const a=el('event-start').value,b=el('event-end').value;el('event-duration').textContent=a&&b&&a<=b?'Duración: '+(Math.round((Date.parse(b)-Date.parse(a))/86400000)+1)+' días (incluye inicio y fin)':'Selecciona un rango de fechas válido.';}
  el('event-start').onchange=eventDuration;el('event-end').onchange=eventDuration;
  el('event-new').onclick=()=>{el('event-form').reset();el('event-id').value='';eventDuration();};
  el('event-form').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{const result=await Cloud.api('event',{revision:cloudRevision,event:{id:el('event-id').value||undefined,name:el('event-name').value,activity:el('event-activity').value,startDate:el('event-start').value,endDate:el('event-end').value,location:el('event-location').value,notes:el('event-notes').value,active:el('event-active').checked}});applyCloud(result);renderEvents();el('event-new').click();el('event-status').textContent='Evento guardado en la nube.';}catch(err){el('event-status').textContent=err.message;}finally{button.disabled=false;}};
  el('report-event').onchange=()=>el('report-generate').click();
  renderEvents();eventDuration();

  let restockAttempt=null;
  function openRestock(product){
    el('restock-id').value=product.id;el('restock-heading').textContent='Reponer: '+product.nombre;el('restock-sku').textContent='SKU: '+product.sku;
    const weighed=['kg','L'].includes(product.saleUnit);el('restock-size-label').hidden=product.consumptionMode!=='measure'&&!weighed;
    el('restock-size').value=product.consumptionMode==='measure'?content(product):1;
    el('restock-size-caption').textContent='Contenido de cada envase comprado ('+(['kg','g'].includes(product.contentUnit)?'g':'ml')+')';
    if(weighed&&product.consumptionMode!=='measure')el('restock-size-caption').textContent='Cantidad neta por envase comprado ('+product.saleUnit+')';
    el('restock-stock').textContent='Stock actual: '+Number(calc(product,getConsumoElaborados()).stock.toFixed(4))+' unidades / envases';
    el('restock-previous').textContent='Último costo de compra registrado: '+(product.lastPurchaseCost==null?'Aún no hay historial':money(product.lastPurchaseCost))+' · Precio de venta actual: '+money(product.precio);
    el('restock-lot').value='';el('restock-expiry').value='';el('restock-supplier').value='';el('restock-document').value='';el('restock-date').value=limaDay(new Date());el('restock-extra').value=0;el('restock-mode').value='units';el('restock-count').value=1;el('restock-units').value=1;el('restock-cost').value='';el('restock-discount').value=0;el('restock-price').value='';el('restock-margin').value=25;el('restock-status').textContent='';restockAttempt=null;restockPreview();el('restock-dialog').showModal();el('restock-count').focus();
  }
  function restockPreview(){
    const byUnit=el('restock-mode').value==='units';el('restock-units').disabled=byUnit;el('restock-units-label').hidden=byUnit;if(byUnit)el('restock-units').value=1;
    el('restock-count-label').textContent=byUnit?'Unidades que ingresan':'Cantidad de paquetes';el('restock-cost-label').textContent=byUnit?'Nuevo costo por unidad / envase (S/)':'Nuevo costo por paquete (S/)';el('restock-discount-label').textContent=byUnit?'Descuento por unidad (S/)':'Descuento por paquete (S/)';
    if(el('restock-cost').value===''){el('restock-preview').textContent='Ingresa el costo de esta compra. Puede ser diferente al anterior.';return null;}
    try{const result=packageMath(...['restock-count','restock-units','restock-cost','restock-discount','restock-margin'].map(id=>Number(el(id).value)));const product=items.find(p=>p.id===el('restock-id').value);
    if(product.consumptionMode==='measure'||['kg','L'].includes(product.saleUnit)){
      const received=Number(el('restock-size').value);
      if(!(received>0))throw Error('Indica el contenido real de cada envase.');
      result.qty*=received/content(product);
    }
    result.total+=Number(el('restock-extra').value)||0;result.unit=result.total/result.qty;result.price=result.unit/(1-Number(el('restock-margin').value)/100);el('restock-preview').textContent=`Ingresan ${result.qty} unidades · Compra neta ${money(result.total)} · Costo unitario ${money(result.unit)} · Nuevo precio de venta: ${el('restock-price').value?money(el('restock-price').value):'por completar'} · Stock después: ${Number((calc(items.find(p=>p.id===el('restock-id').value),getConsumoElaborados()).stock+result.qty).toFixed(4))}`;if(product.consumptionMode==='measure')el('restock-preview').textContent+=' · Ingreso medido: '+quantityLabel(product,result.qty)+' · '+Math.floor(result.qty*product.portionsPerUnit+1e-9)+' dosis de referencia';return result;}catch(e){el('restock-preview').textContent=e.message;return null;}
  }
  ['restock-extra','restock-size','restock-mode','restock-count','restock-units','restock-cost','restock-discount','restock-margin','restock-price'].forEach(id=>el(id).oninput=restockPreview);
  el('restock-use-price').onclick=()=>{const r=restockPreview();if(r){el('restock-price').value=r.price;restockPreview();}};
  el('restock-keep-price').onclick=()=>{el('restock-price').value=items.find(p=>p.id===el('restock-id').value).precio;restockPreview();};
  el('restock-close').onclick=()=>el('restock-dialog').close();
  el('restock-form').onsubmit=async e=>{e.preventDefault();if(!restockPreview()||saving)return;const input={lot:el('restock-lot').value,expiry:el('restock-expiry').value,receivedContent:Number(el('restock-size').value),supplier:el('restock-supplier').value,document:el('restock-document').value,purchaseDate:el('restock-date').value,extraCost:Number(el('restock-extra').value),id:el('restock-id').value,packages:Number(el('restock-count').value),units:Number(el('restock-units').value),cost:Number(el('restock-cost').value),discount:Number(el('restock-discount').value),price:Number(el('restock-price').value)};const signature=JSON.stringify(input);if(restockAttempt?.signature!==signature)restockAttempt={signature,requestId:crypto.randomUUID()};saving=true;e.submitter.disabled=true;try{const result=await Cloud.api('restock',{restock:{...input,requestId:restockAttempt.requestId}});applyCloud(result);el('restock-dialog').close();restockAttempt=null;showToast('Stock repuesto','Compra guardada. Stock, precio de venta e historial actualizados.');}catch(err){el('restock-status').textContent=err.message;}finally{saving=false;e.submitter.disabled=false;}};


  let priceChart=null;
  function refreshPriceProducts(){const selected=el('report-product').value;el('report-product').replaceChildren(new Option('Todos los productos','all'));items.forEach(p=>el('report-product').add(new Option(p.sku+' · '+p.nombre,p.id)));if([...el('report-product').options].some(o=>o.value===selected))el('report-product').value=selected;}
  function showPriceAnalytics(report){
    el('price-analytics').hidden=!report.priceRows;if(priceChart){priceChart.destroy();priceChart=null;}if(!report.priceRows)return;
    const rows=report.priceRows,one=report.priceProduct!=='all',stats=PriceAnalytics.summary(rows),box=el('price-metrics');box.replaceChildren();
    const values=[['Compras registradas',stats.purchases],['Importe comprado',money(stats.total)]];
    if(one)values.push(['Menor costo',stats.min==null?'Sin datos':money(stats.min)],['Mayor costo',stats.max==null?'Sin datos':money(stats.max)],['Costo medio por unidad',stats.weightedCost==null?'Sin datos':money(stats.weightedCost)],['Variación compra',stats.purchaseChange==null?'Sin comparación':stats.purchaseChange.toFixed(2)+'%'],['Variación venta',stats.saleChange==null?'Sin comparación':stats.saleChange.toFixed(2)+'%']);
    values.forEach(([title,value])=>{const card=document.createElement('div');card.className='sum-card';const label=document.createElement('p'),v=document.createElement('strong');label.textContent=title;v.textContent=value;card.append(label,v);box.append(card);});
    el('price-explanation').textContent='Solo datos registrados desde esta actualización. El costo de compra es neto por unidad/envase; el promedio se pondera por unidades compradas. Las variaciones de las tarjetas comparan el primer y último registro del periodo. '+(one?'La tabla muestra además el cambio contra el precio anterior a cada registro.':'Selecciona un producto para comparar precios y ver el gráfico.');
    el('price-chart').parentElement.hidden=!one||!rows.length||!window.Chart;
    if(one&&rows.length&&window.Chart)priceChart=new Chart(el('price-chart'),{type:'line',data:{labels:rows.map(r=>new Date(r.date).toLocaleString('es-PE',{timeZone:'America/Lima'})),datasets:[{label:'Compra neta por unidad S/',data:rows.map(r=>r.unitCost),borderColor:'#087f6b',spanGaps:true},{label:'Venta por unidad S/',data:rows.map(r=>r.salePrice),borderColor:'#2563eb'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}},plugins:{legend:{position:'bottom'}}}});
  }
  el('report-product').onchange=()=>el('report-generate').click();
  el('guide-sell').onclick=()=>switchTab('pos');
  el('guide-restock').onclick=()=>{switchTab('inv');el('inv-search').value='';el('inv-status-filter').value='ALL';activeInvCat='ALL';renderApp();el('inv-search').scrollIntoView({block:'center',behavior:'smooth'});el('inv-search').focus();showToast('Busca el producto','Escribe su nombre o SKU y pulsa + Reponer stock.');};
  el('guide-prices').onclick=()=>{el('report-type').value='prices';el('report-type').onchange();switchTab('rep');};


  let operationAttempt=null;
  async function runOperation(input){const signature=JSON.stringify(input);if(operationAttempt?.signature!==signature)operationAttempt={signature,requestId:crypto.randomUUID()};try{const result=await Cloud.api('operation',{operation:{...input,requestId:operationAttempt.requestId}});applyCloud(result);operationAttempt=null;showToast('Operación registrada','Confirmada en el servidor.');return true;}catch(e){showToast('No se confirmó',e.message,'error');return false;}}
  window.Smartbod={can,state:()=>captureState(),user:()=>activeUser,run:runOperation,apply:applyCloud,money,quantityLabel};await import('/operations-ui.js');const {installConsumables}=await import('/consumables-ui.js');installConsumables(window.Smartbod);try{const pending=JSON.parse(sessionStorage.getItem('smartbod-pending')||'null');if(pending){const status=await Cloud.api('requestStatus',{requestId:pending.requestId});showToast(status.found?'Operación anterior confirmada':'Revisa la operación anterior',status.found?'Está registrada. No la repitas.':'No se encontró confirmación. Revisa el historial antes de reintentar.');if(status.found)sessionStorage.removeItem('smartbod-pending');}}catch{}

  window.dispatchEvent(new Event('smartbod-ready'));
  savedOptions();el('report-type').onchange();el('auth-screen').hidden=true;el('app').hidden=false;accountUI();switchTab(activeUser.role==='admin'?'inv':'pos');


  renderTempIngredients();
  renderApp();
})();
