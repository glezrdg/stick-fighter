import type { RunState } from '../core/runState'

import { BaseScene } from './BaseScene'

interface GameOverData {
  runState?: RunState
}

export class GameOverScene extends BaseScene {
  static readonly KEY = 'GameOver'

  private summary: RunState | undefined = undefined

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(GameOverScene.KEY, services)
  }

  init(data: GameOverData): void {
    this.summary = data.runState
  }

  create(): void {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    this.add
      .text(cx, cy - 60, 'GAME OVER', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: '#ff2a2a',
      })
      .setOrigin(0.5)

    if (this.summary) {
      this.add
        .text(
          cx,
          cy + 4,
          `Wave ${this.summary.wave}   ·   Kills ${this.summary.kills}   ·   Gold ${this.summary.gold}`,
          {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '16px',
            color: '#ffd54a',
          },
        )
        .setOrigin(0.5)
    }

    const restart = this.add
      .text(cx, cy + 80, 'TAP / SPACE para reintentar', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
    this.tweens.add({
      targets: restart,
      alpha: 0.4,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const back = () => this.scene.start('MainMenu')
    this.input.once('pointerdown', back)
    this.input.keyboard?.once('keydown-SPACE', back)
  }
}
