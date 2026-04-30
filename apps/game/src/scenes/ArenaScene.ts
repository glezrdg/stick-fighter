import { timeSeed } from '@stick/sim'

import { type RunState, createRunState } from '../core/runState'

import { BaseScene } from './BaseScene'

/**
 * Gameplay scene. F1.2 is an empty placeholder that:
 *   - Creates a RunState
 *   - Emits run:start, wave:start, gold:changed, player:hp:changed so the HUD
 *     populates from the bus
 *   - Lets the player simulate death with SPACE/tap to validate the
 *     transition to GameOver
 *
 * F1.3+ replaces the placeholder with the real loop (player, enemies,
 * combat, wave spawner).
 */
export class ArenaScene extends BaseScene {
  static readonly KEY = 'Arena'

  private runState!: RunState

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(ArenaScene.KEY, services)
  }

  create(): void {
    this.runState = createRunState({
      seed: timeSeed(),
      playerMaxHp: 100,
    })
    this.runState.wave = 1

    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2

    this.add
      .text(cx, cy - 30, 'ARENA — F1.2 stub', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.add
      .text(cx, cy + 10, 'TAP / SPACE para simular muerte', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
        color: '#9aa1a8',
      })
      .setOrigin(0.5)

    // Populate the HUD from the bus (the Solid HUD subscribes to these).
    this.bus.emit('run:start', { seed: this.runState.seed })
    this.bus.emit('wave:start', { wave: this.runState.wave, totalEnemies: 5 })
    this.bus.emit('gold:changed', { gold: this.runState.gold, delta: 0 })
    this.bus.emit('player:hp:changed', {
      hp: this.runState.playerHp,
      maxHp: this.runState.playerMaxHp,
    })

    const die = () => {
      this.bus.emit('run:end', {
        wave: this.runState.wave,
        kills: this.runState.kills,
        gold: this.runState.gold,
        reason: 'death',
      })
      this.scene.start('GameOver', { runState: this.runState })
    }
    this.input.once('pointerdown', die)
    this.input.keyboard?.once('keydown-SPACE', die)
  }
}
