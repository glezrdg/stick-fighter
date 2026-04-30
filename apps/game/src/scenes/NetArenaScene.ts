import { ARENA, CAM_ZOOM } from '@stick/sim'

import { dtFromPhaser } from '../app/time'
import { netClient, type RoomSnapshot } from '../net/NetClient'
import { type ArenaProps, ArenaPropsRenderer } from '../render/ArenaPropsRenderer'
import { StickmanRenderer } from '../render/StickmanRenderer'

import { BaseScene } from './BaseScene'

/**
 * Multiplayer arena. Renders the room snapshot from the Colyseus server —
 * no local sim, no wave/combat logic, no save state. Inputs (move + attack)
 * are forwarded to the server which is the source of truth for all gameplay.
 *
 * Skin / weapon cosmetics fall back to the default skin while the server
 * doesn't yet broadcast per-player loadout — phase 3c-3 wires that.
 */
export class NetArenaScene extends BaseScene {
  static readonly KEY = 'NetArena'

  private stickman!: StickmanRenderer
  private arenaProps!: ArenaProps
  private arenaPropsGraphics!: Phaser.GameObjects.Graphics
  private playerGraphics = new Map<string, Phaser.GameObjects.Graphics>()
  private enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>()
  private snapshot: RoomSnapshot | null = null
  private offSnapshot?: () => void
  private lastMoveSent = { x: 0, y: 0, t: 0 }

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(NetArenaScene.KEY, services)
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0e1317')
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height)
    this.cameras.main.setZoom(CAM_ZOOM)

    this.bus.emit('ui:scene:enter', { name: 'arena' })

    this.stickman = new StickmanRenderer()
    this.arenaProps = ArenaPropsRenderer.generate({ width: ARENA.width, height: ARENA.height })
    this.arenaPropsGraphics = this.add.graphics()

    this.offSnapshot = netClient.subscribe((snap) => {
      this.snapshot = snap
      if (snap.phase === 'gameover') {
        this.scene.start('GameOver', {})
      }
    })

    // ESC quits the multiplayer session and returns to the menu.
    this.input.keyboard?.on('keydown-ESC', () => {
      void netClient.leave()
      this.scene.start('MainMenu')
    })

    // Forward attack input to the server. The InputController already emits
    // this event from Space / right-half tap; we just relay to the room.
    const offAttack = this.bus.on('input:attack', () => netClient.sendAttack())
    this.events.once('shutdown', () => offAttack())

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  override update(_time: number, deltaMs: number): void {
    const dt = dtFromPhaser(deltaMs)

    // ---- Send our movement input ----
    const move = this.services.input.getMoveVector()
    // Throttle to ~30Hz unless the vector changed meaningfully — keeps
    // bandwidth low without sacrificing responsiveness.
    const now = performance.now()
    const dx = Math.abs(move.x - this.lastMoveSent.x)
    const dy = Math.abs(move.y - this.lastMoveSent.y)
    if (dx > 0.04 || dy > 0.04 || now - this.lastMoveSent.t > 100) {
      netClient.sendMove(move.x, move.y)
      this.lastMoveSent = { x: move.x, y: move.y, t: now }
    }

    if (!this.snapshot) return

    // ---- Render arena floor ----
    this.arenaPropsGraphics.clear()
    ArenaPropsRenderer.update(this.arenaProps, dt, (lo, hi) => this.rng.float(lo, hi))
    ArenaPropsRenderer.drawFloor(this.arenaPropsGraphics, this.arenaProps)

    // ---- Render players ----
    const seenPlayers = new Set<string>()
    for (const p of this.snapshot.players) {
      seenPlayers.add(p.sessionId)
      let g = this.playerGraphics.get(p.sessionId)
      if (!g) {
        g = this.add.graphics()
        this.playerGraphics.set(p.sessionId, g)
      }
      g.setPosition(p.x, p.y)
      this.stickman.draw(g, {
        vx: p.vx,
        vy: p.vy,
        facingX: p.facingX,
        facingY: p.facingY,
        walkPhase: p.walkPhase,
        attackTimer: p.attackTimer,
        attackDuration: p.attackDuration,
        attackKind: (p.attackKind || null) as Parameters<
          typeof this.stickman.draw
        >[1]['attackKind'],
        attackDirX: p.attackDirX,
        attackDirY: p.attackDirY,
        hurtFlash: 0,
        iframes: 0,
        // Distinguish slots: slot 0 = black, slot 1 = blue.
        color: p.slot === 1 ? 0x4080ff : 0x000000,
        clothing: 'tunic',
        accessory: 'none',
      })
    }
    for (const [id, g] of this.playerGraphics) {
      if (!seenPlayers.has(id)) {
        g.destroy()
        this.playerGraphics.delete(id)
      }
    }

    // ---- Render enemies ----
    const seenEnemies = new Set<string>()
    for (const e of this.snapshot.enemies) {
      seenEnemies.add(e.id)
      let g = this.enemyGraphics.get(e.id)
      if (!g) {
        g = this.add.graphics()
        this.enemyGraphics.set(e.id, g)
      }
      g.setPosition(e.x, e.y)
      this.stickman.draw(g, {
        vx: e.vx,
        vy: e.vy,
        facingX: e.facingX,
        facingY: e.facingY,
        walkPhase: e.walkPhase,
        attackTimer: e.attackTimer,
        attackDuration: e.attackDuration,
        attackKind: null,
        attackDirX: 0,
        attackDirY: 0,
        hurtFlash: e.hurtFlash,
        iframes: 0,
        // Phase 3c-3 will broadcast the typeId color via content lookup;
        // for now we use a dim red so enemies are clearly distinguishable.
        color: 0x802020,
        clothing: 'tunic',
        accessory: 'none',
      })
    }
    for (const [id, g] of this.enemyGraphics) {
      if (!seenEnemies.has(id)) {
        g.destroy()
        this.enemyGraphics.delete(id)
      }
    }

    // ---- Camera follow our player ----
    const me = this.snapshot.players.find((p) => p.sessionId === netClient.sessionId)
    if (me) {
      this.cameras.main.centerOn(me.x, me.y)
    }
  }

  private cleanup(): void {
    this.offSnapshot?.()
    for (const g of this.playerGraphics.values()) g.destroy()
    for (const g of this.enemyGraphics.values()) g.destroy()
    this.playerGraphics.clear()
    this.enemyGraphics.clear()
  }
}
