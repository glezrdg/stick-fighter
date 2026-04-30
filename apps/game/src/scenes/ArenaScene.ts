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
// Side-effect: register every skill.
import '../skills'
import {
  SWORD_TORNADO_DMG_MUL,
  SWORD_TORNADO_RADIUS,
  SWORD_TORNADO_TICK_SEC,
} from '../skills/SwordTornado'
import { VAMPIRE_HEAL_PER_KILL } from '../skills/Vampire'
import { type EffectiveStats, BuffSystem } from '../systems/BuffSystem'
import { CombatSystem } from '../systems/CombatSystem'
import { EnemySystem } from '../systems/EnemySystem'
import { updateMovement } from '../systems/MovementSystem'
import { SkillSystem } from '../systems/SkillSystem'
import { WaveSystem } from '../systems/WaveSystem'

import { BaseScene } from './BaseScene'

/**
 * F2.1 loadout — what the run starts with. F2.4 reads this from SaveStore
 * (with the shop wired in). Hard-coding here for now keeps the deployed
 * preview useful so we can verify the SkillSystem end-to-end.
 */
const F2_1_TEST_LOADOUT = {
  ownedSkills: ['dash', 'kiBlast', 'shield', 'vampire', 'golden', 'cdReduce', 'heal'],
  equipped: ['kiBlast', 'dash'] as [string, string],
  weaponId: 'katana',
  weaponLevel: 1,
}

export class ArenaScene extends BaseScene {
  static readonly KEY = 'Arena'

  private runState!: RunState
  private player!: Player
  private stats!: EffectiveStats
  private combat!: CombatSystem
  private waves!: WaveSystem
  private enemySys!: EnemySystem
  private skillSystem!: SkillSystem
  private stickman!: StickmanRenderer

  private playerGraphics!: Phaser.GameObjects.Graphics
  private enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>()

