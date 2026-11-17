# Empaques y consumibles

Disponible en el menú lateral para perfiles de administración. Registrar/editar y asignar requiere permiso de catálogo; comprar requiere compras; uso y conteos requieren ajustes. El vendedor consume automáticamente solo mediante ventas autorizadas.

## Control independiente

1. Registrar material y unidad de control: unidad, par o paquete. Un paquete permite fracciones. La unidad se mantiene para conservar coherencia del historial.
2. Comprar/reponer: ingresar la cantidad en esa unidad y el costo total. Si se controla por unidad, una caja de 100 guantes entra como 100 unidades. Proveedor y documento son opcionales; no se solicita precio de venta.
3. Registrar uso adicional, desperdicio o saldo contado. El costo de salida se calcula con el promedio del valor restante. Puede marcarse como estimado.
4. El saldo contado se compara con el saldo del sistema, que ya incluye ventas. Si cambió mientras se completaba el formulario, se rechaza: actualizar saldos y volver a ingresar el dato. No registrar de nuevo como uso manual lo descontado automáticamente.
5. Las alertas se activan al llegar al mínimo, incluido cero. Consultar existencias, valor disponible, historial por fechas de Lima y CSV.

## Asignación opcional

Elegir un preparado, material y cantidad por unidad vendida. Guardar reemplaza la cantidad de ese material si ya estaba asignado; Quitar afecta ventas futuras. No se descuenta al asignar ni al preparar. Al vender se descuenta del mismo saldo del módulo, con historial y costo incorporado al costo vendido. No se modifica el precio de venta ni se cobra un importe adicional al cliente.

Ejemplo: 100 empaques de S/0.20; asignar uno a cada hamburguesa; vender ocho deja 92 y añade S/1.60 al costo de esas ventas. Si al cierre se cuentan 90, se registra una diferencia adicional de dos (S/0.40), no diez. Una nueva compra usa costo promedio ponderado sobre el saldo existente.

Si falta un consumible asignado, se bloquea la venta completa, sin descontar preparados ni otros materiales. Se conserva el cálculo con el que se registró cada venta para devoluciones y anulaciones. La devolución «recuperable completo» existente devuelve también los consumibles de esa venta; usarla únicamente cuando se recupera todo. No se incluye recuperación selectiva de empaques individuales.

## Costos y reportes

Las compras aumentan el valor disponible. El uso manual y los ajustes de conteo aparecen separados en Resultado operativo. Las diferencias positivas de conteo revierten valor de consumo/ajuste. Los consumibles automáticos ya forman parte del costo vendido y no se suman nuevamente como gasto. El historial distingue compra, uso, desperdicio, conteo, venta y recuperación.

Los conteos, compras y asignaciones se auditan; los reintentos usan el identificador de operación para no duplicar movimientos. El módulo comparte la persistencia y transacciones del inventario; no crea ni modifica datos de negocio durante el despliegue.

Es un control de inventario y costos operativos, no un libro contable tributario. No se implementan alertas por correo, múltiples almacenes ni asignación por pedido completo en esta entrega. Los materiales previamente registrados como mercancía no se convierten automáticamente.
