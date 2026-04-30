/**
 * Static arena obstacle. Pure data — same convention as Enemy/Player.
 *
 * Three types (legacy line 1202):
 *   - 'column': indestructible, big radius
 *   - 'barrel': destructible, explodes in AOE on death
 *   - 'crate':  destructible, explodes in AOE on death
 */
export type ObstacleType = 'barrel' | 'crate' | 'column'

export interface Obstacle {
  id: string
  type: ObstacleType
  x: number
  y: number
  /** Collision/render radius. */
  r: number
  hp: number
  hpMax: number
  indestructible: boolean
  /** Seconds of hit-flash remaining. */
  hitFlash: number
}

let nextObstacleId = 1

export function createObstacle(opts: { type: ObstacleType; x: number; y: number }): Obstacle {
  const r = opts.type === 'column' ? 22 : opts.type === 'barrel' ? 18 : 20
  const indestructible = opts.type === 'column'
  return {
    id: `o${nextObstacleId++}`,
    type: opts.type,
    x: opts.x,
    y: opts.y,
    r,
    hp: 3,
    hpMax: 3,
    indestructible,
    hitFlash: 0,
  }
}

export function _resetObstacleIdsForTest(): void {
  nextObstacleId = 1
}
