# Stick Fighter

Beat'em up 2D HTML5 Canvas. Monorepo con Phaser 3 + TypeScript + Solid.js (web), Fastify + Drizzle + Postgres (backend self-hosted en VPS), Capacitor (móvil futuro), Tauri (desktop futuro).

El plan completo de la migración por fases está en `~/.claude/plans/necesito-que-hagamos-un-prancy-anchor.md`.

## Estructura

```
stick-fighter/
├── apps/
│   ├── game/              # cliente Phaser + Solid + Vite (la app jugable)
│   └── api/               # backend Fastify + Drizzle + Postgres (F4 + auth F5)
├── packages/
│   ├── shared/            # tipos puros, Zod schemas (cliente ↔ servidor)
│   ├── content/           # configs de juego (weapons/skins/skills/enemies) + Zod
│   └── sim/               # simulación pura SIN Phaser/DOM (núcleo determinístico)
├── infra/                 # docker-compose + Caddy del VPS (api + postgres)
├── legacy/
│   └── index.html         # juego original ChatGPT, REFERENCIA funcional, no source
└── .github/workflows/     # CI (lint + typecheck + test + build) + deploy api a VPS
```

> `apps/realtime/` (Colyseus multiplayer) **NO está en main**. Está parqueado en la rama `experimental/multiplayer` — ver sección "Multiplayer" abajo.

## Fase actual

**F4.5 + auth básica + refactor `packages/sim` completados. F5 phase 3 (multiplayer Colyseus) pausado.**

Lo que ya funciona end-to-end:

- F1–F2.6: arena jugable, 8 enemigos, oleadas, jefes, buff cards, gore, tienda, skins, skills, save Zod versionado.
- F3: AudioSystem procedural (sin assets), música por scene, sliders persistidos.
- F4: backend Fastify desplegado en VPS personal (`stick-fighter-api.neomac.io`), tabla `users` + `runs`, leaderboard top-100 cacheado en memoria.
- F4.5: cliente cableado al backend (submit run al terminar, leaderboard pollable desde menú).
- F5 auth básica: `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/me`. bcrypt + JWT (access 15m / refresh 30d). Anonymous submissions siguen funcionando.
- Refactor `packages/sim`: lógica determinística aislada del cliente Phaser (entities, behaviors, skills, systems). Listo para ser reusada server-side cuando volvamos a multiplayer.

Pendiente declarado:

- Migrar frontend de Vercel → VPS + Cloudflare (siguiente tarea, esperando OK).
- Multiplayer (volver con stack distinto, ver "Multiplayer").
- F6 mobile (Capacitor), F7 desktop (Tauri).

## Stack del backend (`apps/api`)

| Pieza                               | Versión  | Rol                                           |
| ----------------------------------- | -------- | --------------------------------------------- |
| Fastify 4                           | TS       | HTTP server                                   |
| Drizzle ORM 0.36                    | TS-first | schemas + migrations versionadas              |
| Postgres 16                         | Docker   | DB principal (volume persistente en VPS)      |
| `@fastify/jwt` 8                    |          | access + refresh tokens                       |
| `@fastify/rate-limit` 9             |          | 60 req/min default                            |
| `@fastify/helmet` + `@fastify/cors` |          | hardening                                     |
| bcryptjs                            |          | password hash (cost 10)                       |
| Caddy 2                             | host     | reverse proxy + auto-SSL Let's Encrypt en VPS |

**Deploy**: workflow `.github/workflows/deploy-api.yml` → self-hosted runner en el VPS personal → `docker compose -f infra/docker-compose.prod.yml up -d --build`. Re-deploy con `git push origin main` o `gh workflow run deploy-api.yml`.

**Tablas (`apps/api/src/db/schema.ts`)**:

- `users(id, display_name, email NULL, password_hash NULL, is_anonymous, created_at)` — anónimos = email NULL.
- `runs(id, user_id, wave_reached, kills, gold, duration_sec, weapon, seed, run_report jsonb, created_at)` — índice por `wave_reached DESC`.

**Endpoints**:

- `GET /health`
- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- `GET /leaderboard?limit=100`
- `POST /runs` con Zod + plausibility checks (kills ≤ wave×maxEnemies, duration mínimo, seed verificable contra `runReport`).

## Correr el backend localmente

