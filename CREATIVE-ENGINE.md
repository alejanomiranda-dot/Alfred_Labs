# Motor creativo de Alfred

El recorrido nuevo es pedido → elección de técnica → generación visual o geometría nativa → sólido comprobado → vista previa → aplicar → exportar.

## Lo que resuelve esta entrega

- Escudos, dibujos, caras y motivos decorativos en relieve sobre una base plana, de un filamento o en colores (hasta 4, uno por carrete del AMS). La imagen puede generarse desde el texto con OpenAI o adjuntarse como referencia.
- Conversión local de una imagen adjunta sin generar otra ilustración. Permite invertir qué zonas se elevan, ajustar ancho/alto/base/profundidad y reconstruir sin gastar otra generación.
- Malla cerrada: superficie de alturas, laterales conectados y dorso plano. Se construye y valida antes de ofrecer Aplicar. Los detalles separados de la imagen quedan unidos por la base.
- Objetos con medidas mediante perfiles, recipientes, formas suaves y operaciones booleanas. Se agregaron elipsoides, cápsulas y anillos, con edición directa de sus medidas.
- Ajustar una propuesta visual en el chat antes de aplicarla puede usar su propia malla. La fuente de geometría (`current` o `pending`) viaja explícitamente; no se confunde el objeto pendiente con el aplicado.
- No se incorpora Meshy ni otra cuenta. OpenAI entiende el pedido y genera el mapa visual; Alfred construye, verifica y exporta la geometría.

## Acabado orgánico de Forge

OpenSCAD arma solo la forma grande; la terminación la hace Alfred con Manifold (`src/finish.js`), sin Blender ni servicios nuevos. Forge elige un `finish` para cada pieza: suavizado de 0 a 1 y una textura (cráteres, roca, madera, escamas o pelaje) con su profundidad y tamaño en mm. Se guarda en la versión y se aplica como última operación del diseño, así el panel «Acabado» lo cambia sin volver a generar la pieza y con Deshacer.

- Suavizado: subdivide la malla y redondea las facetas; las aristas vivas de más de 20 a 75° (según el suavizado) se conservan.
- Textura: desplaza cada punto sobre su normal. Los cráteres son cuencos con borde levantado; roca, madera y pelaje se tallan hacia adentro.
- Protecciones: la base plana y su altura, las aristas vivas, los agujeros, ranuras e interiores de recipientes (si hay otra pared enfrente a menos de 30 a 50 mm no se talla, y en superficies interiores nunca se agrega material), las superficies encerradas como el interior de una luna lámpara (desde ahí casi ningún rayo inclinado sale de la pieza) y una pared mínima de 1,2 mm medida con rayos.
- Profundidad visible: lo que elige la IA no baja de 1 mm en cráteres, 0,5 mm en roca y escamas y 0,35 mm en madera y pelaje; desde el panel se puede bajar más. La crítica visual sabe que la textura es del acabado y puede pedir ajustarla.
- No se reescala la pieza: las medidas cambian décimas de milímetro y los encastres conservan su tamaño.
- Hasta unos 190.000 triángulos y 1 a 3 s de cálculo por cambio; el resultado se reutiliza al redibujar.
- Límite: suavizar redondea también puntas finas (por ejemplo, la punta de un cono). Para piezas técnicas o con caras planas, el suavizado debe ser bajo o nulo.

## Límites concretos

Un relieve no es una figura orgánica completa vista desde todos los lados. Para un personaje de 360°, el asistente pide aceptar una versión geométrica estilizada; no promete reconstrucción fiel. Una ilustración generada de un escudo o personaje es una interpretación, no un archivo oficial. Una referencia ayuda a conservar identidad, pero el muestreo del relieve puede perder letras o detalles pequeños. En colores, la imagen se pide en colores planos (o se usa la adjunta), cada píxel toma el color más cercano de la paleta y cada color se vuelve una parte del 3MF que empieza arriba de la placa: las capas de la base salen de un solo filamento. Detalles más finos que unos 0,5 mm pueden perderse. La revisión en Bambu Studio y la prueba física continúan siendo necesarias.

## Verificación

- Pruebas unitarias de cierre de aristas, volumen, orientación, transparencia, inversión, resolución densa, formas nuevas, ajuste de malla pendiente y errores del proveedor.
- Seis pedidos reales: Newell's, Rosario Central, Manchester United, Leono en relieve, galaxia decorativa y botella con medidas. La botella también se construye para verificar sus medidas declaradas.
- Siete pedidos previos del asistente como regresión.
- Generación real del mapa de alturas de una galaxia con la clave existente.
- Navegador: pedido de Newell's → generar ilustración → sólido de 80 × 80 mm → aplicar → exportar proyecto → reconstruir desde el archivo descargado. Resultado: 52.470 triángulos, volumen positivo y malla válida.
- Navegador: adjuntar mapa de galaxia → interpretar referencia → convertir localmente → invertir alturas y cambiar profundidad de 3 a 4 mm sin regeneración → aplicar. Resultado: 80 × 80 × 6 mm.

La imagen y la conversación son temporales de la sesión. El JSON editable conserva la geometría y los parámetros de origen para identificar el relieve. Ninguna clave ni imagen de prueba se incluye en el código público.
