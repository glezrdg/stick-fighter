# Stick Fighter

Beat'em up 2D HTML5 Canvas. Monorepo con Phaser 3 + TypeScript + Solid.js (web), Fastify + Drizzle + Postgres (backend self-hosted en VPS), Capacitor (móvil futuro), Tauri (desktop futuro).

El plan completo de la migración por fases está en `~/.claude/plans/necesito-que-hagamos-un-prancy-anchor.md`.

## Estructura

```
stick-fighter/
├── apps/
│   ├── game/              # cliente Phaser + Solid + Vite (la app jugable)
│   ├── api/               # backend Fastify + Drizzle + Postgres (auth + leaderboard + cloud-save)
│   └── realtime/          # multiplayer WS raw + JSON, server-authoritative 30Hz (F5R')
├── packages/
│   ├── shared/            # tipos puros + Zod schemas (cliente ↔ api ↔ realtime)
│   ├── content/           # configs de juego (weapons/skins/skills/enemies) + Zod
│   └── sim/               # simulación pura SIN Phaser/DOM (reusada por game + realtime)
├── legacy/
│   └── index.html         # juego original ChatGPT, REFERENCIA funcional, no source
└── .github/workflows/     # deploy-{api,game,realtime}.yml — todos en self-hosted runner del VPS
```

> `apps/realtime/` corre **WS raw + JSON** server-authoritative y está en main, deployado en `wss://stick-fighter-realtime.neomac.io`. La rama `experimental/multiplayer` conserva los intentos viejos con Colyseus (no mergear). Ver sección "Multiplayer" abajo.

## Fase actual

**F5R'-C completado: multi co-op 2P jugable end-to-end con paridad visible básica. Sprint de unificación arquitectural en curso.**

Lo que ya funciona end-to-end:

- F1–F2.6: arena jugable, 8 enemigos, oleadas, jefes, buff cards, gore, tienda, skins, skills, save Zod versionado.
- F3: AudioSystem procedural (sin assets), música por scene, sliders persistidos.
- F4: backend Fastify desplegado en VPS personal (`stick-fighter-api.neomac.io`), tabla `users` + `runs`, leaderboard top-100 cacheado en memoria.
- F4.5: cliente cableado al backend (submit run al terminar, leaderboard pollable desde menú).
- F5 auth básica: `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/me`. bcrypt + JWT (access 15m / refresh 30d). Anonymous submissions siguen funcionando.
- Refactor `packages/sim`: lógica determinística aislada del cliente Phaser (entities, behaviors, skills, systems). Reusada server-side por `apps/realtime`.
- **F5R'-A/B/C**: multi co-op 2P sobre WS raw + JSON (`apps/realtime` en main, deployado en `wss://stick-fighter-realtime.neomac.io`). Cosmetics sync, Left4Dead-style downed/revival, gore + deathFx + camera shake, obstacles destructibles, wave buffs (server pausa, ambos votan).
- **Migración Vercel → VPS**: frontend ahora servido en `https://stick-fighter.neomac.io` desde el VPS personal (nginx:alpine + Traefik + cert wildcard `*.neomac.io` via cf-dns). Proyecto Vercel borrado.

## Roadmap actual: paridad SP↔multi + unificación del motor

**Por qué existe este sprint**: hoy mismo el SP (`ArenaScene.ts`) y el multi (`StickFightRoom.ts` + `NetArenaScene.ts`) son **dos motores paralelos**. `packages/sim` cubre lo determinístico (combat, entities, behaviors, waves, obstacles), pero **muchos sistemas client-only nunca se portaron** (`SkillSystem`, `BuffSystem.computeStats()`, `runState` completo) y el server **reimplementa partes en simplificado** (damage mul, regen, wave-buff apply). Resultado: agregar una mecánica nueva = trabajo doble + drift garantizado.

**El fix** son 3 sprints chicos mergeados a `main` (sin branches largos). Cada uno entrega valor visible.

### Sprint 1: Polish visible (1-2 días) ← EN CURSO

Lo que un jugador _ve_ mal hoy en multi:

