import { register } from './registry'
import type { Skill } from './Skill'

/** HP recovered per kill while owned. ArenaScene wires this to enemy:death. */
export const VAMPIRE_HEAL_PER_KILL = 2

export const Vampire: Skill = {
  id: 'vampire',
  kind: 'passive',
  name: 'SED DE SANGRE',
  desc: 'Recupera 2 HP por kill',
  icon: '🩸',
  cost: 500,
}

register(Vampire)