```bash
# 1. Levantar Postgres local (Docker)
docker run -d --name stick-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=devpw -e POSTGRES_DB=stick \
  postgres:16-alpine

# 2. Crear apps/api/.env
cat > apps/api/.env <<'EOF'
DATABASE_URL=postgres://postgres:devpw@localhost:5432/stick
JWT_SECRET=dev-secret-change-in-prod-32-chars-min
JWT_REFRESH_SECRET=dev-refresh-secret-also-32-chars-min
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:5173
EOF

# 3. Migrar schema
pnpm --filter @stick/api db:migrate

# 4. Arrancar API en watch mode
pnpm --filter @stick/api dev   # http://localhost:3000

# 5. (en otra terminal) levantar el cliente
pnpm dev   # http://localhost:5173

# 6. apuntar el cliente al api local: VITE_API_URL=http://localhost:3000 en apps/game/.env
```

## Env vars

**`apps/api/`** (en `.env` local, en el VPS via `infra/.env` montado por compose):

| Var                    | Requerida | Default                                   | Notas                                   |
| ---------------------- | --------- | ----------------------------------------- | --------------------------------------- |
| `DATABASE_URL`         | sí        | —                                         | `postgres://user:pw@host:5432/db`       |
| `JWT_SECRET`           | sí        | —                                         | mín 32 chars, rotable                   |
| `JWT_REFRESH_SECRET`   | sí        | —                                         | distinto de `JWT_SECRET`                |
| `PORT`                 | no        | `3000`                                    |                                         |
| `HOST`                 | no        | `0.0.0.0`                                 |                                         |
| `NODE_ENV`             | no        | —                                         | `production` apaga pino-pretty          |
| `CORS_ALLOWED_ORIGINS` | no        | `localhost:5173,stick-fighter.vercel.app` | csv. `*.vercel.app` ya pasa por sufijo. |
| `API_VERSION`          | no        | `0.1.0`                                   | reportado en `/health`                  |
| `DRIZZLE_LOG`          | no        | —                                         | `=1` para query logs                    |

**`apps/game/`** (Vite, prefijo `VITE_`):

| Var            | Default                               | Notas                                       |
| -------------- | ------------------------------------- | ------------------------------------------- |
| `VITE_API_URL` | `https://stick-fighter-api.neomac.io` | usar `http://localhost:3000` para dev local |

## Comandos

- `pnpm install` — instala todo (corre Husky `prepare`).
- `pnpm dev` — levanta `apps/game` en `http://localhost:5173`.
- `pnpm --filter @stick/api dev` — API en watch (`tsx watch`).
- `pnpm build` — build de packages + game para producción.
- `pnpm --filter @stick/api build` — `tsc` → `apps/api/dist/`.
- `pnpm lint` / `pnpm format` — ESLint + Prettier.
- `pnpm typecheck` — `tsc --noEmit` en todos los workspaces.
- `pnpm test` — vitest (sim + api: ~53 tests).

## `packages/sim` — qué vive ahí y por qué

`@stick/sim` es el **núcleo determinístico** del juego: stateful pero puro (sin Phaser, sin DOM, sin `Math.random`). Lo importan tanto `apps/game` (single-player hoy) como un eventual servidor multi (mañana).

```
packages/sim/src/
├── rng.ts                # mulberry32 seedable + timeSeed()
├── runState.ts           # contenedor único del estado mutable (mata las globals)
├── eventBus.ts           # bus tipado (GameEvents) — columna del desacoplamiento
├── arena.ts              # constantes geométricas compartidas
├── entities/             # Player, Enemy, Projectile, Obstacle (data + factories puras)
├── enemies/              # behaviors componibles + registry (data-driven en content)
├── skills/               # registry de skills (active + passive modifiers)
└── systems/              # combat, movement, wave, buff, … reciben (state, dt, bus)
```

**Reglas duras de `packages/sim`**:

- ESLint bloquea `Math.random()` (ver `eslint.config.mjs`). Usar `Rng` que recibes por DI.
- No `import phaser`, no `document`, no `window`. Si necesitas algo del entorno, el cliente te lo pasa.
- Sistemas son funciones que reciben `(state: RunState, dt: number, bus: EventBus)`. `dt` en **segundos float**.

### Reparto cliente vs servidor (cuando vuelva multi)

