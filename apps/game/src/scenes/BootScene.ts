import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' })
  }

  create(): void {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    this.add
      .text(cx, cy - 40, 'STICK FIGHTER', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ff2a2a',
      })
      .setOrigin(0.5)

    this.add
      .text(cx, cy + 20, 'v2 — Fase 0 bootstrap', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffd54a',
      })
      .setOrigin(0.5)

    this.add
      .text(cx, cy + 60, 'Phaser + Solid + TS + monorepo OK', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
        color: '#cccccc',
      })
      .setOrigin(0.5)
  }
}
