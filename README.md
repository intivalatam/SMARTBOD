# SMARTBOD Cloud

Versión con API para Vercel y PostgreSQL. Requiere conectar la base de datos antes de operar. No es una versión estática ni funciona abriendo index.html desde el disco.

## Activación
1. Antes de cambiar la versión, descarga el respaldo JSON desde la plataforma anterior. Conserva el archivo fuera del navegador.
2. Crea una base PostgreSQL administrada (por ejemplo Neon) y obtén su conexión con SSL y pool. La cuenta usada por la aplicación necesita crear tablas en su base dedicada. No reutilices una base de otro sistema.
3. Sube el contenido de esta carpeta a una rama de revisión del repositorio SMARTBOD. La estructura incluye public/, api/, lib/, tests/, package.json y vercel.json. Retira del repositorio la anterior configuración estática y el index.html antiguo de raíz al integrar esta versión.
4. En Vercel: Framework Other; Root Directory raíz; Output Directory public; Install Command npm install; Build Command vacío; Node 22.x. Las rutas /api se ejecutan como funciones Node. Conserva smartbod.intiva.edu.pe en Domains.
5. En Settings > Environment Variables configura DATABASE_URL, ADMIN_USERNAME y ADMIN_PASSWORD (mínimo 12 caracteres). Solo Production para datos reales. Preview debe usar una base separada y sus propias credenciales. No copies secretos al código, al chat ni al README.
6. Despliega. El esquema se crea al recibir la primera solicitud; el primer inicio de sesión crea el administrador indicado en las variables. No hay registro público. Tras comprobar el acceso, puedes retirar ADMIN_PASSWORD y ADMIN_USERNAME del entorno y redesplegar: el usuario ya permanece en la base.
7. Desde Usuarios y permisos crea vendedores y fija descuentos. Las cuentas locales anteriores NO se importan: recréalas para darles contraseñas nuevas.
8. En Reportes restaura el respaldo JSON después de revisarlo. Reemplaza los datos centrales y requiere confirmación. Hazlo una sola vez, antes de iniciar ventas con otros equipos.
9. Comprueba con dos navegadores: login, compra, venta, stock, reporte, descuento rechazado, usuario desactivado y cierre de sesión. No elimines tu respaldo anterior.

Si ya sustituiste la versión anterior, /migrar.html permite descargar sus datos locales desde el MISMO dominio y navegador. No migra automáticamente ni borra los datos locales.

## Comportamiento
- Datos centrales en PostgreSQL, sin datos demo al iniciar.
- Sesión de 8 horas en cookie HttpOnly/Secure/SameSite, contraseñas scrypt con sal, límite de intentos de login y permisos consultados en el servidor.
- Administrador: inventario, importación, usuarios, descuentos, reportes y respaldo. Vendedor: catálogo y ventas. El servidor rechaza cambios administrativos del vendedor y no entrega el historial financiero global.
- El servidor usa sus precios, costos, recetas y límites; no acepta el total ni el permiso enviados por el cliente.
- Venta y consumo de insumos en una transacción con bloqueo. Reintentos con mismo identificador no duplican ventas. Con error de red, reintenta el mismo carrito antes de modificarlo.
- Las ediciones administrativas llevan revisión: un estado antiguo se rechaza para evitar sobrescribir ventas de otro equipo. Si hay conflicto, recarga y repite tu cambio.
- Actualizar datos consulta el estado central. No incluye actualización instantánea por WebSockets: una pantalla abierta se refresca con ese botón o después de guardar/vender. Cada venta siempre valida el stock actual del servidor.
- Reportes guardados y respaldos contienen los datos centrales. Las copias JSON no incluyen cuentas/contraseñas. Configura retención y recuperación de respaldos con tu proveedor PostgreSQL; esta entrega no contrata ni activa un plan de backups automáticos.
- Tickets internos, sin facturación electrónica. No incluye recuperación de contraseña por email ni MFA. Otro administrador puede restablecer una contraseña; conserva acceso administrativo al proveedor.
- La migración conserva los datos disponibles y congela el histórico estimado de la versión anterior. No reconstruye costos que nunca se registraron.
- Los reportes actuales y acumulados mantienen sus límites históricos. PDF de entrada: plantilla rellenable SMARTBOD, no escaneos.

## Verificación realizada
Ejecutar `npm test` (11 pruebas del dominio): consumo conjunto, límites de descuento, precios del servidor, pago insuficiente, reintentos, dos ventas sucesivas, migración, conservación de costos, filtrado del vendedor y cantidades inválidas. Comprobación de sintaxis JavaScript y referencias de interfaz.

