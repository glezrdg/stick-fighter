import { type AttackKind, getAura, getEnemyType, getSkin, getWeapon } from '@stick/content'
import type {
  NetCosmetics,
  NetEnemy,
  NetObstacle,
  NetPlayer,
  NetProjectile,
  StateMsg,
} from '@stick/shared'
import { ARENA, CAM_ZOOM, type Obstacle } from '@stick/sim'

import { netClient, type RoomSnapshot } from '../net/NetClient'
import { ApiClient } from '../platform/api'
import { RunQueue } from '../platform/runQueue'
import { type ArenaProps, ArenaPropsRenderer } from '../render/ArenaPropsRenderer'
import { DeathFxRenderer } from '../render/DeathFxRenderer'
import { GoreRenderer } from '../render/GoreRenderer'
import { ObstacleRenderer } from '../render/ObstacleRenderer'
import { ParticleRenderer } from '../render/ParticleRenderer'
import { StickmanRenderer, type StickmanRenderState } from '../render/StickmanRenderer'
import { DeathFxSystem } from '../systems/DeathFxSystem'
import { GoreSystem } from '../systems/GoreSystem'
import { ParticleSystem } from '../systems/ParticleSystem'

import { BaseScene } from './BaseScene'

const VALID_KINDS: ReadonlySet<AttackKind> = new Set([
  'slashR',
  'slashL',
  'kick',
  'uppercut',
  'chop',
  'spin',
])

function coerceKind(s: string): AttackKind | null {
  return VALID_KINDS.has(s as AttackKind) ? (s as AttackKind) : null
}

/** Per-actor (player or enemy) HUD container: HP bar + name label. */
interface ActorOverlay {
  /** Background bar (dark slot). */
  hpBg: Phaser.GameObjects.Rectangle
  /** Filled portion (color = green/yellow/red by hp%). */
  hpFill: Phaser.GameObjects.Rectangle
  /** Optional name (players only). Null for enemies. */
  name: Phaser.GameObjects.Text | null
  /** Last hp seen — diffed each tick to spawn damage popups. */
  lastHp: number
}

/**
 * Multiplayer arena scene — render-only.
 *
 * Server is authoritative; this scene reads `RoomSnapshot.state` and draws.
 * No tickArena() runs locally. Polish layer:
 *   - Names + "vos" indicator over each player
 *   - HP bars (player + enemy) with damage flashes
 *   - Damage popups when HP drops
 *   - Particles when enemies die or get hit (detected via state diff)
 *   - HUD wave/gold/alive piped through the bus so HudRoot reacts as in SP
 *   - Gameover screen when both players reach 0 HP / server says phase=gameover
 */
export class NetArenaScene extends BaseScene {
  static readonly KEY = 'NetArena'

  private playerGraphics!: Phaser.GameObjects.Graphics
  /** Aura glow alrededor de cada player. Se dibuja debajo de los actores. */
  private auraGraphics!: Phaser.GameObjects.Graphics
  /** Layer para projectiles (flechas + orbs + fireballs). */
  private projectileGraphics!: Phaser.GameObjects.Graphics
  private enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>()
  private peerGraphics = new Map<string, Phaser.GameObjects.Graphics>()
  private particleGraphics!: Phaser.GameObjects.Graphics
  private arenaPropsGraphics!: Phaser.GameObjects.Graphics
  private arenaProps!: ArenaProps
  /** Floor-level gore (blood pools, corpses). Drawn below actors. */
  private goreFloorGraphics!: Phaser.GameObjects.Graphics
  /** Mid-air gore (dismembered body parts). Drawn above actors briefly. */
  private gorePartsGraphics!: Phaser.GameObjects.Graphics
  /** Death white-flash + ring above where the enemy died. */
  private deathFxGraphics!: Phaser.GameObjects.Graphics
  /** Static arena obstacles (barrels/crates/columns). */
  private obstacleGraphics!: Phaser.GameObjects.Graphics

  private playerOverlays = new Map<string, ActorOverlay>()
  private enemyOverlays = new Map<string, ActorOverlay>()

  private stickman!: StickmanRenderer
  private particles!: ParticleSystem
  private gore!: GoreSystem
  private deathFx!: DeathFxSystem

  private busUnsubs: Array<() => void> = []
  private netUnsub: (() => void) | null = null
  private snap: RoomSnapshot = netClient.getSnapshot()
  private prevState: StateMsg | null = null

  /** Modo del render — debugging opt-in via query string. **Default 'unlocked'**
   *  porque cualquier cap o state-driven cuts también frenan las animaciones
   *  locales (partículas, props industriales, camera shake) que tickean per-
   *  frame, y eso EMPEORA la sensación general aunque los actores se vean
   *  igual. La solución real al stutter Adreno es interpolación cliente-side
   *  (Fase 4 del plan netcode) — render a 60fps lerpeando entre snapshots.
   *
   *  Modos disponibles via `?render=...`:
   *    - 'unlocked' (default): render cada frame Phaser, comportamiento legacy.
   *    - 'state-driven': skip si state.tick no cambió. Reduce CPU pero frena
   *      las animaciones locales — usar SOLO para tests de diagnóstico.
   *    - 'cap-fps': cap temporal con `?fps=N`. Idem disclaimer. */
  private renderMode: 'state-driven' | 'cap-fps' | 'unlocked' = 'unlocked'
  private renderFpsCap = 30
  private lastRenderTime = 0
  private lastRenderedTick = -1

  /** Posición lerpeada de la cámara, en coordenadas world. En multi el
   *  player local viene del server a 30Hz; si la cámara hace centerOn de
   *  esa posición directamente, el WORLD COMPLETO salta cada 33ms (porque
   *  todo es relativo a la cámara). El ojo percibe stutter aunque los
   *  actores estén bien. Smoothing → la cámara persigue suavemente y el
   *  movimiento se siente fluido a 60fps en cualquier device. Init al centro
   *  del arena en `create()`. */
  private cameraX = 0
  private cameraY = 0

  // HUD bus events tracking — emit only on change to avoid spamming the bus.
  private lastWave = -1
  private lastGold = -1
  private lastAlive = -1
  private lastTotal = -1

  // Game-feel timers (cosmetic only, never sync'd to server).
  private cameraShake = 0
  /** Combo local — se incrementa cuando self pega un hit cerca de un enemy.
   *  Drivea el counter del HUD igual que SP. Se resetea tras 1.5s sin pegar. */
  private localComboCount = 0
  private localComboResetTimer = 0