  private tornadoTickAcc = 0
  private busUnsubs: Array<() => void> = []

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(ArenaScene.KEY, services)
  }

  create(): void {
    // ---- Effective stats (BuffSystem) ----
    this.stats = BuffSystem.computeStats({
      ownedSkills: F2_1_TEST_LOADOUT.ownedSkills,
      runBuffs: { dmg: 0, atkSpeed: 0, hpMax: 0, crit: 0, knockback: 0, regen: 0, gold: 0 },
      equippedWeaponId: F2_1_TEST_LOADOUT.weaponId,
      weaponLevel: F2_1_TEST_LOADOUT.weaponLevel,
    })

    // ---- Run state + player ----
    this.runState = createRunState({ seed: timeSeed(), playerMaxHp: this.stats.maxHp })
    this.player = createPlayer({
      x: ARENA.width / 2,
      y: ARENA.height / 2,
      maxHp: this.stats.maxHp,
    })

    // ---- Systems ----
    this.waves = new WaveSystem({ bus: this.bus, rng: this.rng })
    this.combat = new CombatSystem({
      bus: this.bus,
      attackPatterns,
      getEnemies: () => this.waves.getEnemies(),
      getDmgMul: () => this.stats.dmgMul,
    })
    this.enemySys = new EnemySystem({ bus: this.bus, rng: this.rng })
    this.skillSystem = new SkillSystem({ bus: this.bus })
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
      this.bus.on('input:skill', ({ slot }) => this.castSkill(slot)),
      this.bus.on('enemy:death', ({ enemyId, byPlayer }) => this.onEnemyDeath(enemyId, byPlayer)),
      this.bus.on('wave:start', ({ wave }) => {
        this.runState.wave = wave
      }),
      this.bus.on('player:death', () => this.endRun('death')),
    )

    this.input.keyboard?.on('keydown-ESC', () => this.endRun('quit'))

    // ---- Initial HUD population ----
    this.bus.emit('run:start', { seed: this.runState.seed })
    this.bus.emit('gold:changed', { gold: this.runState.gold, delta: 0 })
    this.bus.emit('player:hp:changed', { hp: this.player.hp, maxHp: this.player.maxHp })
    this.bus.emit('skills:equipped', {
      slot0: F2_1_TEST_LOADOUT.equipped[0] ?? null,
      slot1: F2_1_TEST_LOADOUT.equipped[1] ?? null,
    })

    this.waves.startNextWave()

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  override update(_time: number, deltaMs: number): void {
    const dt = dtFromPhaser(deltaMs)
    this.runState.elapsed += dt

    // Decay run-state timers.
    if (this.runState.cameraShake > 0) {
      this.runState.cameraShake = Math.max(0, this.runState.cameraShake - dt)
    }
    if (this.runState.slowMo > 0) {
      this.runState.slowMo = Math.max(0, this.runState.slowMo - dt)
    }
    if (this.runState.tornadoTimer > 0) {
      this.runState.tornadoTimer = Math.max(0, this.runState.tornadoTimer - dt)
      this.tickTornado(dt)
    } else {
      this.tornadoTickAcc = 0
    }

    // Player tick.
    const moveVec = this.services.input.getMoveVector()
    updateMovement(this.player, moveVec, dt)
    this.combat.update(this.player, dt)
    this.skillSystem.update(this.runState, dt)

    // Regen passive (runBuffs.regen).
    if (this.stats.regenPerSec > 0 && this.player.hp > 0 && this.player.hp < this.player.maxHp) {
      this.player.regenAcc += this.stats.regenPerSec * dt
      if (this.player.regenAcc >= 1) {
        const heal = Math.floor(this.player.regenAcc)
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal)
        this.player.regenAcc -= heal
        this.bus.emit('player:hp:changed', { hp: this.player.hp, maxHp: this.player.maxHp })
      }
    }

    // Enemy tick + waves.
    const enemies = this.waves.getEnemies()
    this.enemySys.update(enemies, this.player, dt)
    this.waves.update(dt)
    this.waves.reapDead()

    // Render.
    this.playerGraphics.setPosition(this.player.x, this.player.y)
    this.stickman.draw(this.playerGraphics, this.player)
    this.renderEnemies(enemies)

    // Camera shake.
    if (this.runState.cameraShake > 0) {
      this.cameras.main.shake(50, 0.005 * Math.min(1, this.runState.cameraShake / 0.5))
    }
  }

  private castSkill(slot: 0 | 1): void {
    const skillId = F2_1_TEST_LOADOUT.equipped[slot]
    this.skillSystem.cast({
      slot,
      skillId,
      cdMul: this.stats.cdMul,
      ctx: {
        player: this.player,
        enemies: this.waves.getEnemies(),
        bus: this.bus,
        rng: this.rng,
        scene: this,
        runState: this.runState,
        dmgMul: this.stats.dmgMul,
      },
    })
  }

  private tickTornado(dt: number): void {
    this.tornadoTickAcc += dt
    while (this.tornadoTickAcc >= SWORD_TORNADO_TICK_SEC) {
      this.tornadoTickAcc -= SWORD_TORNADO_TICK_SEC
      const enemies = this.waves.getEnemies()
      const damage = this.stats.dmgMul * SWORD_TORNADO_DMG_MUL
      for (const e of enemies) {
        if (e.hp <= 0) continue
        const dx = e.x - this.player.x
        const dy = e.y - this.player.y
        if (Math.hypot(dx, dy) > SWORD_TORNADO_RADIUS) continue
        const wasAlive = e.hp > 0
        e.hp -= damage
        e.hurtFlash = 0.12
        this.bus.emit('combat:hit', {
          attackerId: 'player',
          targetId: e.id,
          dmg: damage,
          crit: false,
        })
        if (wasAlive && e.hp <= 0) {
          this.bus.emit('enemy:death', { enemyId: e.id, byPlayer: true })
        }
      }
    }
  }

  private onEnemyDeath(enemyId: string, byPlayer: boolean): void {
    if (!byPlayer) return
    const enemy = this.waves.getEnemies().find((e) => e.id === enemyId)
    if (!enemy) return
    const type = getEnemyType(enemy.typeId)
    const goldGain = Math.floor(type.goldReward * this.stats.goldMul)
    this.runState.gold += goldGain
    this.runState.kills += 1
    this.bus.emit('gold:changed', { gold: this.runState.gold, delta: goldGain })
    this.bus.emit('kills:changed', { kills: this.runState.kills })

    // Vampire passive.
    if (
      F2_1_TEST_LOADOUT.ownedSkills.includes('vampire') &&
      this.player.hp > 0 &&
      this.player.hp < this.player.maxHp
    ) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + VAMPIRE_HEAL_PER_KILL)
      this.bus.emit('player:hp:changed', { hp: this.player.hp, maxHp: this.player.maxHp })
    }
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
