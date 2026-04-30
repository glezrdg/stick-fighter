import { register } from './registry'
import type { Skill } from './Skill'

const FINAL_FLASH_DMG_MUL = 6

export const FinalFlash: Skill = {
  id: 'finalFlash',
  kind: 'active',
  name: 'DESTELLO FINAL',
  desc: 'Onda enorme: mucho daño a todos en pantalla',
  icon: '☀️',
  cost: 25,
  premium: true,
  baseCooldown: 25, // legacy 1500 / 60
  execute(ctx) {
    const { enemies, bus, dmgMul: baseDmgMul, runState } = ctx
    for (const e of enemies) {
      if (e.hp <= 0) continue
      const damage = baseDmgMul * FINAL_FLASH_DMG_MUL
      const wasAlive = e.hp > 0
      e.hp -= damage
      e.hurtFlash = 0.25
      bus.emit('combat:hit', { attackerId: 'player', targetId: e.id, dmg: damage, crit: false })
      if (wasAlive && e.hp <= 0) {
        bus.emit('enemy:death', { enemyId: e.id, byPlayer: true })
      }
    }
    runState.cameraShake = 0.53 // 32/60
    runState.slowMo = 0.67
  },
}

register(FinalFlash)