- HUD encima de las wave-buff cards (chips HP/DMG/etc se cuelan).
- Name labels ("yermino — vos") cruzan el modal de cards.
- Falta indicador "✓ vos / esperando peer" sobre las cards después de votar.
- Stats chips estáticos (siempre 1.00/1.00/1.00/5%) — server nunca emite `stats:changed`.
- Combo counter del HUD queda en 0 — server no emite `combo:advance/finisher`.
- Audio reactivo: events `enemy:death`, `gold:changed` llegan vía bus local pero no todos los del server hacen bridge → SFX faltante.
- Hit-stop client-side (50-180ms freeze al pegar) ausente en multi.
- Damage popups del peer + críticos dorados ausentes.

### Sprint 2: Unificación arquitectural (3-5 días)

ROI más alto. Porta el motor client-only a `packages/sim` y hace que **un cambio = un cambio** en ambos lados:

- Portar `SkillSystem` (Q/E + passives) a `sim`. Hoy multi tiene `c.input.skill = null` literal — los skills no funcionan en co-op.
- Hacer que el server use `BuffSystem.computeStats()` igual que SP, eliminando el `applyBuffToClient` simplificado. Esto **prende automáticamente** los buffs hoy "silent": `atkSpeed` (acelera animación), `knockback` (escala empuje), `gold` (multiplica drops).
- Unificar `runState`: hoy SP tiene `RunState` completo, server tiene `RoomClient.runBuffs` parcial. Alinear schemas.
- Bridge correcto de stats al cliente: server emite `stats:changed` per-cliente, NetArenaScene lo escucha y los chips HUD reaccionan.
- Skill cooldowns en HUD: server emite `skill:cooldown:changed`, chips Q/E reactivos.

### Sprint 3: Features de paridad (3-4 días)

Lo que falta como feature, no como bug:

- Skills (Q/E activos + pasivos) jugables en multi. Sale "gratis" tras Sprint 2 si se hace bien.
- Submit run al terminar multi → POST `/runs` (con seed verificable). Hoy multi no graba leaderboard.
- Reconnect tras backgrounding mobile (`allowReconnection` 60s grace).
- Drop-out gracioso (peer se va, vos seguís solo). Hoy server cierra la room al primer disconnect.
- Cloud save post-run.
- Aura/glow render del player desde `cosmetics.aura`.

### Fuera de scope (decisiones de diseño primero, no código)

- Tienda mid-run en co-op: ¿pausa al peer? ¿shared gold? ¿shared inventory? Punto a discutir.
- Pause menu en co-op: ¿pausa global o solo cámara local?

### Después de paridad

- F6 mobile (Capacitor), F7 desktop (Tauri).
- F2.5 sprites pixelart (parqueado, sigue siendo opcional).

## Stack del backend (`apps/api`)

| Pieza                               | Versión  | Rol                                                                    |
| ----------------------------------- | -------- | ---------------------------------------------------------------------- |
| Fastify 4                           | TS       | HTTP server                                                            |
| Drizzle ORM 0.36                    | TS-first | schemas + migrations versionadas                                       |
| Postgres 16                         | Docker   | DB principal (volume persistente en VPS)                               |
| `@fastify/jwt` 8                    |          | access + refresh tokens                                                |
| `@fastify/rate-limit` 9             |          | 60 req/min default                                                     |
| `@fastify/helmet` + `@fastify/cors` |          | hardening                                                              |
| bcryptjs                            |          | password hash (cost 10)                                                |
| Traefik v3                          | host     | reverse proxy + auto-SSL Let's Encrypt (cf-dns wildcard `*.neomac.io`) |

**Deploy**: workflow `.github/workflows/deploy-api.yml` → self-hosted runner en el VPS personal (`neomac-stick-fighter`) → `docker compose -f apps/api/docker-compose.prod.yml up -d --build`. Re-deploy con `git push origin main` (paths-filtered) o `gh workflow run deploy-api.yml`.

**Frontend deploy**: análogo. `.github/workflows/deploy-game.yml` → mismo runner → `apps/game/docker-compose.prod.yml`. Container `stick-fighter` sirve `dist/` con `nginx:alpine` detrás del mismo Traefik. URL: `https://stick-fighter.neomac.io`. CORS del api permite ese origen.

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

**`apps/api/`** (en `.env` local; en el VPS lo escribe el workflow `deploy-api.yml` desde GitHub Secrets a `apps/api/.env`):

