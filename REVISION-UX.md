# Revisión del taller — 8 de noviembre de 2026

El recorrido verificado es pedido → API → propuesta → sólido real → vista previa → aplicar → archivo imprimible.

## Problemas encontrados y corregidos

- `round` construía un rectángulo con esquinas redondeadas. Faltaba una forma circular y el nombre podía hacer que el asistente prometiera una pieza redonda. Se incorporó `circle` con diámetro único, sin reinterpretar archivos anteriores.
- Un mensaje nuevo eliminaba la propuesta pendiente. Ahora se conserva mientras se conversa y viaja a la API como contexto distinto del diseño aplicado.
- La vista previa desplazaba la página fuera del chat. Ahora el escritorio tiene pieza y chat juntos. En pantallas de hasta 1050 px hay pestañas para alternar entre ambos.
- Ajustes, chat y fabricación estaban mezclados. Ahora los ajustes y la fabricación se abren a demanda, y guardar una versión es una acción visible.
- Las cotas y la regla podían medir la pieza anterior al mostrar una propuesta. Ahora usan la geometría visible y el visor indica propuesta sin aplicar o pieza actual.
- Las modificaciones manuales invalidan propuestas pendientes. Deshacer un cambio del asistente se ofrece mientras no haya otros cambios posteriores. Abrir otro proyecto reinicia el historial de deshacer.
- Detener cancela la espera del navegador y propaga la cancelación a la solicitud del proveedor.

## Evidencia

- `npm run verify`: 48 pruebas aprobadas, compilación y comprobación de salida pública sin la clave local.
- `node scripts/evaluate-assistant.mjs`: 7/7 casos reales aprobados con el modelo configurado: chapita redonda sin diámetro explícito; diámetro de 40 mm; ajuste pendiente a 35 mm y LUNA; consulta sin cambio; óvalo de 50 × 35; huesito grabado en el dorso; caja abierta de 80 × 50 × 30.
- Navegador: envío con Enter, respuesta en historial, propuesta circular, ajuste antes de aplicar, consulta sin perder propuesta, aplicar, deshacer, descartar, detener, restauración del mensaje detenido y rechazo de una propuesta al editar manualmente la pieza.
- Navegador: escritorio de 1280 × 900 y celular de 390 × 844; pestañas de pieza/chat, sin desbordamiento horizontal en celular. Cotas de la propuesta circular: 40 × 40 × 3,2 mm.
- Descarga STL desde el navegador después de aplicar: 40 × 40 × 3,2 mm y radio exterior máximo de 20 mm, comprobados en el archivo binario descargado.

No se cambió el modelo: el fallo reproducido tenía una causa concreta en la geometría y en el contrato de las formas. Los casos de API son una muestra de regresión; no garantizan que cualquier pedido futuro se interprete correctamente. Los flujos completos de fotos, todos los formatos de terceros y la impresión física no se recorrieron manualmente en esta revisión. La compilación conserva el aviso de tamaño del paquete JavaScript.
