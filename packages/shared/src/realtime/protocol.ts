/**
 * Realtime WebSocket protocol — plain JSON over WS@8.
 *
 * Pivoted away from Colyseus after two F5 attempts hit codec bugs (Symbol.metadata
 * in 0.16/schema 3, then `bytes is not iterable` in 0.15/schema 2). With raw WS +
 * JSON the wire is human-readable in DevTools (Network → WS → Frames), every
 * message is a discrete object the type-checker can reason about, and there's
 * zero binary-encoder magic to debug.
 *
 * Design rules:
 *   - Discriminated union by `t` (one-letter `type`) on every message.
 *   - Server is authoritative for state; client only sends inputs/intents.
 *   - State broadcast is full snapshot (every tick, ~30 Hz). 2P co-op + ~20
 *     enemies = ~3-5 KB/tick = ~150 KB/s/client. Acceptable. Delta-encoding
 *     can come later if it ever matters.
 *   - No Zod at the hot-path: parsing 30 messages/sec/client through Zod is
 *     wasteful. We parse with `JSON.parse` and trust the type, then validate
 *     **only the joining handshake** (`hostReq` / `joinReq`) where it's worth.
 */

import { z } from 'zod'

// ============================================================================
// Client → Server
// ============================================================================

/**
 * What each player wants to look like in the room. The client reads its own
 * `save.cosmetics` + equipped weapon and ships them at handshake. The server
 * doesn't validate against the catalog (yet) — if a client lies, the
 * renderer's `getSkin`/`getWeapon` will throw and the client falls back to
 * defaults. This is co-op among friends, not a competitive ladder.
 */
export const NetCosmeticsSchema = z.object({
  /** Skin id from `@stick/content/skins.json`. */
  skin: z.string().min(1).max(40),
  /** Weapon id from `@stick/content/weapons.json`. */
  weapon: z.string().min(1).max(40),
  /** Weapon level (cosmetic-only on the wire; server derives stats locally). */
  weaponLevel: z.number().int().min(1).max(20),
  /** Aura id (player's outline/glow color). */
  aura: z.string().min(1).max(40),
})
export type NetCosmetics = z.infer<typeof NetCosmeticsSchema>

/**
 * Loadout efectivo para el run en multi. El server lo usa con
 * `BuffSystem.computeStats()` para derivar daño efectivo, HP máx, gold mul,
 * cooldown reducido — exactamente la misma fórmula que SP. Sin esto el
 * server ignora weapon damage, golden passive, shield, cdReduce.
 *
 * Validación es laxa (string ids con cap 40, length cap 16) — si el cliente
 * miente con un id inexistente, `getWeapon`/skill registry tira y el server
 * cae al default. Co-op entre amigos, no ladder competitivo.
 */
export const NetLoadoutSchema = z.object({
  /** Pasivas + activas que el jugador "posee" (compradas). */
  ownedSkills: z.array(z.string().min(1).max(40)).max(16),
  /** Las dos skills equipadas en Q/E. null = slot vacío. */
  equippedSkills: z.tuple([
    z.string().min(1).max(40).nullable(),
    z.string().min(1).max(40).nullable(),
  ]),
  /** Arma que el jugador eligió. */
  weaponId: z.string().min(1).max(40),
  /** Nivel del arma (multiplica daño base via BuffSystem). */
  weaponLevel: z.number().int().min(1).max(20),
})
export type NetLoadout = z.infer<typeof NetLoadoutSchema>

/** Versión del protocolo netcode soportada por el cliente. El server detecta
 *  el min común a todos los clientes en sala y emite acorde, permitiendo que
 *  un cliente viejo + uno nuevo coexistan durante un deploy parcial.
 *
 *    1 = legacy (StateMsg full, todos los campos cada tick)
 *    2 = static/dynamic split (Spawn/Despawn msgs + StateMsg solo dinámicos)
 *
 * Más versiones se agregarán en Fases 2-4 (delta encoding, binary, interp). */
export const NetcodeVersionSchema = z.number().int().min(1).max(99)

/** Open a brand-new room. Server picks a fresh 4-letter lobby code. */
export const HostReqSchema = z.object({
  t: z.literal('host'),
  /** Display name for the leaderboard / HUD. 1..20 chars. */
  name: z.string().trim().min(1).max(20),
  /** Optional JWT from `/auth/login`. If valid, room caches `userId`. */
  accessToken: z.string().optional(),
  /** What this player wants to look like. Falls back to defaults if absent. */
  cosmetics: NetCosmeticsSchema.optional(),
  /** Skills owned + equipped + weapon level. Sin esto el server usa defaults
   *  (sin skills, weapon level 1) y el daño se siente igual al de un fresh save. */
  loadout: NetLoadoutSchema.optional(),
  /** Versión netcode soportada. Default 1 si ausente (cliente viejo). */
  netcodeVersion: NetcodeVersionSchema.optional(),
})
export type HostReq = z.infer<typeof HostReqSchema>

