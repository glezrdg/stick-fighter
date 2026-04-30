import type Phaser from 'phaser'

/**
 * Industrial arena pintada de cero — piso claro + grid metálico + remaches +
 * paredes + tubería + ventiladores giratorios + lámparas que parpadean +
 * viñeta. Mirrors `drawArena()` del legacy (líneas 2072-2133).
 *
 * El piso del legacy es CLARO (`#c8ccd0 → #9aa0a6`, gradiente vertical) — esto
 * contrasta intencionalmente con el HUD oscuro y los stickmen negros. Es el
 * cambio visual más grande respecto a la versión que pintaba un rect oscuro.
 */

export interface ArenaProps {
  width: number
  height: number
  fans: Array<{ x: number; y: number; r: number; angle: number; spinSpeed: number }>
  lamps: Array<{ x: number; y: number; flicker: number; flickerTimer: number }>
  /** Polvo flotante ambient (legacy 2189-2202). */
  dust: Array<{ x: number; y: number; vx: number; vy: number; r: number }>
}

const FLOOR_GRID_TILE = 60
const WALL_THICKNESS = 30

export const ArenaPropsRenderer = {
  generate(opts: { width: number; height: number }): ArenaProps {
    const { width, height } = opts
    return {
      width,
      height,
      fans: [
        { x: width * 0.18, y: WALL_THICKNESS / 2, r: 22, angle: 0, spinSpeed: 6 },
        { x: width * 0.55, y: WALL_THICKNESS / 2, r: 22, angle: 0.6, spinSpeed: 5.5 },
        { x: width * 0.82, y: WALL_THICKNESS / 2, r: 22, angle: 1.2, spinSpeed: 7 },
      ],
      lamps: [
        { x: width * 0.3, y: WALL_THICKNESS, flicker: 0.95, flickerTimer: 0 },
        { x: width * 0.7, y: WALL_THICKNESS, flicker: 1.0, flickerTimer: 0.3 },
      ],
      dust: Array.from({ length: 25 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 2 - 1,
        r: 1 + Math.random() * 1.5,
      })),
    }
  },

  update(props: ArenaProps, dt: number, rngFloat: (min: number, max: number) => number): void {
    for (const f of props.fans) f.angle += f.spinSpeed * dt
    for (const l of props.lamps) {
      l.flickerTimer -= dt
      if (l.flickerTimer <= 0) {
        l.flickerTimer = rngFloat(0.05, 0.4)
        l.flicker = rngFloat(0.85, 1.0)
      }
    }
    for (const d of props.dust) {
      d.x += d.vx * dt
      d.y += d.vy * dt
      if (d.x < 0) d.x = props.width
      if (d.x > props.width) d.x = 0
      if (d.y < 0) d.y = props.height
      if (d.y > props.height) d.y = 0
    }
  },

  /** Pinta el piso + grid + paredes + props. Llamar antes de cualquier entity. */
  drawFloor(g: Phaser.GameObjects.Graphics, p: ArenaProps): void {
    const w = p.width
    const h = p.height

    // ---- 1. Piso: gradient #c8ccd0 → #9aa0a6 simulado con bandas ----
    // Phaser Graphics no tiene gradient nativo barato. Aproximamos con bandas
    // horizontales que interpolan entre los dos colores. ~16 bandas son
    // visualmente indistinguibles de un gradient real.
    const bandCount = 16
    const bandH = h / bandCount
    for (let i = 0; i < bandCount; i++) {
      const t = i / (bandCount - 1)
      const r = lerp(0xc8, 0x9a, t)
      const gC = lerp(0xcc, 0xa0, t)
      const b = lerp(0xd0, 0xa6, t)
      g.fillStyle((r << 16) | (gC << 8) | b, 1)
      g.fillRect(0, i * bandH, w, bandH + 1)
    }

    // ---- 2. Grid metálico (tile 60px) ----
    g.lineStyle(1, 0x3c4650, 0.35)
    for (let x = 0; x <= w; x += FLOOR_GRID_TILE) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, h)
      g.strokePath()
    }
    for (let y = 0; y <= h; y += FLOOR_GRID_TILE) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(w, y)
      g.strokePath()
    }

    // ---- 3. Remaches en intersecciones ----
    g.fillStyle(0x28323c, 0.4)
    for (let x = FLOOR_GRID_TILE; x < w; x += FLOOR_GRID_TILE) {
      for (let y = FLOOR_GRID_TILE; y < h; y += FLOOR_GRID_TILE) {
        g.fillCircle(x, y, 2)
      }
    }

    // ---- 4. Paredes superior + inferior (gradient #e8eaed → #b8bcc0) ----
    drawWallBand(g, 0, 0, w, WALL_THICKNESS) // top
    drawWallBand(g, 0, h - WALL_THICKNESS, w, WALL_THICKNESS) // bottom

    // ---- 5. Paredes laterales (sólido) ----
    g.fillStyle(0xa8acb0, 1)
    g.fillRect(0, 0, WALL_THICKNESS / 2, h)
    g.fillRect(w - WALL_THICKNESS / 2, 0, WALL_THICKNESS / 2, h)

    // ---- 6. Tubería superior (banda + sub-línea + remaches) ----
    const pipeY = WALL_THICKNESS + 6
    g.fillStyle(0x6a7078, 1)
    g.fillRect(0, pipeY, w, 6)
    g.fillStyle(0x4a5058, 1)
    g.fillRect(0, pipeY + 6, w, 1.5)
    g.fillStyle(0x2a3038, 1)
    for (let x = 40; x < w; x += 80) {
      g.fillCircle(x, pipeY + 3, 1.8)
    }

    // ---- 7. Ventiladores en pared superior ----
    for (const f of p.fans) {
      g.fillStyle(0x1a1f24, 1)
      g.fillCircle(f.x, f.y, f.r + 2)
      g.lineStyle(2, 0x3a4048, 1)
      g.strokeCircle(f.x, f.y, f.r)
      g.fillStyle(0x5a6068, 1)
      for (let i = 0; i < 4; i++) {
        const a = f.angle + (i * Math.PI) / 2
        const x1 = f.x + Math.cos(a) * f.r * 0.95
        const y1 = f.y + Math.sin(a) * f.r * 0.95
        const x2 = f.x + Math.cos(a + 0.4) * f.r * 0.4
        const y2 = f.y + Math.sin(a + 0.4) * f.r * 0.4
        g.fillTriangle(f.x, f.y, x1, y1, x2, y2)
      }
      g.fillStyle(0x7a8088, 1)
      g.fillCircle(f.x, f.y, 4)
    }

    // ---- 8. Lámparas (cono de luz cálida + bombilla) ----
    for (const l of p.lamps) {
      // Cono de luz hacia abajo — radial gradient simulado con dos discos.
      g.fillStyle(0xfff5b4, 0.05 * l.flicker)
      g.fillCircle(l.x, l.y + 80, 140)
      g.fillStyle(0xfff5b4, 0.1 * l.flicker)
      g.fillCircle(l.x, l.y + 50, 80)
      g.fillStyle(0xfff5b4, 0.18 * l.flicker)
      g.fillCircle(l.x, l.y + 20, 40)
      // Soporte fijo al techo
      g.fillStyle(0x2a3038, 1)
      g.fillRect(l.x - 8, l.y - 6, 16, 8)
      // Bombilla
      g.fillStyle(0xfff5cc, l.flicker)
      g.fillCircle(l.x, l.y + 4, 5)
      g.fillStyle(0xffffff, l.flicker)
      g.fillCircle(l.x, l.y + 4, 2)
    }

    // ---- 9. Sombra de pared sobre piso (gradient simulado) ----
    for (let i = 0; i < 6; i++) {
      const t = i / 6
      g.fillStyle(0x000000, 0.35 * (1 - t))
      g.fillRect(0, WALL_THICKNESS + i * 5, w, 5)
    }

    // ---- 10. Polvo flotante ----
    g.fillStyle(0xb8b8d0, 0.25)
    for (const d of p.dust) {
      g.fillCircle(d.x, d.y, d.r)
    }

    // ---- 11. Viñeta radial — oscuro en esquinas ----
    // Aproximamos con 4 elipses en las esquinas.
    g.fillStyle(0x000000, 0.18)
    const rX = w * 0.35
    const rY = h * 0.35
    g.fillEllipse(0, 0, rX * 2, rY * 2)
    g.fillEllipse(w, 0, rX * 2, rY * 2)
    g.fillEllipse(0, h, rX * 2, rY * 2)
    g.fillEllipse(w, h, rX * 2, rY * 2)
  },
} as const

function drawWallBand(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const bands = 6
  const bandH = h / bands
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1)
    const r = lerp(0xe8, 0xb8, t)
    const gC = lerp(0xea, 0xbc, t)
    const b = lerp(0xed, 0xc0, t)
    g.fillStyle((r << 16) | (gC << 8) | b, 1)
    g.fillRect(x, y + i * bandH, w, bandH + 1)
  }
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}
