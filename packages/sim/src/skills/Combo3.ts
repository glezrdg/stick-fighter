import { register } from './registry'
import type { Skill } from './Skill'

/** F2.2 wires combo3 into CombatSystem (legacy attackQueue +2 hits). For F2.1
 *  it just registers as a buyable passive — no gameplay effect yet. */
export const Combo3: Skill = {
  id: 'combo3',
  kind: 'passive',
  name: 'COMBO TRIPLE',
  desc: 'Cada golpe dispara 2 hits extra rápidos',
  icon: '✊',
  cost: 300,
}

register(Combo3)
