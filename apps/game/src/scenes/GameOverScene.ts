import type { RunState } from '@stick/sim'

import { netClient } from '../net/NetClient'

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
  private netUnsub: (() => void) | null = null

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

    // Multi: cuando el server resetea la sala (consenso de restart), phase
    // pasa de 'gameover' a 'lobby'. Volvemos al MainMenu y emitimos un evento
    // para que main.tsx reabra el LobbyOverlay con la sala intacta.
    this.netUnsub = netClient.subscribe((s) => {
      if (s.phase === 'lobby' && s.code) {
        this.scene.start('MainMenu')
        this.bus.emit('ui:menu:open-lobby', {})
      }
    })

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  private cleanup(): void {
    for (const off of this.busUnsubs) off()
    this.busUnsubs = []
    if (this.netUnsub) {
      this.netUnsub()
      this.netUnsub = null
    }
  }
}
