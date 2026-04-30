import type Phaser from 'phaser'

/**
 * Industrial arena dressing — fans, ceiling lamps, dust ambience, vignette.
 * Mirrors legacy drawArena (lines 2072-2186) at a coarser fidelity.
 *
 * The renderer keeps a fixed list of prop positions chosen at scene-create.
 * Each frame the scene calls `update(dt)` to advance fan rotation + lamp
 * flicker, then `draw(g)` to paint the floor layer. Vignette is drawn
 * separately on a screen-space overlay (not arena-space).
 */

export interface ArenaProps {
  fans: Array<{ x: number; y: number; r: number; angle: number; spinSpeed: number }>
  lamps: Array<{ x: number; y: number; flicker: number; flickerTimer: number }>
  pipes: Array<{ x1: number; y1: number; x2: number; y2: number; thick: number }>
}

export const ArenaPropsRenderer = {
  generate(opts: { width: number; height: number }): ArenaProps {
    const { width, height } = opts
    return {
      fans: [
        { x: width * 0.15, y: height * 0.18, r: 28, angle: 0, spinSpeed: 6 },
        { x: width * 0.85, y: height * 0.18, r: 28, angle: 0.4, spinSpeed: 5.5 },
        { x: width * 0.5, y: height * 0.85, r: 32, angle: 1.2, spinSpeed: 7 },
      ],
      lamps: [
        { x: width * 0.25, y: height * 0.5, flicker: 0.95, flickerTimer: 0 },
        { x: width * 0.75, y: height * 0.5, flicker: 1.0, flickerTimer: 0.3 },
        { x: width * 0.5, y: height * 0.25, flicker: 0.92, flickerTimer: 0.6 },
        { x: width * 0.5, y: height * 0.75, flicker: 0.98, flickerTimer: 0.1 },
      ],
      pipes: [
        { x1: 0, y1: height * 0.08, x2: width, y2: height * 0.08, thick: 5 },
        { x1: width * 0.5, y1: 0, x2: width * 0.5, y2: height * 0.08, thick: 4 },
        { x1: 0, y1: height * 0.94, x2: width, y2: height * 0.94, thick: 5 },
      ],
    }
  },

  update(props: ArenaProps, dt: number, rngFloat: (min: number, max: number) => number): void {
    for (const f of props.fans) {
      f.angle += f.spinSpeed * dt
    }
    for (const l of props.lamps) {
      l.flickerTimer -= dt
      if (l.flickerTimer <= 0) {
        l.flickerTimer = rngFloat(0.05, 0.4)
        l.flicker = rngFloat(0.85, 1.0)
      }
    }
  },

  drawFloor(g: Phaser.GameObjects.Graphics, props: ArenaProps): void {
    // Pipes (drawn first so fans/lamps overlap them).
    for (const p of props.pipes) {
      g.lineStyle(p.thick, 0x303840, 1)
      g.beginPath()
      g.moveTo(p.x1, p.y1)
      g.lineTo(p.x2, p.y2)
      g.strokePath()
      g.lineStyle(p.thick * 0.4, 0x505860, 1)
      g.beginPath()
      g.moveTo(p.x1, p.y1 - 1)
      g.lineTo(p.x2, p.y2 - 1)
      g.strokePath()
    }
    // Fans (mounted on the wall — circular frame + 4 rotating blades).
    for (const f of props.fans) {
      g.fillStyle(0x202428, 1)
      g.fillCircle(f.x, f.y, f.r + 2)
      g.lineStyle(2, 0x404850, 1)
      g.strokeCircle(f.x, f.y, f.r)
      // Blades
      g.fillStyle(0x303840, 1)
      for (let i = 0; i < 4; i++) {
        const a = f.angle + (i * Math.PI) / 2
        const x1 = f.x + Math.cos(a) * f.r * 0.95
        const y1 = f.y + Math.sin(a) * f.r * 0.95
        const x2 = f.x + Math.cos(a + 0.4) * f.r * 0.4
        const y2 = f.y + Math.sin(a + 0.4) * f.r * 0.4
        g.fillTriangle(f.x, f.y, x1, y1, x2, y2)
      }
      g.fillStyle(0x606870, 1)
      g.fillCircle(f.x, f.y, 4)
    }
    // Lamps — yellow halo on the floor.
    for (const l of props.lamps) {
      const radius = 90
      g.fillStyle(0xffe080, 0.06 * l.flicker)
      g.fillCircle(l.x, l.y, radius)
      g.fillStyle(0xffe080, 0.12 * l.flicker)
      g.fillCircle(l.x, l.y, radius * 0.6)
      // Lamp fixture
      g.fillStyle(0x202428, 1)
      g.fillRect(l.x - 6, l.y - 4, 12, 4)
      g.fillStyle(0xffe080, l.flicker)
      g.fillCircle(l.x, l.y, 3)
    }
  },

  /** Vignette painted on top of everything. Caller positions a fullscreen
   *  graphics object in screen space (not arena space). */
  drawVignette(g: Phaser.GameObjects.Graphics, width: number, height: number): void {
    g.clear()
    const cx = width / 2
    const cy = height / 2
    const maxR = Math.hypot(cx, cy)
    // Build a few concentric rings with growing alpha — cheap radial gradient.
    for (let i = 6; i >= 1; i--) {
      const t = i / 6
      g.fillStyle(0x000000, 0.08 * t)
      g.fillCircle(cx, cy, maxR * (1 - t * 0.18))
    }
    // Side darkening
    g.fillStyle(0x000000, 0.18)
    g.fillRect(0, 0, width * 0.06, height)
    g.fillRect(width * 0.94, 0, width * 0.06, height)
  },
} as const
