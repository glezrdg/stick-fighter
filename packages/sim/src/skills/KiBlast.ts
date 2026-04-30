import { register } from './registry'
import type { Skill, SkillContext } from './Skill'

/** Cone radius matching the legacy. */
const KI_BLAST_RADIUS = 220
/** Damage multiplier on top of player base damage. */
const KI_BLAST_DMG_MUL = 5
/** Forward cone half-angle test (dot product threshold). */
const KI_BLAST_CONE_DOT = 0.2

export const KiBlast: Skill = {
  id: 'kiBlast',
  kind: 'active',
  name: 'KI BLAST',
  desc: 'Onda en frente: golpea todo a 220px',
  icon: '💥',
  cost: 350,
  baseCooldown: 10, // legacy 600 frames / 60
  execute(ctx) {
    applyConeAoe(ctx, KI_BLAST_RADIUS, KI_BLAST_CONE_DOT, KI_BLAST_DMG_MUL)
    ctx.runState.cameraShake = 0.27 // 16 frames / 60
    ctx.runState.slowMo = 0.27
  },
}

register(KiBlast)

/** Hits enemies in a forward cone. Used by KiBlast and (in F2.2) other directional AOEs. */
function applyConeAoe(ctx: SkillContext, radius: number, coneDot: number, dmgMul: number): void {
  const { player, enemies, bus, dmgMul: baseDmgMul } = ctx
  for (const e of enemies) {
    if (e.hp <= 0) continue
    const dx = e.x - player.x
    const dy = e.y - player.y
    const dist = Math.hypot(dx, dy)
    if (dist > radius) continue
    if (dist > 0) {
      const inv = 1 / dist
      const dot = dx * inv * player.facingX + dy * inv * player.facingY
      if (dot < coneDot) continue
    }
    const damage = baseDmgMul * dmgMul
    const wasAlive = e.hp > 0
    e.hp -= damage
    e.hurtFlash = 0.18
    bus.emit('combat:hit', { attackerId: 'player', targetId: e.id, dmg: damage, crit: false })
    if (wasAlive && e.hp <= 0) {
      bus.emit('enemy:death', { enemyId: e.id, byPlayer: true })
    }
  }
}
