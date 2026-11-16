# Actualización: precios históricos, uso sencillo e instalación móvil

## Actualizar tu instalación
Descarga un respaldo desde SMARTBOD. Extrae el ZIP y reemplaza en GitHub el contenido completo de la carpeta SMARTBOD: api, lib, public, tests, package.json y vercel.json. Incluye prices.js, pwa.js, sw.js, offline.html, manifest.webmanifest y los iconos en public/assets. Conserva DATABASE_URL, las variables actuales y la base de datos. No requiere otro servicio. Revisa el despliegue en Vercel antes de iniciar ventas.

## Reponer con precios nuevos
Busca el producto existente y pulsa «+ Reponer stock».
1. Indica cuántas unidades/envases o paquetes compraste.
2. Escribe el costo NUEVO de la compra, el descuento y el precio de venta NUEVO. Los precios anteriores aparecen como referencia. Si la venta no cambia, pulsa «Mantener precio de venta actual». El costo nuevo no se rellena con un promedio antiguo.
3. Revisa el stock resultante, compra neta, costo por unidad y precio que cobrarás. Pulsa «Guardar compra y nuevos precios».

Se registra costo neto por unidad/envase, precio de venta, cantidad, total, fecha, responsable y datos del paquete. Reintentar la misma operación no duplica la compra. Los tickets anteriores conservan sus precios y costos. Editar el precio de un producto también deja una fila; una edición sin compra no se cuenta como compra.

En Inventario se muestra la última compra y, por separado, el costo promedio registrado. Los cálculos de costos existentes siguen utilizando el costo acumulado de compras dividido entre unidades compradas (y el valor de preparación para platos). No se ha convertido el sistema a FIFO ni a valoración por lotes. La última compra no sobrescribe el costo histórico del inventario.

## Evolución y métricas
Pulsa «Ver evolución de precios» o Reportes > Historial de precios. Selecciona producto y fechas.
- Compras registradas e importe total.
- Para un producto: costo mínimo y máximo, promedio ponderado por unidades y variaciones de compra/venta.
- Gráfico de compra y venta, con tabla por movimiento.
- Guardar reporte, descargar Excel/PDF e imprimir. Los archivos Excel/PDF contienen la tabla; imprimir incluye las métricas visibles.

Las tarjetas comparan primer y último registro del periodo; la tabla compara cada registro con el precio anterior, que puede estar fuera del periodo. Con un solo registro, o base cero, no hay comparación porcentual. No se mezclan precios de productos diferentes en una media. Si no carga Chart.js, la tabla sigue disponible.

El historial empieza con los movimientos registrados tras esta actualización. No se inventan precios ni fechas de compras anteriores. Se conserva en respaldos JSON y se recupera al restaurarlos. La restauración, exclusiva del administrador y con confirmación, reemplaza los datos actuales.

## Uso más sencillo
Accesos para vender, reponer y consultar precios. Reposición en tres pasos, textos más grandes, botones táctiles amplios, etiquetas «Vender» y «Entradas y salidas», ayudas y resumen previo al guardado. Vendedores solo ven las tareas autorizadas. La sugerencia de precio queda dentro de «Ayúdame a calcular el precio de venta». Se conservan las funciones anteriores.

## Instalar en el teléfono
Abre https://smartbod.intiva.edu.pe tras desplegar y pulsa «Instalar en mi teléfono».
- iPhone: Safari > Compartir > Añadir a pantalla de inicio. Si aparece «Abrir como app web», actívalo.
- Android: botón de instalación cuando esté disponible, o menú del navegador > Instalar aplicación / Añadir a pantalla de inicio.
- Huawei: menú del navegador > Añadir a pantalla de inicio. Según modelo, sistema y navegador puede crear un acceso directo en vez de una instalación independiente. Sin esa opción puedes seguir usando la web.

Es una aplicación web instalable (PWA), no un APK ni una publicación en App Store, Google Play o AppGallery. Usa las mismas cuentas y base de datos. Necesita HTTPS y conexión para consultar y guardar operaciones. Sin red muestra ayuda: no guarda ventas en una cola ni sincroniza después. El service worker solo almacena una página pública de ayuda, no datos del negocio. Si se interrumpe una operación, revisa el resultado al reconectar antes de iniciar otra distinta.
Referencia técnica: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable

## Verificación
79 pruebas automatizadas aprobadas: dominio, precios, reportes, formularios con DOM simulado, manifest, iconos y límites del service worker. Sintaxis, referencias de interfaz, recursos locales y CSP comprobados. Pendiente: prueba visual completa, conexión a tu PostgreSQL y prueba de instalación en dispositivos físicos iPhone/Android/Huawei. No se ha desplegado automáticamente.

---

## Mejoras de la versión anterior

# Nueva clasificación visible antes de la imagen

Inventario > Editar producto > ¿Cómo se utiliza este producto?

1. **Por unidad / cantidad de receta:** pan, carne u otros insumos cuya cantidad se indica en la receta. Se consumen al preparar.
2. **Envase para varias porciones:** registra directamente cuántas porciones rinde una bolsa o envase. Se consume la fracción correspondiente al vender.
3. **Por peso o volumen:** ingresa contenido del envase (kg, g, l o ml) y dosis por hamburguesa (g o ml). El rendimiento se calcula automáticamente y se descuenta al vender. No convierte masa a volumen.

