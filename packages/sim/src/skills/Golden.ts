import { register } from './registry'
import type { Skill } from './Skill'

export const Golden: Skill = {
  id: 'golden',
  kind: 'passive',
  name: 'TOQUE DE ORO',
  desc: '+50% oro ganado',
  icon: '🪙',
  cost: 400,
  modifiers: { goldMul: 1.5 },
}

register(Golden)
