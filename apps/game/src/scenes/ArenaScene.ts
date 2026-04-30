import {
  type AccessoryKind,
  type ClothingKind,
  type WeaponShape,
  attackPatterns,
  getAura,
  getEnemyType,
  getSkin,
  getWeapon,
} from '@stick/content'
import {
  ARENA,
  BuffSystem,
  CAM_ZOOM,
  CombatSystem,
  type Enemy,
  EnemySystem,
  type EffectiveStats,
  type Obstacle,
  ObstacleSystem,
  type Player,
  type Projectile,
  ProjectileSystem,
  type RunState,
  SWORD_TORNADO_DMG_MUL,
  SWORD_TORNADO_RADIUS,
  SWORD_TORNADO_TICK_SEC,
  SkillSystem,
  VAMPIRE_HEAL_PER_KILL,
  WaveBuffSystem,
  WaveSystem,
  createPlayer,
  createRunState,
  requestHitStop,
  tickHitStop,
  timeSeed,
  updateMovement,
} from '@stick/sim'

import { dtFromPhaser } from '../app/time'
import { ApiClient } from '../platform/api'
import { RunQueue } from '../platform/runQueue'
import { type ArenaProps, ArenaPropsRenderer } from '../render/ArenaPropsRenderer'
import { DeathFxRenderer } from '../render/DeathFxRenderer'
import { GoreRenderer } from '../render/GoreRenderer'
import { ObstacleRenderer } from '../render/ObstacleRenderer'
import { ParticleRenderer } from '../render/ParticleRenderer'
import { StickmanRenderer } from '../render/StickmanRenderer'
import { TelegraphRenderer } from '../render/TelegraphRenderer'
import { DeathFxSystem } from '../systems/DeathFxSystem'
import { GoreSystem } from '../systems/GoreSystem'
import { ParticleSystem } from '../systems/ParticleSystem'

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
  private particles!: ParticleSystem
  private deathFx!: DeathFxSystem
  private stickman!: StickmanRenderer
  private dustAcc = 0
  private arenaProps!: ArenaProps
  private arenaPropsGraphics!: Phaser.GameObjects.Graphics

  private playerGraphics!: Phaser.GameObjects.Graphics
  private enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>()
  private projectileGraphics!: Phaser.GameObjects.Graphics
  private goreFloorGraphics!: Phaser.GameObjects.Graphics
  private gorePartsGraphics!: Phaser.GameObjects.Graphics
  private obstacleGraphics!: Phaser.GameObjects.Graphics
  private particleGraphics!: Phaser.GameObjects.Graphics
  private telegraphGraphics!: Phaser.GameObjects.Graphics
  private deathFxGraphics!: Phaser.GameObjects.Graphics
  private auraGraphics!: Phaser.GameObjects.Graphics

  private tornadoTickAcc = 0
  private busUnsubs: Array<() => void> = []
  private activePopups = 0
  /** Wall-clock seconds since the last hit-stop landed. Used to throttle
   *  freeze frames so AOE / fast combos don't turn the game into slideshow. */
  private hitStopCooldown = 0
  /** Reusable scratch buffer for the pure hitStop helpers (avoid per-frame allocs). */
  private readonly hitStopState = { hitStop: 0, cooldown: 0 }
  private loadout!: RunLoadout
  private lastAliveCount = -1
  private currentWaveTotal = 0
  private playerSkinColor = 0x000000
  private playerWeaponShape: { shape: WeaponShape; blade: number } | undefined
  private auraColor = 0xffd54a
  private playerClothing: ClothingKind = 'tunic'
  private playerClothingColor: number | undefined
  private playerAccessory: AccessoryKind = 'none'

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(ArenaScene.KEY, services)
  }

  create(): void {
    // ---- Loadout from save ----
    this.loadout = this.computeLoadout()
    this.refreshCosmetics()

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
    this.projectiles = new ProjectileSystem({
      bus: this.bus,
      // Player arrows collide against the live enemy list.
      getEnemies: () => this.waves.getEnemies(),
      // Boss-sized enemies get a proportionally larger hit radius so arrows
      // don't feel like they whiff against obvious targets.
      getHitRadius: (e) => {
        const enemy = e as { typeId?: string }
        if (typeof enemy.typeId !== 'string') return 26
        const type = getEnemyType(enemy.typeId)
        return 26 * (type.scale ?? 1)
      },
    })
    this.obstacleSys = new ObstacleSystem({ bus: this.bus, rng: this.rng })
    this.obstacleSys.generate()
    this.combat = new CombatSystem({
      bus: this.bus,
      attackPatterns,
      getEnemies: () => this.waves.getEnemies(),
      getDmgMul: () => this.stats.dmgMul,
      getCritChance: () => this.stats.critChance,
      rngNext: () => this.rng.next(),
      onSwing: (ctx) =>
        this.obstacleSys.applyMeleeSwing({
          ...ctx,
          enemies: this.waves.getEnemies(),
          player: this.player,
        }),
      onShoot: (opts) =>
        this.projectiles.spawn({
          type: 'arrow',
          x: opts.x,
          y: opts.y,
          dirX: opts.dirX,
          dirY: opts.dirY,
          speed: opts.speed,
          dmg: opts.dmg,
          life: opts.life,
          radius: opts.radius,
          ownerId: 'player',
        }),
    })
    this.enemySys = new EnemySystem({
      bus: this.bus,
      rng: this.rng,
      projectiles: this.projectiles,
    })
    this.skillSystem = new SkillSystem({ bus: this.bus })
    this.gore = new GoreSystem({ rng: this.rng })
    this.particles = new ParticleSystem({ rng: this.rng })
    this.deathFx = new DeathFxSystem()
    this.stickman = new StickmanRenderer()

    // ---- Arena visuals ----
    // Industrial floor (legacy 2076-2105). Bright concrete-grey gradient with
    // metal grid + rivets — the player and stickmen pop dark against it.
    this.arenaProps = ArenaPropsRenderer.generate({ width: ARENA.width, height: ARENA.height })
    this.arenaPropsGraphics = this.add.graphics()

    // Floor layer (blood pools, corpses) goes BELOW the player and parts.
    this.goreFloorGraphics = this.add.graphics()
    // Telegraph decals sit above the floor + gore but below the actors so the
    // stickmen visually stand on the warning, not under it.
    this.telegraphGraphics = this.add.graphics()
    this.obstacleGraphics = this.add.graphics()
    this.gorePartsGraphics = this.add.graphics()
    // Player aura sits below the stickman so it reads as a glow around them,
    // not on top. Drawn each frame in update() if combo > 0 or tornado active.
    this.auraGraphics = this.add.graphics()
    this.playerGraphics = this.add.graphics()
    this.projectileGraphics = this.add.graphics()
    // Particles render on top of everything except popups.
    this.particleGraphics = this.add.graphics()
    this.particleGraphics.setDepth(900)
    // Death FX (white flash + ring) sit on top of particles so the kill
    // pop reads even through smoke.
    this.deathFxGraphics = this.add.graphics()
    this.deathFxGraphics.setDepth(950)

    // ---- Camera ----
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height)
    this.cameras.main.setZoom(CAM_ZOOM)
    this.cameras.main.startFollow(this.playerGraphics, true, 0.15, 0.15)
    // Off-arena background (the area outside the playable rect when camera
    // shows beyond the bounds) — keep the same dark fill.
    this.cameras.main.setBackgroundColor('#0e1317')

    // ---- Bus wiring ----
    this.busUnsubs.push(
      this.bus.on('input:attack', () => {
        if (!this.runState.paused) this.combat.tryAttack(this.player)
      }),
      this.bus.on('input:shoot', () => {
        if (!this.runState.paused) this.combat.tryShoot(this.player)
      }),
      this.bus.on('input:skill', ({ slot }) => {
        if (!this.runState.paused) this.castSkill(slot)
      }),
      this.bus.on('enemy:death', ({ enemyId, byPlayer }) => this.onEnemyDeath(enemyId, byPlayer)),
      this.bus.on('combat:hit', ({ attackerId, targetId, dmg, crit }) =>
        this.onCombatHit(attackerId, targetId, dmg, crit),
      ),
      this.bus.on('skill:cast', ({ skillId }) => this.onSkillCast(skillId)),
      this.bus.on('combo:finisher', () => this.onComboFinisher()),
      this.bus.on('obstacle:explode', ({ x, y }) => {
        this.particles.spawnShockwave(x, y, 0xff8000, 24)
        this.particles.spawnAuraBurst(x, y, 0xffe080, 16)
        this.runState.cameraShake = 0.5
        this.runState.slowMo = 0.16
      }),
      this.bus.on('wave:start', ({ wave, totalEnemies }) => {
        this.runState.wave = wave
        this.currentWaveTotal = totalEnemies
        this.lastAliveCount = -1
      }),
      this.bus.on('ui:pause:toggle', () => {
        this.runState.paused = !this.runState.paused
      }),
      this.bus.on('ui:pause:set', ({ paused }) => {
        this.runState.paused = paused
      }),
      this.bus.on('wave:complete', ({ wave }) => this.onWaveComplete(wave)),
      this.bus.on('wave:buff:pick', ({ buffId }) => this.onBuffPick(buffId)),
      this.bus.on('player:death', () => this.endRun('death')),
    )

    this.input.keyboard?.on('keydown-ESC', () => this.endRun('quit'))
    this.input.keyboard?.on('keydown-P', () => this.bus.emit('ui:pause:toggle', {}))

    // ---- Initial HUD population ----
    this.bus.emit('ui:scene:enter', { name: 'arena' })
    this.bus.emit('run:start', { seed: this.runState.seed })
    this.bus.emit('gold:changed', { gold: this.runState.gold, delta: 0 })
    this.bus.emit('player:hp:changed', { hp: this.player.hp, maxHp: this.player.maxHp })
    this.bus.emit('skills:equipped', {
      slot0: this.loadout.equipped[0],
      slot1: this.loadout.equipped[1],
    })
    this.emitStats()

    this.waves.startNextWave()

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  override update(_time: number, deltaMs: number): void {
    const realDt = dtFromPhaser(deltaMs)
    if (this.runState.paused) return
    this.runState.elapsed += realDt

    // Hit-stop decays on REAL dt; the helper also drains the throttle window
    // so AOE / over-buffed players can't stack freezes into a slideshow.
    this.hitStopState.hitStop = this.runState.hitStop
    this.hitStopState.cooldown = this.hitStopCooldown
    tickHitStop(this.hitStopState, realDt)
    this.runState.hitStop = this.hitStopState.hitStop
    this.hitStopCooldown = this.hitStopState.cooldown
    // Decay slow-mo on REAL dt; scale gameplay dt while active (legacy 1318: 0.4×).
    if (this.runState.slowMo > 0) {
      this.runState.slowMo = Math.max(0, this.runState.slowMo - realDt)
    }
    const dt = this.runState.hitStop > 0 ? 0 : this.runState.slowMo > 0 ? realDt * 0.4 : realDt

    // Decay other run-state timers on the (possibly slowed) dt.
    if (this.runState.cameraShake > 0) {
      this.runState.cameraShake = Math.max(0, this.runState.cameraShake - dt)
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
    this.particles.update(dt)
    this.deathFx.update(dt)
    ArenaPropsRenderer.update(this.arenaProps, dt, (lo, hi) => this.rng.float(lo, hi))

    // Footstep dust while running.
    const speed = Math.hypot(this.player.vx, this.player.vy)
    if (speed > 1.5 && this.player.dashTimer <= 0) {
      this.dustAcc += dt
      if (this.dustAcc > 0.12) {
        this.dustAcc = 0
        this.particles.spawnDust(this.player.x + this.rng.float(-6, 6), this.player.y + 26)
      }
    } else {
      this.dustAcc = 0
    }

    // Emit alive-enemies change for HUD wave progress.
    const alive = this.waves.getEnemies().length
    if (alive !== this.lastAliveCount) {
      this.lastAliveCount = alive
      this.bus.emit('wave:enemies:changed', { alive, total: this.currentWaveTotal })
    }

    // Player & enemy collision against obstacles.
    this.obstacleSys.applyPlayerCollision(this.player)
    for (const e of enemies)
      this.obstacleSys.applyCollision(e, 16 * (getEnemyType(e.typeId).scale || 1))

    // Camera look-ahead: nudge the camera ~36px toward the player's heading,
    // smoothed exponentially so it tracks but doesn't twitch on direction
    // changes. setFollowOffset uses an inverted sign (negative offset shifts
    // the view in the +direction).
    {
      const vmag = Math.hypot(this.player.vx, this.player.vy)
      const moving = vmag > 0.4
      const targetOffsetX = moving ? -(this.player.vx / Math.max(vmag, 1)) * 36 : 0
      const targetOffsetY = moving ? -(this.player.vy / Math.max(vmag, 1)) * 36 : 0
      const cur = this.cameras.main.followOffset
      const lerp = 1 - Math.pow(0.001, dt) // ~ time-rate 60% per second
      cur.x += (targetOffsetX - cur.x) * lerp
      cur.y += (targetOffsetY - cur.y) * lerp
    }

    // Render.
    this.arenaPropsGraphics.clear()
    ArenaPropsRenderer.drawFloor(this.arenaPropsGraphics, this.arenaProps)
    this.renderGore()
    this.telegraphGraphics.clear()
    TelegraphRenderer.draw(this.telegraphGraphics, enemies, (e) => {
      const behaviors = getEnemyType(e.typeId).behaviors
      return behaviors.includes('rangedKite') ? 'ranged' : 'melee'
    })
    this.renderObstacles(this.obstacleSys.getAll())
    this.particleGraphics.clear()
    ParticleRenderer.draw(this.particleGraphics, this.particles.getAll())
    this.deathFxGraphics.clear()
    DeathFxRenderer.draw(this.deathFxGraphics, this.deathFx.getAll())

    // Aura around the player (legacy drawAura 3649-3663). Visible when combo
    // is rolling or the sword tornado is active. Intensity scales with combo.
    this.auraGraphics.clear()
    this.drawPlayerAura()

    this.playerGraphics.setPosition(this.player.x, this.player.y)
    this.stickman.draw(this.playerGraphics, {
      ...this.player,
      color: this.playerSkinColor,
      clothing: this.playerClothing,
      accessory: this.playerAccessory,
      ...(this.playerClothingColor !== undefined
        ? { clothingColor: this.playerClothingColor }
        : {}),
      ...(this.playerWeaponShape ? { weapon: this.playerWeaponShape } : {}),
    })
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
    this.emitStats()
  }

  /** Push the current effective stats onto the bus so the HUD chips update. */
  private emitStats(): void {
    this.bus.emit('stats:changed', {
      maxHp: this.stats.maxHp,
      dmgMul: this.stats.dmgMul,
      atkSpeedMul: this.stats.atkSpeedMul,
      critChance: this.stats.critChance,
      regenPerSec: this.stats.regenPerSec,
      knockbackMul: this.stats.knockbackMul,
      goldMul: this.stats.goldMul,
    })
  }

  /** Read skin color + weapon shape + aura color from save.cosmetics. */
  private refreshCosmetics(): void {
    const save = this.services.save
    try {
      const skin = getSkin(save.cosmetics.char.equipped)
      this.playerSkinColor = hexToNum(skin.color)
      this.playerClothing = skin.clothing
      this.playerClothingColor = skin.clothingColor ? hexToNum(skin.clothingColor) : undefined
      this.playerAccessory = skin.accessory
    } catch {
      this.playerSkinColor = 0x000000
      this.playerClothing = 'tunic'
      this.playerClothingColor = undefined
      this.playerAccessory = 'none'
    }
    try {
      const weapon = getWeapon(this.loadout.weaponId)
      this.playerWeaponShape = { shape: weapon.shape, blade: hexToNum(weapon.blade) }
    } catch {
      this.playerWeaponShape = undefined
    }
    try {
      const aura = getAura(save.cosmetics.aura.equipped)
      this.auraColor = aura.color === 'rainbow' ? 0xff80ff : hexToNum(aura.color)
    } catch {
      this.auraColor = 0xffd54a
    }
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

  private onCombatHit(attackerId: string, targetId: string, dmg: number, crit: boolean): void {
    const enemy = this.waves.getEnemies().find((e) => e.id === targetId)
    if (!enemy) return
    const text = (crit ? 'CRIT! -' : '-') + Math.ceil(dmg)
    this.spawnDamagePopup(enemy.x, enemy.y - 50, text, crit)
    // Slash sparks + blood splatter at impact.
    const dirX = this.player.attackDirX
    const dirY = this.player.attackDirY
    this.particles.spawnSlashFx(enemy.x, enemy.y - 18, dirX, dirY, this.auraColor)
    this.particles.spawnBlood(enemy.x, enemy.y - 18, dirX, dirY, crit ? 18 : 10)

    // Hit-stop only on direct player swings (not on AOE / DOT ticks). A swing
    // is "primary" when the player is mid-attack from CombatSystem; tornado,
    // skills, projectiles and obstacle blasts hit while no swing is active.
    // Killing blows go through onEnemyDeath instead.
    const isKill = enemy.hp <= 0
    const isPrimary =
      attackerId === 'player' && this.player.attackTimer > 0 && this.player.attackKind !== null
    if (isPrimary && !isKill) {
      this.requestHitStop(crit ? 0.09 : 0.05)
    }

    // Shake scales with damage (clamped). Crits add a floor. AOE ticks get a
    // softer cap so 10 simultaneous hits don't pin the camera at max.
    const shakeCap = isPrimary ? 0.35 : 0.12
    const dmgShake = Math.min(shakeCap, Math.max(0.05, dmg / 80))
    const shake = crit && isPrimary ? Math.max(dmgShake, 0.22) : dmgShake
    this.runState.cameraShake = Math.max(this.runState.cameraShake, shake)

    if (crit && isPrimary) {
      this.runState.slowMo = Math.max(this.runState.slowMo, 0.08)
    }
  }

  /**
   * Apply a hit-stop with throttle + cap (delegates to the pure helper).
   * Skipped if another freeze landed in the last 80ms; resulting freeze is
   * capped at 0.18s total.
   */
  private requestHitStop(duration: number): void {
    this.hitStopState.hitStop = this.runState.hitStop
    this.hitStopState.cooldown = this.hitStopCooldown
    if (requestHitStop(this.hitStopState, duration)) {
      this.runState.hitStop = this.hitStopState.hitStop
      this.hitStopCooldown = this.hitStopState.cooldown
    }
  }

  /**
   * Player aura — soft radial glow around the actor. Intensity grows with
   * combo (matches legacy `0.5 + combo * 0.05`, capped at 1.4) and pulses
   * up to 1.6 while the sword tornado is active. Hidden when combo is 0
   * and no skill is running so the silhouette stays clean in idle.
   */
  private drawPlayerAura(): void {
    // Active when the combo window hasn't expired or the sword tornado
    // is going. Intensity scales with combo step so chaining attacks pumps
    // the glow up.
    const inCombo = this.player.attackStepTimer > 0 && this.player.attackStep > 0
    const tornadoActive = this.runState.tornadoTimer > 0
    if (!inCombo && !tornadoActive) return
    let intensity = inCombo ? Math.min(1.4, 0.5 + this.player.attackStep * 0.15) : 0.6
    if (tornadoActive) intensity = Math.max(intensity, 1.6)

    const cx = this.player.x
    const cy = this.player.y - 18
    const baseR = 38
    const g = this.auraGraphics
    const color = this.auraColor
    // Three concentric discs of decreasing radius / increasing alpha to
    // approximate a radial gradient on Phaser Graphics (no native gradient).
    g.fillStyle(color, 0.1 * intensity)
    g.fillCircle(cx, cy, baseR * 1.2 * intensity)
    g.fillStyle(color, 0.18 * intensity)
    g.fillCircle(cx, cy, baseR * 0.9 * intensity)
    g.fillStyle(color, 0.28 * intensity)
    g.fillCircle(cx, cy, baseR * 0.55 * intensity)
  }

  /** Final attack of the combo cycle — gold flash + extended hit-stop +
   *  bigger camera shake. Pure feel — gameplay damage already happened in
   *  CombatSystem. */
  private onComboFinisher(): void {
    this.particles.spawnAuraBurst(this.player.x, this.player.y - 24, 0xffd54a, 36)
    this.particles.spawnShockwave(this.player.x, this.player.y - 18, 0xffd54a, 24)
    this.requestHitStop(0.14)
    this.runState.cameraShake = Math.max(this.runState.cameraShake, 0.32)
    this.runState.slowMo = Math.max(this.runState.slowMo, 0.12)
  }

  private onSkillCast(_skillId: string): void {
    // Aura burst around the player whenever a skill fires.
    this.particles.spawnAuraBurst(this.player.x, this.player.y - 24, this.auraColor, 30)
    if (_skillId === 'groundPound') {
      this.particles.spawnShockwave(this.player.x, this.player.y, this.auraColor, 32)
    }
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
    // Death stop scales with size — bosses freeze harder. Throttled so a wave
    // of simultaneous deaths (AOE wipe) doesn't compound into a long slideshow.
    const deathStop = type.scale >= 1.3 ? 0.18 : 0.1
    this.requestHitStop(deathStop)

    // Death pop: white core flash + expanding ring. Adds a small particle
    // shockwave so the kill reads even when many enemies die at once.
    this.deathFx.add({ x: enemy.x, y: enemy.y, scale: type.scale })
    this.particles.spawnShockwave(enemy.x, enemy.y - 18, 0xffffff, type.scale >= 1.3 ? 18 : 10)

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

  /** Spawn a floating combat number above an enemy. Size scales with the
   *  amount, arcs up-and-sideways with Back.easeOut so the number "pops"
   *  before fading. Auto-despawns after 800ms. */
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

    // Pull the numeric magnitude from the leading "-N" / "+N" so the visual
    // weight tracks actual damage. Falls back to mid-size if it can't parse.
    const numMatch = /(\d+(?:\.\d+)?)/.exec(text)
    const dmgValue = numMatch ? parseFloat(numMatch[1]!) : 10
    // Map dmg → font size: 12px floor, 28px ceiling, crits get +6px floor.
    const baseSize = Math.max(12, Math.min(28, 11 + dmgValue * 0.18))
    const fontSize = crit ? Math.max(20, baseSize + 6) : baseSize

    // Arc: each popup picks a small lateral drift so multiples don't stack.
    const driftX = (this.rng.next() - 0.5) * 36
    const peakY = y - 40 - (crit ? 12 : 0)

    const txt = this.add
      .text(x, y, text, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: `${Math.round(fontSize)}px`,
        color: color ?? (crit ? '#ff5050' : '#ffffff'),
        fontStyle: crit ? 'bold' : 'normal',
        stroke: '#000000',
        strokeThickness: crit ? 4 : 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(1000)
      .setScale(0.6)
    this.activePopups++

    // Scale-in pop (Back.easeOut), then arc up + fade out.
    this.tweens.add({
      targets: txt,
      scale: crit ? 1.15 : 1,
      duration: 140,
      ease: 'Back.easeOut',
    })
    this.tweens.add({
      targets: txt,
      x: x + driftX,
      y: peakY,
      duration: 380,
      ease: 'Quad.easeOut',
    })
    this.tweens.add({
      targets: txt,
      alpha: 0,
      duration: 380,
      delay: 420,
      ease: 'Cubic.easeIn',
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
          clothing: type.clothing,
          accessory: type.accessory,
          ...(type.clothingColor ? { clothingColor: hexToNum(type.clothingColor) } : {}),
        },
        type.scale,
      )
      // HP bar — only when wounded, drawn after the stickman so it sits on
      // top. Drawn into the same Graphics (already cleared by stickman.draw
      // and now extended).
      if (e.hp > 0 && e.hp < e.maxHp) {
        const barW = 36 * type.scale
        const barH = 4
        const barY = -68 * type.scale
        const pct = Math.max(0, Math.min(1, e.hp / e.maxHp))
        // Background.
        g.fillStyle(0x000000, 0.7)
        g.fillRect(-barW / 2, barY, barW, barH)
        // Fill.
        g.fillStyle(0xff5050, 1)
        g.fillRect(-barW / 2, barY, barW * pct, barH)
        // Outline.
        g.lineStyle(1, 0x000000, 0.8)
        g.strokeRect(-barW / 2, barY, barW, barH)
      }
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
      } else if (p.type === 'arrow') {
        // Player arrow: thin shaft + steel tip + red fletching at tail.
        const angle = Math.atan2(p.vy, p.vx)
        const len = 18
        const tx = p.x + Math.cos(angle) * len
        const ty = p.y + Math.sin(angle) * len
        const bx = p.x - Math.cos(angle) * len * 0.5
        const by = p.y - Math.sin(angle) * len * 0.5
        // Wood shaft.
        g.lineStyle(2, 0xa06820, 1)
        g.beginPath()
        g.moveTo(bx, by)
        g.lineTo(tx, ty)
        g.strokePath()
        // Steel tip (triangle).
        const tipBackX = tx - Math.cos(angle) * 4
        const tipBackY = ty - Math.sin(angle) * 4
        const perp = angle + Math.PI / 2
        const tw = 2.2
        g.fillStyle(0xcfd8dc, 1)
        g.fillTriangle(
          tx,
          ty,
          tipBackX + Math.cos(perp) * tw,
          tipBackY + Math.sin(perp) * tw,
          tipBackX - Math.cos(perp) * tw,
          tipBackY - Math.sin(perp) * tw,
        )
        // Red fletching at the tail.
        g.fillStyle(0xc41a1a, 1)
        const fperp = angle + Math.PI / 2
        const fX1 = bx + Math.cos(fperp) * 3
        const fY1 = by + Math.sin(fperp) * 3
        const fX2 = bx - Math.cos(fperp) * 3
        const fY2 = by - Math.sin(fperp) * 3
        const fbx = bx - Math.cos(angle) * 4
        const fby = by - Math.sin(angle) * 4
        g.fillTriangle(bx, by, fX1, fY1, fbx, fby)
        g.fillTriangle(bx, by, fX2, fY2, fbx, fby)
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
    this.persistRunResults(reason).catch((err) =>
      console.error('[arena] save persist failed:', err),
    )
    this.scene.start('GameOver', { runState: this.runState })
  }

  private async persistRunResults(reason: 'death' | 'quit'): Promise<void> {
    const save = this.services.save
    save.gold += this.runState.gold
    save.totalKills += this.runState.kills
    if (this.runState.wave > save.bestWave) save.bestWave = this.runState.wave
    await this.services.saveStore.save(save)

    // Submit to leaderboard (or queue offline if backend isn't reachable).
    if (this.runState.wave < 1) return

    const buffsRecord: Record<string, number> = { ...this.runState.runBuffs }
    const report = {
      seed: this.runState.seed,
      wave: this.runState.wave,
      kills: this.runState.kills,
      gold: this.runState.gold,
      durationSec: this.runState.elapsed,
      weapon: this.loadout.weaponId,
      buffs: buffsRecord,
      reason,
      ...(save.playerName ? { playerName: save.playerName } : {}),
    }

    if (!ApiClient.isConfigured()) {
      this.bus.emit('run:submitted', { status: 'no-backend', rank: null, runId: null })
      return
    }

    const result = await ApiClient.submitRun(report)
    if (!result) {
      RunQueue.enqueue(report)
      this.bus.emit('run:submitted', { status: 'queued', rank: null, runId: null })
      return
    }
    this.bus.emit('run:submitted', {
      status: 'accepted',
      rank: result.rank,
      runId: result.runId,
    })
    // Opportunistically flush any backlog now that we know the API is up.
    void RunQueue.flush()
  }

  private cleanup(): void {
    for (const off of this.busUnsubs) off()
    this.busUnsubs = []
    for (const g of this.enemyGraphics.values()) g.destroy()
    this.enemyGraphics.clear()
    this.projectiles?.clear()
    this.gore?.clear()
    this.obstacleSys?.clear()
    this.particles?.clear()
    this.deathFx?.clear()
  }
}

function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16)
}
