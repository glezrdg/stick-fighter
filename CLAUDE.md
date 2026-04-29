# Stick Fighter

Beat'em up 2D en HTML5 Canvas con stickman articulado. Single-file, sin build, sin servidor.

## Estructura

- [index.html](index.html) — todo el juego: HTML, CSS y JS inline (~4200 líneas).
- [vercel.json](vercel.json) — solo `cleanUrls: true`. Deploy estático en Vercel.
- [README.md](README.md) — controles y cómo correrlo.

No hay `package.json`, ni bundler, ni dependencias npm. La única dependencia externa son fuentes de Google Fonts cargadas por `<link>`.

## Cómo correrlo / probarlo

Abrir `index.html` en el navegador (doble click o `start index.html`). No hay dev server. Los cambios se ven recargando la página.

El estado del jugador (skins, oro, niveles de armas, skills) se guarda en `localStorage` bajo la clave `stickFighter_v3` — para resetear pruebas, borrar esa clave en DevTools.

## Convenciones

- El juego y los comentarios están en **español**. Mantener ese idioma al editar.
- Todo vive en `index.html`. No partir el archivo en módulos sin pedirlo explícitamente — es intencional que sea single-file.
- Coordenadas: hay sistema de mundo (`ARENA_W`/`ARENA_H` = 1200x800) y de pantalla. Conversiones con `w2sX/w2sY` y `CAM_ZOOM`.
- Tablas de configuración del juego (armas, skins, skills, enemigos, buffs) son objetos const al principio del bloque JS: `WEAPONS`, `CHAR_SKINS`, `AURA_SKINS`, `SKILLS`, `ENEMY_TYPES`, `WAVE_BUFFS`. Cambios de balance van ahí.

## Tareas comunes

- **Agregar arma/skin/skill**: añadir entrada al objeto correspondiente. Verificar que el render lo soporte (algunos campos como `color`, `glow`, `trail` se usan en draw).
- **Tunear balance**: editar `dmgMult`, `maxHP`, `goldMult`, `critChance`, escalado de oleadas en `spawnEnemy` (`hpScale`, `dmgScale`).
- **Probar cambios**: recargar `index.html`. Para arrancar en una oleada alta o con oro, modificar temporalmente `defaultState` o setear `localStorage` desde DevTools.
