# SMARTBOD 4.0 — Actualización y alcance comprobado

Actualizado desde el proyecto proporcionado. Este paquete no se ha desplegado en Vercel ni conectado a tu base real.

## El caso de las 24 hamburguesas

Registrar pan y carne por unidad. Registrar cada crema como envase de 1 kg, contenido 1,000 g y dosis orientativa de 20 g (rendimiento de 50). Crear una receta de rendimiento 1: un pan, una carne y 20 g de cada crema. Elegir «Al preparar» en los cuatro ingredientes.

| Insumo | Antes | Consumo para 24 | Después |
|---|---:|---:|---:|
| Pan | 30 | 24 | 6 |
| Carne | 40 | 24 | 16 |
| Mayonesa | 1,000 g | 480 g | 520 g |
| Ketchup | 1,000 g | 480 g | 520 g |
| Hamburguesas preparadas | 0 | +24 | 24 |

Vender cinco deja 19 preparadas y no vuelve a descontar ingredientes. Si las cremas se agregan al servir, seleccionar «Al servir»: se descuentan al vender. Dosis y momento de consumo pertenecen a cada receta. La configuración antigua se conserva hasta editarla explícitamente. No se han cargado productos de prueba en tu base real.

## Implementado

- Inventario con siete columnas agrupadas, nombres con salto de línea, SKU discreto, detalle desplegable y paginación de 25 productos. Tarjetas por debajo de 1,050 px. Archivo y reactivación de productos.
- Gramos/ml para envases medidos. Vista previa de disponible, consumo y sobrante antes de preparar. Dosis distintas por receta; disponibilidad para vender limitada por complementos.
- Costo promedio móvil de las existencias disponibles. Valorización de preparados incluida. Ventas conservan su costo histórico. Avisos de costo cero o margen superior al 90 % para revisar datos, no como afirmación de un error.
- Lotes de preparados con referencia de receta y vencimiento opcional. Venta prioriza vencimiento próximo y excluye lotes vencidos. Las mermas permiten retirarlos. Sin fecha, no es posible determinar vencimiento.
- Cambios de receta bloqueados mientras quedan preparados, para no alterar el consumo de lotes anteriores. Se conservan versiones de recetas. Para cambiar, terminar el lote, registrar merma o crear otra receta.
- Compras con proveedor, documento, fecha y gastos asociados. Historial también para precios de elaborados. Detección de documento repetido por producto/proveedor.
- Control de importación repetida mediante huella SHA-256 del archivo. Detecta el mismo archivo, no todas sus variantes reformateadas.
- Mermas y ajustes validados en servidor. Verificación del valor total del saldo inicial con motivo; conserva cantidades y ventas históricas.
- Apertura, movimientos y cierre de caja; esperado, contado y diferencia. Un turno abierto por negocio. Pagos divididos y referencia del cobro.
- Devoluciones parciales con destino recuperable/no recuperable y reembolso registrado. La plataforma registra el reembolso, no transfiere dinero ni confirma abonos bancarios.
- Gastos por local/evento. Margen bruto por periodo/origen, gastos y resultado operativo de lo registrado. Mermas incluidas solo al consultar todos los orígenes, pues no se asignan a evento.
- Cobertura según ventas de 30 días y productos sin ventas. Para insumos sin venta directa esta métrica no sustituye el análisis de consumo de recetas.
- Perfiles de administración completa, almacén/compras, producción, supervisión/caja y vendedor. Los perfiles de gestión ven información administrativa; las escrituras se restringen en el servidor. No son permisos por campo.
- Auditoría de cambios y operaciones. Copia antes de restaurar y primera escritura después de 24 horas sin copia diaria. Retención de copias diarias por 30 días. Descarga desde Caja y gestión.
- Consulta de confirmación de operación pendiente al volver a entrar; se conserva solo su identificador en la sesión del navegador. No reconstruye carritos ni permite vender sin red.
- Formularios conservados en pantalla ante fallo de guardado. Mensajes de confirmación posteriores a la respuesta del servidor en los flujos actualizados.
- Persistencia por entidades, lecturas sin bloqueo de escritura y cambios transaccionales. Se conserva un bloqueo global de escritura para proteger stock.
- Separación de HTML, estilos, aplicación, cálculos, operaciones, permisos y persistencia. Bibliotecas de gráficos/Excel/PDF incluidas localmente.

## Actualizar conservando datos

1. Exportar respaldo JSON de la versión actual y una copia de la base del proveedor.
2. Descomprimir. Subir el contenido de SMARTBOD al repositorio conectado a Vercel. No subir node_modules ni secretos.
3. Conservar DATABASE_URL, ADMIN_USERNAME y ADMIN_PASSWORD existentes.
4. Probar primero en staging. El esquema añade tablas y columnas de manera idempotente. La primera escritura migra el estado a entidades; el usuario SQL necesita permisos para tablas, índices y columnas.
5. Comprobar inventario, receta, compra y venta con datos de prueba antes de cambiar producción.
6. Revisar los productos con «Saldo inicial estimado». Contrastar sus compras y existencias físicas y usar «Caja y gestión → Verificar valor del saldo inicial» cuando corresponda.

No es posible reconstruir costos omitidos. Los saldos antiguos parten del promedio histórico existente como estimación: no se inventan compras ni lotes pasados. Descargar una copia interna e importarla requiere administración completa; restaurar genera antes una copia de seguridad.

## Validación

105 pruebas automáticas de dominio y funciones de interfaz. Integración del endpoint con PostgreSQL embebido (PGlite): autenticación, guardado, ventas, costos, copias, auditoría y restricciones por perfil. Migración SQL repetible y lectura/escritura de entidades. JSDOM: inicio, vista previa, preparación de 24, sobrantes, edición y guardado. Verificación sintáctica de módulos.

Comandos: `npm ci`, `npm test`, `npm run test:integration`. También se repitieron las 105 pruebas y las tres comprobaciones de integración en Node 22.23.5, con resultado satisfactorio. El despliegue conserva Node 22.x. Las pruebas de integración requieren las dependencias de desarrollo.

## Pendientes y límites

- Despliegue y validación contra tu base real: no realizados.
- Validación visual en navegador real y dispositivos iPhone/Android/Huawei: pendiente. Chromium no pudo iniciarse en el entorno; JSDOM no comprueba píxeles, responsive real, impresión o instalación PWA.
- Ventas offline, sincronización y conflictos entre dispositivos: NO implementados; se exige conexión para confirmar.
- Múltiples almacenes y transferencias: NO implementados. Local y eventos comparten existencias.
- Lotes y vencimientos de insumos comprados: pendientes. Los lotes agregados son de preparados.
- Copias externas y recuperación ante pérdida del proveedor: requieren configuración externa. Las copias internas comparten la base y se generan al operar, no por un cron independiente.
- Paginación de servidor y pruebas de carga/concurrencia real: pendientes. El cliente recibe todavía el historial completo.
- No se conectaron pagos, facturación tributaria, conciliación bancaria automática ni notificaciones.
- Devolución recuperable de preparado supone recuperación completa, incluidos complementos al servir. No hay recuperación selectiva por ingrediente.
- No se afirma que todas las recomendaciones anteriores estén terminadas ni una auditoría exhaustiva de seguridad o dependencias.
