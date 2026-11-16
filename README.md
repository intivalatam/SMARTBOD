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
