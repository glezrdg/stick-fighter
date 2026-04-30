import { ArraySchema, MapSchema, Schema, defineTypes } from '@colyseus/schema'

/**
 * Colyseus state schema — the source of truth that the server authors and
 * the client mirrors via diffs.
 *
 * We use the imperative `defineTypes` API rather than decorators because
 * @colyseus/schema 3.x's decorator runtime depends on stage-3 decorator
 * metadata (Symbol.metadata) which conflicts with TypeScript's legacy
 * `experimentalDecorators` emit. defineTypes registers the field types
 * directly on the class without relying on decorator metadata.
 */

export class PlayerState extends Schema {
  sessionId = ''
  displayName = ''
  slot = 0
  ready = false
  x = 0
  y = 0
  vx = 0
  vy = 0
  facingX = 1
  facingY = 0
  walkPhase = 0
  attackKind = ''
  attackTimer = 0
  attackDuration = 0
  attackDirX = 1
  attackDirY = 0
  hp = 100
  maxHp = 100
}

defineTypes(PlayerState, {
  sessionId: 'string',
  displayName: 'string',
  slot: 'uint8',
  ready: 'boolean',
  x: 'float32',
  y: 'float32',
  vx: 'float32',
  vy: 'float32',
  facingX: 'float32',
  facingY: 'float32',
  walkPhase: 'float32',
  attackKind: 'string',
  attackTimer: 'float32',
  attackDuration: 'float32',
  attackDirX: 'float32',
  attackDirY: 'float32',
  hp: 'uint16',
  maxHp: 'uint16',
})

export class EnemyState extends Schema {
  id = ''
  typeId = ''
  x = 0
  y = 0
  vx = 0
  vy = 0
  facingX = 1
  facingY = 0
  walkPhase = 0
  attackTimer = 0
  attackDuration = 0
  hp = 0
  maxHp = 0
  hurtFlash = 0
}

defineTypes(EnemyState, {
  id: 'string',
  typeId: 'string',
  x: 'float32',
  y: 'float32',
  vx: 'float32',
  vy: 'float32',
  facingX: 'float32',
  facingY: 'float32',
  walkPhase: 'float32',
  attackTimer: 'float32',
  attackDuration: 'float32',
  hp: 'uint16',
  maxHp: 'uint16',
  hurtFlash: 'float32',
})

export class WorldState extends Schema {
  players = new MapSchema<PlayerState>()
  enemies = new ArraySchema<EnemyState>()
  lobbyCode = ''
  phase: 'lobby' | 'playing' | 'gameover' = 'lobby'
  seed = 0
  wave = 0
  waveAlive = 0
  waveTotal = 0
}

defineTypes(WorldState, {
  players: { map: PlayerState },
  enemies: [EnemyState],
  lobbyCode: 'string',
  phase: 'string',
  seed: 'uint32',
  wave: 'uint16',
  waveAlive: 'uint16',
  waveTotal: 'uint16',
})