| Var                    | Requerida | Default                                  | Notas                                                                     |
| ---------------------- | --------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`         | sí        | —                                        | `postgres://user:pw@host:5432/db`                                         |
| `JWT_SECRET`           | sí        | —                                        | mín 32 chars, rotable                                                     |
| `JWT_REFRESH_SECRET`   | sí        | —                                        | distinto de `JWT_SECRET`                                                  |
| `PORT`                 | no        | `3000`                                   |                                                                           |
| `HOST`                 | no        | `0.0.0.0`                                |                                                                           |
| `NODE_ENV`             | no        | —                                        | `production` apaga pino-pretty                                            |
| `CORS_ALLOWED_ORIGINS` | no        | `localhost:5173,stick-fighter.neomac.io` | csv de orígenes permitidos. Prod tiene `https://stick-fighter.neomac.io`. |
| `API_VERSION`          | no        | `0.1.0`                                  | reportado en `/health`                                                    |
| `DRIZZLE_LOG`          | no        | —                                        | `=1` para query logs                                                      |

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

## Multiplayer

Co-op 2P en producción sobre **WS raw + JSON** (`apps/realtime/`). Server en `wss://stick-fighter-realtime.neomac.io`, deployado al mismo VPS bajo Traefik.

### Historia (lo aprendimos a la mala)

F5 phase 3 intentó **Colyseus 0.16** y crasheó con `Symbol.metadata undefined` en el encoder de `@colyseus/schema`. Retry con 0.15 crasheó con `bytes is not iterable` en `sendFullState`. Tras dos intentos pivotamos a **WS raw + JSON tipado**:

- Cada mensaje es un objeto discriminado por `t` (`'host'`, `'join'`, `'state'`, etc).
- Wire human-readable en DevTools (Network → WS → Frames).
- Zod sólo en handshake (`HostReq`/`JoinReq`); hot-path es `JSON.parse` + narrowing por TS.
- Server-authoritative full-state broadcast a 30Hz (~3-5KB/tick = ~150KB/s/cliente).

Branch histórico de los intentos Colyseus: `experimental/multiplayer` (no mergear, conservar como referencia).

### Estado actual (F5R'-A/B/C completados)

- `packages/shared/src/realtime/protocol.ts` — protocolo discriminado completo.
- `apps/realtime/src/rooms/StickFightRoom.ts` — 2P co-op con cosmetics sync, downed/revival Left4Dead-style, obstacles, wave-buff voting (server pausa, ambos votan, resuelve).
- `apps/realtime/src/server.ts` — Express HTTP + WebSocketServer. Registry in-memory.
- Cliente: `apps/game/src/net/NetClient.ts` (subscription model) + `apps/game/src/scenes/NetArenaScene.ts` (renderer puro, lee snapshots).

### Lo que falta para paridad con SP

Detallado arriba en "Roadmap actual". Resumen:

- **Sprint 1 (en curso)**: polish visible — HUD durante cards, name labels, vote indicator, stats chips reactivos, audio bridge, hit-stop.
- **Sprint 2**: unificar motor — server usa `BuffSystem.computeStats()` y `SkillSystem` directos de `sim` (en vez del mirror simplificado actual).
- **Sprint 3**: features — skills jugables Q/E, submit run, reconnect, drop-out solo, cloud save.

### Cómo correrlo localmente

```bash
# 1. Levantar realtime (puerto 2567)
pnpm --filter @stick/realtime dev

# 2. Cliente (en otra terminal). Apuntar al realtime local:
echo "VITE_REALTIME_URL=ws://localhost:2567" >> apps/game/.env.local
pnpm dev   # http://localhost:5173
```

Abrir 2 navegadores → en uno "CO-OP" → "CREAR SALA" → copiar el código de 4 letras → en el otro "CO-OP" → "UNIRSE" → ambos ready.

## Convenciones

