import type { Rng } from '@stick/sim'
import type Phaser from 'phaser'

import type { EventBus } from '../app/eventBus'
import type { RunState } from '../core/runState'

/**
 * Context handed to a Skill's `execute()`. Concrete skills receive everything
 * they may need (run state, bus, RNG, the active scene for tweens) without
 * reaching for globals.
 */
export interface SkillContext {
  runState: RunState
  bus: EventBus
  rng: Rng
  /** Active scene — used for tweens, particles, camera shake. */
  scene: Phaser.Scene
}

/**
 * Passive bonuses contributed by owned passive skills. The BuffSystem
 * collects modifiers from every owned passive and exposes the combined
 * value (replaces the legacy `dmgMult()` / `goldMult()` / `maxHP()` helpers).
 *
 * Multipliers are *cumulative* (multiplied together). Adders are summed.
 */
export interface PassiveModifiers {
  /** e.g. 1.10 = +10% damage. Default 1. */
  dmgMul?: number
  /** Flat HP added on top of base maxHP. Default 0. */
  hpMaxAdd?: number
  /** e.g. 1.5 = +50% gold. Default 1. */
  goldMul?: number
  /** e.g. 0.75 = 25% cooldown reduction. Default 1. */
  cdReduceMul?: number
  /** Flat HP/sec regen. Default 0. */
  regenPerSec?: number
}

/**
 * Skill definition. A skill is either:
 *   - **active**: triggered by the player (Q/E), goes on cooldown, runs `execute()`.
 *   - **passive**: just owned; contributes `modifiers` to the BuffSystem.
 *
 * Each skill lives in its own file under `skills/`. The file imports the
 * shared `register()` from the registry as a side-effect to make itself
 * available — see `skills/Dash.ts` for the pattern.
 */
export interface Skill {
  readonly id: string
  readonly kind: 'active' | 'passive'
  readonly name: string
  readonly desc: string
  /** Single-character / emoji icon for HUD. */
  readonly icon?: string

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
