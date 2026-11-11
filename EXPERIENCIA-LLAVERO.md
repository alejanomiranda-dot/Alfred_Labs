# Del pedido al llavero de Mutual UNIR

## Nueva prueba con logo y QR adjuntos · 09/11/2026

El recorrido real en producción no leía la imagen QR: la trataba como otro logo y volvía a pedir el enlace. Se agregó lectura local con jsQR, preservación del logo entre mensajes y error recuperable cuando el QR es ilegible. El archivo `mutual-unir-qr-alta-calidad.png` entregado por Ale contiene **`https://www.mutualunir.com.ar/`**, distinto del enlace elegido en la prueba anterior registrada abajo. Se reconstruyen los módulos con ese destino, sin vectorizar la imagen ni usar IA.

La prueba también detectó que el selector nativo de guardado no aparecía en el navegador integrado. La exportación principal usa ahora la descarga del navegador; la elección de carpeta sigue disponible como acción explícita. La prueba de navegador simula un selector de guardado que nunca responde para prevenir esa regresión.

La base incorpora biseles de 0,2 mm abajo y 0,4 mm arriba, con el QR al ras sobre z=0. El llavero real exportado mide 50 × 60 × 3,8 mm, conserva la marca y el texto completos, tiene cuatro colores, 8.072 triángulos en la unión y un volumen de 9.908,94 mm³. El script `scripts/verify-keychain-file.mjs` inspecciona los sólidos del archivo descargado: cuatro materiales sin solapamiento, una sola pieza física cerrada, medidas correctas, revisión geométrica sin incidencias y QR leído desde las superficies exportadas. Archivos y reporte: `artifacts/llavero-mutual-unir-premium-20261109/` (ignorados por Git).

Ale confirmó A2L con AMS y boquilla de 0,4 mm. La validación digital no acredita todavía la impresión física, resistencia o lectura con teléfono del objeto terminado.

## Prueba anterior con un enlace escrito

Prueba realizada desde el navegador integrado con el archivo original `logo.png` suministrado por el usuario. Destino del QR: `https://mutualunir.com/`, después de que el usuario eligiera la web.

## Fricción observada

Al pedir «logo de Mutual UNIR en el frente y QR en el dorso», la aplicación anterior abrió el generador de relieves visuales. La respuesta propuso omitir el texto del logo, afirmó que el QR atrás no era posible en ese modo y sugirió elegir motivos o preparar piezas separadas. El recorrido no producía el objeto solicitado y confundía una marca existente con una ilustración a generar.

La pantalla inicial también mezclaba siete formas de empezar, cuatro tipos de plantilla, chat, selector de motores, parámetros y fabricación. Para este producto concreto, esa cantidad de opciones no ayudaba a completar el trabajo.

## Cambios aplicados

- Entrada guiada visible para logo y QR; otros proyectos y herramientas quedan dentro de una sección desplegable.
- Dos datos necesarios: archivo de logo y destino web. El tamaño tiene un valor inicial y se cambia a demanda.
- Conversión local de los contornos y colores del archivo, sin pedir una nueva ilustración a OpenAI. Se recortan márgenes transparentes/blancos antes de reducir resolución, conservando mejor las letras.
- Una pieza con frente multicolor y QR de color al ras del dorso. Base blanca más hasta tres colores; el QR reutiliza un color suficientemente oscuro del logo o adapta el más oscuro para mantener contraste.
- Vistas de frente y dorso, con el chat apartado durante este recorrido. El 3MF se descarga desde la vista previa; «Usar en el taller» es opcional.
- El 3MF guarda la configuración y puede reabrirse como proyecto editable, sin exigir al usuario un segundo archivo ni volver a cargar el logo para cambiar el enlace.
- Los pedidos de llavero/logo/QR en el chat abren el creador directo, evitando el desvío por generación visual.
- Medidas libres desde 25 × 25 mm y espesor desde 1,6 mm: Alfred aplica lo que se pide dentro de ese rango (con un aviso si queda fino) y no impone mínimos propios. El QR del dorso se agranda o achica para llenar la placa con al menos 2 mm de borde libre, y el logo se escala al frente.
- Enganche a elección: agujero dentro de la placa o argolla arriba (solo el agujero con su reborde de 2 mm, fuera de la placa), que deja toda la placa para el logo y el QR. Probado con 35 × 35 mm, 1,8 mm y argolla: el QR de `https://www.mutualunir.com.ar/` se lee desde el 3MF exportado.
- En el chat, los cambios de ancho, alto, espesor, agujero, enganche y enlace se aplican de verdad; si una medida no entra, Alfred explica por qué y deja la pieza como estaba, en lugar de decir «listo».

## Pieza real generada

- 50 × 60 × 3,8 mm; base de 3,2 mm, relieve frontal de 0,6 mm y agujero de 4 mm.
- Logo completo, incluido el texto Mutual UNIR, adaptado a tres colores sólidos más blanco. Los degradados del original no se reproducen exactamente.
- QR en el dorso con módulos de aproximadamente 1,27 mm y margen de cuatro módulos. Se refleja la geometría en X para que la cara exterior tenga la orientación correcta.
- 7.480 triángulos en el sólido unido. Volumen aproximado: 9.930 mm³.
- El archivo exportado se leyó de nuevo: se rasterizaron las superficies de color del dorso desde los vértices/triángulos del 3MF y un lector QR recuperó exactamente `https://mutualunir.com/`. La prueba no vuelve a generar un QR desde metadatos.

Los archivos de la prueba, capturas y reporte quedan en `artifacts/llavero-mutual-unir/`, excluidos de Git. La imagen de la marca no se incorpora al código público.

## Verificación reproducible

`npm run verify` comprueba las regresiones existentes y la nueva geometría, cierre de superficies, colores sin solapamiento, destino del QR exportado, persistencia y entradas inválidas. `npm run verify:browser` comprueba además que se puede crear y descargar el llavero sin aplicar y sin solicitudes al asistente, y revisa desborde móvil.

## Límite físico

No se abrió el proyecto en Bambu Studio ni se imprimió esta pieza. El 3MF contiene geometría y colores, no el perfil de impresora ni laminado. Antes de entregar llaveros hay que asignar filamentos, revisar las primeras capas del QR, imprimir una muestra y escanear el objeto físico. La lectura digital verificada no sustituye esa prueba.