| Vive en `packages/sim` (server-authoritative)  | Vive en `apps/game` (cliente only)        |
| ---------------------------------------------- | ----------------------------------------- |
| RunState, RNG, eventBus contract               | StickmanRenderer / SpriteCharacter        |
| Entities + factories                           | Phaser scenes (Arena, MainMenu, GameOver) |
| Behaviors de enemigos                          | InputController + virtualJoystick         |
| Combat / Movement / Wave / Buff systems        | HUD Solid (`apps/game/src/ui/`)           |
| Skill registry + modifiers                     | AudioSystem (Howler-style, side-effect)   |
| Arena geometry                                 | Particle/gore visual fluff                |
| Plausibility checks (también re-corren en API) | Cámara, hit-stop, screen shake            |

La única lógica de combate que NO está en sim hoy es la generación de partículas de gore (cosmética). Todo lo que afecta scoreboard ya pasa por sim.

## Multiplayer (parqueado)

F5 phase 3 intentó co-op 2P self-hosted con **Colyseus 0.16**. Funcionaba lobby/matchmaking pero el server crasheaba al intentar serializar el `WorldState` (`Symbol.metadata` undefined en el encoder de `@colyseus/schema`). Probamos polyfill, `defineTypes`, downgrade a 0.15 → cada fix expuso otro mismatch. Tras ~3h en el ciclo decidimos pausarlo limpiamente.

**Estado**:

- 12 commits preservados en la rama `experimental/multiplayer` (push'd a origin).
- Main rolled back limpio: typecheck/test/lint/build verdes.
- Container `stick-fighter-realtime` parado en el VPS (`docker compose down`).
- El refactor de `packages/sim` se quedó (es la parte valiosa — no se tira).

**Cuándo volver**: con stack distinto. Opciones a evaluar:

- **PartyKit / Cloudflare Durable Objects** — sin server propio, paga-por-uso.
- **Socket.IO custom** — mensajes manuales, más control que Colyseus.
- **Colyseus Cloud managed** — descarga el deploy/runtime, no self-host.

No volver a Colyseus self-hosted sin entender primero el bug de `Symbol.metadata` upstream.

**Cómo "testear multiplayer hoy"**: no se puede en main. Para experimentar: `git checkout experimental/multiplayer`, leer el README de esa rama (si existe) y arrancar `apps/realtime` localmente. No se va a mergear sin replantear el stack.

## Convenciones

- **Idioma**: español en commits, comentarios y docs (a menos que sea técnico estándar). El código (identificadores) en inglés.
- **TypeScript estricto**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Sin excepciones.
- **Cero `Math.random()` en `packages/sim/**`\*\* — ESLint rule lo bloquea. Usar el RNG seedable (mulberry32).
- **Cero `JSON.parse(localStorage)` directo** — siempre vía `saveStore` con Zod.
- **HUD en Solid** (`apps/game/src/ui/`), juego en canvas Phaser. Cero `getElementById` en sistemas de juego.
- **Audio**: Howler-style procedural por ahora (sin assets). Llega Howler real con assets cuando pase F2.6.
- **Tiempo en sistemas**: `dt` en **segundos float**. No `tickMul` ni frames-a-60Hz.
- **Backend env**: nunca commitear `.env`. `JWT_SECRET` y `JWT_REFRESH_SECRET` viven en `infra/.env` en el VPS, montados por compose.

## Legacy

El `index.html` original (4262 líneas) está en `legacy/`. **No se porta línea a línea.** Sirve como spec funcional para validar comportamiento. F2 ya alcanzó paridad visible — se archiva cuando confirmemos que no falta nada de gameplay tras la migración a sprites (F2.5 futura).

## Tareas comunes

- **Agregar arma/skill/enemigo nuevo**: editar el JSON en `packages/content/src/data/`, validado por Zod schema en `packages/content/src/schemas/`.
- **Tunear balance**: misma vía — JSON, no código.
- **Probar cambios**: `pnpm dev`. Para arrancar en estado específico, modificar `defaultState` en `apps/game/src/core/meta/saveStore.ts` o setear `localStorage` desde DevTools (key `stickFighter_v4`).
- **Agregar test**: archivos `*.test.ts` junto al código fuente, corre con `pnpm test` (vitest).
- **Migración Drizzle**: editar `apps/api/src/db/schema.ts`, `pnpm --filter @stick/api db:generate`, commitear el SQL generado en `apps/api/src/db/migrations/`. El deploy las corre automáticamente al arrancar el container.
