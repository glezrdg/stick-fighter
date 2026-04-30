import type Phaser from 'phaser'

import type { Particle } from '../systems/ParticleSystem'

/**
 * Stateless particle renderer. Draws every particle as a fading circle into
 * a single Graphics object. Caller clears the Graphics each frame.
 */
export const ParticleRenderer = {
  draw(g: Phaser.GameObjects.Graphics, particles: readonly Particle[]): void {
    for (const p of particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.lifeMax))
      g.fillStyle(p.color, alpha)
      g.fillCircle(p.x, p.y, p.size)
    }
  },
} as const
