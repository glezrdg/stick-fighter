import { attackPatterns, getEnemyType } from '@stick/content'
import { timeSeed } from '@stick/sim'

import { dtFromPhaser } from '../app/time'
import { ARENA, CAM_ZOOM } from '../core/arena'
// Side-effect: register every enemy behavior.
import '../enemies'
import { type RunState, createRunState } from '../core/runState'
import type { Enemy } from '../entities/Enemy'
import type { Obstacle } from '../entities/Obstacle'
import { type Player, createPlayer } from '../entities/Player'
import type { Projectile } from '../entities/Projectile'
import { GoreRenderer } from '../render/GoreRenderer'
import { ObstacleRenderer } from '../render/ObstacleRenderer'
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
import { GoreSystem } from '../systems/GoreSystem'
import { updateMovement } from '../systems/MovementSystem'
import { ObstacleSystem } from '../systems/ObstacleSystem'
import { ProjectileSystem } from '../systems/ProjectileSystem'
import { SkillSystem } from '../systems/SkillSystem'
import { WaveBuffSystem } from '../systems/WaveBuffSystem'
import { WaveSystem } from '../systems/WaveSystem'

import { BaseScene } from './BaseScene'

/**
 * The active loadout for this run, derived from `services.save`. Computed
 * fresh in `create()` so it picks up shop purchases between runs.
 */
interface RunLoadout {
  ownedSkills: readonly string[]
  /** Up to 2 equipped active skill ids (passives are derived from owned). */
  equipped: [string | null, string | null]
  weaponId: string
  weaponLevel: number
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
  private projectiles!: ProjectileSystem
  private gore!: GoreSystem
  private obstacleSys!: ObstacleSystem
  private stickman!: StickmanRenderer

  private playerGraphics!: Phaser.GameObjects.Graphics
  private enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>()
  private projectileGraphics!: Phaser.GameObjects.Graphics
  private goreFloorGraphics!: Phaser.GameObjects.Graphics
  private gorePartsGraphics!: Phaser.GameObjects.Graphics
  private obstacleGraphics!: Phaser.GameObjects.Graphics