Pendiente de conexión: instalación de dependencias en Vercel, prueba contra PostgreSQL real, login/roles de extremo a extremo y comprobación visual del despliegue. Las pruebas del dominio no sustituyen estas comprobaciones.

## Arquitectura y mantenimiento
api/index.js: autenticación, autorización y transacciones. lib/schema.sql: tablas propias sb_*. lib/domain.js: validación/cálculo de ventas. public/: interfaz y plantillas. sb_audit registra operaciones administrativas y ventas. Los datos de negocio se guardan como documento JSONB versionado, adecuado para una primera instalación pequeña; no es un motor analítico de alto volumen. La API limita el documento de entrada a 3 MB. Vigila crecimiento de historial y migra a tablas normalizadas/paginación antes de alcanzar ese límite.

## Actualización: preparación por tandas
Antes de actualizar exporta el respaldo JSON. Sustituye los archivos del proyecto Cloud completo; no basta con actualizar public/index.html porque también cambia la API. Conserva las variables y base de datos de Vercel.
En una receta indica cuántas porciones rinden TODOS los ingredientes listados. Ejemplo: ingredientes para 24 hamburguesas -> rendimiento 24. Guarda. En Editar, indica cuántas porciones vas a preparar y pulsa Registrar preparación. El servidor descuenta ingredientes proporcionalmente y crea stock preparado. Caja solo vende porciones preparadas y no vuelve a descontar los ingredientes. El costo de esas porciones queda conservado aunque luego cambie la receta.
Las recetas previas conservan rendimiento 1 hasta que el administrador lo corrija. No se reconstruyen existencias preparadas ni se corrige retroactivamente el consumo anterior. Si antes registraste una tanda entera como una porción, revisa los ingredientes reales y ajusta el inventario con motivo antes de preparar. Las nuevas existencias preparadas comienzan en cero.
Reportes se actualiza al abrir la pestaña y muestra una tabla dentro de la plataforma. Incluye Preparaciones con filtro de fechas. Guardar/cargar un reporte conserva una instantánea; Actualizar vista vuelve a los datos actuales. Importar/descargar está al final de Inventario, debajo de la tabla.
Validación de esta actualización: 14 pruebas de dominio pasadas para rendimiento, preparación parcial, costos, insumos insuficientes, permisos, venta, doble consumo e idempotencia. Sintaxis y referencias HTML comprobadas; queda por verificar el flujo visual completo contra el despliegue real.

## Actualización: anulaciones e imágenes
Reportes > Ventas y correcciones permite buscar y anular tickets. Solo administrador, con motivo obligatorio y confirmación. La anulación conserva el ticket marcado como Anulado, devuelve stock y revierte ingresos/costos según lo registrado. En preparados devuelve porciones listas sin devolver ingredientes. En ventas antiguas de consumo directo devuelve insumos de la receta histórica cuando esos datos están disponibles. Tickets sin costos/productos históricos suficientes se rechazan para no inventar ajustes. Los reintentos no duplican devoluciones. Las nuevas ventas conservan ID del producto para soportar cambios posteriores de SKU.
Anular es para una venta errónea cuya mercadería sigue disponible. No devuelve dinero mediante Yape, tarjeta ni banco; el usuario debe gestionar el reembolso por separado. Una devolución con productos dañados necesita un ajuste de merma posterior. Las instantáneas de reportes guardadas antes de anular mantienen su contenido; genera una nueva vista para consultar cifras corregidas.
Editar producto incluye carga de JPG/PNG/WebP, vista previa y quitar imagen. Admite archivos de entrada de hasta 10 MB; el navegador convierte a JPEG, limita a 640 px y comprime antes de subir. El servidor guarda imágenes en sb_images y exige sesión para leerlas, y rol administrador para cargarlas. No requiere Blob ni variables adicionales. Editar otros campos conserva la foto. Para recetas nuevas, guarda la receta y añade su foto desde Editar.
Los respaldos JSON contienen referencias a las imágenes, no sus bytes. Conserva backups PostgreSQL de sb_images si migras toda la base. Quitar la imagen retira la referencia del producto; no elimina el archivo de la base para preservar referencias históricas. El almacenamiento de imágenes cuenta en el uso de PostgreSQL.
Pruebas actuales: 21 pruebas de dominio pasadas, incluyendo anulación, permisos, reintentos, stock directo/preparado e histórico. Sintaxis, IDs de interfaz y CSP verificados. La carga real de imágenes, la nueva tabla y el flujo visual deben probarse en el despliegue conectado.
Para instalar reemplaza el proyecto Cloud completo (api, lib y public incluidos) y redespliega; conserva DATABASE_URL y la base. El esquema añade sb_images sin borrar datos existentes.

