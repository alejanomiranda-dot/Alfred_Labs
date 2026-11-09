# Motor creativo de Alfred

El recorrido nuevo es pedido → elección de técnica → generación visual o geometría nativa → sólido comprobado → vista previa → aplicar → exportar.

## Lo que resuelve esta entrega

- Escudos, dibujos, caras y motivos decorativos en relieve sobre una base plana, de un filamento o en colores (hasta 4, uno por carrete del AMS). La imagen puede generarse desde el texto con OpenAI o adjuntarse como referencia.
- Conversión local de una imagen adjunta sin generar otra ilustración. Permite invertir qué zonas se elevan, ajustar ancho/alto/base/profundidad y reconstruir sin gastar otra generación.
- Malla cerrada: superficie de alturas, laterales conectados y dorso plano. Se construye y valida antes de ofrecer Aplicar. Los detalles separados de la imagen quedan unidos por la base.
- Objetos con medidas mediante perfiles, recipientes, formas suaves y operaciones booleanas. Se agregaron elipsoides, cápsulas y anillos, con edición directa de sus medidas.
- Ajustar una propuesta visual en el chat antes de aplicarla puede usar su propia malla. La fuente de geometría (`current` o `pending`) viaja explícitamente; no se confunde el objeto pendiente con el aplicado.
- No se incorpora Meshy ni otra cuenta. OpenAI entiende el pedido y genera el mapa visual; Alfred construye, verifica y exporta la geometría.

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