  private tornadoTickAcc = 0
  private busUnsubs: Array<() => void> = []
  private activePopups = 0
  private loadout!: RunLoadout

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(ArenaScene.KEY, services)
  }

  create(): void {
    // ---- Loadout from save ----
    this.loadout = this.computeLoadout()

    // ---- Effective stats (BuffSystem) ----
    this.stats = BuffSystem.computeStats({
      ownedSkills: this.loadout.ownedSkills,
      runBuffs: { dmg: 0, atkSpeed: 0, hpMax: 0, crit: 0, knockback: 0, regen: 0, gold: 0 },
      equippedWeaponId: this.loadout.weaponId,
      weaponLevel: this.loadout.weaponLevel,
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
    this.projectiles = new ProjectileSystem({ bus: this.bus })
    this.obstacleSys = new ObstacleSystem({ bus: this.bus, rng: this.rng })
    this.obstacleSys.generate()
    this.combat = new CombatSystem({
      bus: this.bus,
      attackPatterns,
      getEnemies: () => this.waves.getEnemies(),
      getDmgMul: () => this.stats.dmgMul,
      onSwing: (ctx) =>
        this.obstacleSys.applyMeleeSwing({
          ...ctx,
          enemies: this.waves.getEnemies(),
          player: this.player,
        }),
    })
    this.enemySys = new EnemySystem({
      bus: this.bus,
      rng: this.rng,
      projectiles: this.projectiles,
    })
    this.skillSystem = new SkillSystem({ bus: this.bus })
    this.gore = new GoreSystem({ rng: this.rng })
    this.stickman = new StickmanRenderer()

    // ---- Arena visuals ----
    this.add
      .rectangle(ARENA.width / 2, ARENA.height / 2, ARENA.width, ARENA.height, 0x1a1f24)
      .setStrokeStyle(2, 0x404850)
    const grid = this.add.graphics()
    grid.lineStyle(1, 0x2a3038, 0.5)
    for (let x = 0; x <= ARENA.width; x += 60) grid.lineBetween(x, 0, x, ARENA.height)
    for (let y = 0; y <= ARENA.height; y += 60) grid.lineBetween(0, y, ARENA.width, y)

    // Floor layer (blood pools, corpses) goes BELOW the player and parts.
    this.goreFloorGraphics = this.add.graphics()
    this.obstacleGraphics = this.add.graphics()
    this.gorePartsGraphics = this.add.graphics()
    this.playerGraphics = this.add.graphics()
    this.projectileGraphics = this.add.graphics()

    // ---- Camera ----
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height)
    this.cameras.main.setZoom(CAM_ZOOM)
    this.cameras.main.startFollow(this.playerGraphics, true, 0.15, 0.15)
    this.cameras.main.setBackgroundColor('#0e1317')

    // ---- Bus wiring ----
    this.busUnsubs.push(
      this.bus.on('input:attack', () => {
        if (!this.runState.paused) this.combat.tryAttack(this.player)
      }),
      this.bus.on('input:skill', ({ slot }) => {
        if (!this.runState.paused) this.castSkill(slot)
      }),
      this.bus.on('enemy:death', ({ enemyId, byPlayer }) => this.onEnemyDeath(enemyId, byPlayer)),
      this.bus.on('combat:hit', ({ targetId, dmg, crit }) => this.onCombatHit(targetId, dmg, crit)),
      this.bus.on('wave:start', ({ wave }) => {
        this.runState.wave = wave
      }),
      this.bus.on('wave:complete', ({ wave }) => this.onWaveComplete(wave)),
      this.bus.on('wave:buff:pick', ({ buffId }) => this.onBuffPick(buffId)),
      this.bus.on('player:death', () => this.endRun('death')),
    )

    this.input.keyboard?.on('keydown-ESC', () => this.endRun('quit'))

    // ---- Initial HUD population ----
    this.bus.emit('run:start', { seed: this.runState.seed })
    this.bus.emit('gold:changed', { gold: this.runState.gold, delta: 0 })
    this.bus.emit('player:hp:changed', { hp: this.player.hp, maxHp: this.player.maxHp })
    this.bus.emit('skills:equipped', {
      slot0: this.loadout.equipped[0],
      slot1: this.loadout.equipped[1],
    })

    this.waves.startNextWave()

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  override update(_time: number, deltaMs: number): void {
    const dt = dtFromPhaser(deltaMs)
    if (this.runState.paused) return
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

    // Enemy + projectile tick + waves + gore + obstacles.
    const enemies = this.waves.getEnemies()
    this.enemySys.update(enemies, this.player, dt)
    this.projectiles.update(this.player, dt)
    this.waves.update(dt)
    this.waves.reapDead()
    this.gore.update(dt)
    this.obstacleSys.update(dt)

    // Player & enemy collision against obstacles.
    this.obstacleSys.applyPlayerCollision(this.player)
    for (const e of enemies)
      this.obstacleSys.applyCollision(e, 16 * (getEnemyType(e.typeId).scale || 1))

    // Render.
    this.renderGore()
    this.renderObstacles(this.obstacleSys.getAll())
    this.playerGraphics.setPosition(this.player.x, this.player.y)
    this.stickman.draw(this.playerGraphics, this.player)
    this.renderEnemies(enemies)
    this.renderProjectiles(this.projectiles.getAll())

    // Camera shake.
    if (this.runState.cameraShake > 0) {
      this.cameras.main.shake(50, 0.005 * Math.min(1, this.runState.cameraShake / 0.5))
    }
  }

  private castSkill(slot: 0 | 1): void {
    const skillId = this.loadout.equipped[slot]
    if (!skillId) return
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

  private onWaveComplete(wave: number): void {
    this.runState.paused = true
    const offer = WaveBuffSystem.rollOffer(this.rng, 3)
    this.bus.emit('wave:buff:offer', { wave, buffIds: offer.map((b) => b.id) })
  }

  private onBuffPick(buffId: string): void {
    if (!this.runState.paused) return
    WaveBuffSystem.apply(buffId, this.runState, this.player)
    this.recomputeStats()
    this.bus.emit('player:hp:changed', { hp: this.player.hp, maxHp: this.player.maxHp })
    this.runState.paused = false
    this.bus.emit('wave:resume', { wave: this.runState.wave })
    this.waves.startNextWave()
  }

  private recomputeStats(): void {
    this.stats = BuffSystem.computeStats({
      ownedSkills: this.loadout.ownedSkills,
      runBuffs: this.runState.runBuffs,
      equippedWeaponId: this.loadout.weaponId,
      weaponLevel: this.loadout.weaponLevel,
    })
  }

  /** Pull the current run loadout from the save. Falls back to defaults if
   *  the player hasn't equipped anything yet. */
  private computeLoadout(): RunLoadout {
    const save = this.services.save
    const owned = save.skills.owned
    const equipped: [string | null, string | null] = [
      save.skills.equipped[0] ?? null,
      save.skills.equipped[1] ?? null,
    ]
    const weaponId = save.cosmetics.sword.equipped
    const weaponLevel = save.weaponLevels[weaponId] ?? 1
    return {
      ownedSkills: owned,
      equipped,
      weaponId,
      weaponLevel,
    }
  }

  private onCombatHit(targetId: string, dmg: number, crit: boolean): void {
    const enemy = this.waves.getEnemies().find((e) => e.id === targetId)
    if (!enemy) return
    const text = (crit ? 'CRIT! -' : '-') + Math.ceil(dmg)
    this.spawnDamagePopup(enemy.x, enemy.y - 50, text, crit)
  }

  private onEnemyDeath(enemyId: string, byPlayer: boolean): void {
    const enemy = this.waves.getEnemies().find((e) => e.id === enemyId)
    if (!enemy) return
    const type = getEnemyType(enemy.typeId)
    const aliveCount = this.waves.getEnemies().reduce((n, e) => n + (e.hp > 0 ? 1 : 0), 0)
    this.gore.addKill({
      x: enemy.x,
      y: enemy.y,
      color: hexToNum(type.color),
      scale: type.scale,
      knockbackX: -enemy.vx * 0.3,
      knockbackY: -enemy.vy * 0.3,
      aliveEnemies: aliveCount,
    })
    this.runState.cameraShake = Math.max(this.runState.cameraShake, aliveCount > 8 ? 0.08 : 0.16)

    if (!byPlayer) return
    const goldGain = Math.floor(type.goldReward * this.stats.goldMul)
    this.runState.gold += goldGain
    this.runState.kills += 1
    this.bus.emit('gold:changed', { gold: this.runState.gold, delta: goldGain })
    this.bus.emit('kills:changed', { kills: this.runState.kills })
    this.spawnDamagePopup(enemy.x, enemy.y - 70, `+${goldGain} 🪙`, false, '#ffd54a')

    // Vampire passive.
    if (
      this.loadout.ownedSkills.includes('vampire') &&
      this.player.hp > 0 &&
      this.player.hp < this.player.maxHp
    ) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + VAMPIRE_HEAL_PER_KILL)
      this.bus.emit('player:hp:changed', { hp: this.player.hp, maxHp: this.player.maxHp })
    }
  }

  /** Spawn a floating combat number above an enemy. Auto-despawns after 700ms. */
  private spawnDamagePopup(
    x: number,
    y: number,
    text: string,
    crit: boolean,
    color?: string,
  ): void {
    const MAX = 14
    if (this.activePopups >= MAX && !crit) return
    if (this.activePopups >= MAX * 1.5) return
    const txt = this.add
      .text(x, y, text, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: crit ? '20px' : '14px',
        color: color ?? (crit ? '#ff5050' : '#ffffff'),
        fontStyle: crit ? 'bold' : 'normal',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(1000)
    this.activePopups++
    this.tweens.add({
      targets: txt,
      y: y - 30,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        txt.destroy()
        this.activePopups--
      },
    })
  }

  private renderObstacles(obstacles: readonly Obstacle[]): void {
    const g = this.obstacleGraphics
    g.clear()
    for (const o of obstacles) ObstacleRenderer.draw(g, o)
  }

  private renderGore(): void {
    const floor = this.goreFloorGraphics
    const parts = this.gorePartsGraphics
    floor.clear()
    parts.clear()
    for (const pool of this.gore.getBloodPools()) GoreRenderer.drawBloodPool(floor, pool)
    for (const corpse of this.gore.getCorpses()) GoreRenderer.drawCorpse(floor, corpse)
    for (const bp of this.gore.getBodyParts()) GoreRenderer.drawBodyPart(parts, bp)
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

  private renderProjectiles(projectiles: readonly Projectile[]): void {
    const g = this.projectileGraphics
    g.clear()
    for (const p of projectiles) {
      if (p.type === 'spear') {
        // Triangle pointing along velocity, with a small "shaft".
        const angle = Math.atan2(p.vy, p.vx)
        const tipLen = 16
        const tx = p.x + Math.cos(angle) * tipLen
        const ty = p.y + Math.sin(angle) * tipLen
        const bx = p.x - Math.cos(angle) * tipLen * 0.6
        const by = p.y - Math.sin(angle) * tipLen * 0.6
        g.lineStyle(3, 0x5a3a1a, 1)
        g.beginPath()
        g.moveTo(bx, by)
        g.lineTo(tx, ty)
        g.strokePath()
        g.fillStyle(0xcfd8dc, 1)
        g.fillCircle(tx, ty, 3)
      } else {
        // Default: glowing orb.
        g.fillStyle(0x5a30b0, 0.4)
        g.fillCircle(p.x, p.y, p.radius * 1.6)
        g.fillStyle(0xa872f0, 1)
        g.fillCircle(p.x, p.y, p.radius)
        g.fillStyle(0xffffff, 0.85)
        g.fillCircle(p.x, p.y, p.radius * 0.45)
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
    this.persistRunResults().catch((err) => console.error('[arena] save persist failed:', err))
    this.scene.start('GameOver', { runState: this.runState })
  }

  private async persistRunResults(): Promise<void> {
    const save = this.services.save
    save.gold += this.runState.gold
    save.totalKills += this.runState.kills
    if (this.runState.wave > save.bestWave) save.bestWave = this.runState.wave
    await this.services.saveStore.save(save)
  }

  private cleanup(): void {
    for (const off of this.busUnsubs) off()
    this.busUnsubs = []
    for (const g of this.enemyGraphics.values()) g.destroy()
    this.enemyGraphics.clear()
    this.projectiles?.clear()
    this.gore?.clear()
    this.obstacleSys?.clear()
  }
}

function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16)
}