/** Join an existing room by 4-letter code. */
export const JoinReqSchema = z.object({
  t: z.literal('join'),
  code: z.string().regex(/^[A-Z2-9]{4}$/, '4-letter code'),
  name: z.string().trim().min(1).max(20),
  accessToken: z.string().optional(),
  cosmetics: NetCosmeticsSchema.optional(),
  loadout: NetLoadoutSchema.optional(),
  netcodeVersion: NetcodeVersionSchema.optional(),
})
export type JoinReq = z.infer<typeof JoinReqSchema>

/** Flip "ready". When all players in the room are ready, server starts the run. */
export interface ReadyReq {
  t: 'ready'
}

/**
 * Per-tick input. Continuous fields (movement vector + pressed flags). The
 * server samples the latest received input each tick — extra emissions get
 * coalesced, missing ones get re-applied. Cliente debe emitir cada cambio.
 */
export interface InputReq {
  t: 'input'
  /** Movement x in [-1, 1]. */
  dx: number
  /** Movement y in [-1, 1]. */
  dy: number
  /** Edge flag: client sets true ONCE the frame the user pressed attack.
   *  Server consumes it (one-shot — does NOT re-fire on subsequent tick). */
  attack?: boolean
  shoot?: boolean
  /** Skill slot to cast (0 or 1), one-shot. */
  skill?: 0 | 1
}

/** Voluntary disconnect — frees the slot immediately, no reconnect grace. */
export interface LeaveReq {
  t: 'leave'
}

/** Cliente vota una de las cartas de la oferta entre-waves. Server resuelve
 *  cuando ambos votan o cuando el timeout de 30s expira. */
export interface WaveBuffVoteReq {
  t: 'wave-buff:vote'
  buffId: string
}

/** Cliente pide reiniciar el run desde la pantalla de gameover, manteniendo
 *  la sala viva con los mismos players. Server requiere consenso de todos
 *  los activos: cuando el último activo lo pide, se resetea wave/HP/buffs/
 *  cosmetics y la sala vuelve a phase='lobby'. Si un peer hace `leave`
 *  en gameover, el restante puede pedir restart unilateralmente.
 *  Idempotente: pedirlo dos veces del mismo cliente cuenta una sola. */
export interface RestartReq {
  t: 'restart'
}

/** Reconexión a una sala existente preservando el slot. El server mantiene
 *  un grace window de ~60s tras un disconnect; durante ese período el slot
 *  queda "zombie" y un nuevo socket puede reclamarlo enviando este mensaje
 *  con el `sessionId` original. Útil para mobile Safari que mata WS al
 *  backgroundear ~30s.
 */
export const RejoinReqSchema = z.object({
  t: z.literal('rejoin'),
  code: z.string().regex(/^[A-Z2-9]{4}$/, '4-letter code'),
  sessionId: z.string().min(1).max(64),
  accessToken: z.string().optional(),
  netcodeVersion: NetcodeVersionSchema.optional(),
})
export type RejoinReq = z.infer<typeof RejoinReqSchema>

export type ClientMsg =
  | HostReq
  | JoinReq
  | RejoinReq
  | ReadyReq
  | InputReq
  | LeaveReq
  | WaveBuffVoteReq
  | RestartReq

// ============================================================================
// Server → Client
// ============================================================================

/** Sent right after host/join succeeds. Identifies the client's slot + code. */
export interface LobbyMsg {
  t: 'lobby'
  /** 4-letter code the host (and friends) can see/share. */
  code: string
  /** Server-assigned id for this connection. Stable for the room's lifetime. */
  sessionId: string
  /** 0 = host, 1 = friend. */
  slot: 0 | 1
  /** Snapshot of all players in the lobby right now (incl. self). */
  players: ReadonlyArray<{ sessionId: string; name: string; slot: 0 | 1; ready: boolean }>
}

