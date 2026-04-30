import type { EnemyType } from '@stick/content'
import type { Rng } from '@stick/sim'

import type { EventBus } from '../app/eventBus'
import type { Enemy } from '../entities/Enemy'
import type { Player } from '../entities/Player'

/** Context passed to a behavior on each tick. */
export interface BehaviorContext {
  enemy: Enemy
  type: EnemyType
  player: Player
  bus: EventBus
  rng: Rng
  /** Seconds since the previous tick. */
  dt: number
}

/**
 * Behaviors are pure functions that mutate an enemy each tick. Multiple
 * behaviors can compose (e.g. `["meleeChase", "phaseTransition"]`). They
 * run in array order; later ones see the changes of earlier ones.
 */
export type Behavior = (ctx: BehaviorContext) => void
