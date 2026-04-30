import Phaser from 'phaser'

import { type Services } from '../app/di'

/**
 * F1.1 placeholder. Renders the splash text and emits a few events to prove
 * the bus → HUD wiring works end-to-end. F1.2 replaces this with the real
 * preload + main menu flow.
 */
export class BootScene extends Phaser.Scene {
  constructor(private readonly services: Services) {
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
      .text(cx, cy + 20, 'v2 — Fase 1.1: foundation', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffd54a',
      })
      .setOrigin(0.5)

    this.add
      .text(cx, cy + 60, 'RNG · saveStore · eventBus · time · DI · RunState', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '12px',
        color: '#cccccc',
      })
      .setOrigin(0.5)

    // Smoke-test: emit a couple of events so the HUD reflects something
    // other than zeros. F1.2 replaces this with real gameplay.
    const { bus } = this.services
    bus.emit('player:hp:changed', { hp: 100, maxHp: 100 })
    bus.emit('wave:start', { wave: 1, totalEnemies: 5 })
    bus.emit('gold:changed', { gold: 0, delta: 0 })
  }
}