/** Phase changed (lobby → playing → gameover). */
export interface PhaseMsg {
  t: 'phase'
  phase: 'lobby' | 'playing' | 'gameover'
  /** When entering 'playing', the server sends the deterministic seed so
   *  clients can reproduce non-essential RNG-driven cosmetics if they want.
   *  When 'gameover', se reenvía el seed original para que cada cliente
   *  pueda mandarlo en el RunReport (anti-cheat: server lo correlaciona). */
  seed: number | null
  /** Final stats cuando phase=gameover. Cada cliente arma su RunReport y
   *  lo submitea al api de leaderboard via `POST /runs`. Co-op shared:
   *  wave/kills/gold son los del run completo (no per-cliente). */
  summary?: {
    wave: number
    kills: number
    gold: number
    durationSec: number
  }
}

/** Full state snapshot. Sent every server tick (~30 Hz) while phase='playing'.
 *  Only carries renderable fields — anything not on this struct is owned
 *  exclusively by the server (combat resolution, damage, etc.).
 *
 *  En netcode v1, `enemies`/`obstacles` llevan TODOS los campos. En v2 (con
 *  static/dynamic split), llevan solo dinámicos vía `enemiesDynamic` y
 *  `obstaclesDynamic`. Server elige el shape según min netcodeVersion en
 *  sala. Cliente acepta ambos: si `enemiesDynamic` está presente, lo merge
 *  contra el cache local de spawns; si `enemies` está presente, usa ese full. */
export interface StateMsg {
  t: 'state'
  /** Server tick number (monotonic, for client-side smoothing/interp). */
  tick: number
  players: ReadonlyArray<NetPlayer>
  /** v1: full enemies con typeId/maxHp/attackDuration. */
  enemies?: ReadonlyArray<NetEnemy>
  /** v2+: solo dinámicos. typeId/maxHp viven en EnemySpawnMsg cacheado. */
  enemiesDynamic?: ReadonlyArray<NetEnemyDynamic>
  /** v1: full obstacles con type/r/hpMax. */
  obstacles?: ReadonlyArray<NetObstacle>
  /** v2+: solo hp/hitFlash. type/r/hpMax viven en ObstacleSpawnMsg. */
  obstaclesDynamic?: ReadonlyArray<NetObstacleDynamic>
  /** Projectiles en vuelo (flechas del player + orbs/fireballs enemigos).
   *  Optional para retrocompat. */
  projectiles?: ReadonlyArray<NetProjectile>
  wave: number
  alive: number
  total: number
  gold: number
}

export interface NetObstacle {
  id: string
  type: 'barrel' | 'crate' | 'column'
  x: number
  y: number
  r: number
  hp: number
  hpMax: number
  hitFlash: number
}

export interface NetPlayer {
  sessionId: string
  name: string
  slot: 0 | 1
  x: number
  y: number
  vx: number
  vy: number
  facingX: number
  facingY: number
  walkPhase: number
  attackKind: string
  attackTimer: number
  attackDuration: number
  attackDirX: number
  attackDirY: number
  /** Bow draw/release timer (sim Player.bowTimer). Sin esto el StickmanRenderer
   *  nunca dibuja la pose del arco — el cliente veía la flecha volando pero
   *  al jugador en idle, sin arma. */
  bowTimer?: number
  bowDuration?: number
  bowDirX?: number
  bowDirY?: number
  hp: number
  maxHp: number
  /** What the client wants to look like — set at handshake, retransmitted by
   *  the server every tick. Optional so old clients still render (default). */
  cosmetics?: NetCosmetics
  /** Left4Dead-style downed state: the player is incapacitated, can't take
   *  input, and stays at hp=0 until revived by the peer. */
  downed?: boolean
  /** When `downed`, fraction (0..1) of the revival counter — 1.0 means the
   *  peer has matado the configured number of enemies and the next tick
   *  will revive this player at 50% HP. */
  revivalProgress?: number
  /** Effective stats derived from this player's run buffs. The client
   *  diffs the local self's stats and emits `stats:changed` on the local
   *  bus so the HUD chips (DMG/VEL/CRT/REG/KB/ORO) reaccionan vivos.
   *  Optional para retrocompat con servers/cliente más viejos. */
  stats?: NetPlayerStats
  /** IDs de las dos skills equipadas (Q/E). null = slot vacío. El cliente
   *  emite `skills:equipped` al bus local apenas el slot 0 cambia para
   *  que los chips muestren el icono correcto. */
  skillSlots?: [string | null, string | null]
  /** Cooldown actual de cada slot. Para que el chip muestre progreso radial. */
  skillCooldowns?: [NetSkillCooldown, NetSkillCooldown]
}

/** Subset de `EffectiveStats` que el server computa per-cliente para que
 *  el HUD pueda pintar los chips en multi. No incluye `maxHp` ni `cdMul`
 *  porque ya están en otros campos del player o no se usan en multi. */
