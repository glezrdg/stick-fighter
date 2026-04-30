import { register } from './registry'
import type { Skill } from './Skill'

export const CdReduce: Skill = {
  id: 'cdReduce',
  kind: 'passive',
  name: 'MENTE FRÍA',
  desc: '-25% cooldown de habilidades',
  icon: '⏱',
  cost: 600,
  modifiers: { cdReduceMul: 0.75 },
}

register(CdReduce)
