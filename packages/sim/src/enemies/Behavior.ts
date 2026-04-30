import type { EnemyType } from '@stick/content'

import type { Enemy } from '../entities/Enemy'
import type { Player } from '../entities/Player'
import type { EventBus } from '../eventBus'
import type { Rng } from '../rng'
import type { ProjectileSystem } from '../systems/ProjectileSystem'

/** Context passed to a behavior on each tick. */
export interface BehaviorContext {
  enemy: Enemy
  type: EnemyType
  player: Player
  bus: EventBus
  rng: Rng
  /** Seconds since the previous tick. */
  dt: number
  /** Used by ranged behaviors to fire projectiles. */
  projectiles: ProjectileSystem
}

/**
 * Behaviors are pure functions that mutate an enemy each tick. Multiple
 * behaviors can compose (e.g. `["meleeChase", "phaseTransition"]`). They
 * run in array order; later ones see the changes of earlier ones.
 */
export type Behavior = (ctx: BehaviorContext) => void
