# Alfred Forge — prototipo experimental 0.1

**No es una integración de producción.** Sin Meshy ni Tripo API: un LLM propone un programa OpenSCAD, OpenSCAD compila STL/3MF y el Taller de Vero existente puede importar esos archivos. Geometrías programables; **no** esculturas universales fotorrealistas. Solo uso local y asistido.

## Requisitos
- Node.js 22+
- OpenSCAD 2021.01+ instalado; binario `openscad` en PATH (en Windows puede definirse `OPENSCAD_BIN`).
- Opcional: `OPENAI_API_KEY` en `.env.local` en la raíz del repo o en la carpeta del experimento. `OPENAI_MODEL` por defecto `gpt-4.1`.

## Ejemplo reproducible sin IA
Desde la raíz del repo:

```bash
node experiments/alfred-forge/forge.mjs --example
```

Genera `output/arbol-vero-ale.scad`, `.stl`, `.3mf` y `.json`. Abrir STL/3MF en la interfaz del Taller o en Bambu Studio.

## Pedido nuevo con OpenAI
```bash
node experiments/alfred-forge/forge.mjs "Un árbol de 15 cm que diga VERO y ALE con corazón"
```

Una compilación fallida puede provocar una segunda llamada al modelo y consumir más API. La edición conversacional todavía **no está integrada en la interfaz**. Este experimento se sube como material de partida para la tarea #1.

## Seguridad
**No exponer como endpoint público.** El código OpenSCAD escrito por un LLM no es confiable: el filtrado por expresiones regulares no constituye un sandbox. Antes de ejecutar código de usuarios en remoto se requiere aislamiento de proceso/VM sin red ni secretos, límites de CPU/RAM/tiempo y restricciones de sistema de archivos. No almacenes credenciales en GitHub ni uses `VITE_` para claves.

3MF es geometría **sin laminar**. No se implementó el envío Wi-Fi ni el inicio automático de impresión. Revisar con Bambu Studio, verificar el estado físico de la impresora y exigir aprobación humana.

## Próximo paso para Codex
Leer [issue #1](../../issues/1) (enlace relativo puede no funcionar desde este directorio; URL: https://github.com/alejanomiranda-dot/taller-3D/issues/1), ejecutar tests existentes e integrar un flujo de propuestas en el visor de forma incremental. Trabajar solo en esta rama, abrir PR borrador, no fusionar ni desplegar `main`.
