# Taller de Vero

Prototipo funcional para diseñar chapitas, llaveros QR y llaveros con logo SVG. Unidades: milímetros.

## Uso local

Requiere Node.js 22.12 o posterior. Desde esta carpeta:

```powershell
npm install
npm run dev
```

Abrir la dirección que muestra Vite. `npm run build` prepara la versión distribuible en `dist`. `npm test` verifica sólidos cerrados, tamaños, QR y exportación 3MF.

`npm run verify` ejecuta las pruebas, compila y verifica que la clave local no aparezca en la salida pública. Usarlo antes de publicar cambios. El puerto local es fijo (5173): si ya está ocupado, usar la instancia existente o cerrar su ventana anterior. No se cambia a otro puerto silenciosamente.

## Qué funciona

- Diseño paramétrico, agujero real, textos extruidos y sólidos cerrados mediante Manifold.
- Vista 3D interactiva; medidas y colores editables.
- QR generado algorítmicamente con margen de cuatro módulos. No generado como imagen por IA.
- Logos SVG simples con rellenos y contornos. Convertir texto y trazos a curvas antes de importar.
- Dibujos PNG/JPG: conversión local de contraste a contornos, con ajuste e inversión. No reconstruye objetos tridimensionales desde fotografías.
- Guardar 3MF con selector de ubicación en navegadores compatibles; descarga normal como alternativa. Paquete ZIP con 3MF, JSON editable e instrucciones.
- Carpeta de trabajo elegida por la usuaria: disponible durante la sesión. Cada guardado crea una subcarpeta con fecha e identificador para conservar las revisiones anteriores.
- STL unido y 3MF estándar con dos partes, materiales y unidades. El 3MF NO incluye un perfil de impresora ni asignaciones AMS: revisar/importar como un objeto de varias partes en Bambu Studio y asignar filamentos.
- Guardado local de hasta 50 proyectos y exportación/importación JSON. El navegador no sincroniza ni respalda los proyectos automáticamente.

## Flujo de primera prueba

1. Crear una chapita de ejemplo y confirmar las medidas y la identificación.
2. Descargar 3MF y abrirlo en Bambu Studio; verificar que las dos partes comparten posición.
3. Elegir el perfil exacto A2L, boquilla y material instalados. Asignar filamentos a base y relieve.
4. Laminar, comprobar dimensiones, capas, letras, agujero y cambios de color.
5. Imprimir una muestra. Medirla y, si tiene QR, escanearla con varios teléfonos y distintas luces.
6. Registrar ajustes y guardar el JSON definitivo junto con el proyecto del laminador.

La geometría cerrada no garantiza resistencia, legibilidad ni calidad física. Los límites y avisos son orientaciones del prototipo, no una calibración de la impresora de Vero. No hay control de impresora ni conexión a Tinkercad.

## Próxima etapa: asistente

La versión local incorpora un asistente con OpenAI: pedidos escritos → propuesta de parámetros → validación geométrica → revisión y aplicación por Vero. Permite deshacer el último cambio del asistente. No reconstruye repuestos arbitrarios ni opera la impresora. Usa GPT-4.1 mini mediante Responses API y salida estructurada. Envía el pedido y los campos del diseño; no envía imágenes ni contornos. No registra solicitudes en el servidor y solicita `store:false` a la API.

Para trabajar con IA, hacer doble clic en **Iniciar taller.cmd**, mantener esa ventana abierta y usar `http://127.0.0.1:5173/`. La clave se lee de `.env.local` solamente en el servidor local. Requiere Internet y saldo/cuota en el proyecto OpenAI. La versión publicada es estática: conserva diseño y exportación, pero no ejecuta el asistente ni recibe la clave local. No subir `.env.local` a servicios ni repositorios.

Próximas ampliaciones: nuevos tipos paramétricos, encargos, plantillas y backend alojado con credencial separada y control de uso. Medidas desconocidas deben consultarse, especialmente en repuestos.

## Privacidad

El modelado y la conversión de imágenes se calculan en el navegador. Al enviar un pedido al asistente local, se envían a OpenAI el pedido y los campos de texto, medidas y colores del diseño actual; pueden incluir el teléfono y URL si están completados. Las imágenes y contornos no se envían. La tipografía de interfaz se solicita a Google Fonts; la tipografía geométrica está incluida. Un QR con URL dirige a quien lo escanea al destino indicado. Una ficha de mascota editable requeriría un servicio adicional; no se crea aquí.

Los dos 3MF originales de la carpeta superior no se modifican ni se publican.
