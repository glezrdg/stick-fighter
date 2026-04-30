import type { Rng } from '@stick/sim'
import type Phaser from 'phaser'

import type { EventBus } from '../app/eventBus'
import type { RunState } from '../core/runState'
import type { Enemy } from '../entities/Enemy'
import type { Player } from '../entities/Player'

/**
 * Context handed to a Skill's `execute()`. Concrete skills receive everything
 * they may need (player, run state, bus, RNG, the active scene for tweens)
 * without reaching for globals.
 */
export interface SkillContext {
  player: Player
  /** Live enemies in the current run. Skills that hit/AOE iterate this. */
  enemies: readonly Enemy[]
  bus: EventBus
  rng: Rng
  /** Active scene — used for tweens, particles, camera shake. */
  scene: Phaser.Scene
  /** Per-run mutable state (camera shake, slowMo, tornado timer, etc). */
  runState: RunState
  /** Damage multiplier from BuffSystem (weapon + skills + run buffs). */
  dmgMul: number
}

/**
 * Passive bonuses contributed by owned passive skills. Aggregated into
 * EffectiveStats by BuffSystem (replaces legacy `dmgMult()` / `goldMult()`
 * / `maxHP()` helpers). For F2.1 we read the modifiers directly from the
 * skill registry instead of from this field — kept here for forward
 * compatibility with content-driven balance tweaks in F2.3.
 */
export interface PassiveModifiers {
  dmgMul?: number
  hpMaxAdd?: number
  goldMul?: number
  cdReduceMul?: number
  regenPerSec?: number
}

/**
 * Skill definition. A skill is either:
 *   - **active**: triggered by the player (Q/E), goes on cooldown, runs `execute()`.
 *   - **passive**: just owned; contributes to the BuffSystem and/or hooks bus events.
 */
export interface Skill {
  readonly id: string
  readonly kind: 'active' | 'passive'
  readonly name: string
  readonly desc: string
  readonly icon?: string
  /** Cost in gold to buy in the shop. 0 = free / starter. */
  readonly cost: number
  /** Premium = paid with gems instead of gold. */
  readonly premium?: boolean

  // --- active-only ---------------------------------------------------
  /** Base cooldown in seconds. Required for active skills. */
  readonly baseCooldown?: number
  /** Optional gating beyond cooldown (e.g. heal only when hp < max). */
  canExecute?(ctx: SkillContext): boolean
  /** Apply the gameplay effect. Called by SkillSystem after cooldown check. */
  execute?(ctx: SkillContext): void

  // --- passive-only --------------------------------------------------
  readonly modifiers?: PassiveModifiers
}