- **Idioma**: español en commits, comentarios y docs (a menos que sea técnico estándar). El código (identificadores) en inglés.
- **TypeScript estricto**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Sin excepciones.
- **Cero `Math.random()` en `packages/sim/**`\*\* — ESLint rule lo bloquea. Usar el RNG seedable (mulberry32).
- **Cero `JSON.parse(localStorage)` directo** — siempre vía `saveStore` con Zod.
- **HUD en Solid** (`apps/game/src/ui/`), juego en canvas Phaser. Cero `getElementById` en sistemas de juego.
- **Audio**: Howler-style procedural por ahora (sin assets). Llega Howler real con assets cuando pase F2.6.
- **Tiempo en sistemas**: `dt` en **segundos float**. No `tickMul` ni frames-a-60Hz.
- **Backend env**: nunca commitear `.env`. `JWT_SECRET`, `POSTGRES_PASSWORD`, `CORS_ALLOWED_ORIGINS` viven como GitHub Secrets y el workflow `deploy-api.yml` los escribe a `apps/api/.env` en el VPS antes del `docker compose up`.

## Legacy

El `index.html` original (4262 líneas) está en `legacy/`. **No se porta línea a línea.** Sirve como spec funcional para validar comportamiento. F2 ya alcanzó paridad visible — se archiva cuando confirmemos que no falta nada de gameplay tras la migración a sprites (F2.5 futura).

## Tareas comunes

- **Agregar arma/skill/enemigo nuevo**: editar el JSON en `packages/content/src/data/`, validado por Zod schema en `packages/content/src/schemas/`.
- **Tunear balance**: misma vía — JSON, no código.
- **Probar cambios**: `pnpm dev`. Para arrancar en estado específico, modificar `defaultState` en `apps/game/src/core/meta/saveStore.ts` o setear `localStorage` desde DevTools (key `stickFighter_v4`).
- **Agregar test**: archivos `*.test.ts` junto al código fuente, corre con `pnpm test` (vitest).
- **Migración Drizzle**: editar `apps/api/src/db/schema.ts`, `pnpm --filter @stick/api db:generate`, commitear el SQL generado en `apps/api/src/db/migrations/`. El deploy las corre automáticamente al arrancar el container.

---

## Cliente: render + game feel

Esta sección documenta cómo está cableada la capa visual del cliente (Phaser canvas + Solid HUD overlay), las convenciones del juice, y los archivos que un agente nuevo puede tocar sin chocar con sim/backend.

### Layers de Graphics en `ArenaScene`

Orden de pintado (de atrás hacia adelante):

```
arenaPropsGraphics       # piso industrial + paredes + lámparas + polvo + viñeta
goreFloorGraphics        # blood pools + corpses
telegraphGraphics        # cono melee / línea ranged (windup del enemigo)
obstacleGraphics         # barriles, cajas, columnas
gorePartsGraphics        # body parts en el suelo
auraGraphics             # glow del aura del player (debajo del actor)
playerGraphics           # stickman del jugador
projectileGraphics       # arrows / orbs / spears
particleGraphics  (depth 900)  # blood, sparks, dust, shockwaves
deathFxGraphics   (depth 950)  # white flash + ring al matar
```

Cada layer se `clear()` y se redibuja por frame. Los enemigos tienen su propio `Graphics` por id en el Map `enemyGraphics` para que se pueda destruir cuando muere el enemigo.

### Helpers puros del juice

**`packages/sim/src/systems/hitStop.ts`** — pause de gameplay 50–180 ms al impactar. Pure functions:

- `requestHitStop(state, duration)` aplica el freeze respetando un throttle de **80 ms** y un cap de **180 ms**. Devuelve `false` si fue rechazado por throttle (AOE pegando a 10 enemigos en el mismo tick → 1 freeze, no 10).
- `tickHitStop(state, realDt)` decae los timers en dt real (no afectado por slow-mo).
- ArenaScene mantiene un `hitStopState = { hitStop, cooldown }` y mirror al `runState.hitStop` para que el render lo lea consistente.

Solo los **swings primarios** del jugador disparan freeze en `combat:hit` (chequeo `player.attackTimer > 0 && attackKind !== null`). AOE y skills (tornado, kiBlast, FinalFlash, GroundPound) **no** generan freeze por golpe — solo en muerte y throttled. Tornado tickeando 5×/seg es safe.

### Sistemas visuales del cliente

