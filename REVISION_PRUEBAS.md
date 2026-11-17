# Preparación de pruebas de SMARTBOD 4.0

Base: commit f54c9cc3c3981832da9ce69313058e5b5dea95be de main, que ya incorpora SMARTBOD_ACTUALIZADO.zip. El cálculo fraccionario, las recetas y el inventario adaptable forman parte de esa subida previa.

Esta revisión elimina archivos de la versión anterior que quedaron al subir el ZIP: index.html en la raíz (la aplicación servida está en public/index.html), public/operations.js (sustituido por operations-ui.js) y tests/operations.test.js (importaba funciones eliminadas y hacía fallar npm test). La suite de la versión actual incluye enterprise.test.js y las pruebas de integración. Eliminar la prueba antigua no demuestra equivalencia funcional entre versiones; consultar los pendientes de LEEME_ACTUALIZACION.md.

El service worker limpia las cachés SMARTBOD anteriores, incluida la aplicación offline antigua, cuando se activa la nueva versión. Conserva cachés ajenas. La versión 4.0 requiere conexión para registrar ventas; no ofrece cola offline.

## Configurar la prueba

1. Crear una base PostgreSQL vacía, exclusiva de pruebas.
2. En el entorno Preview de Vercel, asignar su conexión a PREVIEW_DATABASE_URL. La API no reutiliza DATABASE_URL en Preview.
3. Usar ADMIN_USERNAME y ADMIN_PASSWORD exclusivos de prueba; no guardar credenciales en GitHub.
4. Confirmar que las URL no apuntan a la misma base con usuarios o parámetros diferentes. La protección rechaza cadenas idénticas, pero no puede verificar si dos URL distintas identifican la misma base.
5. Probar con datos ficticios y mantener el PR en borrador hasta revisar escritorio y teléfono.

No se ha creado ni conectado una base de pruebas ni modificado Vercel desde esta revisión. La rama puede generar una vista previa automática si el repositorio ya está conectado. Sin PREVIEW_DATABASE_URL, su API devuelve un mensaje de configuración y no se conecta a producción.

## Prueba de aceptación

Registrar 30 panes, 40 carnes y 1 envase de 1 kg de cada crema. Dosis: 20 g por porción (50 porciones por envase). En la receta, configurar los cuatro ingredientes «Al preparar».

Preparar 24 debe dejar 6 panes, 16 carnes, 520 g de mayonesa, 520 g de ketchup y 24 hamburguesas preparadas. Vender 5 deja 19 preparadas y conserva 520 g de cada crema. Si las salsas se agregan al servir, configurar esa etapa explícitamente.

Verificar nombres completos, importes y acciones en escritorio y móvil. Esta revisión no acredita pruebas visuales reales ni instalación en teléfonos.

## Comprobaciones

Ejecutar npm test y npm run test:integration. La suite verifica cálculos, inventario, autenticación/API, persistencia SQL y flujos DOM con datos de prueba. No utiliza una base de producción.
