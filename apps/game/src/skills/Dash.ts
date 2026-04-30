import { register } from './registry'
import type { Skill } from './Skill'

/** Dash duration (seconds). Legacy: 22 frames @ 60fps ≈ 0.367s. */
const DASH_DURATION_SEC = 0.37
/** Player invulnerability while dashing. Legacy: 90 frames @ 60fps = 1.5s. */
const DASH_IFRAMES_SEC = 1.5

export const Dash: Skill = {
  id: 'dash',
  kind: 'active',
  name: 'DASH FANTASMA',
  desc: 'Esquiva 1.5 seg + atraviesa enemigos',
  icon: '💨',
  cost: 300,
  baseCooldown: 8, // legacy 480 frames / 60
  execute(ctx) {
    ctx.player.dashTimer = DASH_DURATION_SEC
    ctx.player.iframes = Math.max(ctx.player.iframes, DASH_IFRAMES_SEC)
  },
}

register(Dash)
