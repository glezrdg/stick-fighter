import { attackPatterns, getEnemyType } from '@stick/content'
import { timeSeed } from '@stick/sim'

import { dtFromPhaser } from '../app/time'
import { ARENA, CAM_ZOOM } from '../core/arena'
// Side-effect: register every enemy behavior.
import '../enemies'
import { type RunState, createRunState } from '../core/runState'
import type { Enemy } from '../entities/Enemy'
import { type Player, createPlayer } from '../entities/Player'
import { StickmanRenderer } from '../render/StickmanRenderer'
import { CombatSystem } from '../systems/CombatSystem'
import { EnemySystem } from '../systems/EnemySystem'
import { updateMovement } from '../systems/MovementSystem'
import { WaveSystem } from '../systems/WaveSystem'

import { BaseScene } from './BaseScene'

/**
 * Gameplay scene. F1.4 closes Phase 1: player movement, combo with hit
 * detection, grunt enemies via meleeChase, wave spawner. After a wave
 * clears another starts automatically (testing infinite scaling lands in F2).
 */
export class ArenaScene extends BaseScene {
  static readonly KEY = 'Arena'

  private runState!: RunState
  private player!: Player
  private combat!: CombatSystem
  private waves!: WaveSystem
  private enemySys!: EnemySystem
  private stickman!: StickmanRenderer

  private playerGraphics!: Phaser.GameObjects.Graphics
  private enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>()

  private busUnsubs: Array<() => void> = []

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(ArenaScene.KEY, services)
  }

  create(): void {
    // ---- Run state + player ----
    this.runState = createRunState({ seed: timeSeed(), playerMaxHp: 100 })
    this.player = createPlayer({ x: ARENA.width / 2, y: ARENA.height / 2 })

    // ---- Systems ----
    this.waves = new WaveSystem({ bus: this.bus, rng: this.rng })
    this.combat = new CombatSystem({
      bus: this.bus,
      attackPatterns,
      getEnemies: () => this.waves.getEnemies(),
    })
    this.enemySys = new EnemySystem({ bus: this.bus, rng: this.rng })
    this.stickman = new StickmanRenderer()

    // ---- Arena visuals ----
    this.add
      .rectangle(ARENA.width / 2, ARENA.height / 2, ARENA.width, ARENA.height, 0x1a1f24)
      .setStrokeStyle(2, 0x404850)
    const grid = this.add.graphics()
    grid.lineStyle(1, 0x2a3038, 0.5)
    for (let x = 0; x <= ARENA.width; x += 60) grid.lineBetween(x, 0, x, ARENA.height)
    for (let y = 0; y <= ARENA.height; y += 60) grid.lineBetween(0, y, ARENA.width, y)

    this.playerGraphics = this.add.graphics()

    // ---- Camera ----
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height)
    this.cameras.main.setZoom(CAM_ZOOM)
    this.cameras.main.startFollow(this.playerGraphics, true, 0.15, 0.15)
    this.cameras.main.setBackgroundColor('#0e1317')

    // ---- Bus wiring ----
    this.busUnsubs.push(
      this.bus.on('input:attack', () => this.combat.tryAttack(this.player)),
      this.bus.on('input:skill', ({ slot }) => {
        // F2 wires SkillSystem; for now broadcast so audio/HUD can react.
        this.bus.emit('skill:cast', { skillId: 'placeholder', slot })
      }),
      this.bus.on('enemy:death', ({ enemyId, byPlayer }) => {
        if (!byPlayer) return
        // Lookup enemy to get its goldReward, then bookkeep run totals.
        const enemy = this.waves.getEnemies().find((e) => e.id === enemyId)
        if (!enemy) return
        const type = getEnemyType(enemy.typeId)
        this.runState.gold += type.goldReward
        this.runState.kills += 1
        this.bus.emit('gold:changed', { gold: this.runState.gold, delta: type.goldReward })
        this.bus.emit('kills:changed', { kills: this.runState.kills })
      }),
      this.bus.on('wave:start', ({ wave }) => {
        this.runState.wave = wave
      }),
      this.bus.on('player:death', () => this.endRun('death')),
    )

    this.input.keyboard?.on('keydown-ESC', () => this.endRun('quit'))

    // Initial HUD population.
    this.bus.emit('run:start', { seed: this.runState.seed })
    this.bus.emit('gold:changed', { gold: this.runState.gold, delta: 0 })
    this.bus.emit('player:hp:changed', { hp: this.player.hp, maxHp: this.player.maxHp })

    // Kick off wave 1.
    this.waves.startNextWave()

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  override update(_time: number, deltaMs: number): void {
    const dt = dtFromPhaser(deltaMs)
    this.runState.elapsed += dt

    // Player tick.
    const moveVec = this.services.input.getMoveVector()
    updateMovement(this.player, moveVec, dt)
    this.combat.update(this.player, dt)

    // Enemy tick + wave bookkeeping.
    const enemies = this.waves.getEnemies()
    this.enemySys.update(enemies, this.player, dt)
    this.waves.update(dt)
    this.waves.reapDead()

    // Render.
    this.playerGraphics.setPosition(this.player.x, this.player.y)
    this.stickman.draw(this.playerGraphics, this.player)
    this.renderEnemies(enemies)
  }

  private renderEnemies(enemies: readonly Enemy[]): void {
    const seen = new Set<string>()
    for (const e of enemies) {
      seen.add(e.id)
      let g = this.enemyGraphics.get(e.id)
      if (!g) {
        g = this.add.graphics()
        this.enemyGraphics.set(e.id, g)
      }
      const type = getEnemyType(e.typeId)
      g.setPosition(e.x, e.y)
      this.stickman.draw(
        g,
        {
          vx: e.vx,
          vy: e.vy,
          facingX: e.facingX,
          facingY: e.facingY,
          walkPhase: e.walkPhase,
          attackTimer: e.attackTimer,
          attackDuration: e.attackDuration,
          attackKind: e.attackKind,
          attackDirX: e.attackDirX,
          attackDirY: e.attackDirY,
          hurtFlash: e.hurtFlash,
          iframes: 0,
          color: hexToNum(type.color),
        },
        type.scale,
      )
    }
    // Drop graphics for enemies that died/disappeared.
    for (const [id, g] of this.enemyGraphics) {
      if (!seen.has(id)) {
        g.destroy()
        this.enemyGraphics.delete(id)
      }
    }
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
    for (const g of this.enemyGraphics.values()) g.destroy()
    this.enemyGraphics.clear()
  }
}

function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16)
}
