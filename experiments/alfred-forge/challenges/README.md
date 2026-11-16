# Desafíos de fabricación · 16/11/2026

Cinco programas producidos por Alfred con IA real, revisados como prototipos. No son piezas comercialmente aprobadas. La cadena incluye una corrección pedida a Alfred después de detectar colisiones durante el giro.

| Desafío | Cuerpos | Comprobación digital de movimiento |
| --- | ---: | --- |
| Bisagra de 60 × 30 × 10 mm | 2 | 10 posiciones entre 0° y 170° |
| Cadena de 130 mm, 5 eslabones | 5 | 9 posiciones por junta entre −20° y +20°, moviendo todos los eslabones posteriores |
| Engranajes de 12 y 24 dientes, módulo 2 | 3 | 73 posiciones del piñón entre 0° y 360°, rueda con relación −1/2 |
| Caja de 80 × 50 × 30 mm y tapa deslizante | 2 | 17 posiciones durante inserción de 80 mm |
| Spinner de tres brazos, círculo circunscrito de 60 mm | 2 | 73 posiciones entre 0° y 360° y centro de volumen del rotor alineado con el eje |

Las posiciones muestreadas no presentaron intersecciones de volumen ≥0,001 mm³. Es un control de colisiones discretas: no demuestra ausencia de colisión entre muestras, transmisión de carga, retención, resistencia, desgaste ni movimiento físico. Los ejes, pivotes y cuerpos de `manifest.json` fueron definidos revisando estas fuentes concretas; no se infieren para modelos nuevos. La revisión automática de la aplicación comprueba cuerpos, separaciones y apoyo; no ejecuta una simulación de movimiento de cualquier mecanismo generado.

## Repetir sin consumir IA

Con OpenSCAD local y las dependencias del proyecto:

```powershell
npm run verify:premium
node scripts/slice-mechanisms.mjs artifacts/premium-verification
```

El primer comando compila las cinco fuentes, construye sus sólidos, comprueba dimensiones, cantidad exacta de cuerpos, separación sobre los triángulos finales, apoyo, paredes aproximadas y las trayectorias de `manifest.json`. Guarda STL, 3MF, proyecto editable, ZIP con guía y `reporte.json` en `artifacts/premium-verification/` (ignorado por Git). El reporte incluye SHA-256 de cada fuente.

El segundo requiere Bambu Studio portable en `.tools/bambu-studio/portable`, o `BAMBU_STUDIO_DIR`. Resuelve los perfiles originales de la A2L: boquilla 0,4 mm, PLA Basic, calidad 0,16 mm, cuatro paredes, cinco capas superiores/inferiores, sin soportes ni brim. Centra cada objeto completo sin separar sus cuerpos. Confirma código de salida, reporte de Bambu y presencia de G-code real. No se conecta a una impresora ni inicia impresiones. Sus resultados y archivos laminados quedan en `laminado/`.

La distancia entre caja y tapa en la disposición de impresión es aproximadamente 10,127 mm: **no es el juego del encastre**. Ese juego nominal es 0,4 mm y debe comprobarse con la tapa montada y con una muestra física.

## Dar tareas nuevas a Alfred

```powershell
node --env-file=.env.local scripts/evaluate-mechanisms.mjs
# O seleccionar: bisagra, cadena, engranajes, caja
node --env-file=.env.local scripts/evaluate-mechanisms.mjs cadena
```

Este comando consume API con la clave existente. Los pedidos completos están en `scripts/evaluate-mechanisms.mjs`. Comprueba la elección de camino, generación, compilación y revisión estática, con una corrección como máximo. No transforma esos controles en una aprobación comercial ni simula automáticamente los ejes de una pieza nueva.

## Qué falló y qué se corrigió

- La exigencia de un sólido único y la eliminación de detalles menores al 2 % podían fusionar un mecanismo o quitarle un eje/retén. Ahora se declara la cantidad exacta de cuerpos y se conservan todos los componentes de mecanismos.
- El acabado orgánico podía modificar encastres. Se anula para mecanismos y el editor impide reintroducirlo al reabrir el proyecto.
- Los controles distinguían mal entre cuerpos previstos y partes accidentales. Ahora miden también separaciones y apoyo por cuerpo, y preservan el contrato de fabricación durante las correcciones.
- La primera cadena tenía aproximadamente 0,424 mm de separación en reposo, pero chocaba desde ±10° (hasta 5,438 mm³ a ±15°). Alfred reemplazó la abertura por el barrido del brazo con su ancho completo y margen. La versión guardada pasa los controles entre ±20°.
- Un dragón articulado podía ir al escultor, que fusiona sus partes. Ahora tiene prioridad el camino de mecanismos.

## Criterio interno para autorizar venta

Todavía pendiente para los cinco prototipos:

1. Imprimir con el material y perfil reales del taller. Registrar versión de fuente, impresora, filamento y configuración; medir juego y cotas críticas con calibre.
2. Comprobar liberación, recorrido útil y retención; repetir 100 ciclos manuales como prueba interna inicial y registrar cualquier atasco, grieta o salida. Este umbral es un criterio de taller propuesto, no una certificación de vida útil.
3. Revisar a simple vista y al tacto las caras visibles: sin hilos, rebabas, costura prominente, marcas de soporte ni escalones molestos. Ajustar orientación, costura, velocidad exterior y flujo según el resultado impreso.
4. Repetir al menos tres muestras con el mismo perfil para comprobar consistencia. Registrar tiempo/material reales, descarte, posprocesado y costo antes de fijar precio.

Los cinco casos prueban una mejora concreta del circuito. No garantizan que cualquier pedido de Alfred salga imprimible o alcance un acabado premium; cada diseño comercial necesita su propia validación.

## Spinner probado desde el navegador integrado

La pestaña abierta conservaba JavaScript anterior al despliegue: su corrección convirtió el primer spinner en una pieza fija. Se conservó ese proyecto y se recargó la pestaña. La interfaz actual mantuvo dos cuerpos, pero el primer diseño tenía láminas finas producidas por hull global del contorno cóncavo. Además, forzar una caja 60×60 dejaba los lóbulos a distintos radios.

Alfred corrigió la pieza desde su conversación: tres brazos idénticos a 120°, biseles con secciones cóncavas, alojamiento cortado después de formar el exterior y compensación de facetas. La envolvente XYZ final es 50×54,629×14 mm; el círculo circunscrito tiene 60 mm. Separación mínima medida: 0,4048 mm. Sin zonas finas detectadas con pared objetivo de 2 mm. La distancia del centro de volumen del rotor al eje es aproximadamente 0,0000031 mm para geometría homogénea; no prueba el equilibrado de una impresión con infill real. Las 73 posiciones muestreadas no tuvieron colisiones.

Bambu Studio generó G-code con A2L/PLA/0,16 mm, sin soportes ni brim: aproximadamente 12,3 g y 36 minutos. No se imprimió. La prueba está en `artifacts/spinner-20261116/` (local, ignorada). El generador incorpora las reglas de concavidad y simetría, y el asistente distingue diámetro circunscrito de la caja XYZ para formas de simetría impar. No garantiza que cualquier nuevo spinner salga correcto sin revisión.