| Archivo                                      | Propósito                                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/game/src/render/StickmanRenderer.ts`   | Stickman vectorial (player + enemigos). Sombra dinámica, ojo direccional, smears en swing, espada visible en la espalda en idle, squash en hurtFlash, drawBowAttack (3 fases). |
| `apps/game/src/render/DeathFxRenderer.ts`    | White flash + expanding ring al kill. Lee `DeathFxSystem`.                                                                                                                     |
| `apps/game/src/render/TelegraphRenderer.ts`  | Decals de pre-ataque enemigo. Acepta `kindOf(enemy) → 'melee' \| 'ranged'`; melee = cono frontal, ranged = línea con reticle.                                                  |
| `apps/game/src/render/ParticleRenderer.ts`   | Pool de partículas (blood, sparks, dust, shockwaves, aura burst).                                                                                                              |
| `apps/game/src/render/ArenaPropsRenderer.ts` | Piso industrial + ventiladores + lámparas con flicker + polvo flotante + viñeta.                                                                                               |
| `apps/game/src/systems/DeathFxSystem.ts`     | Pool de death effects (cap 32, vida 0.28 s).                                                                                                                                   |
| `apps/game/src/systems/AudioSystem.ts`       | Howler-style procedural por bus events.                                                                                                                                        |

### Constantes ya tuneadas (no las toques sin entender por qué)

| Constante               | Archivo                                            | Valor  | Razón                                                                            |
| ----------------------- | -------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| `CAM_ZOOM`              | `packages/sim/src/arena.ts`                        | `1.8`  | Sweet spot entre legacy 1.6 y closer 2.0 — viewport 540×960.                     |
| `HIT_STOP_THROTTLE_SEC` | `packages/sim/src/systems/hitStop.ts`              | `0.08` | Evita slideshow con AOE / atk-speed alto.                                        |
| `HIT_STOP_CAP_SEC`      | idem                                               | `0.18` | Tope absoluto del freeze acumulado.                                              |
| `BOW_AUTO_AIM_RADIUS`   | `packages/sim/src/systems/CombatSystem.ts`         | `600`  | Casi 3× el melee — el bow es respuesta a ranged.                                 |
| `BOW_COOLDOWN_SEC`      | idem                                               | `0.4`  | Legacy parity (24 frames / 60).                                                  |
| `ARROW_SPEED_PX_SEC`    | idem                                               | `720`  | Tipo `'arrow'`, ownerId `'player'` para diferenciar de enemy projectiles.        |
| `MAX_FIRE_DIST`         | `packages/sim/src/enemies/behaviors/rangedKite.ts` | `260`  | Hard cap; el arquero no apunta si player está más lejos (no off-screen sniping). |
| `WINDUP_SEC`            | idem                                               | `0.55` | Tiempo del telegraph antes del disparo. Premia esquivar.                         |

### HUD reactivo (Solid + bus tipado)

Patrón estándar en `apps/game/src/ui/HudRoot.tsx`:

```tsx
const [hp, setHp] = createSignal(props.initialHp)
const off = props.bus.on('player:hp:changed', ({ hp }) => setHp(hp))
onCleanup(off)
```

**Eventos clave del HUD**:

- `player:hp:changed` — barra de HP arriba.
- `gold:changed` — chip dorado + tienda.
- `wave:start` / `wave:enemies:changed` — banner + contador.
- `combo:advance` / `combo:reset` / `combo:finisher` — combo counter + finisher juice.
- `stats:changed` — emitido por `ArenaScene.emitStats()` en run start y tras `recomputeStats()` (wave buff pick). Driver de los 7 chips legacy (HP / DMG / VEL / CRT / REG / KB / ORO).
- `skills:equipped` / `skill:cooldown:changed` — slots Q / E.

**Regla**: nunca `getElementById` en sistemas de juego. La HUD es Solid puro, recibe data por bus, no muta sim state.

### `ShopOverlay` — reactive accessor pattern

Solid no detecta mutaciones in-place de objetos (el save se modifica con `save.gold -= cost`). El truco es leer un signal-tick dentro del accessor para forzar rerender:

```tsx
const [rev, setRev] = createSignal(0)
const save = () => {
  rev()
  return props.getSave()
} // toca rev → reactive
const persist = () => {
  void props.saveStore.save(props.getSave())
  setRev((r) => r + 1) // dispara rerender
  props.bus.emit('gold:changed', { gold: props.getSave().gold, delta: 0 })
}
```

Cualquier `save().gold` / `save().cosmetics.x.owned` dentro de un computed Solid se invalida cuando `persist()` corre. **Si copias un nuevo handler de compra, asegurate de llamar `persist()` al final** o la UI no se actualiza.

### Previews del shop (`ShopPreview.tsx`)

Cada arma y skin se dibuja en un `<canvas>` 2D real (no Phaser, no WebGL extra). Para agregar una weapon nueva:

1. Añadirla a `packages/content/src/data/weapons.json`.
2. Agregar el `shape` al schema en `packages/content/src/schemas/weapon.ts`.
3. Agregar un `case` en `drawWeaponShape()` de `ShopPreview.tsx`.
4. Añadir el render real (in-game) en `apps/game/src/render/WeaponRenderer.ts`.

Para una skin nueva: solo `skins.json` + el `clothing` y `accessory` ya existentes funcionan; si introduces un clothing/accessory nuevo, agrégalo en `ClothingRenderer.ts` / `AccessoryRenderer.ts` + el case correspondiente en `drawClothing` / `drawAccessoryHint` de `ShopPreview.tsx`.

### Dev wallet en localhost

`apps/game/src/app/di.ts → applyDevWalletIfLocalhost()` se ejecuta en el bootstrap. Si `window.location.hostname` es `localhost / 127.0.0.1 / 0.0.0.0`, sube `save.gold` a 99 999 y `save.gems` a 999. **No-op en producción** (el deploy a VPS no hace match).

- Para validar el "fresh save" experience en local: abrir con `http://localhost:5173/?nocheats=1`.
- Solo aumenta valores si están por debajo del target — no resetea progreso.

