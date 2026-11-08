# Alfred Labs · Taller de Vero

Estudio de diseño 3D asistido para la Bambu Lab A2L. Unidades: milímetros. Web: https://alfredlabs.vercel.app

## Alfred Forge · experimental

La rama `feature/alfred-forge-mvp` integra generación OpenSCAD, vista previa sin aplicar, correcciones, historial de fuentes y exportación. Para probar hoy: `npm ci`, `npm run forge:check`, `npm run dev`; abrí `http://127.0.0.1:5173` y elegí **Alfred Forge**. La muestra incluida funciona sin IA y sin OpenSCAD instalado. En Windows: **Preparar taller.cmd**, luego **Iniciar taller.cmd**.

Leé la [guía de prueba local y límites](experiments/alfred-forge/README.md). La Preview en Vercel usa un compilador aislado en Vercel Sandbox sin pedir código de acceso. El modo local sigue disponible; OpenSCAD nunca se ejecuta dentro de Vercel Functions.

## Uso local

Requiere Node.js 22.12 o posterior. Desde esta carpeta:

```powershell
npm install
npm run dev
```

Abrir `http://127.0.0.1:5173/` (o hacer doble clic en **Iniciar taller.cmd**). `npm test` verifica sólidos cerrados, medidas, colores, importación, imprimibilidad y la protección del asistente. `npm run build` prepara `dist`. `npm run verify` prueba, compila y comprueba que la clave local no aparezca en la salida pública.

## Formas de empezar

- **Desde cero**: la guía pregunta lo que falta y construye la pieza.
- **Desde foto o dibujo**: la guía describe la imagen por tramos y pregunta medidas. «Medir en la foto» calcula medidas reales con una referencia de escala (tarjeta de 85,6 mm, regla).
- **Desde un archivo 3D**: STL o 3MF (también de Bambu Studio). Se valida como sólido cerrado y, si es muy pesado, se simplifica con tolerancia de centésimas. La guía recibe sus cortes reales, no la malla.
- **Repuesto a medida**: dibujo de qué medir con calibre, tipo de encastre y holgura.
- **Plantillas**: chapitas, QR y logos. **Abrir un proyecto**: JSON editable.

## Diseño

- Operaciones: bloques, cajas abiertas, cilindros y conos, recipientes, piezas por perfil (torno), esferas, contornos, texto, uniones, huecos e intersecciones. Pieza importada como primera operación.
- Texto e íconos (corazón, huellita, estrella, hoja, flor, hueso, casa, luna) grabados, en relieve, incrustados o **alrededor** de superficies curvas. Tres tipografías.
- **Multicolor**: color por operación, hasta 4 colores (AMS). El 3MF lleva una parte por color.
- **Ajuste directo** de cada operación, con deshacer y rehacer.
- Cada propuesta de la guía se construye y se compara con las medidas que declaró; si no coincide, se corrige sola antes de mostrarse. Se ve como **vista previa** translúcida antes de aplicarla.
- **Chat con Alfred**: Enter envía, Shift + Enter agrega una línea. Podés detener la consulta, ajustar una propuesta pendiente o hacer preguntas sin perderla. **Aplicar** cambia la pieza; **Descartar** conserva el diseño actual. En celular, las pestañas alternan entre el chat y la pieza 3D. Ajustes y fabricación se abren a demanda.
- **Formas precisas**: «Redonda · círculo» tiene un único diámetro; «Rectángulo redondeado» conserva la forma de los proyectos anteriores (`round`). «Ovalada» permite ancho y alto distintos. Las cotas del visor distinguen propuesta sin aplicar y pieza actual.

## Revisión y salida

- Visor con regla, cotas y plano de corte.
- **Revisión de impresión**: voladizos que necesitan soporte, paredes finas, apoyo en la cama, orientación sugerida, gramos, tiempo y costo. Son estimaciones; Bambu Studio da el valor final.
- **Prueba de encaje**: exporta solo una franja de la pieza.
- 3MF por partes y colores, STL unido, paquete ZIP con instrucciones, carpeta de trabajo.
- **Biblioteca con versiones** y miniaturas (IndexedDB del navegador; no se sincroniza entre dispositivos). Foto de producto PNG y presupuesto para imprimir o guardar como PDF.
- **Costos y estilo**: precio del filamento, hora de máquina, margen, colores, tipografía y notas que la guía usa por defecto.

## Asistente y publicación

OpenAI Responses API con salida estructurada (`gpt-4.1` por defecto; `OPENAI_MODEL` lo cambia). `store:false`. Se envían el pedido, la conversación reciente, el diseño (sin mallas importadas ni contornos de logo), el estilo y la imagen adjunta.

`node scripts/evaluate-assistant.mjs` ejecuta siete casos reales con la clave local (consume API); no forma parte de `npm test`. Comprueba interpretación de círculo y diámetro, ajustes de una propuesta sin aplicar, consultas sin cambios, óvalo, grabado del dorso y caja abierta. También construye los sólidos para verificar las propuestas.

Vercel: proyecto `alejano910/taller-3d`, conectado a `alejanomiranda-dot/taller-3D` (rama `main`; cada push publica). La aplicación no solicita código de acceso. Conserva validación de origen y límites de pedidos por instancia. `OPENAI_API_KEY` permanece solo en el servidor, nunca con prefijo `VITE_`. La configuración local se lee de `.env.local` (no se sube).

## Privacidad

El modelado, la importación, la medición y la revisión se calculan en el navegador. La biblioteca y los ajustes viven en este navegador. Un QR con URL dirige a quien lo escanea al destino indicado.