export interface NetPlayerStats {
  dmgMul: number
  atkSpeedMul: number
  critChance: number
  regenPerSec: number
  knockbackMul: number
  goldMul: number
}

/** Cooldown remaining + total per skill slot. El cliente lo lee y emite
 *  `skill:cooldown:changed` al bus local para que los chips Q/E muestren
 *  el progreso radial igual que en SP. */
export interface NetSkillCooldown {
  remaining: number
  total: number
}

export interface NetProjectile {
  id: string
  /** 'orb' | 'arrow' | 'fireball'. El cliente mapea esto a un render distinto. */
  type: string
  x: number
  y: number
  vx: number
  vy: number
  /** 'player' = arrow del jugador (color claro, dmg friendly).
   *  Cualquier otra cosa = projectile enemy (color rojo, hostil). */
  ownerId: string
}

export interface NetEnemy {
  id: string
  typeId: string
  x: number
  y: number
  vx: number
  vy: number
  facingX: number
  facingY: number
  walkPhase: number
  /** Mismo discriminator que `Player.attackKind` (chop/spin/kick/poke/...).
   *  Empty string = no atacando. El cliente lo mapea a la animación
   *  correcta del StickmanRenderer en lugar de hardcoded 'chop'. */
  attackKind?: string
  attackTimer: number
  attackDuration: number
  /** Dirección frozen del swing (sim Enemy.attackDirX/Y). Sin esto el
   *  StickmanRenderer cae a `facingX/Y` que cambia mid-swing — el smear
   *  se ve raro porque el brazo gira con el cuerpo. */
  attackDirX?: number
  attackDirY?: number
  hp: number
  maxHp: number
  hurtFlash: number
}

/** Mensaje "spawn" de un enemy — se manda UNA VEZ al aparecer. Lleva los
 *  campos inmutables (typeId, maxHp) que en netcode v1 viajaban en cada
 *  StateMsg. Cliente cachea esto y reconstruye el enemy completo en cada
 *  tick mergeando con el `NetEnemyDynamic` del state. */
export interface EnemySpawnMsg {
  t: 'spawn:enemy'
  id: string
  typeId: string
  maxHp: number
  /** Posición inicial — el primer tick ya lo va a updatear pero el cliente
   *  necesita algún valor para no flickear el render entre el spawn y el
   *  primer state msg. */
  x: number
  y: number
}

/** Mensaje "despawn" — el server confirma que un enemy ya no existe.
 *  Cliente quita del cache. Sin esto, después de que un enemy muere el
 *  cliente lo seguiría renderizando con el último state cacheado. */
export interface EnemyDespawnMsg {
  t: 'despawn:enemy'
  id: string
}

/** Mismo patrón para obstacles. Se mandan al inicio del run (cuando
 *  ObstacleSystem.generate los crea) y se despawnean cuando se rompen. */
export interface ObstacleSpawnMsg {
  t: 'spawn:obstacle'
  id: string
  type: 'barrel' | 'crate' | 'column'
  x: number
  y: number
  r: number
  hpMax: number
}

export interface ObstacleDespawnMsg {
  t: 'despawn:obstacle'
  id: string
}

/** Versión "dinámica" del NetEnemy que viaja en cada tick desde netcode v2.
 *  Excluye campos inmutables (`typeId`, `maxHp`, `attackDuration`) que el
 *  cliente ya tiene del `EnemySpawnMsg`. Reduce ~50% el tamaño por enemy
 *  vs `NetEnemy` v1. */
export interface NetEnemyDynamic {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  facingX: number
  facingY: number
  walkPhase: number
  attackKind?: string
  attackTimer: number
  attackDirX?: number
  attackDirY?: number
  hp: number
  hurtFlash: number
}

/** Versión "dinámica" del NetObstacle. Excluye `type`, `r`, `hpMax` (todo
 *  inmutable). Solo viaja `hp` y `hitFlash` que cambian con damage. */
export interface NetObstacleDynamic {
  id: string
  hp: number
  hitFlash: number
}

/** A peer left (drop-out, network failure). The other player keeps going solo. */
export interface PeerLeftMsg {
  t: 'peer-left'
  sessionId: string
  reason: 'consented' | 'timeout' | 'kicked'
}

/** Server rejected a request. `code` is machine-readable, `msg` human-readable. */
export interface ErrorMsg {
  t: 'error'
  code:
    | 'invalid-code'
    | 'lobby-full'
    | 'lobby-locked'
    | 'invalid-message'
    | 'auth-failed'
    | 'internal'
    | 'rejoin-failed'
  msg: string
}

