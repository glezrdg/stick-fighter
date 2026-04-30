import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema'

/**
 * Colyseus state schema. With Colyseus 0.15 + @colyseus/schema 2.x the
 * legacy `experimentalDecorators` decorator emit works out of the box —
 * no Symbol.metadata polyfill needed.
 */

export class PlayerState extends Schema {
  @type('string') sessionId = ''
  @type('string') displayName = ''
  @type('uint8') slot = 0
  @type('boolean') ready = false
  @type('number') x = 0
  @type('number') y = 0
  @type('number') vx = 0
  @type('number') vy = 0
  @type('number') facingX = 1
  @type('number') facingY = 0
  @type('number') walkPhase = 0
  @type('string') attackKind = ''
  @type('number') attackTimer = 0
  @type('number') attackDuration = 0
  @type('number') attackDirX = 1
  @type('number') attackDirY = 0
  @type('uint16') hp = 100
  @type('uint16') maxHp = 100
}

export class EnemyState extends Schema {
  @type('string') id = ''
  @type('string') typeId = ''
  @type('number') x = 0
  @type('number') y = 0
  @type('number') vx = 0
  @type('number') vy = 0
  @type('number') facingX = 1
  @type('number') facingY = 0
  @type('number') walkPhase = 0
  @type('number') attackTimer = 0
  @type('number') attackDuration = 0
  @type('uint16') hp = 0
  @type('uint16') maxHp = 0
  @type('number') hurtFlash = 0
}

export class WorldState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>()
  @type([EnemyState]) enemies = new ArraySchema<EnemyState>()
  @type('string') lobbyCode = ''
  @type('string') phase: 'lobby' | 'playing' | 'gameover' = 'lobby'
  @type('uint32') seed = 0
  @type('uint16') wave = 0
  @type('uint16') waveAlive = 0
  @type('uint16') waveTotal = 0
}