### Render config (Phaser)

`main.tsx` usa `antialias: true, pixelArt: false, roundPixels: false` — **vector look** matcheando el legacy Canvas 2D. NO cambiar a `pixelArt: true` salvo que se decida pivotar a sprites pixel-art (F2.5 que sigue parqueado).

### Cómo agregar un FX visual nuevo (recipe)

1. **Si es disparado por una acción del juego** (combo finisher, kill, hit crítico): agregar evento al bus tipado en `packages/sim/src/eventBus.ts`.
2. **Si necesita estado** (lifetime, pool): nuevo `*System` en `apps/game/src/systems/` (no en sim si es solo cosmético).
3. **Render** en `apps/game/src/render/` con un `*Renderer` stateless que recibe la lista del system y un `Phaser.GameObjects.Graphics`.
4. Wirear en `ArenaScene`:
   - Crear el system y un `*Graphics` layer en `create()`.
   - Update del system en el `update(...)` loop.
   - Render por frame.
   - Suscribir al evento del bus que dispara el spawn.
   - Añadir `system?.clear()` al `cleanup()`.

Ejemplo de referencia: `DeathFxSystem` + `DeathFxRenderer` + listener `enemy:death` en `ArenaScene.onEnemyDeath()`.

### Zona segura para juice / UI sin chocar con backend

Cuando el otro agente está en backend / multiplayer / auth, los siguientes paths son **seguros para iterar en paralelo**:

- `apps/game/src/render/**`
- `apps/game/src/scenes/ArenaScene.ts` (cuidado si está moviendo imports de `@stick/sim`)
- `apps/game/src/scenes/{MainMenuScene,GameOverScene,BootScene,PreloadScene}.ts`
- `apps/game/src/ui/{HudRoot,ShopOverlay,ShopPreview,WaveBuffCards,TutorialOverlay,JoystickOverlay}.tsx`
- `apps/game/src/systems/{DeathFxSystem,AudioSystem}.ts`
- Constantes de game-feel en `packages/sim/src/{arena,systems/hitStop,systems/CombatSystem,enemies/behaviors/rangedKite}.ts` (esos archivos están estables)

Evitar mientras backend/auth estén activos: `apps/api/**`, `packages/shared/src/api/**`, `packages/shared/src/index.ts`, `apps/game/src/platform/{api,authStore,runQueue}.ts`, `apps/game/src/ui/{MainMenuOverlay,AuthOverlay}.tsx`, `apps/game/src/app/di.ts` (si están tocando bootstrap de auth).
