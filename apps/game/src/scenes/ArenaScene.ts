import { attackPatterns } from '@stick/content'
import { timeSeed } from '@stick/sim'

import { dtFromPhaser } from '../app/time'
import { ARENA, CAM_ZOOM } from '../core/arena'
import { type RunState, createRunState } from '../core/runState'
import { type Player, createPlayer } from '../entities/Player'
import { StickmanRenderer } from '../render/StickmanRenderer'
import { CombatSystem } from '../systems/CombatSystem'
import { updateMovement } from '../systems/MovementSystem'

import { BaseScene } from './BaseScene'

/**
 * Gameplay scene. F1.3 wires the foundation: player movement, combo state
 * machine, stickman renderer, camera follow. No enemies, no waves — those
 * land in F1.4. Press SPACE during play to test the combo cycle visually.
 */
export class ArenaScene extends BaseScene {
  static readonly KEY = 'Arena'

  private runState!: RunState
  private player!: Player
  private combat!: CombatSystem
  private stickman!: StickmanRenderer
  private playerGraphics!: Phaser.GameObjects.Graphics

  private busUnsubs: Array<() => void> = []

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(ArenaScene.KEY, services)
  }

  create(): void {
    // ---- Init run state + player ----
    this.runState = createRunState({ seed: timeSeed(), playerMaxHp: 100 })
    this.runState.wave = 1
    this.player = createPlayer({ x: ARENA.width / 2, y: ARENA.height / 2 })

    // ---- Combat + renderer ----
    this.combat = new CombatSystem({ bus: this.bus, attackPatterns })
    this.stickman = new StickmanRenderer()

    // ---- Visuals: arena floor (so motion is visible) + player graphics ----
    this.add
      .rectangle(ARENA.width / 2, ARENA.height / 2, ARENA.width, ARENA.height, 0x1a1f24)
      .setStrokeStyle(2, 0x404850)
    // Subtle grid for depth perception
    const grid = this.add.graphics()
    grid.lineStyle(1, 0x2a3038, 0.5)
    for (let x = 0; x <= ARENA.width; x += 60) {
      grid.lineBetween(x, 0, x, ARENA.height)
    }
    for (let y = 0; y <= ARENA.height; y += 60) {
      grid.lineBetween(0, y, ARENA.width, y)
    }

    this.playerGraphics = this.add.graphics()

    // ---- Camera: zoom in, bound to arena, follow player ----
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height)
    this.cameras.main.setZoom(CAM_ZOOM)
    this.cameras.main.startFollow(this.playerGraphics, true, 0.15, 0.15)
    this.cameras.main.setBackgroundColor('#0e1317')

    // ---- Subscribe to raw input events ----
    this.busUnsubs.push(
      this.bus.on('input:attack', () => this.combat.tryAttack(this.player)),
      this.bus.on('input:skill', ({ slot }) => {
        // F1.4 wires SkillSystem; for now just emit so HUD can react.
        this.bus.emit('skill:cast', { skillId: 'placeholder', slot })
      }),
    )

    // F1.3 has no enemies yet — Esc exits to GameOver so the flow stays testable.
    this.input.keyboard?.once('keydown-ESC', () => this.endRun('quit'))

    // ---- Populate the HUD via bus ----
    this.bus.emit('run:start', { seed: this.runState.seed })
    this.bus.emit('wave:start', { wave: this.runState.wave, totalEnemies: 0 })
    this.bus.emit('gold:changed', { gold: this.runState.gold, delta: 0 })
    this.bus.emit('player:hp:changed', {
      hp: this.player.hp,
      maxHp: this.player.maxHp,
    })

    // ---- Cleanup on scene shutdown ----
    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  override update(_time: number, deltaMs: number): void {
    const dt = dtFromPhaser(deltaMs)
    this.runState.elapsed += dt

    const moveVec = this.services.input.getMoveVector()
    updateMovement(this.player, moveVec, dt)
    this.combat.update(this.player, dt)

    // Position the player Graphics in world coords; redraw the stickman pose.
    this.playerGraphics.setPosition(this.player.x, this.player.y)
    this.stickman.draw(this.playerGraphics, this.player)
  }

  private endRun(reason: 'death' | 'quit'): void {
    this.bus.emit('run:end', {
      wave: this.runState.wave,
      kills: this.runState.kills,
      gold: this.runState.gold,
      reason,
    })
    this.scene.start('GameOver', { runState: this.runState })
  }

  private cleanup(): void {
    for (const off of this.busUnsubs) off()
    this.busUnsubs = []
  }
}
