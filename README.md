# Stick Fighter

Beat'em up 2D en HTML5 Canvas. Stickman articulado, espada + arco, combo de 6 con auto-aim, 9 tipos de enemigos, oleadas, gore, 13 skins.

> **Estado**: en migración a monorepo (Phaser 3 + TypeScript + Solid + Fastify + Colyseus). El juego original en `legacy/index.html` sigue siendo la versión jugable hasta que `apps/game` alcance paridad funcional (Fase 2 del plan).

## Stack

- **Cliente**: Phaser 3 + TypeScript + Vite + Solid.js (HUD)
- **Backend**: Fastify + Drizzle ORM + Postgres + Redis (self-hosted en VPS, Docker)
- **Multiplayer**: Colyseus
- **Mobile**: Capacitor
- **Desktop**: Tauri 2

## Cómo correrlo

### Versión nueva (en desarrollo)

```bash
pnpm install
pnpm dev
```

Abre `http://localhost:5173`. Por ahora solo muestra una pantalla de bootstrap (Fase 0).

### Versión legacy (jugable)

Abre `legacy/index.html` directamente con el navegador (doble click). No requiere build ni servidor.

## Controles (versión legacy)

- **WASD / flechas** — mover
- **ESPACIO** — espada (combo de 6 ataques con auto-aim)
- **F** — disparar arco
- **Q / E** — habilidades equipadas
- **Doble tap** — dash (si la skill está desbloqueada)

## Deploy

Configurado para Vercel (`vercel.json`). Build del monorepo produce `apps/game/dist`. Hasta paridad funcional, considera mantener la legacy desplegada en una ruta separada si quieres preservar la URL pública.

## Licencia

Privado por ahora.
