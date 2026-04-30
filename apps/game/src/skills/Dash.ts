import { register } from './registry'
import type { Skill } from './Skill'

/**
 * First skill ported. F1.2 just registers it; F1.3 (Player entity) plugs in
 * the actual displacement effect inside `execute()`.
 */
export const Dash: Skill = {
  id: 'dash',
  kind: 'active',
  name: 'Dash',
  desc: 'Sprint corto en la dirección de movimiento.',
  icon: '💨',
  baseCooldown: 4,
  execute(_ctx) {
    // F1.3: propel player in facing direction (~180px over ~140ms with iframes).
    // For now SkillSystem still emits 'skill:cast' so HUD/audio can react.
  },
}

register(Dash)
