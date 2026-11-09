# Alfred Labs

Estudio de diseño 3D asistido para la Bambu Lab A2L. Unidades: milímetros. Web: https://alfredlabs.vercel.app

## Cómo funciona

Una sola pantalla y una sola conversación. Al entrar, Alfred pregunta **«¿Qué querés imprimir?»**; se responde con palabras y, si hace falta, con una foto, un logo o un archivo 3D (botón **+**). **«o mirá una pieza de ejemplo»** abre una pieza precompilada sin usar IA.

Alfred decide cómo construir cada pedido, sin que la persona elija un motor:

- **Plantillas** (chapitas, llaveros QR) y **piezas por medidas** (cajas, soportes, recipientes, repuestos): operaciones geométricas verificadas contra las medidas pedidas; si no cierran, se corrigen solas hasta tres veces.
- **Llavero con logo adelante y QR atrás**: se arma en el navegador con el archivo original, sin IA ni generación de imágenes. Si falta el logo o el enlace, Alfred lo pide. [Experiencia real con Mutual UNIR](EXPERIENCIA-LLAVERO.md).
- **Relieves** (escudos, dibujos, rostros): con una imagen adjunta se usa tal cual; si no, se genera con OpenAI. Cambiar medidas o profundidad después no vuelve a generar.
- **Generador avanzado** (OpenSCAD): formas orgánicas o esculpidas, y respaldo cuando el modelado por medidas no alcanza. Cada corrección parte de la versión anterior; las versiones y la fuente `.scad` quedan en «Avanzado».

Los cambios se aplican directo y se pueden **deshacer y rehacer** (también Ctrl+Z / Ctrl+Shift+Z). La columna **Tu pieza** muestra solo los controles de ese tipo de pieza y arriba indica si está **lista para imprimir** o qué revisar (ver dónde, apoyarla mejor). **Imprimir** guarda el 3MF para Bambu Studio y explica los pasos; los demás formatos están en «Más formatos y herramientas». Tema claro u oscuro según el sistema, con selector manual.

Forge local necesita OpenSCAD: `npm run forge:check`. En Windows: **Preparar taller.cmd**, luego **Iniciar taller.cmd**. OpenSCAD portable se detecta en `.tools/openscad/openscad.com` (o `OPENSCAD_BIN`). En Vercel se compila en un Vercel Sandbox aislado; OpenSCAD nunca corre dentro de Vercel Functions. [Pruebas en Windows](PRUEBAS-LOCALES.md) · [Guía de Forge y límites](experiments/alfred-forge/README.md).

## Uso local

Requiere Node.js 22.12 o posterior. Desde esta carpeta:

```powershell
npm install
npm run dev
```

Abrir `http://127.0.0.1:5173/` (o hacer doble clic en **Iniciar taller.cmd**). `npm test` verifica sólidos cerrados, medidas, colores, importación, imprimibilidad y la protección del asistente. `npm run build` prepara `dist`. `npm run verify` prueba, compila y comprueba que la clave local no aparezca en la salida pública.

## Diseño

- Operaciones: bloques, cajas abiertas, cilindros y conos, recipientes, piezas por perfil (torno), esferas, elipsoides, cápsulas, anillos, contornos, texto, uniones, huecos e intersecciones. Un STL o 3MF importado es la primera operación.
- Texto e íconos grabados, en relieve, incrustados o alrededor de superficies curvas. Las plantillas usan Helvetiker Bold y pasan a Gentilis si el texto lleva acentos o Ñ, para no alterar el nombre. El modelado por medidas conserva también esos caracteres y avisa si necesita usar Gentilis.
- **Multicolor**: hasta 4 colores (AMS). El 3MF lleva una parte por color.
- «Medir» sobre una foto adjunta calcula medidas reales con una referencia de escala. La guía para repuestos indica qué medir con calibre, el encastre y la holgura.

## Revisión y salida

