/**
 * Colyseus state schema for StickFightRoom.
 *
 * Pinned to `@colyseus/schema@2.0.36` (legacy decorators path). The 3.x line
 * relies on `Symbol.metadata` which Node 22 doesn't expose natively — that
 * bug ate ~3 hours during the first F5 attempt. Stay on 2.x; if you need
 * to upgrade, write a smoke test for `broadcastPatch` first.
 *
 * The schema is the **wire-snapshot** of the world — only what the client
 * needs to render. The authoritative state of truth lives in the room's
 * own sim entities (Player, Enemy from @stick/sim) and gets mirrored here
 * each tick. Keep fields flat and primitive — no nested @type schemas
 * unless absolutely necessary, to minimize codec surface area.
 */
import { ArraySchema, MapSchema, Schema, type } from '@colyseus/schema'

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
