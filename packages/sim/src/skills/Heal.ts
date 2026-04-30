import { register } from './registry'
import type { Skill } from './Skill'

const HEAL_FRACTION = 0.5

export const Heal: Skill = {
  id: 'heal',
  kind: 'active',
  name: 'CURACIÓN',
  desc: 'Recupera 50% de tu vida',
  icon: '✨',
  cost: 400,
  baseCooldown: 25, // legacy 1500 / 60
  canExecute(ctx) {
    return ctx.player.hp < ctx.player.maxHp
  },
  execute(ctx) {
    const heal = Math.floor(ctx.player.maxHp * HEAL_FRACTION)
    ctx.player.hp = Math.min(ctx.player.maxHp, ctx.player.hp + heal)
    ctx.bus.emit('player:hp:changed', { hp: ctx.player.hp, maxHp: ctx.player.maxHp })
  },
}

register(Heal)