- Visor con regla, cotas y plano de corte.
- **Revisión de impresión**: voladizos que necesitan soporte, paredes finas, apoyo en la cama, orientación sugerida, gramos, tiempo y costo. Son estimaciones; Bambu Studio da el valor final.
- **Prueba de encaje**: exporta solo una franja de la pieza.
- 3MF por partes y colores, STL unido, paquete ZIP con instrucciones, carpeta de trabajo.
- **Biblioteca con versiones** y miniaturas (IndexedDB del navegador; no se sincroniza entre dispositivos). Foto de producto PNG y presupuesto para imprimir o guardar como PDF.
- **Costos y estilo**: precio del filamento, hora de máquina, margen, colores, tipografía y notas que la guía usa por defecto.

## Asistente y publicación

OpenAI Responses API con salida estructurada (`gpt-5.5` por defecto; `OPENAI_MODEL` lo cambia). Forge usa `gpt-6.1-sol` (`OPENAI_FORGE_MODEL`) y revisa visualmente tres vistas antes de dar por terminada una figura. `store:false`. Se envían el pedido, la conversación reciente, el diseño (sin mallas importadas ni contornos de logo), el estilo y la imagen adjunta.

La generación visual usa Images API (`gpt-image-1.5`, configurable con `OPENAI_IMAGE_MODEL`) con la misma clave del servidor. Requiere acceso a imágenes y créditos en la cuenta. El mapa de alturas se convierte en una malla cerrada en el navegador, con fondo plano y base mínima de 1,2 mm. La respuesta de imágenes se limita a 4 MB de base64 y el tiempo de la función a 180 segundos. Si la generación no está disponible, se puede convertir una imagen adjunta directamente. El proyecto editable conserva la malla y las medidas del relieve, no la imagen original.

`node scripts/evaluate-assistant.mjs` ejecuta siete casos reales con la clave local (consume API); no forma parte de `npm test`. Comprueba interpretación de círculo y diámetro, ajustes de una propuesta sin aplicar, consultas sin cambios, óvalo, grabado del dorso y caja abierta. También construye los sólidos para verificar las propuestas.

`node scripts/evaluate-creative.mjs` prueba seis pedidos creativos reales. `--image` agrega una generación real de una galaxia y guarda su mapa en `muestras/`. Estas pruebas consumen API; las pruebas geométricas de `npm test` usan datos sintéticos sin red. [Alcance y validación del motor creativo](CREATIVE-ENGINE.md).

Vercel: proyecto `alejano910/alfred_labs`, conectado a `alejanomiranda-dot/Alfred_Labs` (rama `main`; cada push publica). La aplicación no solicita código de acceso. Conserva validación de origen y límites de pedidos por instancia. `OPENAI_API_KEY` permanece solo en el servidor, nunca con prefijo `VITE_`. La configuración local se lee de `.env.local` (no se sube).

La imagen aislada de Forge usa OpenSCAD 2026.11.06 con Manifold. `node --env-file=.env.local scripts/provision-forge-snapshot.mjs` prepara una imagen, verifica SHA-256 contra la publicación oficial y compila la muestra con el worker real sin red antes de guardarla. `FORGE_BASE_SNAPSHOT_ID` permite reutilizar una imagen existente de herramientas para renovarla sin reinstalar Ubuntu; luego se actualiza `server/forge-sandbox-config.js`. La retención es de 30 días desde el último uso. Forge en producción requiere `FORGE_REMOTE_ENABLED=true`; las vistas previas lo habilitan automáticamente.

Para probar una vista previa protegida con la credencial OIDC local: `LIVE_URL` debe apuntar a su URL y se ejecuta `node --env-file=.env.local scripts/verify-live-browser.mjs`. Esa prueba consume API, comprueba caja y figura, y agrega relieve con `--image`. La credencial sólo viaja al origen del despliegue.

## Privacidad

El modelado, la importación, la medición y la revisión se calculan en el navegador. La biblioteca y los ajustes viven en este navegador. Un QR con URL dirige a quien lo escanea al destino indicado.