## Actualización: venta diaria y eventos
La pestaña Eventos permite al administrador crear y editar actividades con nombre, tipo (libre o sugerido: feria, kermesse, campeonato, festival), inicio, fin, duración inclusiva automática, lugar, observaciones y estado habilitado/cerrado. No elimina actividades históricas.
En Caja el vendedor selecciona Venta diaria/local o un evento habilitado vigente hoy en Lima. El servidor valida las fechas y el estado y conserva en el ticket una copia de los datos del evento y la fecha comercial. Cambiar el evento después no cambia los tickets históricos. No permite registrar ventas retroactivas: las fechas del evento organizan la actividad, pero cada venta usa la hora real del servidor.
Reportes incluye Ventas por día y Ventas por evento, con fechas y filtro de origen: todos, solo local o un evento. Tickets anulados se cuentan por separado y no suman importes ni descuentos vigentes. Se pueden guardar, descargar en Excel/PDF e imprimir. El filtro de origen solo se aplica a los reportes de ventas; stock y movimientos son globales. Días sin tickets no generan una fila. Tickets antiguos sin evento se consideran venta diaria; si no hay fecha recuperable se identifican como históricos sin fecha.
Los eventos forman parte del respaldo JSON. Se usa el mismo inventario para local y eventos; esta versión no crea almacenes o transferencias por feria. Para ofrecer porciones en un evento, registra primero su preparación y luego selecciona el evento al cobrar.
Validación: 30 pruebas de dominio y 3 pruebas de reportes pasan, incluyendo fechas inclusivas, fecha Lima, eventos cerrados, permisos, persistencia histórica y conciliación con anulaciones. La comprobación visual de extremo a extremo sigue pendiente en el despliegue real.
Actualiza api, lib y public juntos; conserva base y variables y redespliega en Vercel. No requiere nuevas variables ni servicios.

## Actualización integrada: portada, reposición y envases
La portada de acceso reproduce la composición de la referencia proporcionada, con su ilustración integrada y formulario HTML funcional. Diseño adaptable, mostrar/ocultar contraseña y errores del servidor. En móvil se priorizan título y formulario.
Inventario > + Reponer stock abre directamente el producto seleccionado. Elige unidades o paquetes, indica costo y descuento de compra, revisa costo unitario y precio sugerido. El precio vigente se conserva salvo cambio explícito. La operación suma unidades al mismo SKU; el servidor valida y evita duplicar una reposición por reintento. Las recetas se preparan, no se reponen como mercadería.
Editar receta permite por ingrediente: Cantidad para toda la receta (incluye 0.25, 0.5, 1, etc.) o Un envase rinde X porciones. Ejemplo: mayonesa para 48 porciones con receta de 24 consume 0.5 envases; si 1 envase está calculado para 24, registra 1 por receta o rendimiento de envase 24. Una bolsa grande se trata igual. Siempre usa la misma unidad física que registras en inventario: envase, bolsa o unidad.
La sección ¿Es suficiente para la preparación? muestra requerido, disponible y si alcanza cada insumo. Si modificas la receta, guarda primero. El sistema permite consumos fraccionarios y no exige un envase por porción; sí impide consumir más existencias de las registradas. Guarda el rendimiento real, no confirmes un sí genérico para saltar el control.
Todas las mejoras previas están incluidas: usuarios/roles, descuentos, paquetes, recetas y preparados, eventos, reportes visibles, anulaciones, imágenes y plantillas.
Verificación actual: 43 pruebas de lógica/reportes pasadas; sintaxis JavaScript, recursos locales, IDs y hash CSP verificados. El navegador de pruebas no pudo iniciarse en este entorno, así que queda pendiente la revisión visual de escritorio/móvil y el flujo conectado a PostgreSQL real.
Instalación: exporta respaldo, sube el contenido completo a la raíz del repositorio (api, lib, public, tests, package.json, vercel.json), mantén Output Directory public y las variables actuales. No cambies DATABASE_URL ni crees otra base. Revisa el nuevo despliegue en Vercel. Esta actualización no borra datos; no restaures el respaldo salvo necesidad. El recurso public/assets/login-reference.png debe subirse también.
