# Estado de Alfred · 9 de noviembre de 2026

Rama `claude/3d-print-ai-ux-analysis-acde06`. Este archivo resume dónde quedó el trabajo para continuar.

## Qué funciona

- **Una pantalla, un chat.** El asistente (`server/assistant.js`) devuelve un camino: `template`, `keychain`, `cad`, `relief`, `forge` o `chat`. El navegador (`src/ui/app.js`) lo construye. Los cambios se aplican directo, con Deshacer.
- **Construye primero.** Con un pedido razonable arma la pieza con supuestos estándar y los cuenta. Pregunta solo lo imprescindible, como medidas de encastre o de repuestos.
- **Forge (figuras orgánicas)** usa `gpt-6.1-sol` (`OPENAI_FORGE_MODEL`) con razonamiento medio y no compila el 3MF (la app lo arma). Verifica partes sueltas, medidas pedidas (`expectedSize`, con 0 en los ejes libres) y apoyo en la cama. Corrige sola una vez y, si quedan detalles sueltos diminutos (menos del 2 % de la superficie), los quita del STL.
- **Revisión visual** (`server/critique.js`): después de generar, el modelo mira tres vistas (`viewer.snapshots()`). Si la nota es menor a 8, Forge pule la pieza una vez y conserva la mejor versión.
- **Asistente:** `gpt-5.5` (`OPENAI_MODEL`) con razonamiento bajo. Tarda segundos y escribe mensajes naturales.
- **Relieves:** el fondo se detecta solo, la silueta sube como meseta con bisel suave y hay detalle interno leve. La imagen se pide sin marco y el visor la muestra con sombreado suave.
- **Voladizos:** se muestran como «Lista para imprimir con soportes», no como un error.

## Resultados medidos (con IA real, `scripts/evaluate-forge.mjs`)

Gato 80 mm, búho 60 mm, T-rex 100 mm, soporte de celular, maceta de 100 × 90 mm y llavero «SOFÍA»: los seis se armaron sin preguntas, en 3 a 55 segundos. Todos son de una pieza, con la medida pedida, y las figuras sacaron 8/10 en la revisión visual. `npm test` aprueba 82 pruebas y `npm run verify:browser` y `verify:live --image` pasan.

## OpenSCAD

En `.tools/openscad` (de la carpeta principal, ignorado por git) está **OpenSCAD 2026.11.06**, que tiene el motor Manifold y compila en menos de 1 segundo lo que el 2021.01 tardaba 98. `server/forge.js` lo detecta solo (`--backend=manifold`). El 2021.01 quedó en `.tools/openscad-2021.01`. En esta copia de trabajo se usa con `OPENSCAD_BIN` apuntando a la carpeta principal.

## Pendiente

1. **Vercel (Forge en línea).** La imagen fijada en `server/forge-sandbox-config.js` vence el **15/11/2026** y tiene OpenSCAD 2021.01 (con 60 s de límite, las figuras fallan). `scripts/provision-forge-snapshot.mjs` ya instala el AppImage 2026 en `/opt/openscad` y `server/forge-worker.mjs` lo usa si existe. Falta que la preparación termine bien: el último intento falló en el `apt-get install` base y ahora muestra el motivo. Se corre con `node --env-file=.env.local scripts/provision-forge-snapshot.mjs`. Después hay que poner el ID nuevo en `forge-sandbox-config.js` o en `FORGE_SANDBOX_SNAPSHOT_ID`.
2. **Variables de Vercel.** Si `OPENAI_MODEL` está fijada en `gpt-4.1`, conviene quitarla o pasarla a `gpt-5.5`.
3. **Guía CAD:** las tipografías sin Ñ ni acentos reemplazan la letra. Las plantillas ya pasan a Gentilis.
4. **Merge a `main`** después de probarlo en la vista previa.
