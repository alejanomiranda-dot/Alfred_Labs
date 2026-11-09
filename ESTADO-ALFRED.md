# Estado de Alfred · 9 de noviembre de 2026

Continuación en `codex/alfred-continuidad-forge`. Se conservó el trabajo del llavero en `4636708`, se integró la copia de Claude hasta `021140a` y se incorporó `origin/main`, incluido el nombre actual del proyecto. La copia de Claude queda disponible como worktree separado.

## Qué funciona

- **Una pantalla, un chat.** El asistente (`server/assistant.js`) devuelve un camino: `template`, `keychain`, `cad`, `relief`, `forge` o `chat`. El navegador (`src/ui/app.js`) lo construye. Los cambios se aplican directo, con Deshacer.
- **Construye primero.** Con un pedido razonable arma la pieza con supuestos estándar y los cuenta. Pregunta solo lo imprescindible, como medidas de encastre o de repuestos.
- **Forge (figuras orgánicas)** usa `gpt-6.1-sol` (`OPENAI_FORGE_MODEL`) con razonamiento medio y no compila el 3MF (la app lo arma). Verifica partes sueltas, medidas pedidas (`expectedSize`, con 0 en los ejes libres) y apoyo en la cama. Corrige sola una vez y, si quedan detalles sueltos diminutos (menos del 2 % de la superficie), los quita del STL.
- **Revisión visual** (`server/critique.js`): después de generar, el modelo mira tres vistas (`viewer.snapshots()`). Si la nota es menor a 8, Forge pule la pieza una vez y conserva la mejor versión.
- **Asistente:** `gpt-5.5` (`OPENAI_MODEL`) con razonamiento bajo. Tarda segundos y escribe mensajes naturales.
- **Relieves:** el fondo se detecta solo, la silueta sube como meseta con bisel suave y hay detalle interno leve. La imagen se pide sin marco y el visor la muestra con sombreado suave.
- **Voladizos:** se muestran como «Lista para imprimir con soportes», no como un error.

## Resultados anteriores registrados por Claude (con IA real, `scripts/evaluate-forge.mjs`)

Gato 80 mm, búho 60 mm, T-rex 100 mm, soporte de celular, maceta de 100 × 90 mm y llavero «SOFÍA»: los seis se armaron sin preguntas, en 3 a 55 segundos. Todos son de una pieza, con la medida pedida, y las figuras sacaron 8/10 en la revisión visual. `npm test` aprueba 82 pruebas y `npm run verify:browser` y `verify:live --image` pasan.

## OpenSCAD

En `.tools/openscad` (de la carpeta principal, ignorado por git) está **OpenSCAD 2026.11.06**, que tiene el motor Manifold y compila en menos de 1 segundo lo que el 2021.01 tardaba 98. `server/forge.js` lo detecta solo (`--backend=manifold`). El 2021.01 quedó en `.tools/openscad-2021.01`. En esta copia de trabajo se usa con `OPENSCAD_BIN` apuntando a la carpeta principal.

## Verificación de esta continuación · 09/11/2026

- `npm run verify`: 85 pruebas aprobadas, build y control de clave local en la salida pública. Vite mantiene sus avisos de tamaño del bundle y externalización de `node:module` de Manifold.
- `npm run verify:browser`: estudio unificado, ejemplo, deshacer, fallos sin perder la pieza, corrección, exportación, llavero con lectura del QR del 3MF, biblioteca, temas y móvil.
- IA real local con `LIVE_URL=http://127.0.0.1:5177 npm run verify:live -- --image`: caja de 80 × 50 × 30 mm; gato y corrección a 80,02 mm, una pieza; relieve de 60 × 50 × 6 mm y ajuste sin nueva generación de imagen. Sin errores JavaScript ni desborde móvil. Evidencia en `artifacts/live/` (ignorado).
- Imagen nueva: `snap_YYhqQ3wZrAXI0nNNpXu7vHooepHv`, OpenSCAD 2026.11.06 y Manifold, SHA-256 verificado contra la publicación oficial. Muestra compilada con el worker real y sin red antes de guardar. Retención de 30 días desde el último uso.
- La instalación base de Ubuntu falló por conectividad; la renovación exitosa partió de la imagen de herramientas existente mediante `FORGE_BASE_SNAPSHOT_ID`, descargó y sustituyó OpenSCAD y probó el worker. El script admite ambas vías.
- Se arrancó otra VM desde la imagen ya guardada y se recompiló el gato real: STL de 598.884 bytes, una sola pieza, 26,16 s para el circuito remoto completo.
- Vercel confirmado por ID: `prj_me6dUrAkieRMlfrWE3mnY3l753OS`, equipo `alejano910`, nombre actual `alfred_labs`. Repositorio actual: `alejanomiranda-dot/Alfred_Labs`; el remoto antiguo redirige. No existe `OPENAI_MODEL` fijada en Vercel: se utiliza el valor del código.
- CAD conserva ahora Ñ y acentos usando Gentilis cuando la fuente elegida no los incluye, con aviso y prueba geométrica de regresión.

## Pendiente de publicación

1. Probar la vista previa de esta rama con la imagen nueva y completar el PR, merge y despliegue.
2. Confirmar Forge en producción con `FORGE_REMOTE_ENABLED=true`; conservar la protección de Vercel y los límites existentes.
3. Actualizar este estado con los enlaces y resultados finales.

## Validación física

La revisión digital no reemplaza abrir el 3MF en Bambu Studio, asignar materiales e imprimir una muestra. La lectura del QR físico y la resistencia de las piezas siguen requiriendo una prueba de impresión.
