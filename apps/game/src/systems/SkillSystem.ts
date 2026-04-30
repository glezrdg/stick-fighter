import type { EventBus } from '../app/eventBus'
import type { RunState } from '../core/runState'
import * as skillRegistry from '../skills'
import type { SkillContext } from '../skills/Skill'

/**
 * Owns the cooldown counters for the two equipped active skills (slot 0 and
 * slot 1) and dispatches `cast()` to the right `Skill.execute()` via the
 * registry. Replaces the legacy 47-line if/else of `useSkill()`.
 *
 * Cooldowns are stored in seconds (consistent with the rest of the codebase).
 * Cooldown reduction from the `cdReduce` passive is applied at cast time via
 * `cdMul` from BuffSystem.
 */
export class SkillSystem {
  private readonly bus: EventBus
  /** Per-slot cooldown remaining, in seconds. */
  private readonly cooldowns: [number, number] = [0, 0]
  /** Per-slot total cooldown of the most recent cast (for HUD progress bars). */
  private readonly cooldownTotal: [number, number] = [1, 1]

  constructor(opts: { bus: EventBus }) {
    this.bus = opts.bus
  }

  update(_runState: RunState, dt: number): void {
    for (let i = 0; i < 2; i++) {
      if (this.cooldowns[i]! > 0) {
        this.cooldowns[i] = Math.max(0, this.cooldowns[i]! - dt)
        this.bus.emit('skill:cooldown:changed', {
          slot: i as 0 | 1,
          remaining: this.cooldowns[i]!,
          total: this.cooldownTotal[i]!,
        })
      }
    }
  }

  /**
   * Try to cast the skill equipped in `slot`. Returns true on success.
   * Emits `skill:cast` and `skill:cooldown:changed` on the bus.
   */
  cast(opts: {
    slot: 0 | 1
    skillId: string | undefined
    cdMul: number
    ctx: SkillContext
  }): boolean {
    const { slot, skillId, cdMul, ctx } = opts
    if (!skillId) return false
    if (this.cooldowns[slot]! > 0) return false
    if (ctx.runState.paused) return false

    const skill = skillRegistry.tryGet(skillId)
    if (!skill || skill.kind !== 'active') return false
    if (skill.canExecute && !skill.canExecute(ctx)) return false

    skill.execute?.(ctx)

    const baseCd = skill.baseCooldown ?? 0
    const effectiveCd = baseCd * cdMul
    this.cooldowns[slot] = effectiveCd
    this.cooldownTotal[slot] = effectiveCd

    this.bus.emit('skill:cast', { skillId: skill.id, slot })
    this.bus.emit('skill:cooldown:changed', {
      slot,
      remaining: effectiveCd,
      total: effectiveCd,
    })
    return true
  }

  /** Read-only view of the current cooldown for HUD/debug. */
  getCooldown(slot: 0 | 1): number {
    return this.cooldowns[slot]!
  }

  /** Read-only view of the cooldown's total length (for progress bars). */
  getCooldownTotal(slot: 0 | 1): number {
    return this.cooldownTotal[slot]!
  }
}
