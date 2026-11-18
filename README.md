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

## Operaciones de market

En Herramientas de gestión → Operaciones de market selecciona un producto para configurar su presentación. Registra el código que leerá el escáner, el nombre, cuántas unidades base contiene y el precio completo del paquete. Repite para cada código. El SKU sigue identificando la unidad suelta. Un lector USB en modo teclado puede enviar el código y Enter en Vender.

Para venta por peso o volumen, elige kg o L y la precisión. Las existencias y el precio del producto deben estar expresados en esa unidad antes de activar la modalidad. En Vender, 350 g se introducen como 0.350 kg. El campo permite introducir manualmente la lectura de la balanza. Para una devolución usa la misma unidad histórica.

En Caja y gestión abre una caja física con nombre y el usuario del cajero responsable. Si omites el usuario, la caja admite varios vendedores. Selecciona esa caja en Vender. Al cerrar, indica efectivo contado y los totales contrastados de Yape, Plin y tarjeta. Los cobros y reembolsos requieren turno. La identificación del vendedor queda registrada en cada ticket.

En Reponer producto registra proveedor, lote y vencimiento. Vender utiliza primero los lotes vigentes con vencimiento más próximo. Retiros permite descontar un lote concreto. El saldo anterior sin lote sigue disponible. En Reposición sugerida registra plazo, cantidad pendiente de recibir y tamaño del paquete de compra. El cálculo usa los últimos 30 días, el saldo y el mínimo. Al recibir una compra se descuenta del pendiente. Conteo físico compara el saldo leído con el actual antes de confirmar.

## Comprobantes electrónicos

El conector usa la API JSON de NubeFact. Configura en el servidor la RUTA HTTPS y el TOKEN de la cuenta, la tasa de IGV aplicable en CPE_IGV y cuatro series de cuatro caracteres (factura, boleta y sus dos series de notas de crédito). Usa series nuevas, exclusivas de esa base, habilitadas por el proveedor. El correlativo comienza en 1. Las series de factura y sus notas empiezan con F y las de boleta con B. Separa credenciales y series de prueba y producción.

Desde el ticket, Mis tickets u Operaciones de market, guarda los datos del cliente para reservar el comprobante y pulsa Enviar. Si se pierde la respuesta, pulsa Consultar. El reintento reutiliza serie y número. La aceptación se registra únicamente cuando el proveedor la confirma. Cuando se reciben enlaces se muestran PDF, XML y CDR. Los supervisores de caja pueden vincular una nota a una devolución o a una venta anulada con comprobante aceptado.

La modalidad implementada cubre ventas internas en soles con todas las líneas gravadas a una misma tasa, identificación DNI o RUC, y precios con IGV incluido. Operaciones mixtas con bienes exonerados, gratuitos o inafectos requieren parametrización tributaria adicional antes de su emisión. El respaldo integral incluye los documentos fiscales, sus correlativos y estados. Manual del proveedor: https://www.nubefact.com/integracion
