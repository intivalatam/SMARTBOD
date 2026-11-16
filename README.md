# SMARTBOD

Aplicación estática de inventario, recetas y punto de venta.

## Publicar
1. Descomprime el ZIP y sube el contenido de SMARTBOD a la raíz de un repositorio GitHub.
2. En Vercel, importa el repositorio. Framework: Other. Sin comando de compilación. Directorio de salida: `.`.
3. Pulsa Deploy.

## Uso y límites
Los datos pertenecen al navegador y al dominio: no se sincronizan entre usuarios ni equipos. Exporta JSON antes de cambiar de dominio o equipo y al finalizar cada jornada. Importa ese archivo en el nuevo dominio. No abras varias pestañas para registrar operaciones simultáneas.
Los datos iniciales son demostrativos. Usa Vaciar todo antes de ingresar datos reales.
Los tickets son comprobantes internos; no existe integración de facturación electrónica.
No incluye usuarios, servidor ni base de datos remota. Publicar en Vercel no añade estas funciones.
Bibliotecas de gráficos/PDF/Excel y fuentes requieren conexión a sus CDN.
Las cifras históricas heredadas se congelan según los valores disponibles: no es posible reconstruir costos originales que el archivo anterior nunca guardó.

## Mejoras
Validación conjunta de insumos, pago suficiente, descuento coherente en movimientos, importación con confirmación, SKU único, protección de productos vinculados, conservación de ingresos/costos y consumo, tickets persistentes incluidos en respaldos y nueva apariencia adaptable.

## Usuarios y reportes
En la primera apertura crea el administrador con una contraseña de al menos 10 caracteres. No existen contraseñas predeterminadas. Abre Usuarios y permisos para crear vendedores, editar nombres y roles, desactivar cuentas y cambiar contraseñas. Administrador: acceso completo. Vendedor: Caja y Catálogo. Límites iniciales: administrador 100%, vendedor 0%; ajustables por el administrador.
Los descuentos se ingresan en soles y se validan contra el porcentaje máximo del subtotal antes del cobro. Los nuevos tickets registran el operador.
En Reportes elige el reporte, actualiza la vista y guarda una copia, descarga Excel/PDF o imprime. Las fechas filtran ventas y movimientos; stock es actual y rentabilidad es acumulada. Los reportes guardados se incluyen en el respaldo JSON; las cuentas y contraseñas NO se exportan.
Las contraseñas se derivan con PBKDF2-SHA256, sal aleatoria y 210000 iteraciones. Se requiere HTTPS o localhost. Cerrar sesión vacía el carrito.
IMPORTANTE: las cuentas son locales. Los controles de perfiles no constituyen autorización de servidor: quien manipule el navegador puede eludirlos. No usar esta versión como control de seguridad multiusuario. Se requiere backend y base de datos para autenticación central, recuperación de cuentas y autorización real. No se han implementado esos servicios en este paquete.

## Compras por paquetes e importacion
Inventario incluye plantillas Excel descargables y PDF rellenable (5 productos por archivo). Se aceptan XLS/XLSX con hoja Carga y el PDF SMARTBOD conservando campos. Las cargas suman compras, no reemplazan stock. Se validan todas las filas y se muestra vista previa antes de confirmar; no importar dos veces el mismo archivo.
El descuento se expresa en soles por paquete. Costo neto = paquetes * (costo paquete - descuento paquete). Costo unitario = costo neto / unidades totales. Precio sugerido = costo unitario / (1 - margen/100), redondeado hacia arriba a centimos.
Los rangos de fecha y periodos rapidos se aplican a ventas y movimientos. Existencias es una foto actual y rentabilidad es acumulada; no se reconstruye stock historico con datos insuficientes.
