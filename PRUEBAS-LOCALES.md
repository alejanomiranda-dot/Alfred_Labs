# Alfred Labs integrado · pruebas locales

Validación del 08/11/2026 en Windows. Se combinó el trabajo de Alfred Forge del PR #2 con el motor creativo del PR #3 ya integrado en `main`, conservando relieves desde imágenes, nuevas formas nativas, generación procedural, correcciones e historial.

## Abrir el taller en esta computadora

1. Abrí **Iniciar taller.cmd**, o ejecutá `npm run dev`.
2. Entrá a **http://127.0.0.1:5173/**. Si ya hay un servidor iniciado, usá esa dirección.
3. **Alfred Forge** genera y corrige piezas procedurales. **Guía CAD** trabaja con medidas, piezas importadas y relieves visuales.
4. Revisá cada vista previa, elegí **Aplicar** y usá **Preparar para imprimir** para exportar. Revisá el archivo en Bambu Studio antes de imprimir.

La clave está en `.env.local`, solo del lado del servidor. No se modificó su contenido. Se descargó OpenSCAD 2021.01 portable desde el sitio oficial, comprobando el SHA-256 oficial, a `.tools/openscad/`. Ambas ubicaciones están ignoradas por Git. La copia portable no forma parte del repositorio: en otra computadora hay que instalar OpenSCAD o configurar `OPENSCAD_BIN`.

## Pruebas reproducibles

```powershell
npm run forge:check
npm run verify
npm run verify:browser
npm audit
```

`verify` ejecuta las pruebas de geometría, API y compilador, construye la web y comprueba que la clave local no se incluya en la salida pública. `verify:browser` usa Chromium y datos sintéticos/muestra; no consume OpenAI. Requiere `npx playwright install chromium` una vez.

Con `npm run dev` iniciado, la aceptación con llamadas reales se ejecuta explícitamente:

```powershell
npm run verify:live
npm run verify:live -- --image
```

Estos últimos comandos consumen API: generan y corrigen una pieza con Forge y construyen una caja con Guía CAD. `--image` agrega un pedido visual y una generación real de imagen. No se ejecutan como parte de las pruebas habituales. Escriben evidencia en `artifacts/live/`, ignorado por Git.

## Resultados reales obtenidos

- Forge generó un bloque de **30 × 20 × 10 mm**, con agujero pasante central de **4 mm**. La vista previa conservó intacta la pieza anterior.
- Una corrección real cambió solo el alto a **18 mm**. Se comprobó el volumen del sólido, incluido el agujero, y el proyecto exportado conserva dos versiones de fuente. Archivos: `bloque-inicial.zip`, `bloque-corregido.zip` y `bloque-corregido.json`.
- Guía CAD generó una caja abierta de **80 × 50 × 30 mm**, con paredes y fondo de **2 mm**. El JSON exportado reconstruye un sólido válido. Archivo: `caja-cad.json`.
- OpenAI generó un mapa de alturas de luna y estrellas. Alfred lo convirtió en un sólido cerrado de **60 × 50 mm**. Se cambió la profundidad de 3 a **4 mm sin otra llamada** de generación; altura final aproximada **5,98 mm**, **43.722 triángulos** y volumen positivo. Archivos: `luna-mapa-alturas.png`, `luna-relieve.json` y `luna-relieve.stl`.
- Chromium no registró errores JavaScript en esos recorridos. Vista móvil de **390 × 844** sin desborde horizontal. Capturas y reporte en `artifacts/live/`.

La revisión de impresión del relieve advierte sobre detalles finos; una malla cerrada no confirma que esos detalles se impriman correctamente con cualquier boquilla. Todavía no se verificó Bambu Studio ni una impresión física.

## Correcciones de la integración

- Se resolvieron los conflictos entre ambos motores y se conservó la ruta de imágenes en el endpoint compartido.
- Los mensajes de Alfred ya no heredan el estilo y la altura del panel de chat.
- Empezar desde cero o importar una pieza vuelve a la Guía CAD aunque se estuviera usando Forge.
- Crear un relieve nuevo elimina la fuente Forge del objeto reemplazado. El contexto de Guía CAD excluye el historial OpenSCAD.
- La muestra precompilada verifica su hash con saltos de línea normalizados, compatible con Git en Windows.
- `OPENAI_MODEL` de la configuración local llega a Guía CAD, además de Forge.
- Se fijó `@vercel/cli-config` 0.3.7 mediante `overrides` para resolver su dependencia vulnerable de Zod; `npm audit` informó **cero vulnerabilidades**.

## Alcance pendiente

La aceptación remota completa con OpenAI/Sandbox y la impresión física siguen pendientes. Forge remoto permanece deshabilitado en producción por defecto. La imagen remota de prueba vence el **15/11/2026** y debe renovarse antes de seguir probando ese modo.
