import type { EventBus } from '../app/eventBus'
import { ARENA } from '../core/arena'
import type { Player } from '../entities/Player'
import { type Projectile, createProjectile } from '../entities/Projectile'

const PLAYER_HIT_RADIUS = 18 // matches Player collision radius
const PLAYER_IFRAME_SEC = 0.5
const PLAYER_HURT_FLASH_SEC = 0.18

/**
 * Owns the list of in-flight projectiles. Behaviors call `spawn()` to fire
 * one; `update(player, dt)` integrates motion, collides against the player
 * (respecting iframes), and reaps dead/out-of-bounds entries.
 */
export class ProjectileSystem {
  private readonly bus: EventBus
  private readonly projectiles: Projectile[] = []

  constructor(opts: { bus: EventBus }) {
    this.bus = opts.bus
  }

  spawn(opts: {
    type: string
    x: number
    y: number
    dirX: number
    dirY: number
    /** Speed in pixels per second. */
    speed: number
    dmg: number
    /** Seconds before automatic despawn. */
    life: number
    ownerId: string
    /** Collision radius vs the player. */
    radius: number
  }): void {
    const len = Math.hypot(opts.dirX, opts.dirY) || 1
    this.projectiles.push(
      createProjectile({
        type: opts.type,
        x: opts.x,
        y: opts.y,
        vx: (opts.dirX / len) * opts.speed,
        vy: (opts.dirY / len) * opts.speed,
        dmg: opts.dmg,
        life: opts.life,
        ownerId: opts.ownerId,
        radius: opts.radius,
      }),
    )
  }

  update(player: Player, dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt

      // Out-of-bounds or expired? Drop.
      const oob = p.x < -50 || p.y < -50 || p.x > ARENA.width + 50 || p.y > ARENA.height + 50
      if (p.life <= 0 || oob) {
        this.projectiles.splice(i, 1)
        continue
      }

      // Collide with player.
      if (player.iframes <= 0 && player.hp > 0) {
        const dx = player.x - p.x
        const dy = player.y - p.y
        const r = p.radius + PLAYER_HIT_RADIUS
        if (dx * dx + dy * dy <= r * r) {
          this.applyHit(player, p.dmg)
          this.projectiles.splice(i, 1)
        }
      }
    }
  }

  getAll(): readonly Projectile[] {
    return this.projectiles
  }

  /** Drop every projectile (e.g. on scene shutdown). */
  clear(): void {
    this.projectiles.length = 0
  }

  private applyHit(player: Player, dmg: number): void {
    player.hp = Math.max(0, player.hp - dmg)
    player.hurtFlash = PLAYER_HURT_FLASH_SEC
    player.iframes = PLAYER_IFRAME_SEC
    this.bus.emit('player:hurt', { dmg, remainingHp: player.hp, src: 'projectile' })
    this.bus.emit('player:hp:changed', { hp: player.hp, maxHp: player.maxHp })
    if (player.hp === 0) this.bus.emit('player:death', {})
  }
}
