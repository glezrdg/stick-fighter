import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema'

/**
 * Colyseus state schema — the source of truth that the server authors and
 * the client mirrors via diffs. Only fields that the client needs to render
 * or react to live here. Per-frame intermediate state (e.g. attackStepTimer)
 * stays in the sim's RunState on the server, not in the schema.
 *
 * Skeleton for F5 phase 3a — populated with real fields as gameplay lands.
 */

/** A connected player + their authoritative pose. */
export class PlayerState extends Schema {
  @type('string') sessionId = ''
  @type('string') displayName = ''
  /** Slot index in the lobby (0 or 1). Determines spawn position + skin. */
  @type('uint8') slot = 0
  /** True once the client has confirmed it loaded the run + is ready. */
  @type('boolean') ready = false
  /** Authoritative position (sim coords). */
  @type('float32') x = 0
  @type('float32') y = 0
  @type('float32') vx = 0
  @type('float32') vy = 0
  @type('uint16') hp = 100
  @type('uint16') maxHp = 100
}

/** A single enemy as the server sees it. Trimmed to what the client renders. */
export class EnemyState extends Schema {
  @type('string') id = ''
  @type('string') typeId = ''
  @type('float32') x = 0
  @type('float32') y = 0
  @type('uint16') hp = 0
  @type('float32') hurtFlash = 0
}

export class WorldState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>()
  @type([EnemyState]) enemies = new ArraySchema<EnemyState>()

  /** Lobby code (4 letters) shown in the UI so a friend can join. */
  @type('string') lobbyCode = ''
  /** 'lobby' until both slots are ready, then 'playing', then 'gameover'. */
  @type('string') phase: 'lobby' | 'playing' | 'gameover' = 'lobby'
  /** Per-run seed broadcast to clients on phase transition so client-side
   *  prediction can match server RNG. */
  @type('uint32') seed = 0
  @type('uint16') wave = 0
  @type('uint16') waveAlive = 0
  @type('uint16') waveTotal = 0
}
