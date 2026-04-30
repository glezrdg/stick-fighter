import { register } from './registry'
import type { Skill } from './Skill'

/** Effect is implemented in BuffSystem (`+30 maxHp` when owned).
 *  This file is the registry entry / shop metadata. */
export const Shield: Skill = {
  id: 'shield',
  kind: 'passive',
  name: 'PIEL DE ACERO',
  desc: '+30 vida máxima',
  icon: '🛡',
  cost: 250,
  modifiers: { hpMaxAdd: 30 },
}

register(Shield)
