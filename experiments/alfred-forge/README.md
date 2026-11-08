# Alfred Forge — prototipo local y prueba en línea

Describí piezas procedurales, revisá una propuesta en el visor del taller, corregila por conversación y exportá STL/3MF y la fuente OpenSCAD. No usa Meshy ni Tripo. Las figuras orgánicas son aproximaciones procedurales; no hay reconstrucción universal ni impresión automática.

## Prueba en línea en Vercel

La rama `feature/alfred-forge-mvp` publica una Preview separada de producción. Elegí **Alfred Forge**, ingresá el mismo **código de acceso de la guía** y abrí la muestra o enviá un pedido. No hace falta instalar OpenSCAD en tu computadora para este modo.

`api/forge.js` valida origen, código y cuota antes de gastar recursos. El servidor llama a OpenAI y crea una **Vercel Sandbox** efímera desde una imagen con OpenSCAD y Liberation Sans. La VM recibe únicamente fuente y runner, nunca la clave de OpenAI ni el token de Vercel; arranca con `deny-all`, sin puertos y sin persistencia. El proceso web de Vercel no ejecuta OpenSCAD.

Límites de Preview: 1 vCPU/2 GiB por VM, 60 s por formato, 128 KiB de logs, 1 MiB por archivo y 230 s de vida máxima de la VM. Se detiene al finalizar, al fallar o al cancelar. El límite menor de archivo mantiene la respuesta JSON por debajo del máximo de Vercel Functions. Si la pieza es demasiado detallada, pedí menos resolución o usá el modo local.

La muestra y recompilación no usan IA, pero **sí consumen cómputo de Sandbox**. Generar/corregir usa además OpenAI. Se permiten 20 pedidos/hora/IP y 1 trabajo concurrente **por instancia**; no es una cuota global entre instancias. La Preview conserva la protección de acceso de Vercel y el código de Alfred. No se cambió producción.

Configuración:

- `OPENAI_API_KEY` y `ASSISTANT_ACCESS_CODE`: se reutilizan del servidor; no se leen ni copian al navegador/VM.
- `FORGE_SANDBOX_SNAPSHOT_ID`: opcional, reemplaza la imagen de prueba registrada en `server/forge-sandbox-config.js`.
- La imagen inicial de prueba fue preparada el **8 de noviembre de 2026** y vence el **15 de noviembre**. Hay que renovarla antes de esa fecha. Contiene herramientas de sistema, sin fuentes ni piezas de usuarios.
- Para preparar otra imagen con credenciales de desarrollo de Vercel ya configuradas: `node scripts/provision-forge-snapshot.mjs`. El script instala herramientas confiables, bloquea la red y crea una imagen de 30 días; muestra solo el identificador a configurar. No es un endpoint de la web.
- Forge remoto se habilita automáticamente solo en `VERCEL_ENV=preview`. Para una futura producción se requeriría `FORGE_REMOTE_ENABLED=true`, después de revisar cuotas globales y completar la validación real.

## Para probar localmente

1. Usá la rama **`feature/alfred-forge-mvp`**, no `main`:
   ```sh
   git clone --branch feature/alfred-forge-mvp https://github.com/alejanomiranda-dot/taller-3D.git
   cd taller-3D
   npm ci
   npm run forge:check
   npm run dev
   ```
2. Abrí **http://127.0.0.1:5173**. En Windows también podés usar **Preparar taller.cmd** una vez y luego **Iniciar taller.cmd**.
3. Elegí **Alfred Forge** y **Abrir árbol de muestra · sin IA**. La pieza actual sigue intacta. En el visor usá **Comparar / Propuesta / Actual**, girá la pieza y revisá medidas. La muestra mide **78 × 78 × 140 mm**.
4. Usá **Aplicar** cuando estés conforme o **Descartar**. Para revertir una aplicación, usá **Deshacer cambio del asistente** en Guía CAD o **Deshacer** en Ajustes de la pieza.
5. Antes de aplicar podés descargar **fuente .scad** y **paquete Forge** (STL, 3MF, fuente, historial y guía). Después de aplicar, usá **Guardar versión**, **Exportar proyecto editable** o los archivos de fabricación habituales.
6. Abrí el 3MF en **Bambu Studio**, verificá el perfil real de tu impresora, medidas, textos, soportes y laminado. Estos archivos no están laminados ni se envían a imprimir.

**Sin OpenSCAD:** la muestra precompilada viene incluida y se comprueba contra su fuente y archivos con SHA-256. Podés visualizarla, aplicarla y exportarla. Para generar o recompilar otras piezas necesitás OpenSCAD.

## Requisitos para generar y corregir

- Node.js **22.12 o posterior** (recomendado Node 24 LTS).
- OpenSCAD **2021.01 o posterior**, desde https://openscad.org/downloads.html. Linux/macOS: `openscad` en PATH. Windows: se busca `C:\Program Files\OpenSCAD\openscad.com`, luego `openscad.com` en PATH.
- Una clave propia de OpenAI en **`.env.local` en la raíz**, solo del lado del servidor. Nunca compartirla por chat ni subirla a Git. Nunca usar `VITE_OPENAI_API_KEY`.
- Si OpenSCAD está en otra ubicación, definí `OPENSCAD_BIN` en ese mismo archivo. En Windows, por ejemplo: `OPENSCAD_BIN="D:/Aplicaciones/OpenSCAD/openscad.com"`.
- `OPENAI_MODEL` opcional; se conserva `gpt-4.1` como valor del prototipo existente. La disponibilidad depende del proyecto de OpenAI.
- Reiniciá el servidor después de cambiar `.env.local` y usá **Comprobar instalación**. La presencia de clave no confirma saldo, permisos ni funcionamiento de la API.

