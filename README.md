# SMARTBOD 4.0

Inventario, compras, recetas por dosis, preparación, ventas, caja y reportes para un negocio con existencias compartidas.

Lee **LEEME_ACTUALIZACION.md** antes de desplegar: incluye el caso de las 24 hamburguesas, la migración, las funciones comprobadas y los pendientes.

## Estructura

- public/index.html, app.js, base.css, workspace.css: interfaz y estilos.
- public/inventory-math.js: medidas, dosis y disponibilidad compartidas con servidor.
- public/operations-ui.js: caja, gastos, devoluciones, ajustes y recuperación.
- public/cloud.js: comunicación y recuperación de confirmaciones.
- lib/domain.js, operations.js, batches.js: reglas de negocio.
- lib/permissions.js: autorización de perfiles.
- lib/repository.js y schema.sql: persistencia, migración y auditoría.
- api/index.js: API, sesiones y transacciones.
- tests: pruebas de dominio, interfaz e integración.

## Configuración

Vercel sin framework, salida public, Node 22.x. Variables: DATABASE_URL, ADMIN_USERNAME y ADMIN_PASSWORD (mínimo 12 caracteres). Las credenciales iniciales solo crean el primer usuario cuando aún no existen usuarios. Nunca incluir secretos en archivos públicos.

Comandos: `npm ci`, `npm test`, `npm run test:integration`. Las pruebas de integración requieren dependencias de desarrollo.

Flujo: registrar productos y contenido → registrar compra → receta con dosis y momento de consumo → preparar revisando sobrantes → vender → conciliar caja → revisar resultados.

Este paquete no incluye la base real ni se despliega automáticamente. Respaldar antes de actualizar. Margen bruto no equivale a ganancia neta; los resultados consideran únicamente costos y gastos registrados.
