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

## Respaldo integral de SMARTBOD
Con Node y las dependencias instaladas, configura DATABASE_URL en el entorno del administrador y ejecuta
`node scripts/recovery.mjs backup smartbod.gz`. El archivo contiene inventario, ventas, caja, cuentas con hashes de contraseñas, permisos, fotos, auditoría y copias operativas. Guárdalo en almacenamiento privado y cifrado. Para recuperar en una base nueva, configura RESTORE_DATABASE_URL y ejecuta `node scripts/recovery.mjs restore smartbod.gz`. El programa comprueba que el destino esté libre de tablas SMARTBOD. Inicia sesión nuevamente y contrasta el cierre de caja, existencias y fotografías antes de cambiar la conexión de producción. La restauración requiere volver a iniciar sesión.

## Operación diaria
- Un administrador o supervisor abre el turno en Herramientas de gestión → Caja y gestión. El efectivo de pagos simples o mixtos y los reembolsos en efectivo se asignan al turno correspondiente.
- Para vasos comprados en paquetes, registra el material con unidad de control «Unidad». En Reponer indica los paquetes, las unidades por paquete y el costo total. Los materiales existentes conservan la unidad con la que fueron registrados.
- Para aceite, cremas u otros ingredientes compartidos, registra el contenido de referencia (g, kg, ml o L). En cada receta indica la dosis por porción y si se descuenta al preparar o al vender. En Reponer puedes indicar el contenido real de cada envase comprado, en g o ml. El costo y el saldo se convierten a la presentación de referencia. La venta directa del insumo sigue expresada en esa presentación.
