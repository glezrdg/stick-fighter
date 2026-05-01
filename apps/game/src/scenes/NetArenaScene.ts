import { type AttackKind, getAura, getSkin, getWeapon } from '@stick/content'
import type { NetCosmetics, NetEnemy, NetPlayer, StateMsg } from '@stick/shared'
import { ARENA, CAM_ZOOM } from '@stick/sim'

import { netClient, type RoomSnapshot } from '../net/NetClient'
import { ParticleRenderer } from '../render/ParticleRenderer'
import { StickmanRenderer, type StickmanRenderState } from '../render/StickmanRenderer'
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
  private enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>()
  private peerGraphics = new Map<string, Phaser.GameObjects.Graphics>()
  private particleGraphics!: Phaser.GameObjects.Graphics

  private playerOverlays = new Map<string, ActorOverlay>()
  private enemyOverlays = new Map<string, ActorOverlay>()

  private stickman!: StickmanRenderer
  private particles!: ParticleSystem

  private busUnsubs: Array<() => void> = []
  private netUnsub: (() => void) | null = null
  private snap: RoomSnapshot = netClient.getSnapshot()
  private prevState: StateMsg | null = null

  // HUD bus events tracking — emit only on change to avoid spamming the bus.
  private lastWave = -1
  private lastGold = -1
  private lastAlive = -1
  private lastTotal = -1

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

    this.bus.emit('ui:scene:enter', { name: 'arena' })

    this.stickman = new StickmanRenderer()
    this.particles = new ParticleSystem({ rng: this.rng })
    this.playerGraphics = this.add.graphics()
    this.playerGraphics.setDepth(1000)
    this.particleGraphics = this.add.graphics()
    this.particleGraphics.setDepth(950)

    // Edge inputs from the local InputController → buffered, sent on next frame.
    this.busUnsubs.push(this.bus.on('input:attack', () => (this.pendingAttack = true)))
    this.busUnsubs.push(this.bus.on('input:shoot', () => (this.pendingShoot = true)))
    this.busUnsubs.push(this.bus.on('input:skill', ({ slot }) => (this.pendingSkill = slot)))

    this.netUnsub = netClient.subscribe((s) => {
      this.snap = s
      // Server says it's over (or we got error/disconnected) → bail to menu.
      if (s.phase === 'gameover' || s.phase === 'error' || s.phase === 'idle') {
        // Surface the run-end so HUD/menu chrome reacts.
        if (s.phase === 'gameover') {
          this.bus.emit('run:end', {
            wave: this.lastWave,
            kills: 0,
            gold: this.lastGold,
            reason: 'death',
          })
        }
        this.scene.start('MainMenu')
      }
    })

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.max(0, Math.min(0.1, deltaMs / 1000))
    const moveVec = this.services.input.getMoveVector()

    // Forward input to the server. NetClient coalesces dups so emitting
    // every frame is fine.
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

    // Render from the latest server snapshot.
    const state = this.snap.state
    if (!state) return

    this.diffAndEmit(state)

    this.renderPlayers(state.players)
    this.renderEnemies(state.enemies)
    this.reapStaleEnemies(state.enemies)
    this.reapStalePlayers(state.players)

    // Tick + draw client-side particles (the only sim that runs locally).
    this.particles.update(dt)
    this.particleGraphics.clear()
    ParticleRenderer.draw(this.particleGraphics, this.particles.getAll())

    this.prevState = state

    // Camera follows the local player (or first player if we got booted).
    const me = state.players.find((p) => p.sessionId === this.snap.sessionId) ?? state.players[0]
    if (me) this.cameras.main.centerOn(me.x, me.y)
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

    if (!prev) return

    // ---- Damage popups + sparks ----------------------------------------
    // Players: HP went down → blood + popup at their position.
    for (const p of state.players) {
      const before = prev.players.find((q) => q.sessionId === p.sessionId)
      if (!before) continue
      if (p.hp < before.hp) {
        const dmg = before.hp - p.hp
        this.particles.spawnBlood(p.x, p.y - 18, -p.facingX, -p.facingY)
        this.spawnDamagePopup(p.x, p.y - 38, dmg, false)
      }
    }
    // Enemies: HP down → slash + popup; disappeared → blood burst.
    for (const e of state.enemies) {
      const before = prev.enemies.find((q) => q.id === e.id)
      if (!before) continue
      if (e.hp < before.hp) {
        const dmg = before.hp - e.hp
        this.particles.spawnSlashFx(e.x, e.y - 18, e.facingX, e.facingY)
        this.spawnDamagePopup(e.x, e.y - 30, dmg, true)
      }
    }
    const liveIds = new Set(state.enemies.map((e) => e.id))
    for (const before of prev.enemies) {
      if (!liveIds.has(before.id)) {
        // Enemy gone → blood burst at the last-seen position.
        this.particles.spawnBlood(before.x, before.y - 18, 0, -1, 22)
        this.particles.spawnShockwave(before.x, before.y - 18, 0xa00000, 16)
      }
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

  // ---------------------------------------------------------------- renderers

  private renderPlayers(players: ReadonlyArray<NetPlayer>): void {
    for (const p of players) {
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
      this.stickman.draw(g, this.toRenderable(p))
      this.updatePlayerOverlay(p, isSelf)
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
      g.clear()
      g.setPosition(e.x, e.y)
      const enemyState: StickmanRenderState = {
        vx: e.vx,
        vy: e.vy,
        facingX: e.facingX,
        facingY: e.facingY,
        walkPhase: e.walkPhase,
        attackKind: e.attackTimer > 0 ? 'chop' : null,
        attackTimer: e.attackTimer,
        attackDuration: e.attackDuration || 0.5,
        attackDirX: e.facingX,
        attackDirY: e.facingY,
        hurtFlash: e.hurtFlash,
        iframes: 0,
        color: enemyColorOf(e.typeId),
      }
      this.stickman.draw(g, enemyState)
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
    const hpFrac = Math.max(0, Math.min(1, p.maxHp > 0 ? p.hp / p.maxHp : 0))
    const above = p.y - 36
    ov.hpBg.setPosition(p.x, above)
    ov.hpFill.setPosition(p.x - 17, above)
    ov.hpFill.width = 34 * hpFrac
    ov.hpFill.fillColor = hpFrac > 0.6 ? 0x7fff7f : hpFrac > 0.3 ? 0xffd54a : 0xff6060
    if (ov.name) ov.name.setPosition(p.x, above - 4)
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
      hurtFlash: 0,
      iframes: 0,
      color: visual.color,
      clothing: visual.clothing,
      ...(visual.clothingColor !== undefined ? { clothingColor: visual.clothingColor } : {}),
      accessory: visual.accessory,
      ...(visual.weapon ? { weapon: visual.weapon } : {}),
    }
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
    // Drop the connection — entering the menu means leaving the room.
    void netClient.leave()
    this.prevState = null
    this.lastWave = -1
    this.lastGold = -1
    this.lastAlive = -1
    this.lastTotal = -1
  }
}

function enemyColorOf(typeId: string): number {
  let hash = 0
  for (const c of typeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
  return 0x202020 + (Math.abs(hash) & 0x3f3f3f)
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
  // Touch the import so eslint doesn't bark when the aura plumbing lands.
  void getAura
  return { color, clothing, clothingColor, accessory, weapon }
}
