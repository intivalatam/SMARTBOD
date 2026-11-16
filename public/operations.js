(() => {
  const databaseName = 'smartbod-operations-v1';
  const databaseVersion = 1;
  const originalApi = Cloud.api.bind(Cloud);
  const originalStart = Cloud.start.bind(Cloud);
  let state;
  let user;
  let policy;
  let orderLines = [];
  let orderAttempt;
  let lotAttempt;
  let supplierAttemptId;
  let backupsLoaded = false;
  let bootOffline = false;

  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacenamiento local.'));
    });
  }

  async function record(mode, value, id) {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction('records', mode);
        const store = transaction.objectStore('records');
        const request = mode === 'readonly' ? store.get(id) : value === null ? store.delete(id) : store.put(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('No se pudo leer el almacenamiento local.'));
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar el almacenamiento local.'));
      });
    } catch (error) {
      db.close();
      throw error;
    }
  }

  const getRecord = id => record('readonly', null, id);
  const putRecord = value => record('readwrite', value);
  const removeRecord = id => record('readwrite', null, id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const money = value => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value) || 0);
  const dateLabel = value => value ? new Date(value).toLocaleString('es-PE') : '—';

  async function saveSnapshot(result) {
    if (!result?.state || !result.user) return;
    state = result.state;
    user = result.user;
    policy = result.policy || policy;
    await putRecord({ id: 'lastBoot', revision: result.revision, state, user, policy, savedAt: new Date().toISOString() });
    if (document.getElementById('ops-admin')) render();
  }

  async function listPending() {
    const db = await database();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction('records', 'readonly').objectStore('records').getAll();
        request.onsuccess = () => resolve(request.result.filter(item => item.id.startsWith('sale:')).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
        request.onerror = () => reject(request.error || new Error('No se pudo leer la cola de ventas.'));
        request.transaction.oncomplete = () => db.close();
      });
    } catch (error) {
      db.close();
      throw error;
    }
  }

  async function enqueueSale(payload) {
    const sale = payload.sale;
    const id = `sale:${sale.requestId}`;
    const previous = await getRecord(id);
    if (!previous) await putRecord({ id, payload, userId: user?.id || '', createdAt: new Date().toISOString(), status: 'pending', message: 'Aún no confirmada por el servidor.' });
  }

  async function cachedBoot() {
    const cached = await getRecord('lastBoot');
    return cached ? { ...cached, offline: true } : null;
  }

  Cloud.api = async (action, data = {}) => {
    if (action === 'state' && !navigator.onLine) {
      const cached = await cachedBoot();
      if (cached) {
        state = cached.state;
        user = cached.user;
        policy = cached.policy;
        bootOffline = true;
        return cached;
      }
    }
    if (action === 'sale' && !navigator.onLine) {
      await enqueueSale(data);
      const error = new Error('Venta guardada como pendiente en este dispositivo. No hay ticket hasta recibir confirmación del servidor.');
      error.pending = true;
      render();
      throw error;
    }
    try {
      const result = await originalApi(action, data);
      await saveSnapshot(result);
      if (action === 'sale' && data.sale?.requestId) {
        await removeRecord(`sale:${data.sale.requestId}`);
        if (document.getElementById('ops-admin')) void renderPending();
      }
      return result;
    } catch (error) {
      if (action === 'state' && (error.networkError || !navigator.onLine)) {
        const cached = await cachedBoot();
        if (cached) {
          state = cached.state;
          user = cached.user;
          policy = cached.policy;
          bootOffline = true;
          return cached;
        }
      }
      if (action === 'sale' && (error.networkError || !navigator.onLine)) {
        await enqueueSale(data);
        error.message = 'Venta guardada como pendiente en este dispositivo. No hay ticket hasta recibir confirmación del servidor.';
        error.pending = true;
        render();
      }
      throw error;
    }
  };

  function createView() {
    const tabs = document.querySelector('.tabs');
    const app = document.getElementById('app');
    if (!tabs || !app || document.getElementById('v-ops')) return;
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.setAttribute('role', 'tab');
    tab.dataset.tab = 'ops';
    tab.setAttribute('aria-selected', 'false');
    tab.textContent = '🧰 Operación';
    tabs.append(tab);

    const view = document.createElement('div');
    view.className = 'view';
    view.id = 'v-ops';
    view.hidden = true;
    view.innerHTML = `
      <section class="panel" style="margin-bottom:20px">
        <h2>Turno de caja</h2>
        <p>Abre un turno para registrar ventas. El arqueo compara el efectivo contado con el fondo inicial y las ventas en efectivo confirmadas.</p>
        <p id="ops-offline-note" class="help-note" role="status"></p>
        <p id="ops-shift-status" role="status"></p>
        <form id="ops-shift-open" class="report-controls">
          <label>Ubicación<select id="ops-location-select" required></select></label>
          <label>Fondo inicial (S/)<input id="ops-opening-amount" type="number" min="0" step="0.01" value="0" required></label>
          <button class="btn" type="submit">Abrir turno</button>
        </form>
        <form id="ops-shift-close" class="report-controls" hidden>
          <label>Efectivo contado al cierre (S/)<input id="ops-closing-amount" type="number" min="0" step="0.01" required></label>
          <button class="btn soft" type="submit">Cerrar turno y hacer arqueo</button>
        </form>
        <p id="ops-shift-result" role="status"></p>
      </section>
      <section class="panel" style="margin-bottom:20px">
        <h2>Ventas pendientes de confirmación</h2>
        <p>Las ventas offline no generan ticket hasta que el servidor las confirme. Si hay un conflicto de stock, revisa existencias y reintenta con el mismo identificador.</p>
        <div id="ops-pending-sales" aria-live="polite"></div>
      </section>
      <section id="ops-admin" hidden>
        <section class="panel" style="margin-bottom:20px">
          <h2>Sucursales y lugares de venta</h2>
          <p>Las ubicaciones se guardan en los tickets; el inventario sigue siendo compartido entre todas, según la configuración elegida.</p>
          <form id="ops-location-form" class="report-controls"><label>Nombre de ubicación<input id="ops-location-name" maxlength="100" required placeholder="Local, feria o sucursal"></label><button class="btn" type="submit">Agregar ubicación</button></form>
          <div id="ops-locations"></div>
        </section>
        <section class="panel" style="margin-bottom:20px">
          <h2>Proveedores</h2>
          <form id="ops-supplier-form" class="report-controls"><label>Nombre<input id="ops-supplier-name" maxlength="120" required></label><label>Contacto<input id="ops-supplier-contact" maxlength="120"></label><label>Teléfono<input id="ops-supplier-phone" maxlength="40"></label><label>Correo<input id="ops-supplier-email" type="email" maxlength="150"></label><button class="btn" type="submit">Guardar proveedor</button></form>
          <div id="ops-suppliers"></div>
        </section>
        <section class="panel" style="margin-bottom:20px">
          <h2>Órdenes de compra</h2>
          <form id="ops-order-line" class="report-controls">
            <label>Proveedor<select id="ops-order-supplier" required></select></label>
            <label>Producto<select id="ops-order-product" required></select></label>
            <label>Paquetes<input id="ops-order-packages" type="number" min="1" step="1" value="1" required></label>
            <label>Unidades por paquete<input id="ops-order-units" type="number" min="1" step="1" value="1" required></label>
            <label>Costo por paquete (S/)<input id="ops-order-cost" type="number" min="0" step="0.01" required></label>
            <label>Descuento por paquete (S/)<input id="ops-order-discount" type="number" min="0" step="0.01" value="0" required></label>
            <label>Precio venta por unidad (S/)<input id="ops-order-price" type="number" min="0.01" step="0.01" required></label>
            <label>Vencimiento<input id="ops-order-expiration" type="date"></label>
            <button class="btn soft" type="submit">Añadir producto a la orden</button>
          </form>
          <div id="ops-order-draft"></div>
          <button id="ops-order-save" class="btn" type="button" disabled>Crear orden de compra</button>
          <div id="ops-orders"></div>
        </section>
        <section class="panel" style="margin-bottom:20px">
          <h2>Lotes, vencimientos y mermas</h2>
          <form id="ops-lot-form" class="report-controls">
            <label>Producto recibido<select id="ops-lot-product" required></select></label>
            <label>Cantidad (unidades)<input id="ops-lot-quantity" type="number" min="0.000001" step="any" required></label>
            <label>Costo unitario (S/)<input id="ops-lot-cost" type="number" min="0" step="0.01" required></label>
            <label>Precio de venta por unidad (S/)<input id="ops-lot-price" type="number" min="0.01" step="0.01" required></label>
            <label>Vencimiento<input id="ops-lot-expiration" type="date"></label>
            <label>Proveedor<select id="ops-lot-supplier"></select></label>
            <button class="btn" type="submit">Registrar ingreso por lote</button>
          </form>
          <p>Las salidas consumen primero los lotes que vencen antes. Los lotes vencidos se bloquean en ventas y preparación.</p>
          <div id="ops-lots"></div>
        </section>
        <section class="panel" style="margin-bottom:20px">
          <h2>Indicadores</h2>
          <div class="report-controls"><label>Desde<input id="ops-metrics-from" type="date"></label><label>Hasta<input id="ops-metrics-to" type="date"></label><label>Ubicación<select id="ops-metrics-location"></select></label><button id="ops-metrics-refresh" class="btn ghost" type="button">Actualizar</button></div>
          <div id="ops-metrics" class="summary"></div>
          <div id="ops-top-products"></div>
        </section>
        <section class="panel" style="margin-bottom:20px">
          <h2>Respaldos verificados en almacenamiento externo</h2>
          <p>Se genera un respaldo diario automático en S3 y se conservan hasta 30 copias. Restaurar reemplaza los datos actuales.</p>
          <button id="ops-backup-create" class="btn soft" type="button">Crear y verificar respaldo ahora</button>
          <button id="ops-backup-refresh" class="btn ghost" type="button">Actualizar lista</button>
          <p id="ops-backup-status" role="status"></p>
          <div class="report-controls"><label>Respaldo<select id="ops-backup-list"></select></label><button id="ops-backup-restore" class="btn danger" type="button">Restaurar respaldo</button></div>
        </section>
      </section>`;
    app.append(view);
  }

  function activeShift() {
    return (state?.cashShifts || []).find(shift => shift.cashierId === user?.id && shift.status === 'open');
  }

  function saleContext() {
    const shift = activeShift();
    return shift ? { cashShiftId: shift.id, locationId: shift.locationId } : null;
  }

  function updateSaleButton() {
    const button = document.getElementById('btn-process-sale');
    if (!button) return;
    const shift = activeShift();
    button.disabled = !shift;
    button.title = shift ? '' : 'Abre un turno desde Operación antes de registrar ventas.';
    button.textContent = shift ? 'Procesar Venta' : 'Abre un turno para vender';
  }

  function renderShift() {
    const openForm = document.getElementById('ops-shift-open');
    if (!openForm) return;
    const locations = state?.locations || [{ id: 'local', name: 'Local' }];
    const selector = document.getElementById('ops-location-select');
    const previousLocation = selector.value;
    selector.innerHTML = locations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
    if (locations.some(location => location.id === previousLocation)) selector.value = previousLocation;
    const shift = activeShift();
    openForm.hidden = Boolean(shift);
    document.getElementById('ops-shift-close').hidden = !shift;
    document.getElementById('ops-shift-status').textContent = shift
      ? `Turno abierto · ${locations.find(location => location.id === shift.locationId)?.name || 'Ubicación'} · Fondo inicial ${money(shift.openingAmount)}`
      : 'No tienes un turno abierto. Las ventas están bloqueadas hasta abrir uno.';
    document.getElementById('ops-offline-note').textContent = bootOffline || !navigator.onLine
      ? 'Modo sin conexión: solo puedes dejar ventas pendientes. No se emiten tickets ni se permiten cambios de inventario.'
      : 'Con conexión · Los cambios y confirmaciones se guardan en el servidor.';
    updateSaleButton();
  }

  function renderLocationsAndProducts() {
    const locations = state?.locations || [];
    const products = (state?.items || []).filter(item => item.tipo === 'producto');
    const productOptions = products.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nombre)} · ${escapeHtml(item.sku)}</option>`).join('');
    for (const id of ['ops-order-product', 'ops-lot-product']) {
      const select = document.getElementById(id);
      if (select) select.innerHTML = productOptions;
    }
    const locationList = document.getElementById('ops-locations');
    if (locationList) locationList.innerHTML = locations.map(location => `<span class="status-chip">${escapeHtml(location.name)}</span>`).join(' ');
    const metricsLocation = document.getElementById('ops-metrics-location');
    if (metricsLocation) {
      const selected = metricsLocation.value || 'all';
      metricsLocation.innerHTML = '<option value="all">Todas</option>' + locations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
      metricsLocation.value = locations.some(location => location.id === selected) ? selected : 'all';
    }
  }

  function renderSuppliersAndOrders() {
    const suppliers = state?.suppliers || [];
    for (const id of ['ops-order-supplier', 'ops-lot-supplier']) {
      const select = document.getElementById(id);
      if (select) select.innerHTML = `<option value="">${id === 'ops-lot-supplier' ? 'Sin proveedor' : 'Selecciona proveedor'}</option>` + suppliers.map(supplier => `<option value="${escapeHtml(supplier.id)}">${escapeHtml(supplier.name)}</option>`).join('');
    }
    const supplierList = document.getElementById('ops-suppliers');
    if (supplierList) supplierList.innerHTML = suppliers.length
      ? `<ul>${suppliers.map(supplier => `<li>${escapeHtml(supplier.name)}${supplier.phone ? ` · ${escapeHtml(supplier.phone)}` : ''}${supplier.email ? ` · ${escapeHtml(supplier.email)}` : ''}</li>`).join('')}</ul>`
      : '<p>Aún no hay proveedores registrados.</p>';
    const orders = state?.purchaseOrders || [];
    const orderList = document.getElementById('ops-orders');
    if (orderList) orderList.innerHTML = orders.length ? `<div class="clean-table-container"><table class="clean-table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Artículos</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${orders.map(order => `<tr><td>${escapeHtml(dateLabel(order.createdAt))}</td><td>${escapeHtml(order.supplierName)}</td><td>${order.lines.map(line => `${escapeHtml(line.name)} × ${line.quantity}`).join('<br>')}</td><td>${escapeHtml(order.status)}</td><td>${order.status === 'Pendiente' ? `<button class="btn soft small" data-receive-order="${escapeHtml(order.id)}">Recibir e ingresar stock</button>` : escapeHtml(dateLabel(order.receivedAt))}</td></tr>`).join('')}</tbody></table></div>` : '<p>No hay órdenes de compra.</p>';
    const draft = document.getElementById('ops-order-draft');
    if (draft) draft.innerHTML = orderLines.length ? `<ol>${orderLines.map((line, index) => `<li>${escapeHtml(line.name)} · ${line.packages} × ${line.units} · ${line.expirationDate ? `vence ${escapeHtml(line.expirationDate)}` : 'sin vencimiento registrado'} <button class="btn ghost small" type="button" data-remove-order-line="${index}">Quitar</button></li>`).join('')}</ol>` : '<p>La orden está vacía.</p>';
    const saveButton = document.getElementById('ops-order-save');
    if (saveButton) saveButton.disabled = !orderLines.length || !suppliers.length || !navigator.onLine;
  }

  function renderLots() {
    const target = document.getElementById('ops-lots');
    if (!target) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lots = (state?.lots || []).filter(lot => Number(lot.remainingQty) > 0).sort((a, b) => (a.expirationDate || '9999-12-31').localeCompare(b.expirationDate || '9999-12-31'));
    target.innerHTML = lots.length ? `<div class="clean-table-container"><table class="clean-table"><thead><tr><th>Producto / SKU</th><th>Disponible</th><th>Vencimiento</th><th>Estado</th><th>Merma</th></tr></thead><tbody>${lots.map(lot => {
      const product = state.items.find(item => item.id === lot.productId);
      const days = lot.expirationDate ? Math.ceil((new Date(`${lot.expirationDate}T00:00:00`) - today) / 86400000) : null;
      const status = days === null ? 'Sin fecha' : days < 0 ? 'Vencido · no vendible' : days <= 30 ? `Por vencer · ${days} días` : 'Vigente';
      return `<tr><td>${escapeHtml(product?.nombre || 'Producto eliminado')}<br>${escapeHtml(product?.sku || '')}</td><td>${Number(lot.remainingQty)}</td><td><input type="date" data-lot-expiration="${escapeHtml(lot.id)}" value="${escapeHtml(lot.expirationDate || '')}"><button class="btn ghost small" data-save-expiration="${escapeHtml(lot.id)}" ${!navigator.onLine ? 'disabled' : ''}>Guardar</button></td><td>${escapeHtml(status)}</td><td><button class="btn ghost small" data-waste-lot="${escapeHtml(lot.id)}" ${!navigator.onLine ? 'disabled' : ''}>Registrar merma</button></td></tr>`;
    }).join('')}</tbody></table></div>` : '<p>No hay lotes con existencias.</p>';
  }

  function renderMetrics() {
    const target = document.getElementById('ops-metrics');
    if (!target || user?.role !== 'admin') return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    const from = document.getElementById('ops-metrics-from').value || today;
    const to = document.getElementById('ops-metrics-to').value || today;
    const locationId = document.getElementById('ops-metrics-location').value || 'all';
    const receipts = (state.receipts || []).filter(receipt => receipt.status !== 'voided' && receipt.businessDate >= from && receipt.businessDate <= to && (locationId === 'all' || receipt.locationId === locationId));
    const revenue = receipts.reduce((sum, receipt) => sum + Number(receipt.total || 0), 0);
    const costs = receipts.reduce((sum, receipt) => sum + (receipt.costs || []).reduce((total, cost) => total + Number(cost.unitCost || 0) * (receipt.lines?.find(line => line.productId === cost.productId)?.qty || 0), 0), 0);
    const expired = (state.lots || []).filter(lot => lot.expirationDate && lot.expirationDate < today && lot.remainingQty > 0).reduce((sum, lot) => sum + Number(lot.remainingQty), 0);
    const waste = (state.kardex || []).filter(item => item.type === 'WASTE').reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const cards = [['Ventas confirmadas', money(revenue)], ['Tickets confirmados', receipts.length], ['Margen bruto estimado', money(revenue - costs)], ['Unidades vencidas disponibles', expired], ['Unidades mermadas registradas', waste]];
    target.innerHTML = cards.map(([label, value]) => `<article class="sum-card"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(value)}</div></article>`).join('');
    const totals = new Map();
    for (const receipt of receipts) for (const line of receipt.lines || []) {
      const product = state.items.find(item => item.id === line.productId);
      const entry = totals.get(line.productId) || { name: line.nombre, quantity: 0, revenue: 0 };
      entry.quantity += Number(line.qty); entry.revenue += Number(line.net ?? line.subtotal ?? 0); totals.set(line.productId, entry);
      if (!product) entry.name = line.nombre;
    }
    const ranking = [...totals.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
    document.getElementById('ops-top-products').innerHTML = ranking.length ? `<h3>Productos más vendidos en el periodo</h3><ol>${ranking.map(item => `<li>${escapeHtml(item.name)} · ${item.quantity} unidades · ${money(item.revenue)}</li>`).join('')}</ol>` : '<p>No hay ventas confirmadas en el periodo seleccionado.</p>';
  }

  async function renderPending() {
    const target = document.getElementById('ops-pending-sales');
    if (!target) return;
    try {
      const pending = await listPending();
      target.innerHTML = pending.length ? `<div class="clean-table-container"><table class="clean-table"><thead><tr><th>Fecha de registro</th><th>Artículos</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${pending.map(item => `<tr><td>${escapeHtml(dateLabel(item.createdAt))}</td><td>${(item.payload.sale.lines || []).map(line => `${escapeHtml(state?.items?.find(product => product.id === line.id)?.nombre || line.id)} × ${line.qty}`).join('<br>')}</td><td>${escapeHtml(item.message)}</td><td><button class="btn soft small" data-retry-sale="${escapeHtml(item.id)}" ${!navigator.onLine || item.userId !== user?.id ? 'disabled' : ''}>Reintentar confirmación</button></td></tr>`).join('')}</tbody></table></div>` : '<p>No hay ventas pendientes en este dispositivo.</p>';
    } catch (error) {
      target.textContent = error.message;
    }
  }

  async function renderBackups(force = false) {
    const select = document.getElementById('ops-backup-list');
    if (!select || user?.role !== 'admin' || !navigator.onLine || (backupsLoaded && !force)) return;
    const status = document.getElementById('ops-backup-status');
    try {
      const result = await Cloud.api('backupList');
      backupsLoaded = true;
      select.innerHTML = result.backups.length ? result.backups.map(item => `<option value="${escapeHtml(item.key)}">${escapeHtml(dateLabel(item.createdAt))} · ${(item.size / 1024).toFixed(1)} KB</option>`).join('') : '<option value="">No hay respaldos disponibles</option>';
      if (!result.backups.length) status.textContent = 'Aún no hay respaldos S3.';
    } catch (error) {
      backupsLoaded = true;
      status.textContent = error.message;
    }
  }

  function render() {
    if (!state || !user) return;
    const admin = user.role === 'admin';
    document.getElementById('ops-admin').hidden = !admin;
    renderShift();
    renderLocationsAndProducts();
    renderSuppliersAndOrders();
    renderLots();
    renderMetrics();
    void renderPending();
    if (admin && navigator.onLine) void renderBackups();
  }

  async function syncPending() {
    if (!navigator.onLine || !user) return;
    const pending = await listPending();
    for (const item of pending) {
      if (item.userId !== user.id) continue;
      try {
        const result = await originalApi('sale', item.payload);
        await saveSnapshot(result);
        await removeRecord(item.id);
        const status = document.getElementById('ops-shift-result');
        if (status) status.textContent = `Venta offline confirmada por el servidor: ${result.receipt.ticketNum}.`;
      } catch (error) {
        item.status = error.status === 409 ? 'review' : 'pending';
        item.message = error.status === 409 ? `Requiere revisión: ${error.message}. No se emitió ticket.` : 'Pendiente de confirmación; conserva el identificador original.';
        await putRecord(item);
        if (error.networkError || !navigator.onLine) break;
      }
    }
    await renderPending();
  }

  async function call(action, payload) {
    if (!navigator.onLine) throw new Error('Conecta el dispositivo para confirmar este cambio en el servidor.');
    const result = await Cloud.api(action, payload);
    return result;
  }

  function bindForms() {
    document.getElementById('ops-shift-open').addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const result = await call('shiftOpen', { shift: { locationId: document.getElementById('ops-location-select').value, openingAmount: Number(document.getElementById('ops-opening-amount').value) } });
        await saveSnapshot(result);
      } catch (error) { document.getElementById('ops-shift-result').textContent = error.message; }
    });
    document.getElementById('ops-shift-close').addEventListener('submit', async event => {
      event.preventDefault();
      const shift = activeShift();
      if (!shift) return;
      try {
        const result = await call('shiftClose', { shift: { shiftId: shift.id, closingAmount: Number(document.getElementById('ops-closing-amount').value) } });
        await saveSnapshot(result);
        const closed = result.state.cashShifts.find(item => item.id === shift.id);
        document.getElementById('ops-shift-result').textContent = `Turno cerrado · efectivo esperado ${money(closed.expectedCash)} · contado ${money(closed.closingAmount)} · diferencia ${money(closed.difference)}.`;
      } catch (error) { document.getElementById('ops-shift-result').textContent = error.message; }
    });
    document.getElementById('ops-location-form').addEventListener('submit', async event => {
      event.preventDefault();
      try { await call('location', { location: { name: document.getElementById('ops-location-name').value } }); event.currentTarget.reset(); }
      catch (error) { document.getElementById('ops-shift-result').textContent = error.message; }
    });
    document.getElementById('ops-supplier-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      supplierAttemptId ||= crypto.randomUUID();
      try {
        await call('supplier', { supplier: { id: supplierAttemptId, name: document.getElementById('ops-supplier-name').value, contact: document.getElementById('ops-supplier-contact').value, phone: document.getElementById('ops-supplier-phone').value, email: document.getElementById('ops-supplier-email').value } });
        form.reset();
        supplierAttemptId = null;
      } catch (error) { document.getElementById('ops-shift-result').textContent = error.message; }
    });
    document.getElementById('ops-order-line').addEventListener('submit', event => {
      event.preventDefault();
      const product = state.items.find(item => item.id === document.getElementById('ops-order-product').value);
      const line = {
        productId: product?.id,
        name: product?.nombre,
        packages: Number(document.getElementById('ops-order-packages').value),
        units: Number(document.getElementById('ops-order-units').value),
        cost: Number(document.getElementById('ops-order-cost').value),
        discount: Number(document.getElementById('ops-order-discount').value),
        price: Number(document.getElementById('ops-order-price').value),
        expirationDate: document.getElementById('ops-order-expiration').value || null,
      };
      if (!product || !Number.isInteger(line.packages) || line.packages <= 0 || !Number.isInteger(line.units) || line.units <= 0 || line.cost < line.discount || line.price <= 0) return;
      orderLines.push(line);
      renderSuppliersAndOrders();
    });
    document.getElementById('ops-order-draft').addEventListener('click', event => {
      const button = event.target.closest('[data-remove-order-line]');
      if (!button) return;
      orderLines.splice(Number(button.dataset.removeOrderLine), 1);
      renderSuppliersAndOrders();
    });
    document.getElementById('ops-orders').addEventListener('click', async event => {
      const button = event.target.closest('[data-receive-order]');
      if (!button) return;
      button.disabled = true;
      try { await call('purchaseReceive', { order: { orderId: button.dataset.receiveOrder } }); }
      catch (error) {
        document.getElementById('ops-shift-result').textContent = error.message;
        button.disabled = false;
      }
    });
    document.getElementById('ops-order-save').addEventListener('click', async () => {
      const supplierId = document.getElementById('ops-order-supplier').value;
      if (!supplierId || !orderLines.length) return;
      try {
        const signature = JSON.stringify({ supplierId, lines: orderLines });
        if (orderAttempt?.signature !== signature) orderAttempt = { signature, requestId: crypto.randomUUID() };
        await call('purchaseOrder', { order: { requestId: orderAttempt.requestId, supplierId, lines: orderLines } });
        orderLines = [];
        orderAttempt = null;
        renderSuppliersAndOrders();
      } catch (error) { document.getElementById('ops-shift-result').textContent = error.message; }
    });
    document.getElementById('ops-lot-form').addEventListener('submit', async event => {
      event.preventDefault();
      const product = state.items.find(item => item.id === document.getElementById('ops-lot-product').value);
      if (!product) return;
      const quantity = Number(document.getElementById('ops-lot-quantity').value);
      const unitCost = Number(document.getElementById('ops-lot-cost').value);
      const request = { id: product.id, packages: quantity, units: 1, cost: quantity * unitCost, discount: 0, price: Number(document.getElementById('ops-lot-price').value), expirationDate: document.getElementById('ops-lot-expiration').value || null, supplierId: document.getElementById('ops-lot-supplier').value || null };
      try {
        const signature = JSON.stringify(request);
        if (lotAttempt?.signature !== signature) lotAttempt = { signature, requestId: crypto.randomUUID() };
        await call('restock', { restock: { ...request, requestId: lotAttempt.requestId } });
        lotAttempt = null;
        event.currentTarget.reset();
      } catch (error) { document.getElementById('ops-shift-result').textContent = error.message; }
    });
    document.getElementById('ops-backup-create').addEventListener('click', async () => {
      const status = document.getElementById('ops-backup-status');
      status.textContent = 'Creando y verificando copia...';
      try {
        const result = await Cloud.api('backupCreate');
        status.textContent = `Respaldo verificado: ${result.backup.key}`;
        await renderBackups(true);
      } catch (error) { status.textContent = error.message; }
    });
    document.getElementById('ops-backup-refresh').addEventListener('click', () => void renderBackups(true));
    document.getElementById('ops-backup-restore').addEventListener('click', async () => {
      const key = document.getElementById('ops-backup-list').value;
      if (!key || !confirm('La restauración reemplazará inventario, ventas y configuración actuales. ¿Continuar?')) return;
      try {
        const result = await Cloud.api('backupRestore', { key });
        await saveSnapshot(result);
        document.getElementById('ops-backup-status').textContent = `Respaldo restaurado. Revisión ${result.revision}.`;
      } catch (error) { document.getElementById('ops-backup-status').textContent = error.message; }
    });
    document.getElementById('ops-pending-sales').addEventListener('click', event => {
      const button = event.target.closest('[data-retry-sale]');
      if (button) void syncPending();
    });
    document.getElementById('ops-lots').addEventListener('click', async event => {
      const expiryButton = event.target.closest('[data-save-expiration]');
      if (expiryButton) {
        const input = [...document.querySelectorAll('[data-lot-expiration]')].find(item => item.dataset.lotExpiration === expiryButton.dataset.saveExpiration);
        if (!input) return;
        try { await call('lotExpiration', { lot: { lotId: expiryButton.dataset.saveExpiration, expirationDate: input.value || null } }); }
        catch (error) { document.getElementById('ops-shift-result').textContent = error.message; }
        return;
      }
      const button = event.target.closest('[data-waste-lot]');
      if (!button) return;
      const quantity = Number(prompt('Cantidad que se dará de baja por merma:'));
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      const reason = prompt('Motivo de la merma (mínimo 3 caracteres):');
      if (!reason) return;
      button.dataset.requestId ||= crypto.randomUUID();
      try { await call('waste', { waste: { lotId: button.dataset.wasteLot, quantity, reason, requestId: button.dataset.requestId } }); }
      catch (error) { document.getElementById('ops-shift-result').textContent = error.message; }
    });
    document.getElementById('ops-metrics-refresh').addEventListener('click', renderMetrics);
    for (const id of ['ops-metrics-from', 'ops-metrics-to', 'ops-metrics-location']) document.getElementById(id).addEventListener('change', renderMetrics);
  }

  function initialize(boot) {
    state = boot.state;
    user = boot.user;
    policy = boot.policy;
    bootOffline = Boolean(boot.offline);
    createView();
    bindForms();
    render();
    window.addEventListener('online', () => { bootOffline = false; render(); void syncPending(); });
    window.addEventListener('offline', () => { render(); });
    if (navigator.onLine) void syncPending();
  }

  Cloud.start = async () => {
    const boot = await originalStart();
    initialize(boot);
    return boot;
  };

  window.SmartOps = { saleContext, syncPending, snapshot: () => state };
})();
