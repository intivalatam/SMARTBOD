# Comprobación de esta entrega
- Node 22.23.5. Pasaron las 128 pruebas unitarias y las pruebas de integración de API, SQL, recuperación y DOM.
- PostgreSQL 18.6 local, 10 000 tickets previos, dos cuentas de vendedor. Dos ventas mixtas simultáneas se confirmaron en 26 ms en una ejecución local de la API. Se verificaron reintento, bloqueo de efectivo con turno cerrado, consulta de tickets propios y reembolso en otro turno. Los dos cierres cuadraron.
- Recuperación en una segunda base vacía de PostgreSQL. Se verificaron el acceso con la cuenta restaurada, permisos almacenados, existencias, 10 002 tickets, imagen binaria y cierres.
- Una compra de 5 L abasteció diez porciones de 20 ml y diez de 30 ml. El saldo fue de 4.5 L.
- Chromium, interfaz de prueba con datos simulados. Navegación y edición de consumibles a 1440 y 390 px.
- Entorno de producción y dispositivos físicos pendientes de comprobación.

Para repetir la batería automatizada, ejecuta npm ci, npm test y npm run test:integration.

## Actualización de market
La batería pasó a 133 pruebas unitarias. Se comprobaron presentación más unidades sueltas, venta y devolución en kg, dos cajas con una diferencia en Yape, vencimientos, retiro y reintegro de lote, reposición por demanda y conteo concurrente. La integración fiscal probó reserva idempotente de boleta/factura, nota vinculada y recuperación de una respuesta incierta con proveedor simulado.

En Chromium conectado a la API y PostgreSQL local se creó una presentación, se introdujeron tres lecturas (paquete de seis y dos botellas), se cobró S/ 28 y quedaron 16 de las 24 unidades. Desde ese ticket se reservó la boleta B001-1 en una base de prueba. La aceptación real requiere credenciales, series y homologación o validación con el proveedor del negocio. El lector y la balanza físicos no formaron parte de la prueba.
