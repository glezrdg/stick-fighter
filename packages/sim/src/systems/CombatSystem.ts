import type { AttackPatterns } from '@stick/content'

import type { Player } from '../entities/Player'
import type { EventBus } from '../eventBus'
import { createRng } from '../rng'

/** Auto-aim radius for melee attacks (matches legacy line 1681). */
export const AUTO_AIM_RADIUS = 220
/** Auto-aim radius for the bow — much longer than melee. */
export const BOW_AUTO_AIM_RADIUS = 600
/** If the player doesn't attack again within this window, the combo step resets. */
export const COMBO_RESET_SEC = 1.5
/** Bow cooldown between shots (legacy 24 frames / 60 ≈ 0.4s). */
export const BOW_COOLDOWN_SEC = 0.4
/** Total bow animation duration (draw + release). */
export const BOW_DURATION_SEC = 0.3
/** Player arrow speed in px/sec (matches the spear projectile feel). */
export const ARROW_SPEED_PX_SEC = 720
/** Player arrow damage = base damage × this multiplier. */
export const ARROW_DMG_MUL = 1.0
/** Arrow projectile life in seconds. */
const ARROW_LIFE_SEC = 1.6
/** Arrow projectile collision radius. */
const ARROW_RADIUS = 8
/** Forward velocity boost applied at the start of each attack (px/frame at 60Hz).
 *  Per-kind, mirrors legacy line 1735 (kick=4.5, chop=3, spin=2, default=2.5). */
const LUNGE_BY_KIND: Record<string, number> = {
  kick: 4.5,
  chop: 3,
  spin: 2,
}
const LUNGE_DEFAULT = 2.5
/** Cone half-angle for melee hits: dot(attackDir, toEnemy) > this connects. */
export const HIT_CONE_DOT_THRESHOLD = 0.3
/** Looser cone for chop (legacy line 1740: 0.45 vs default 0.3). */
const HIT_CONE_DOT_CHOP = 0.45
/** Hurt flash duration applied to enemies on hit (seconds). */
const ENEMY_HURT_FLASH_SEC = 0.12
/** Base crit chance and multiplier (legacy lines 1767-1781). */
const BASE_CRIT_CHANCE = 0.05
const CRIT_DMG_MUL = 2.0

/** Minimum projection of an enemy used by auto-aim and hit detection. */
export interface EnemyTarget {
  x: number
  y: number
  hp: number
  hurtFlash: number
  /** Per-instance id (used in `combat:hit` / `enemy:death` events). */
  id: string
  /** Set when the enemy is killed so callers can award gold + bookkeeping. */
  goldReward?: number
}

/** Swing geometry handed to the optional onSwing callback so scenes can
 *  resolve secondary hits (obstacles, decals, audio). */
export interface SwingResolveContext {
  originX: number
  originY: number
  dirX: number
  dirY: number
  reach: number
  arcDot: number
  all: boolean
}

export interface CombatSystemOptions {
  bus: EventBus
  attackPatterns: AttackPatterns
  /** Returns the live enemies (used for both auto-aim and hit resolution). */
  getEnemies?: () => Iterable<EnemyTarget>
  /** Returns the current effective damage multiplier from BuffSystem.
   *  Defaults to 1 if not provided. */
  getDmgMul?: () => number
  /** Crit chance from BuffSystem (BASE + ojoAsesino buff). Defaults to BASE_CRIT_CHANCE. */
  getCritChance?: () => number
  /** Returns 0..1 random for crit roll. Tests inject deterministic values. */
  rngNext?: () => number
  /** Invoked when a swing is fired so callers can resolve hits against
   *  non-enemy targets (e.g. destructible obstacles). */
  onSwing?: (ctx: SwingResolveContext) => void
  /** Spawns a player arrow projectile when the bow fires. The scene wires
   *  this to its ProjectileSystem so the arrow can collide with enemies. */
  onShoot?: (opts: {
    x: number
    y: number
    dirX: number
    dirY: number
    speed: number
    dmg: number
    life: number
    radius: number
  }) => void
}