/** Server-side ping — the client echoes it back. Used to measure RTT and
 *  also keeps mobile-Safari WS connections alive past the ~30s background timer. */
export interface PingMsg {
  t: 'ping'
  /** Server-issued nonce. Client must echo it verbatim in `pong`. */
  nonce: number
}

/** Cliente cast'eó una skill activa. Server lo retransmite a todos los
 *  peers para que el cliente local pinte particles/shockwave/aura burst en
 *  la posición del caster. Coordenadas son world-space al momento del cast. */
export interface SkillCastMsg {
  t: 'skill:cast'
  sessionId: string
  skillId: string
  x: number
  y: number
  facingX: number
  facingY: number
}

/** Wave terminada → server pausa el tick global, ofrece 3 buffs. Cada cliente
 *  elige el suyo independientemente vía `WaveBuffVoteReq`; el server aplica
 *  ese buff SOLO al picker (no compartido) y emite un `WaveBuffResolvedMsg`
 *  por cada pick. Cuando todos los activos picaron (o expira el timeout y
 *  server autopickea), llega `WaveBuffEndMsg` y se reanuda la siguiente wave. */
export interface WaveBuffOfferMsg {
  t: 'wave-buff:offer'
  wave: number
  buffIds: ReadonlyArray<string>
  /** Cuántos segundos quedan antes del autopick. UI puede mostrar countdown. */
  timeoutSec: number
}

/** Indicador en vivo de quién votó qué (mientras esperás al peer). */
export interface WaveBuffVotesMsg {
  t: 'wave-buff:votes'
  /** Map sessionId → buffId votado (o null si aún no votó). */
  votes: ReadonlyArray<{ sessionId: string; buffId: string | null }>
}

/** Server aplicó un buff a UN player específico (cada quien elige el suyo).
 *  En multi cada player recibe SU bendición, no compartida con el peer.
 *  El server emite un resolved por cada pick; cuando todos los activos
 *  picaron, se manda un `WaveBuffEndMsg` que cierra la fase en cliente. */
export interface WaveBuffResolvedMsg {
  t: 'wave-buff:resolved'
  /** A quién se le aplica este buff. */
  sessionId: string
  wave: number
  buffId: string
  /** 'picked' = jugador eligió manualmente. 'autopick' = timeout, server randomizó. */
  reason: 'picked' | 'autopick'
}

/** Server cerró la fase de wave-buff (todos picaron o llegó el timeout). El
 *  cliente debe limpiar el overlay y volver a estado `playing`. Un solo
 *  mensaje por wave, después de N `WaveBuffResolvedMsg` (uno por player). */
export interface WaveBuffEndMsg {
  t: 'wave-buff:end'
  wave: number
}

/** Estado de votos para reiniciar el run desde gameover. Server lo
 *  broadcastea cada vez que cambia (alguien voto / alguien hizo leave). El
 *  cliente lo usa para mostrar "esperando al peer (1/2)". */
export interface RestartVotesMsg {
  t: 'restart:votes'
  /** sessionId de cada player que ya pidió restart. */
  votes: ReadonlyArray<string>
  /** Total de clientes activos en la sala (ws !== null). El cliente
   *  computa "x de y" sin necesidad de lookups extra. */
  needed: number
}

export type ServerMsg =
  | LobbyMsg
  | PhaseMsg
  | StateMsg
  | PeerLeftMsg
  | ErrorMsg
  | PingMsg
  | SkillCastMsg
  | WaveBuffOfferMsg
  | WaveBuffVotesMsg
  | WaveBuffResolvedMsg
  | WaveBuffEndMsg
  | RestartVotesMsg
  | EnemySpawnMsg
  | EnemyDespawnMsg
  | ObstacleSpawnMsg
  | ObstacleDespawnMsg

// ============================================================================
// Helpers
// ============================================================================

/** Encode for the wire. Centralized so we can swap to msgpack later if needed. */
export function encodeMsg(msg: ClientMsg | ServerMsg): string {
  return JSON.stringify(msg)
}

/** Best-effort parse. Returns `null` on malformed JSON or missing `t`. The
 *  caller switches on `msg.t` and the type system narrows from there. */
export function parseMsg<T extends { t: string }>(raw: string): T | null {
  try {
    const obj = JSON.parse(raw) as unknown
    if (obj && typeof obj === 'object' && typeof (obj as { t: unknown }).t === 'string') {
      return obj as T
    }
    return null
  } catch {
    return null
  }
}
