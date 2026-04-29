# Legacy — referencia funcional

Este directorio contiene el `index.html` original de Stick Fighter (~4262 líneas, todo HTML+CSS+JS inline) que sirve como **especificación funcional viva** durante la migración a la nueva arquitectura.

## ¿Por qué está aquí?

- El nuevo monorepo (`apps/game`) reescribe el juego desde cero en Phaser 3 + TypeScript + Solid.
- El comportamiento de cada sistema (combo de 6, oleadas, gore, skills, etc) se valida contra este `index.html`.
- **No se porta línea a línea.** Se usa como referencia visual/funcional, no como código fuente.

## Cómo correrlo

Doble click en `index.html` o sirve con cualquier static server (`python -m http.server`, `npx serve`).

Estado del jugador en localStorage bajo `stickFighter_v3`.

## Cuándo se elimina

Cuando Fase 2 (content parity) esté completa y un playtester no note diferencia entre `apps/game` y este legacy. Ahí podemos archivar este folder a una rama `archive/legacy-html`.