/**
 * Combo state machine + attack initiation. Replaces the legacy `tryAttack()`
 * + `doAttack()` + the implicit step-counter.
 *
 * F1.3 wires the bus listener to `input:attack` from ArenaScene; hit
 * detection (does the swing connect?) lands in F1.4 once enemies exist.
 */
export class CombatSystem {
  private readonly bus: EventBus
  private readonly attackPatterns: AttackPatterns
  private readonly getEnemies: (() => Iterable<EnemyTarget>) | undefined
  private readonly getDmgMul: () => number
  private readonly getCritChance: () => number
  private readonly rngNext: () => number
  private readonly onSwing: ((ctx: SwingResolveContext) => void) | undefined
  private readonly onShoot: CombatSystemOptions['onShoot']

  constructor(opts: CombatSystemOptions) {
    this.bus = opts.bus
    this.attackPatterns = opts.attackPatterns
    this.getEnemies = opts.getEnemies
    this.getDmgMul = opts.getDmgMul ?? (() => 1)
    this.getCritChance = opts.getCritChance ?? (() => BASE_CRIT_CHANCE)
    // Default to a fresh seeded RNG when not injected. Production callers
    // (ArenaScene, server room) always pass a seeded RNG so the run is
    // reproducible; tests that don't care about crit randomness can let
    // this fallback run instead of wiring one up.
    if (opts.rngNext) {
      this.rngNext = opts.rngNext
    } else {
      const fallback = createRng(0)
      this.rngNext = () => fallback.next()
    }
    this.onSwing = opts.onSwing
    this.onShoot = opts.onShoot
  }

  /** Tick timers: counts the active attack down, resets the combo step on idle. */
  update(player: Player, dt: number): void {
    if (player.attackTimer > 0) {
      player.attackTimer = Math.max(0, player.attackTimer - dt)
      if (player.attackTimer === 0) {
        player.attackKind = null
      }
    }

    if (player.attackStepTimer > 0) {
      player.attackStepTimer = Math.max(0, player.attackStepTimer - dt)
      if (player.attackStepTimer === 0 && player.attackStep !== 0) {
        player.attackStep = 0
        this.bus.emit('combo:reset', {})
      }
    }

    if (player.bowCooldown > 0) {
      player.bowCooldown = Math.max(0, player.bowCooldown - dt)
    }
    if (player.bowTimer > 0) {
      player.bowTimer = Math.max(0, player.bowTimer - dt)
    }
  }

