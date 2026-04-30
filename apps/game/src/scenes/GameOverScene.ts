import type { RunState } from '@stick/sim'

import { BaseScene } from './BaseScene'

interface GameOverData {
  runState?: RunState
}

/**
 * Empty Phaser scene — actual GameOver UI rendered by `GameOverOverlay` (Solid).
 * Listens for retry / return events to navigate back.
 */
export class GameOverScene extends BaseScene {
  static readonly KEY = 'GameOver'

  private busUnsubs: Array<() => void> = []

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(GameOverScene.KEY, services)
  }

  init(_data: GameOverData): void {}

  create(): void {
    this.cameras.main.setBackgroundColor('#000')
    this.bus.emit('ui:scene:enter', { name: 'gameover' })

    this.busUnsubs.push(
      this.bus.on('ui:menu:start-run', () => this.scene.start('Arena')),
      this.bus.on('ui:menu:return', () => this.scene.start('MainMenu')),
    )

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  private cleanup(): void {
    for (const off of this.busUnsubs) off()
    this.busUnsubs = []
  }
}
