import { BaseScene } from './BaseScene'

export class MainMenuScene extends BaseScene {
  static readonly KEY = 'MainMenu'

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(MainMenuScene.KEY, services)
  }

  create(): void {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    this.add
      .text(cx, cy - 80, 'STICK FIGHTER', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: '#ff2a2a',
      })
      .setOrigin(0.5)

    this.add
      .text(cx, cy - 20, 'v2 — Fase 1.2', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '16px',
        color: '#ffd54a',
      })
      .setOrigin(0.5)

    const startText = this.add
      .text(cx, cy + 80, 'TAP / SPACE PARA EMPEZAR', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    // Pulse the prompt so the player knows the screen is interactive.
    this.tweens.add({
      targets: startText,
      alpha: 0.4,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const startRun = () => this.scene.start('Arena')
    this.input.once('pointerdown', startRun)
    this.input.keyboard?.once('keydown-SPACE', startRun)
    this.input.keyboard?.once('keydown-ENTER', startRun)
  }
}