Ejemplo ilustrativo: mayonesa de 1 kg que cuesta S/17, con una dosis que tú determines de 20 g, rinde 50 hamburguesas. Cuesta S/0,34 por hamburguesa. Vender 24 usa 480 g (0,48 envases), con costo de mayonesa S/8,16; quedan 520 g. Los 20 g son un ejemplo, no una dosis predeterminada. Puedes cambiar rendimiento o dosis para ventas futuras.

La vista previa muestra costo por porción y consumo equivalente para 24 ventas. En cada producto existente debes guardar la clasificación correcta; no se deduce el rendimiento por el nombre. Elige una de las tres opciones antes de guardar. Las recetas que lo incluyen usarán el rendimiento actualizado. Los campos aparecen antes de la imagen para que no queden ocultos debajo de ella.

La foto enviada muestra un formulario sin estos controles. Para disponer de ellos hay que reemplazar public, lib y api juntos con esta entrega. La actualización no se ha aplicado automáticamente a tu sitio.

---

# SMARTBOD · Rendimiento de insumos y descuento al vender

## Actualizar tu instalación existente
1. Descarga un respaldo JSON desde SMARTBOD.
2. Descomprime este ZIP. Sube el CONTENIDO de la carpeta SMARTBOD a la raíz de tu repositorio, sustituyendo los archivos anteriores: public, api, lib, tests, package.json y vercel.json. No subas únicamente el ZIP ni únicamente index.html. Incluye public/assets/login-reference.png.
3. Conserva tu base de datos, DATABASE_URL y las demás variables actuales. No requiere nuevas variables. Mantén la salida public y la configuración existente del proyecto.
4. Revisa el nuevo despliegue de Vercel y entra a smartbod.intiva.edu.pe. No restaures el respaldo sobre los datos actuales salvo que necesites recuperarlos.
5. Confirma una operación controlada en el despliegue antes de continuar la jornada. Esta entrega fue comprobada localmente; no se ha conectado a tu base real ni desplegado por ti.

## Configurar una bolsa o crema
En Inventario > Editar el producto existente:
- Presentación: Bolsa, envase, botella, etc.
- Contenido: por ejemplo 1 kg o 500 ml. Este dato es descriptivo, no convierte automáticamente gramos a unidades.
- Detalle: marca, sabor o indicaciones.
- Activa «Descontar este insumo por cada porción vendida».
- En «Un envase rinde (porciones)» registra el rendimiento real; por ejemplo, 40.
- Guarda. Usa «+ Reponer stock» para sumar compras al mismo producto sin duplicarlo. Si registras bolsas, cada unidad de stock equivale a una bolsa.

Incluye ese insumo en las recetas correspondientes. Se toma su rendimiento automáticamente y se indica que se descuenta al vender. Cada plato vendido usa una porción de cada insumo configurado de esta manera; el rendimiento se comparte entre las recetas que lo incluyen. Si dos recetas necesitan dosis diferentes, esta versión no incorpora un multiplicador de dosis por receta: configura insumos separados con existencias asignadas coherentemente o usa el consumo por receta durante la preparación.

Ejemplo: una bolsa de papas al hilo rinde 40 porciones. Preparar 24 hamburguesas no consume esta bolsa. Vender 24 descuenta 0,6 bolsas y deja 0,4 bolsas (16 porciones). El pan y la carne, sin activar esta opción, se descuentan al preparar. El stock de hamburguesas listas se incrementa al preparar y disminuye al vender.

Mayonesa, ketchup y papas pueden tener rendimientos distintos. La venta valida simultáneamente todos los insumos necesarios, incluso cuando el carrito contiene varios platos. Si falta alguno, no se registra parcialmente la venta. Vender directamente un envase del catálogo descuenta un envase completo.

Anular una venta devuelve las porciones preparadas y el consumo fraccionario que se registró al vender; usa los datos históricos aunque después cambies el rendimiento. No devuelve el pan/carne consumidos en la preparación.

## Existencias anteriores
Los consumos anteriores no se recalculan. Para evitar consumir dos veces los ingredientes de tandas existentes, no se permite cambiar entre descuento al preparar y al vender si hay platos preparados pendientes que usan el insumo. Termina esas existencias antes de activar el nuevo modo. El mensaje identifica el motivo. Cambiar el número de porciones de un insumo ya configurado para descontar al vender aplica a ventas futuras.

## Incluido
Portada de acceso, reposición por unidades/paquetes, preparación rápida, roles administrador/vendedor, descuentos por perfil, eventos, reportes en pantalla y exportación, imágenes, anulaciones y plantillas permanecen integrados.

## Validación
64 pruebas automatizadas aprobadas: dominio, reportes y actualización de interfaz con DOM simulado. Incluyen consumo fraccionario, múltiples cremas, insuficiencia, reintentos, anulación, costos y stock preparado. Sintaxis JavaScript, IDs HTML y hash CSP verificados. Pendiente: revisión visual escritorio/móvil y flujo de extremo a extremo conectado a PostgreSQL en el despliegue real.