  /**
   * Begin the next attack of the combo, then resolve hits against enemies
   * in range immediately (matches the legacy: damage applies at attack
   * start, animation plays after).
   *
   * No-op if the player is already mid-swing.
   */
  tryAttack(player: Player): void {
    if (player.attackTimer > 0) return

    const pattern = this.attackPatterns[player.attackStep]
    if (!pattern) return // defensive — attackStep should always be 0..5

    const aim = this.computeAimDirection(player)
    const durSec = pattern.durFrames / 60
    player.attackKind = pattern.kind
    player.attackTimer = durSec
    player.attackDuration = durSec
    player.attackDirX = aim.x
    player.attackDirY = aim.y
    player.facingX = aim.x
    player.facingY = aim.y

    // Lunge in the attack direction (per-kind: kick=4.5, chop=3, spin=2, default=2.5).
    const lunge = LUNGE_BY_KIND[pattern.kind] ?? LUNGE_DEFAULT
    player.vx += aim.x * lunge
    player.vy += aim.y * lunge

    const wasFinalStep = player.attackStep === this.attackPatterns.length - 1
    player.attackStep = (player.attackStep + 1) % this.attackPatterns.length
    player.attackStepTimer = COMBO_RESET_SEC

    this.bus.emit('combo:advance', { count: player.attackStep })
    if (wasFinalStep) {
      this.bus.emit('combo:finisher', { kind: pattern.kind })
    }

    this.onSwing?.({
      originX: player.x,
      originY: player.y,
      dirX: aim.x,
      dirY: aim.y,
      reach: pattern.reach,
      arcDot: HIT_CONE_DOT_THRESHOLD,
      all: pattern.all === true,
    })

    // ---- Resolve hits ----
    const enemies = this.getEnemies?.()
    if (!enemies) return

    const baseDmg = this.getDmgMul() * pattern.dmgMul
    const critChance = this.getCritChance()
    const arcDot = pattern.kind === 'chop' ? HIT_CONE_DOT_CHOP : HIT_CONE_DOT_THRESHOLD
    for (const e of enemies) {
      if (e.hp <= 0) continue
      const dx = e.x - player.x
      const dy = e.y - player.y
      const dist = Math.hypot(dx, dy)
      if (dist > pattern.reach) continue
      // `all` patterns (spin) hit every enemy in reach regardless of facing.
      if (!pattern.all) {
        const inv = dist > 0 ? 1 / dist : 0
        const dot = dx * inv * aim.x + dy * inv * aim.y
        if (dot < arcDot) continue
      }
      const crit = this.rngNext() < critChance
      const dmg = crit ? baseDmg * CRIT_DMG_MUL : baseDmg
      const wasDead = e.hp <= 0
      e.hp -= dmg
      e.hurtFlash = ENEMY_HURT_FLASH_SEC
      this.bus.emit('combat:hit', {
        attackerId: 'player',
        targetId: e.id,
        dmg,
        crit,
      })
      if (!wasDead && e.hp <= 0) {
        this.bus.emit('enemy:death', { enemyId: e.id, byPlayer: true })
      }
    }
  }

  /**
   * Fire an arrow if the bow is off cooldown. Auto-aim picks the closest
   * enemy within `BOW_AUTO_AIM_RADIUS`; if no target, fires forward.
   * The actual projectile spawn is delegated to the scene via `onShoot`
   * so this module stays Phaser-free.
   */
  tryShoot(player: Player): boolean {
    if (player.bowCooldown > 0) return false
    if (player.attackTimer > 0) return false // can't shoot while mid-melee

    const aim = this.computeAimDirection(player, BOW_AUTO_AIM_RADIUS)
    player.facingX = aim.x
    player.facingY = aim.y
    player.bowDirX = aim.x
    player.bowDirY = aim.y
    player.bowCooldown = BOW_COOLDOWN_SEC
    player.bowTimer = BOW_DURATION_SEC
    player.bowDuration = BOW_DURATION_SEC

    const dmg = this.getDmgMul() * ARROW_DMG_MUL
    this.onShoot?.({
      x: player.x,
      y: player.y - 30, // shoulder height (matches enemy projectile spawn)
      dirX: aim.x,
      dirY: aim.y,
      speed: ARROW_SPEED_PX_SEC,
      dmg,
      life: ARROW_LIFE_SEC,
      radius: ARROW_RADIUS,
    })
    return true
  }

  private computeAimDirection(player: Player, radius = AUTO_AIM_RADIUS): { x: number; y: number } {
    const enemies = this.getEnemies?.()
    if (!enemies) return { x: player.facingX, y: player.facingY }

    let best: EnemyTarget | undefined
    let bestDistSq = radius * radius
    for (const e of enemies) {
      if (e.hp <= 0) continue
      const dx = e.x - player.x
      const dy = e.y - player.y
      const d2 = dx * dx + dy * dy
      if (d2 < bestDistSq) {
        bestDistSq = d2
        best = e
      }
    }
    if (!best) return { x: player.facingX, y: player.facingY }

    const dx = best.x - player.x
    const dy = best.y - player.y
    const d = Math.hypot(dx, dy) || 1
    return { x: dx / d, y: dy / d }
  }
}
