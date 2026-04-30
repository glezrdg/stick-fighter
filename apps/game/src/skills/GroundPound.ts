import { register } from './registry'
import type { Skill } from './Skill'

const GROUND_POUND_RADIUS = 240
const GROUND_POUND_DMG_MUL = 3

export const GroundPound: Skill = {
  id: 'groundPound',
  kind: 'active',
  name: 'GOLPE SÍSMICO',
  desc: 'Daño en área enorme + stun',
  icon: '👊',
  cost: 700,
  baseCooldown: 15, // legacy 900 frames / 60
  execute(ctx) {
    const { player, enemies, bus, dmgMul: baseDmgMul, runState } = ctx
    for (const e of enemies) {
      if (e.hp <= 0) continue
      const dx = e.x - player.x
      const dy = e.y - player.y
      const dist = Math.hypot(dx, dy)
      if (dist > GROUND_POUND_RADIUS) continue
      const damage = baseDmgMul * GROUND_POUND_DMG_MUL
      const wasAlive = e.hp > 0
      e.hp -= damage
      e.hurtFlash = 0.18
      // Stun-by-cooldown: pushes the enemy's attack cooldown out so it can't swing for a beat.
      e.attackCooldown = Math.max(e.attackCooldown, 1.0)
      bus.emit('combat:hit', { attackerId: 'player', targetId: e.id, dmg: damage, crit: false })
      if (wasAlive && e.hp <= 0) {
        bus.emit('enemy:death', { enemyId: e.id, byPlayer: true })
      }
    }
    runState.cameraShake = 0.43 // 26/60
    runState.slowMo = 0.4
  },
}

register(GroundPound)