Al generar con IA, cada pedido hace **una sola solicitud Responses** con salida JSON estructurada y `store:false`; no hay reintentos con gasto automático. Se envían el pedido, hasta 8 mensajes recientes y, cuando elegís corregir, la fuente completa de la versión seleccionada. No se envían claves al navegador ni mallas a OpenAI. No hay clave configurada en el entorno de desarrollo de esta entrega: las pruebas de proveedor se hacen con respuestas simuladas, sin gastar API.

## Correcciones y versiones

- Después de una propuesta, **Corregir la versión seleccionada** queda marcado. Ejemplo: «Mantené el árbol y los nombres, pero hacé la base de 90 mm de diámetro». La siguiente propuesta usa la fuente anterior completa; no reemplaza la pieza hasta Aplicar.
- Desmarcalo para iniciar otro diseño independiente.
- El selector conserva las últimas **8 fuentes**. **Ver versión** recompila la fuente seleccionada y la ofrece como propuesta, sin API.
- Un error, cancelación o respuesta desactualizada no reemplaza la pieza ni la propuesta previa. Si cambiás de proyecto durante la consulta se cancela; si editás la pieza durante la consulta se rechaza el resultado para no pisar tus ajustes.
- Aplicar conserva la fuente y el historial en el JSON editable y la biblioteca IndexedDB. **Guardá o exportá** para conservarlos después de cerrar la sesión. Antes de aplicar, descargá el paquete Forge.
- Forge reconstruye su propia fuente. **No incorpora cambios posteriores de Guía CAD ni modificaciones manuales sobre la malla.** Para grabar, perforar o modificar un STL ajeno, usá Guía CAD. La fuente archivada describe la versión generada, no las ediciones CAD posteriores.
- El taller admite hasta 300 mm por eje; no representa el volumen real de ninguna impresora. La malla del visor puede simplificarse con tolerancia de hasta 0,05 mm; el paquete Forge conserva los STL/3MF originales. Los exportadores habituales trabajan sobre la pieza aplicada, incluidas sus ediciones posteriores.

## Verificaciones reproducibles

```sh
npm run forge:check       # Node, presencia de clave y ejecutable; no consume API
npm run forge:example     # genera o copia la muestra a experiments/alfred-forge/output
npm run verify           # pruebas, build y comprobación de salida pública
```

Prueba opcional de navegador (no consume API):

```sh
npx playwright install chromium
npm run verify:browser
```

Con Chromium ya instalado en Linux podés usar `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run verify:browser`. Usa el puerto 5174 y guarda capturas/descargas en `artifacts/forge/` (ignorado por Git).

La prueba comprueba vista previa y comparación, fallo simulado que conserva propuesta, aplicación, descargas, recompilación, descarte, biblioteca con fuente y vista móvil. Las pruebas Node comprueban además STL/3MF reales de la muestra, sólida cerrada y volumen coincidente, fuentes inválidas, falta de compilador antes de gastar API, errores de proveedor, cancelación, timeout, límites de salida, limpieza temporal, clave no heredada por el compilador y acceso HTTP solo local. Si falta OpenSCAD, la prueba de compilación real se marca como omitida y la muestra precompilada sigue disponible.

## Ejecución local y límites

En modo local, el endpoint `/api/forge` del servidor de desarrollo Vite está restringido a loopback, Host `127.0.0.1`, origen del mismo servidor y JSON. Rechaza encabezados de proxy, otros métodos, solicitudes grandes y generaciones concurrentes. El compilador de procesos local se rechaza si se detecta Vercel. La ruta remota `api/forge.js` usa exclusivamente Sandbox y está deshabilitada en producción por defecto.

OpenSCAD se ejecuta sin shell, en carpeta temporal aislada para sus salidas, sin heredar las claves ni el HOME del usuario. Se borran los temporales también al fallar. Cada formato tiene watchdog de **120 segundos**, logs hasta **256 KiB** y archivo hasta **12 MiB**. Linux usa `prlimit` cuando está disponible: **2 GiB** de espacio de direcciones, **90 s** de CPU y **12 MiB** por archivo. Windows/macOS tienen timeout y límites de salida, **sin límite duro de RAM/CPU**. Un único pedido puede tardar varios minutos entre IA y dos formatos; **Detener** cancela la consulta y el proceso actual.

**Estos controles no son un sandbox.** OpenSCAD corre con los permisos del usuario local; los filtros de referencias externas no aíslan el sistema de archivos ni la red. No usar túneles, no cambiar el host a una interfaz pública y no ofrecer este proceso como servicio compartido.

El modo remoto usa el worker aislado descrito arriba. Antes de abrir el servicio a más usuarios faltan cuotas y cola globales, observabilidad de costos y validación de carga. La ejecución local sigue sin ser un sandbox: no exponer el servidor Vite con túneles.

## Pendiente de validar en la computadora de Vero

- Windows: instalación real de Node/OpenSCAD y doble clic en los `.cmd`.
- Generación y corrección con la clave real, cuota y modelo configurados.
- Fuente tipográfica disponible y legibilidad de VERO/ALE.
- Apertura en Bambu Studio, perfil correcto, soportes, tolerancias e impresión física.
- El acceso remoto con el código real y la generación con OpenAI deben comprobarse en la Preview. No se implementó Wi-Fi ni inicio de impresión; siempre requieren revisión y aprobación humana.