  // Edge buffers for the next sendInput() call.
  private pendingAttack = false
  private pendingShoot = false
  private pendingSkill: 0 | 1 | null = null

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(NetArenaScene.KEY, services)
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1f24')
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height)
    this.cameras.main.setZoom(CAM_ZOOM)
    this.cameras.main.centerOn(ARENA.width / 2, ARENA.height / 2)

    // Lectura de `?render=...` y `?fps=N` para tunear el render mode en prod.
    // Defaults: state-driven (solo render cuando hay state nuevo).
    if (typeof location !== 'undefined') {
      const params = new URLSearchParams(location.search)
      const mode = params.get('render')
      if (mode === 'cap-fps' || mode === 'unlocked' || mode === 'state-driven') {
        this.renderMode = mode
      }
      const raw = params.get('fps')
      if (raw) {
        const parsed = parseInt(raw, 10)
        if (Number.isFinite(parsed)) this.renderFpsCap = Math.max(10, Math.min(144, parsed))
      }
    }
    this.lastRenderTime = 0
    this.lastRenderedTick = -1
    this.cameraX = ARENA.width / 2
    this.cameraY = ARENA.height / 2

    this.bus.emit('ui:scene:enter', { name: 'arena' })

    this.stickman = new StickmanRenderer()
    this.particles = new ParticleSystem({ rng: this.rng })
    this.gore = new GoreSystem({ rng: this.rng })
    this.deathFx = new DeathFxSystem()

    // Industrial floor + grid + lamps + fans + dust — same as SP. Drawn first
    // so everything else (actors, fx, HUD overlays) sits on top.
    this.arenaProps = ArenaPropsRenderer.generate({
      width: ARENA.width,
      height: ARENA.height,
    })
    this.arenaPropsGraphics = this.add.graphics()
    this.arenaPropsGraphics.setDepth(-100)

    // Gore floor sits above arena props but below actors. Body parts above
    // actors briefly so they don't get hidden by the stickmen.
    this.goreFloorGraphics = this.add.graphics()
    this.goreFloorGraphics.setDepth(-50)
    this.gorePartsGraphics = this.add.graphics()
    this.gorePartsGraphics.setDepth(990)

    // Obstacles drawn between gore floor and actors so destructibles read as
    // arena props but the actor silhouettes stay on top.
    this.obstacleGraphics = this.add.graphics()
    this.obstacleGraphics.setDepth(800)

    // Aura debajo de los actores. Layer dedicado para que no se mezcle con
    // particles/HUD; misma idea que SP (`auraGraphics` en ArenaScene).
    this.auraGraphics = this.add.graphics()
    this.auraGraphics.setDepth(900)
    this.playerGraphics = this.add.graphics()
    this.playerGraphics.setDepth(1000)
    this.projectileGraphics = this.add.graphics()
    this.projectileGraphics.setDepth(940)
    this.particleGraphics = this.add.graphics()
    this.particleGraphics.setDepth(950)
    this.deathFxGraphics = this.add.graphics()
    this.deathFxGraphics.setDepth(1020)

    // Edge inputs from the local InputController → buffered, sent on next frame.
    this.busUnsubs.push(this.bus.on('input:attack', () => (this.pendingAttack = true)))
    this.busUnsubs.push(this.bus.on('input:shoot', () => (this.pendingShoot = true)))
    this.busUnsubs.push(this.bus.on('input:skill', ({ slot }) => (this.pendingSkill = slot)))

    // Wave-buff bridge: el server pausa el tick y broadcastea `waveBuffOffer`.
    // Lo traducimos a `wave:buff:offer` en el bus local para que el componente
    // existente WaveBuffCards reaccione igual que en SP. El click sobre una
    // carta emite `wave:buff:pick` → reenviamos el voto al server por WS.
    this.busUnsubs.push(
      this.bus.on('wave:buff:pick', ({ buffId }) => netClient.sendWaveBuffVote(buffId)),
    )

    // Peer drop-out: server broadcasts peer-left → mostramos toast 4s y el
    // run sigue (el server mantiene la sala viva con el sobreviviente).
    this.busUnsubs.push(netClient.onPeerLeft(({ name }) => this.showPeerLeftToast(name)))

    // Skill cast del peer (o nuestro): el server retransmite — spawneamos
    // FX en el punto del caster. KiBlast/FinalFlash/GroundPound son cones
    // invisibles sin esto; con el aura burst se sienten igual que en SP.
    this.busUnsubs.push(
      netClient.onSkillCast(({ sessionId, skillId, x, y }) =>
        this.spawnSkillCastFx(sessionId, skillId, x, y),
      ),
    )

    this.netUnsub = netClient.subscribe((s) => {
      const prevOffer = this.snap.waveBuffOffer
      const prevPhase = this.snap.phase
      this.snap = s
      // Transición a gameover (una sola vez): submitear run + ir a GameOverScene.
      if (s.phase === 'gameover' && prevPhase !== 'gameover') {
        const sum = s.gameoverSummary
        if (sum) {
          this.bus.emit('run:end', {
            wave: sum.wave,
            kills: sum.kills,
            gold: sum.gold,
            reason: 'death',
          })
          this.persistMultiRun(sum).catch((err) =>
            console.error('[net-arena] run submit failed:', err),
          )
        } else {
          this.bus.emit('run:end', {
            wave: this.lastWave,
            kills: 0,
            gold: this.lastGold,
            reason: 'death',
          })
        }
        this.scene.start('GameOver')
        return
      }
      // Phase ya es gameover y el listener corre por updates posteriores
      // (ej. state msg que llegó tarde, votes, etc.) — no navegamos otra vez.
      if (s.phase === 'gameover') return
      // Error o idle: no hay run que mostrar, volvemos al menú.
      if (s.phase === 'error' || s.phase === 'idle') {
        this.scene.start('MainMenu')
        return
      }
      // Translate net offer transitions into local-bus events that the
      // existing WaveBuffCards (mounted in main.tsx) consumes.
      if (!prevOffer && s.waveBuffOffer) {
        this.bus.emit('wave:buff:offer', {
          wave: s.waveBuffOffer.wave,
          buffIds: s.waveBuffOffer.buffIds,
        })
      } else if (prevOffer && !s.waveBuffOffer) {
        // Resolved (or cancelled) — hide the cards.
        this.bus.emit('wave:resume', { wave: prevOffer.wave })
      }
    })

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.max(0, Math.min(0.1, deltaMs / 1000))

    // Combo timer local (no server-sync): si pasan >1.5s sin pegar, reset.
    if (this.localComboResetTimer > 0) {
      this.localComboResetTimer = Math.max(0, this.localComboResetTimer - dt)
      if (this.localComboResetTimer === 0 && this.localComboCount > 0) {
        this.localComboCount = 0
        this.bus.emit('combo:reset', {})
      }
    }

    // If we're downed, the server ignores our input anyway — but suppressing
    // it locally means the joystick widget stops feeding the WS too, and the
    // attack/skill buffer doesn't queue up phantom presses for the revival.
    const meSnap = this.snap.state?.players.find((p) => p.sessionId === this.snap.sessionId)
    const selfDowned = meSnap?.downed === true
    if (selfDowned) {
      this.pendingAttack = false
      this.pendingShoot = false
      this.pendingSkill = null
      netClient.sendInput(0, 0)
    } else {
      const moveVec = this.services.input.getMoveVector()
      const edges =
        this.pendingAttack || this.pendingShoot || this.pendingSkill !== null
          ? {
              ...(this.pendingAttack ? { attack: true } : {}),
              ...(this.pendingShoot ? { shoot: true } : {}),
              ...(this.pendingSkill !== null ? { skill: this.pendingSkill } : {}),
            }
          : undefined
      netClient.sendInput(moveVec.x, moveVec.y, edges)
      this.pendingAttack = false
      this.pendingShoot = false
      this.pendingSkill = null
    }

    // Render from the latest server snapshot.
    const state = this.snap.state
    if (!state) return

    // Skip frames duplicados según el modo. En 'state-driven' (default) solo
    // pintamos si el server tick cambió — cero frames repetidos sin agregar
    // latency. En 'cap-fps' usamos un threshold temporal (suma ~1 frame de
    // delay pero más predictible si el server hicicupea). En 'unlocked'
    // renderizamos cada frame Phaser (comportamiento legacy, lo que vimos
    // saltar en Adreno).
    if (this.renderMode === 'state-driven') {
      if (state.tick === this.lastRenderedTick) return
      this.lastRenderedTick = state.tick
    } else if (this.renderMode === 'cap-fps') {
      const now = performance.now()
      const minDelta = 1000 / this.renderFpsCap
      if (this.lastRenderTime > 0 && now - this.lastRenderTime < minDelta - 1) return
      this.lastRenderTime = now
    }

    this.diffAndEmit(state)

    // Floor + ambient (fans, lamps, dust). Cheap; redraw every frame is fine.
    ArenaPropsRenderer.update(this.arenaProps, dt, (lo, hi) => this.rng.float(lo, hi))
    this.arenaPropsGraphics.clear()
    ArenaPropsRenderer.drawFloor(this.arenaPropsGraphics, this.arenaProps)

    // Tick + draw gore (corpses, parts, blood pools) before the live actors.
    this.gore.update(dt)
    this.goreFloorGraphics.clear()
    this.gorePartsGraphics.clear()
    for (const pool of this.gore.getBloodPools()) {
      GoreRenderer.drawBloodPool(this.goreFloorGraphics, pool)
    }
    for (const corpse of this.gore.getCorpses()) {
      GoreRenderer.drawCorpse(this.goreFloorGraphics, corpse)
    }
    for (const bp of this.gore.getBodyParts()) {
      GoreRenderer.drawBodyPart(this.gorePartsGraphics, bp)
    }

    this.renderObstacles(state.obstacles ?? [])
    this.renderPlayers(state.players)
    this.renderEnemies(state.enemies ?? [])
    this.renderProjectiles(state.projectiles ?? [])
    this.reapStaleEnemies(state.enemies ?? [])
    this.reapStalePlayers(state.players)

    // Tick + draw client-side particles (the only sim that runs locally).
    this.particles.update(dt)
    this.particleGraphics.clear()
    ParticleRenderer.draw(this.particleGraphics, this.particles.getAll())

    // Death FX (white flash + ring) on top of everything.
    this.deathFx.update(dt)
    this.deathFxGraphics.clear()
    DeathFxRenderer.draw(this.deathFxGraphics, this.deathFx.getAll())

    this.prevState = state

    // Camera follow con smoothing — clave para que multi se sienta fluido
    // aunque el server tickee 30Hz. Sin esto cada 33ms la cámara salta a
    // la nueva posición del player y el WORLD ENTERO se mueve en steps,
    // lo que el ojo percibe como stutter aunque haya 60fps reales. Smoothing
    // factor frame-rate-independent: k = 1 - exp(-dt × τ); τ alto = snappy,
    // bajo = laggier. 14 ≈ 70ms de time constant, sweet spot entre
    // responsividad y suavidad. Cuando llegamos a Fase 4 (interpolación
    // global) este smoothing ya no será necesario.
    const me = state.players.find((p) => p.sessionId === this.snap.sessionId) ?? state.players[0]
    if (me) {
      const k = 1 - Math.exp(-dt * 14)
      this.cameraX += (me.x - this.cameraX) * k
      this.cameraY += (me.y - this.cameraY) * k
      this.cameras.main.centerOn(this.cameraX, this.cameraY)
    }

    // Apply + decay the local cameraShake. Phaser's shake() doesn't stack,
    // so we re-arm it as long as we have time left.
    if (this.cameraShake > 0) {
      const intensity = 0.005 * Math.min(1, this.cameraShake / 0.5)
      this.cameras.main.shake(50, intensity)
      this.cameraShake = Math.max(0, this.cameraShake - dt)
    }
  }

  // ----------------------------------------------------------------- diff fx

  /**
   * Compare new state to previous and emit cosmetic FX + HUD events.
   * Server doesn't send `combat:hit` or `enemy:death` over the wire (yet) —
   * we infer them by watching HP go down and entries disappear.
   */
  private diffAndEmit(state: StateMsg): void {
    const prev = this.prevState

    // ---- HUD bus events ------------------------------------------------
    if (state.wave !== this.lastWave) {
      this.lastWave = state.wave
      this.bus.emit('wave:start', { wave: state.wave, totalEnemies: state.total })
    }
    if (state.gold !== this.lastGold) {
      const delta = state.gold - this.lastGold
      this.lastGold = state.gold
      this.bus.emit('gold:changed', { gold: state.gold, delta: this.lastGold === -1 ? 0 : delta })
    }
    if (state.alive !== this.lastAlive || state.total !== this.lastTotal) {
      this.lastAlive = state.alive
      this.lastTotal = state.total
      this.bus.emit('wave:enemies:changed', { alive: state.alive, total: state.total })
    }

    // The local player's HP changed → emit so HudRoot HP bar reacts.
    const me = state.players.find((p) => p.sessionId === this.snap.sessionId)
    const meBefore = prev?.players.find((p) => p.sessionId === this.snap.sessionId)
    if (me && (!meBefore || me.hp !== meBefore.hp || me.maxHp !== meBefore.maxHp)) {
      this.bus.emit('player:hp:changed', { hp: me.hp, maxHp: me.maxHp })
    }
    // Local player's effective stats changed (post wave-buff resolve) → emit
    // `stats:changed` so the 6 chips DMG/VEL/CRT/REG/KB/ORO reaccionen.
    if (me?.stats) {
      const a = me.stats
      const b = meBefore?.stats
      const changed =
        !b ||
        a.dmgMul !== b.dmgMul ||
        a.atkSpeedMul !== b.atkSpeedMul ||
        a.critChance !== b.critChance ||
        a.regenPerSec !== b.regenPerSec ||
        a.knockbackMul !== b.knockbackMul ||
        a.goldMul !== b.goldMul
      if (changed) {
        this.bus.emit('stats:changed', {
          maxHp: me.maxHp,
          dmgMul: a.dmgMul,
          atkSpeedMul: a.atkSpeedMul,
          critChance: a.critChance,
          regenPerSec: a.regenPerSec,
          knockbackMul: a.knockbackMul,
          goldMul: a.goldMul,
        })
      }
    }
    // Equipped skills (slot 0 + slot 1): primero tick → emit. Idempotente.
    if (me?.skillSlots) {
      const cur = me.skillSlots
      const prevSlots = meBefore?.skillSlots
      if (!prevSlots || prevSlots[0] !== cur[0] || prevSlots[1] !== cur[1]) {
        this.bus.emit('skills:equipped', { slot0: cur[0], slot1: cur[1] })
      }
    }
    // Cooldown progress per slot. Server tickea en SkillSystem.update y los
    // pinta en NetPlayer cada tick (~30Hz). Emite cuando cambian para que
    // el chip Q/E reaccione fluido.
    if (me?.skillCooldowns) {
      for (const slot of [0, 1] as const) {
        const cur = me.skillCooldowns[slot]
        const prev = meBefore?.skillCooldowns?.[slot]
        if (!prev || prev.remaining !== cur.remaining || prev.total !== cur.total) {
          this.bus.emit('skill:cooldown:changed', {
            slot,
            remaining: cur.remaining,
            total: cur.total,
          })
        }
      }
    }

    if (!prev) return

    // ---- Damage popups + sparks + audio bridge -------------------------
    // En multi NUNCA llega un `combat:hit` por la red — para no aumentar
    // el tamaño del state msg lo inferimos por diff de HP. Emitimos los
    // mismos eventos que SP para que AudioSystem reaccione igual.

    // Players: HP went down → blood + popup at their position + player:hurt sfx.
    for (const p of state.players) {
      const before = prev.players.find((q) => q.sessionId === p.sessionId)
      if (!before) continue
      if (p.hp < before.hp) {
        const dmg = before.hp - p.hp
        this.particles.spawnBlood(p.x, p.y - 18, -p.facingX, -p.facingY)
        this.spawnDamagePopup(p.x, p.y - 38, dmg, false)
        // Local player took a hit → shake the camera so the impact reads.
        if (p.sessionId === this.snap.sessionId) {
          this.cameraShake = Math.max(this.cameraShake, 0.18 + Math.min(0.25, dmg / 100))
          this.bus.emit('player:hurt', { dmg, remainingHp: p.hp, src: 'melee' })
        }
      }
      // Player went from alive → downed: emit `player:death` analog so audio
      // reacciona igual que en SP. (En multi no es muerte real — es Left4Dead
      // downed — pero para el oído es el mismo cue.)
      if (p.downed && !before.downed && p.sessionId === this.snap.sessionId) {
        this.bus.emit('player:death', {})
      }
    }
    // Enemies: HP down → slash + popup + combat:hit (drives sfxHit).
    // Determinamos el attackerId localmente: si el self está mid-swing
    // cuando un enemy pierde HP cerca, asumimos que fue self (drives combo
    // local). Si no, asumimos peer. Heurística — se puede afinar si el
    // server envía attribution explícita en el futuro.
    const selfAttacking = !!me && me.attackTimer > 0
    const stateEnemies = state.enemies ?? []
    const prevEnemies = prev.enemies ?? []
    for (const e of stateEnemies) {
      const before = prevEnemies.find((q) => q.id === e.id)
      if (!before) continue
      if (e.hp < before.hp) {
        const dmg = before.hp - e.hp
        this.particles.spawnSlashFx(e.x, e.y - 18, e.facingX, e.facingY)
        this.spawnDamagePopup(e.x, e.y - 30, dmg, true)
        const critGuess = dmg >= 30
        // Attribution heurística: si self está swingando + cerca, fue self.
        // Threshold 80px ≈ alcance del melee. Si no cuadra, asumimos peer.
        let attackerId = 'peer'
        if (selfAttacking && me) {
          const dx = e.x - me.x
          const dy = e.y - me.y
          if (Math.hypot(dx, dy) < 80) attackerId = 'self'
        }
        this.bus.emit('combat:hit', { attackerId, targetId: e.id, dmg, crit: critGuess })
        // Combo del player local: solo cuando self pegó el hit. Se traduce en
        // el contador del HUD que pulsa con cada cadena de hits.
        if (attackerId === 'self') {
          this.localComboCount++
          this.localComboResetTimer = 1.5
          this.bus.emit('combo:advance', { count: this.localComboCount })
        }
      }
    }
    const liveIds = new Set(stateEnemies.map((e) => e.id))
    const aliveCount = stateEnemies.length
    for (const before of prevEnemies) {
      if (liveIds.has(before.id)) continue
      // Enemy gone → full SP-style death FX:
      //   - white flash + ring (DeathFxSystem)
      //   - blood pool + flying body parts (GoreSystem)
      //   - blood splatter particles for instant impact (ParticleSystem)
      let scale = 1
      let color = 0xa00000
      try {
        const type = getEnemyType(before.typeId)
        scale = type.scale ?? 1
        // Use the enemy's content color so corpses match the live skin.
        color = parseInt(type.color.slice(1), 16)
      } catch {
        // Unknown typeId — use defaults.
      }
      this.deathFx.add({ x: before.x, y: before.y, scale })
      this.gore.addKill({
        x: before.x,
        y: before.y,
        color,
        scale,
        knockbackX: before.vx,
        knockbackY: before.vy,
        aliveEnemies: aliveCount,
      })
      this.particles.spawnBlood(before.x, before.y - 18, 0, -1, 18)
      // Each kill rumbles the camera a touch — bigger if it's a heavyweight.
      this.cameraShake = Math.max(this.cameraShake, 0.08 + 0.04 * scale)
      // Audio bridge: el AudioSystem en SP escucha `enemy:death` para sfxKill.
      // En multi no nos llega del server — lo inferimos del diff y lo emitimos
      // localmente con la misma firma.
      this.bus.emit('enemy:death', { enemyId: before.id, byPlayer: true })
    }

    // Obstacles: si desapareció uno respecto al state previo, asumimos que
    // explotó (server destroys explicitly, no se "achican"). Emite `obstacle:
    // explode` para que AudioSystem haga sfxExplode().
    const prevObstacles = prev.obstacles ?? []
    const nowObstacleIds = new Set((state.obstacles ?? []).map((o) => o.id))
    for (const before of prevObstacles) {
      if (nowObstacleIds.has(before.id)) continue
      this.particles.spawnShockwave(before.x, before.y, before.r * 1.5)
      this.cameraShake = Math.max(this.cameraShake, 0.22)
      this.bus.emit('obstacle:explode', { x: before.x, y: before.y, type: before.type })
    }
  }

  /** Floating yellow "-N" that lifts and fades over ~600ms. */
  private spawnDamagePopup(x: number, y: number, dmg: number, fromEnemy: boolean): void {
    const text = this.add.text(x, y, `-${Math.ceil(dmg)}`, {
      fontFamily: "'Russo One', sans-serif",
      fontSize: fromEnemy ? '12px' : '14px',
      color: fromEnemy ? '#ffd54a' : '#ff6060',
      stroke: '#000',
      strokeThickness: 3,
    })
    text.setOrigin(0.5, 1)
    text.setDepth(1100)
    this.tweens.add({
      targets: text,
      y: y - 22,
      alpha: 0,
      duration: 600,
      ease: 'Quad.easeOut',
      onComplete: () => text.destroy(),
    })
  }

  /** Aura glow detrás de cada player. Activa cuando el player está
   *  mid-attack (attackTimer>0) o downed-no, mismas tres discs concéntricas
   *  que SP. El color sale de cosmetics.aura via `getAura`. */
  private drawPlayerAura(p: NetPlayer): void {
    if (p.downed) return
    if (p.attackTimer <= 0) return
    let color = 0xffd54a
    try {
      if (p.cosmetics?.aura) color = parseInt(getAura(p.cosmetics.aura).color.slice(1), 16)
    } catch {
      // unknown aura id → default dorado
    }
    const cx = p.x
    const cy = p.y - 18
    const baseR = 38
    // Más intenso cerca del fin del swing — `progress` sube con cada hit.
    const progress = p.attackDuration > 0 ? 1 - p.attackTimer / p.attackDuration : 0.5
    const intensity = 0.6 + 0.6 * progress
    const g = this.auraGraphics
    g.fillStyle(color, 0.1 * intensity)
    g.fillCircle(cx, cy, baseR * 1.2 * intensity)
    g.fillStyle(color, 0.18 * intensity)
    g.fillCircle(cx, cy, baseR * 0.9 * intensity)
    g.fillStyle(color, 0.28 * intensity)
    g.fillCircle(cx, cy, baseR * 0.55 * intensity)
  }

  // ---------------------------------------------------------------- renderers

  private renderPlayers(players: ReadonlyArray<NetPlayer>): void {
    // Re-pintamos las auras de cero cada frame; afectan a todos los players
    // (uno o dos) según su attackTimer activo.
    this.auraGraphics.clear()
    for (const p of players) {
      this.drawPlayerAura(p)
      const isSelf = p.sessionId === this.snap.sessionId
      let g: Phaser.GameObjects.Graphics
      if (isSelf) {
        this.playerGraphics.clear()
        this.playerGraphics.setPosition(p.x, p.y)
        g = this.playerGraphics
      } else {
        let peer = this.peerGraphics.get(p.sessionId)
        if (!peer) {
          peer = this.add.graphics()
          peer.setDepth(1000)
          this.peerGraphics.set(p.sessionId, peer)
        }
        peer.clear()
        peer.setPosition(p.x, p.y)
        g = peer
      }
      // Downed: rotate the stick 90° so it reads as "lying down" + drop the
      // alpha to grey it out a bit. Server keeps hp pinned at 0; the renderer
      // has no idea which side is "down" so we just rotate the Graphics.
      if (p.downed) {
        g.setRotation(Math.PI / 2)
        g.setAlpha(0.55)
      } else {
        g.setRotation(0)
        g.setAlpha(1)
      }
      this.stickman.draw(g, this.toRenderable(p))
      this.updatePlayerOverlay(p, isSelf)
    }
  }

  private renderObstacles(obstacles: ReadonlyArray<NetObstacle>): void {
    this.obstacleGraphics.clear()
    for (const o of obstacles) {
      // ObstacleRenderer.draw uses only `type, x, y, r, hitFlash` — the rest
      // of the Obstacle interface is irrelevant. Cast is safe here.
      ObstacleRenderer.draw(this.obstacleGraphics, o as unknown as Obstacle)
    }
  }

  private renderProjectiles(projectiles: ReadonlyArray<NetProjectile>): void {
    const g = this.projectileGraphics
    g.clear()
    for (const p of projectiles) {
      const angle = Math.atan2(p.vy, p.vx)
      if (p.type === 'arrow') {
        // Flecha del player: shaft + tip + fletching, con sombra debajo y
        // estela glow detrás. La estela vibra sutilmente para que la flecha
        // se sienta veloz, no estática.
        const len = 18
        const cosA = Math.cos(angle)
        const sinA = Math.sin(angle)
        const tx = p.x + cosA * len
        const ty = p.y + sinA * len
        const bx = p.x - cosA * len * 0.5
        const by = p.y - sinA * len * 0.5
        // Estela glow dorada detrás (hint de movimiento). Dos circulos en
        // gradiente, no requiere setBlendMode (mantenemos render simple).
        const trailX = bx - cosA * 14
        const trailY = by - sinA * 14
        g.fillStyle(0xffd54a, 0.18)
        g.fillCircle(trailX, trailY, 7)
        g.fillStyle(0xffd54a, 0.32)
        g.fillCircle(bx - cosA * 6, by - sinA * 6, 5)
        // Sombra elíptica abajo (proyección a piso).
        g.fillStyle(0x000000, 0.22)
        g.fillEllipse(p.x, p.y + 22, 14, 4)
        // Wood shaft.
        g.lineStyle(2.5, 0xa06820, 1)
        g.beginPath()
        g.moveTo(bx, by)
        g.lineTo(tx, ty)
        g.strokePath()
        // Steel tip (triangle).
        const tipBackX = tx - cosA * 5
        const tipBackY = ty - sinA * 5
        const perp = angle + Math.PI / 2
        const cosP = Math.cos(perp)
        const sinP = Math.sin(perp)
        g.fillStyle(0xe8edf0, 1)
        g.fillTriangle(
          tx,
          ty,
          tipBackX + cosP * 2.6,
          tipBackY + sinP * 2.6,
          tipBackX - cosP * 2.6,
          tipBackY - sinP * 2.6,
        )
        // Tip highlight (white nick).
        g.fillStyle(0xffffff, 0.85)
        g.fillCircle(tx, ty, 1.2)
        // Red fletching at the tail (3 mini triangles para sentirse más rico).
        g.fillStyle(0xc41a1a, 1)
        const fX1 = bx + cosP * 3.2
        const fY1 = by + sinP * 3.2
        const fX2 = bx - cosP * 3.2
        const fY2 = by - sinP * 3.2
        const fbx = bx - cosA * 5
        const fby = by - sinA * 5
        g.fillTriangle(bx, by, fX1, fY1, fbx, fby)
        g.fillTriangle(bx, by, fX2, fY2, fbx, fby)
      } else if (p.type === 'spear') {
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
        // Default: orb mágico violeta (ranged enemy projectile).
        const r = 5
        g.fillStyle(0x5a30b0, 0.4)
        g.fillCircle(p.x, p.y, r * 1.6)
        g.fillStyle(0xa872f0, 1)
        g.fillCircle(p.x, p.y, r)
        g.fillStyle(0xffffff, 0.85)
        g.fillCircle(p.x, p.y, r * 0.45)
      }
    }
  }

  private renderEnemies(enemies: ReadonlyArray<NetEnemy>): void {
    for (const e of enemies) {
      let g = this.enemyGraphics.get(e.id)
      if (!g) {
        g = this.add.graphics()
        g.setDepth(900)
        this.enemyGraphics.set(e.id, g)
      }
      // No g.clear() — stickman.draw() ya lo hace internamente. Antes
      // hacíamos doble clear y se cargaba el setPosition/scale del frame.
      g.setPosition(e.x, e.y)
      // Pull the FULL EnemyType del content para que el render matchee
      // exactamente el de SP: color + clothing + accessory + scale + clothingColor.
      // Antes solo pasábamos color y caía a defaults para todo lo demás —
      // por eso brutes/archers se veían como stickmen genéricos sin
      // diferenciación visual.
      let color = 0x202020
      let clothing: ReturnType<typeof getEnemyType>['clothing'] | undefined
      let accessory: ReturnType<typeof getEnemyType>['accessory'] | undefined
      let clothingColor: number | undefined
      let scale = 1
      try {
        const type = getEnemyType(e.typeId)
        color = parseInt(type.color.slice(1), 16)
        clothing = type.clothing
        accessory = type.accessory
        if (type.clothingColor) clothingColor = parseInt(type.clothingColor.slice(1), 16)
        scale = type.scale
      } catch {
        // typeId desconocido → fallback minimal
      }
      const enemyState: StickmanRenderState = {
        vx: e.vx,
        vy: e.vy,
        facingX: e.facingX,
        facingY: e.facingY,
        walkPhase: e.walkPhase,
        attackKind: coerceKind(e.attackKind ?? ''),
        attackTimer: e.attackTimer,
        attackDuration: e.attackDuration || 0.5,
        attackDirX: e.attackDirX ?? e.facingX,
        attackDirY: e.attackDirY ?? e.facingY,
        hurtFlash: e.hurtFlash,
        iframes: 0,
        color,
        ...(clothing ? { clothing } : {}),
        ...(accessory ? { accessory } : {}),
        ...(clothingColor !== undefined ? { clothingColor } : {}),
      }
      this.stickman.draw(g, enemyState, scale)
      this.updateEnemyOverlay(e)
    }
  }

  /** HP bar + name above each player. Self gets "(vos)" and a brighter tint. */
  private updatePlayerOverlay(p: NetPlayer, isSelf: boolean): void {
    let ov = this.playerOverlays.get(p.sessionId)
    if (!ov) {
      const hpBg = this.add.rectangle(0, 0, 36, 4, 0x2a2a2a).setOrigin(0.5, 0.5).setDepth(1050)
      const hpFill = this.add.rectangle(0, 0, 34, 2, 0x7fff7f).setOrigin(0, 0.5).setDepth(1051)
      const labelText = isSelf ? `${p.name} (vos)` : p.name
      const name = this.add
        .text(0, 0, labelText, {
          fontFamily: "'Russo One', sans-serif",
          fontSize: '10px',
          color: isSelf ? '#ffd54a' : '#7fc97f',
          stroke: '#000',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 1)
        .setDepth(1052)
      ov = { hpBg, hpFill, name, lastHp: p.hp }
      this.playerOverlays.set(p.sessionId, ov)
    }
    // Si hay wave-buff cards abiertas, escondemos los overlays para que no
    // crucen el modal. Las cards lo cubren todo y los names cruzaban "OLEADA
    // X SUPERADA" en mid-air.
    if (this.snap.waveBuffOffer) {
      ov.hpBg.setVisible(false)
      ov.hpFill.setVisible(false)
      if (ov.name) ov.name.setVisible(false)
      return
    }
    ov.hpBg.setVisible(true)
    ov.hpFill.setVisible(true)
    if (ov.name) ov.name.setVisible(true)
    const above = p.y - 36
    if (p.downed) {
      // Replace HP bar with a revival progress bar (yellow → green as peer
      // racks up kills). Bar shows fill = revivalProgress (0..1).
      const prog = Math.max(0, Math.min(1, p.revivalProgress ?? 0))
      ov.hpBg.setPosition(p.x, above)
      ov.hpBg.fillColor = 0x442211
      ov.hpFill.setPosition(p.x - 17, above)
      ov.hpFill.width = 34 * prog
      ov.hpFill.fillColor = prog > 0.6 ? 0x7fff7f : 0xffd54a
      if (ov.name) {
        ov.name.setPosition(p.x, above - 4)
        ov.name.setText(isSelf ? `${p.name} (vos) — DOWN` : `${p.name} — DOWN`)
        ov.name.setColor('#ff6060')
      }
    } else {
      const hpFrac = Math.max(0, Math.min(1, p.maxHp > 0 ? p.hp / p.maxHp : 0))
      ov.hpBg.setPosition(p.x, above)
      ov.hpBg.fillColor = 0x2a2a2a
      ov.hpFill.setPosition(p.x - 17, above)
      ov.hpFill.width = 34 * hpFrac
      ov.hpFill.fillColor = hpFrac > 0.6 ? 0x7fff7f : hpFrac > 0.3 ? 0xffd54a : 0xff6060
      if (ov.name) {
        ov.name.setPosition(p.x, above - 4)
        ov.name.setText(isSelf ? `${p.name} (vos)` : p.name)
        ov.name.setColor(isSelf ? '#ffd54a' : '#7fc97f')
      }
    }
    ov.lastHp = p.hp
  }

  /** Compact HP bar above each enemy (no name). */
  private updateEnemyOverlay(e: NetEnemy): void {
    let ov = this.enemyOverlays.get(e.id)
    if (!ov) {
      const hpBg = this.add.rectangle(0, 0, 24, 3, 0x2a2a2a).setOrigin(0.5, 0.5).setDepth(950)
      const hpFill = this.add.rectangle(0, 0, 22, 2, 0xff6060).setOrigin(0, 0.5).setDepth(951)
      ov = { hpBg, hpFill, name: null, lastHp: e.hp }
      this.enemyOverlays.set(e.id, ov)
    }
    const hpFrac = Math.max(0, Math.min(1, e.maxHp > 0 ? e.hp / e.maxHp : 0))
    // Only show enemy HP bars when they've taken damage (less HUD noise).
    const visible = hpFrac > 0 && hpFrac < 1
    ov.hpBg.setVisible(visible)
    ov.hpFill.setVisible(visible)
    if (visible) {
      const above = e.y - 30
      ov.hpBg.setPosition(e.x, above)
      ov.hpFill.setPosition(e.x - 11, above)
      ov.hpFill.width = 22 * hpFrac
    }
    ov.lastHp = e.hp
  }

  private reapStaleEnemies(enemies: ReadonlyArray<NetEnemy>): void {
    const live = new Set(enemies.map((e) => e.id))
    for (const [id, g] of this.enemyGraphics) {
      if (!live.has(id)) {
        g.destroy()
        this.enemyGraphics.delete(id)
      }
    }
    for (const [id, ov] of this.enemyOverlays) {
      if (!live.has(id)) {
        ov.hpBg.destroy()
        ov.hpFill.destroy()
        this.enemyOverlays.delete(id)
      }
    }
  }

  private reapStalePlayers(players: ReadonlyArray<NetPlayer>): void {
    const live = new Set(players.map((p) => p.sessionId))
    for (const [sid, g] of this.peerGraphics) {
      if (!live.has(sid)) {
        g.destroy()
        this.peerGraphics.delete(sid)
      }
    }
    for (const [sid, ov] of this.playerOverlays) {
      if (!live.has(sid)) {
        ov.hpBg.destroy()
        ov.hpFill.destroy()
        ov.name?.destroy()
        this.playerOverlays.delete(sid)
      }
    }
  }

  private toRenderable(p: NetPlayer): StickmanRenderState {
    const visual = resolveCosmetics(p.cosmetics)
    return {
      vx: p.vx,
      vy: p.vy,
      facingX: p.facingX,
      facingY: p.facingY,
      walkPhase: p.walkPhase,
      attackKind: coerceKind(p.attackKind),
      attackTimer: p.attackTimer,
      attackDuration: p.attackDuration || 0.3,
      attackDirX: p.attackDirX,
      attackDirY: p.attackDirY,
      // Bow draw/release: sin esto el StickmanRenderer no dibuja la pose
      // del arco. El cliente veía la flecha volando pero al player en idle,
      // sin bow visible.
      ...(p.bowTimer !== undefined ? { bowTimer: p.bowTimer } : {}),
      ...(p.bowDuration !== undefined ? { bowDuration: p.bowDuration } : {}),
      ...(p.bowDirX !== undefined ? { bowDirX: p.bowDirX } : {}),
      ...(p.bowDirY !== undefined ? { bowDirY: p.bowDirY } : {}),
      hurtFlash: 0,
      iframes: 0,
      color: visual.color,
      clothing: visual.clothing,
      ...(visual.clothingColor !== undefined ? { clothingColor: visual.clothingColor } : {}),
      accessory: visual.accessory,
      ...(visual.weapon ? { weapon: visual.weapon } : {}),
    }
  }

  /** Visuales de un skill cast (local o del peer). El server emite un
   *  `skill:cast` cuando cualquier cliente dispara una activa; pintamos
   *  aura burst + shockwave en el punto del caster, igual que SP. Para
   *  skills específicas con FX extra (groundPound shockwave grande,
   *  finalFlash chorro) lo extendemos por id. */
  private spawnSkillCastFx(sessionId: string, skillId: string, x: number, y: number): void {
    // Color del aura del caster: si es nuestro lo sacamos del save, si es
    // el peer lo sacamos de la cosmetics que viaja en su NetPlayer.
    let color = 0xffd54a
    const me = this.snap.state?.players.find((p) => p.sessionId === sessionId)
    if (me?.cosmetics?.aura) {
      try {
        color = parseInt(getAura(me.cosmetics.aura).color.slice(1), 16)
      } catch {
        // unknown aura → default dorado
      }
    }
    const cy = y - 24
    this.particles.spawnAuraBurst(x, cy, color, 30)
    if (skillId === 'groundPound') {
      this.particles.spawnShockwave(x, y, color, 32)
      this.cameraShake = Math.max(this.cameraShake, 0.32)
    } else if (skillId === 'kiBlast' || skillId === 'finalFlash') {
      this.particles.spawnShockwave(x, cy, color, 24)
      this.cameraShake = Math.max(this.cameraShake, 0.22)
    } else {
      // dash, swordTornado, heal — solo aura burst sutil.
      this.cameraShake = Math.max(this.cameraShake, 0.1)
    }
  }

  /** Toast cuando el peer se desconecta. Pinta un texto centrado-superior
   *  por 4s y luego desaparece. El run continúa solo (server mantiene la sala). */
  private showPeerLeftToast(name: string): void {
    const cam = this.cameras.main
    const x = cam.scrollX + cam.width / (2 * cam.zoom)
    const y = cam.scrollY + 40
    const txt = this.add
      .text(x, y, `${name} se desconectó — seguís solo`, {
        fontFamily: "'Russo One', sans-serif",
        fontSize: '14px',
        color: '#ffd54a',
        stroke: '#000',
        strokeThickness: 3,
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setDepth(2000)
      .setScrollFactor(0)
    this.tweens.add({
      targets: txt,
      alpha: 0,
      y: y - 20,
      duration: 600,
      delay: 3400,
      onComplete: () => txt.destroy(),
    })
  }

  /**
   * Submit del run al `/runs` del leaderboard. El server-multi nos pasa el
   * summary (wave/kills/gold/seed/dur). Cada cliente arma su RunReport con
   * su loadout local y lo manda. Si el api está caído cae en `RunQueue`.
   *
   * También actualiza el save local: gold + bestWave + totalKills.
   */
  private async persistMultiRun(sum: {
    seed: number
    wave: number
    kills: number
    gold: number
    durationSec: number
  }): Promise<void> {
    const save = this.services.save
    save.gold += sum.gold
    save.totalKills += sum.kills
    if (sum.wave > save.bestWave) save.bestWave = sum.wave
    await this.services.saveStore.save(save)

    if (sum.wave < 1) return

    const weaponId = save.cosmetics.sword.equipped
    const report = {
      seed: sum.seed,
      wave: sum.wave,
      kills: sum.kills,
      gold: sum.gold,
      durationSec: sum.durationSec,
      weapon: weaponId,
      buffs: {} as Record<string, number>,
      reason: 'death' as const,
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
    void RunQueue.flush()
  }

  private cleanup(): void {
    for (const off of this.busUnsubs) off()
    this.busUnsubs = []
    if (this.netUnsub) {
      this.netUnsub()
      this.netUnsub = null
    }
    for (const g of this.enemyGraphics.values()) g.destroy()
    this.enemyGraphics.clear()
    for (const g of this.peerGraphics.values()) g.destroy()
    this.peerGraphics.clear()
    for (const ov of this.playerOverlays.values()) {
      ov.hpBg.destroy()
      ov.hpFill.destroy()
      ov.name?.destroy()
    }
    this.playerOverlays.clear()
    for (const ov of this.enemyOverlays.values()) {
      ov.hpBg.destroy()
      ov.hpFill.destroy()
    }
    this.enemyOverlays.clear()
    // Drop la conexión SOLO si la sala ya terminó (error / idle). En gameover
    // o lobby la mantenemos viva para que el flow de "Play Again" pueda usar
    // el room sin recrearlo: GameOverOverlay lee snapshot.code/sessionId para
    // decidir si está en multi y mostrar los botones REINTENTAR (consenso).
    const phase = netClient.getSnapshot().phase
    if (phase !== 'gameover' && phase !== 'lobby' && phase !== 'playing') {
      void netClient.leave()
    }
    this.prevState = null
    this.lastWave = -1
    this.lastGold = -1
    this.lastAlive = -1
    this.lastTotal = -1
  }
}

function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16)
}

interface ResolvedCosmetics {
  color: number
  clothing: ReturnType<typeof getSkin>['clothing']
  clothingColor: number | undefined
  accessory: ReturnType<typeof getSkin>['accessory']
  weapon: { shape: ReturnType<typeof getWeapon>['shape']; blade: number } | undefined
}

const FALLBACK_COSMETICS: ResolvedCosmetics = {
  color: 0x000000,
  clothing: 'tunic',
  clothingColor: undefined,
  accessory: 'none',
  weapon: undefined,
}

/**
 * Map the wire-cosmetics ids to renderable values via `@stick/content`.
 * Mirrors `ArenaScene.refreshCosmetics()` but operates on the per-tick
 * NetPlayer.cosmetics. Falls back to defaults on bad ids so a malicious or
 * out-of-date client can't break the renderer for everyone.
 *
 * Note: `aura` color isn't consumed by StickmanRenderer (it's drawn in a
 * separate aura graphic in SP). When we wire the aura overlay in NetArena
 * we'll thread it through here too.
 */
function resolveCosmetics(c: NetCosmetics | undefined): ResolvedCosmetics {
  if (!c) return FALLBACK_COSMETICS
  let color = FALLBACK_COSMETICS.color
  let clothing = FALLBACK_COSMETICS.clothing
  let clothingColor: number | undefined
  let accessory = FALLBACK_COSMETICS.accessory
  let weapon: ResolvedCosmetics['weapon']
  try {
    const skin = getSkin(c.skin)
    color = hexToNum(skin.color)
    clothing = skin.clothing
    clothingColor = skin.clothingColor ? hexToNum(skin.clothingColor) : undefined
    accessory = skin.accessory
  } catch {
    /* fall through to defaults */
  }
  try {
    const w = getWeapon(c.weapon)
    weapon = { shape: w.shape, blade: hexToNum(w.blade) }
  } catch {
    /* no weapon drawn */
  }
  return { color, clothing, clothingColor, accessory, weapon }
}
