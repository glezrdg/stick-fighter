# Stick Fighter

Beat'em up 2D HTML5 Canvas. Monorepo con Phaser 3 + TypeScript + Solid.js (web), Fastify + Drizzle + Postgres (backend self-hosted), Colyseus (multiplayer), Capacitor (móvil), Tauri (desktop).

El plan completo de la migración por fases está en `~/.claude/plans/necesito-que-hagamos-un-prancy-anchor.md`.

## Estructura

```
stick-fighter/
├── apps/
│   └── game/              # cliente Phaser + Solid + Vite (la app jugable)
├── packages/
│   ├── shared/            # tipos puros, Zod schemas (cliente ↔ servidor)
│   ├── content/           # configs de juego (weapons/skins/skills/enemies) + Zod
│   └── sim/               # simulación pura SIN Phaser/DOM, reusada en multiplayer
├── legacy/
│   └── index.html         # juego original ChatGPT, REFERENCIA funcional, no source
├── .github/workflows/     # CI (lint + typecheck + test + build)
└── (apps/api, apps/realtime, mobile/, desktop/, infra/ se agregan en F4-F7)
```

## Comandos

- `pnpm install` — instala todo (corre Husky `prepare`).
- `pnpm dev` — levanta `apps/game` en `http://localhost:5173`.
- `pnpm build` — build de packages + game para producción.
- `pnpm lint` / `pnpm format` — ESLint + Prettier.
- `pnpm typecheck` — `tsc --noEmit` en todos los workspaces.
- `pnpm test` — vitest (vacío hasta F1).

## Convenciones

- **Idioma**: español en commits, comentarios y docs (a menos que sea técnico estándar). El código (identificadores) en inglés.
- **TypeScript estricto**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Sin excepciones.
- **Cero `Math.random()` en `packages/sim/**`\*\* — ESLint rule lo bloquea. Usar el RNG seedable (mulberry32) que llega en F1.
- **Cero `JSON.parse(localStorage)` directo** — siempre vía `saveStore` con Zod (F1).
- **HUD en Solid** (`apps/game/src/ui/`), juego en canvas Phaser. Cero `getElementById` en sistemas de juego.
- **Audio**: Howler.js (no Phaser audio). Llega en F3.
- **Tiempo en sistemas**: `dt` en **segundos float**. No `tickMul` ni frames-a-60Hz.

## Fase actual: 0 — Bootstrap

El monorepo está montado, `pnpm dev` muestra una pantalla Phaser "v2 — Fase 0 bootstrap" + HUD Solid sobre el canvas. No es jugable todavía.

Lo que sigue (Fase 1) está descrito en el plan: slice vertical Player + 1 enemigo + 1 oleada con todos los patrones inquebrantables (RunState, event bus tipado, RNG seedable, Skill registry, save Zod versionado, etc).

## Legacy

El `index.html` original (4262 líneas) está en `legacy/`. **No se porta línea a línea.** Sirve como spec funcional para validar comportamiento durante la migración. Se archiva cuando F2 esté completa.

## Tareas comunes

- **Agregar arma/skill/enemigo nuevo** (en F2+): editar el JSON correspondiente en `packages/content/src/data/`, validado por Zod schema en `packages/content/src/schemas/`.
- **Tunear balance**: misma vía — JSON, no código.
- **Probar cambios**: `pnpm dev`. Para arrancar en estado específico, modificar `defaultState` o setear `localStorage` desde DevTools (la key cambia en F1).
- **Agregar test**: archivos `*.test.ts` junto al código fuente, corre con `pnpm test` (vitest).
