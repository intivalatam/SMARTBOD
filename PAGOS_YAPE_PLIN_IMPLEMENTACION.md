# SMARTBOD — Cobro automático con Yape y Plin (pendiente de habilitación comercial)

## Estado
**No habilitado para cobrar.** Este documento especifica el circuito seguro antes de activar pagos reales. No se deben marcar ventas como pagadas por capturas, códigos QR estáticos, respuestas del navegador o afirmaciones del comprador.

## Proveedor
Evaluar Culqi Órdenes de Pago — Billeteras Móviles (Yape / Plin), conforme a la modalidad aprobada para el comercio. Documentación oficial: https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/billetera-moviles/

La activación requiere afiliación, claves de entorno pruebas/producción, habilitación comercial del método y configuración de webhooks. El sistema actual no contiene credenciales autorizadas ni una identidad de comercio verificada.

## Flujo obligatorio
1. Cliente elige productos; el servidor recalcula cantidad, precio y disponibilidad actual y crea `order_id` aleatorio único. Capturar nombre y celular o correo cuando se requieran para seguimiento, con aviso de privacidad y retención mínima.
2. Registrar pedido `PENDING_PAYMENT` con líneas, total calculado y vencimiento. Reservar inventario de manera atómica por tiempo limitado o comprobar saldo nuevamente al confirmar, para evitar sobreventa.
3. El backend crea orden en el proveedor con su llave privada en variables de entorno. Devuelve al navegador únicamente datos de checkout/QR permitidos.
4. Webhook recibido: validar autenticidad según documentación del proveedor; consultar al proveedor estado, monto, moneda (PEN) e identificador único de orden. No confiar en campos sin autenticar.
5. En **una sola transacción PostgreSQL** y con bloqueo por pedido, insertar evento de pago único (restricción UNIQUE por ID de transacción del proveedor), cambiar `PENDING_PAYMENT` a `PAID`, ejecutar una sola vez la misma lógica de venta, descontar inventario y consumibles, generar ticket y registrar auditoría. Cualquier duplicado de webhook debe devolver respuesta correcta sin duplicar venta.
6. Rechazos, expiraciones y cancelaciones liberan reservas. Reembolsos y anulaciones se concilian con el proveedor y la política de retorno de mercadería.
7. Conciliación periódica entre proveedor, pedidos, ventas y banco; alertas por discrepancias, reintentos e incidentes.

## Requisitos de seguridad y pruebas
- No guardar llave privada en código, GitHub ni frontend.
- Roles administrativos para reembolsos, auditoría inmutable y minimización de datos personales.
- Pruebas de webhook duplicado, falso, fuera de orden, pago parcial, dos clientes con último stock, timeout, reverso, pérdida de conexión y reintentos.
- No habilitar botón de pago en producción hasta contar con credenciales oficiales y pruebas exitosas.

## Alcance de las mejoras de esta rama
La paginación del inventario se cambia a 50; las alertas muestran cada producto crítico y permiten ubicarlo; la pantalla de consumibles ofrece accesos rápidos con permisos. Los reportes ya disponen de vista en tabla, Excel, PDF e impresión en `public/app.js`. El circuito de pagos anterior **no está conectado** ni debe considerarse implementado.
