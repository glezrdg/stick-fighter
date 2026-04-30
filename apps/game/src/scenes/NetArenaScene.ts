import type { AttackKind } from '@stick/content'
import type { NetEnemy, NetPlayer } from '@stick/shared'
import { ARENA, CAM_ZOOM } from '@stick/sim'

import { netClient, type RoomSnapshot } from '../net/NetClient'
import { StickmanRenderer, type StickmanRenderState } from '../render/StickmanRenderer'

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

/**
 * Multiplayer arena scene — render-only.
 *
 * Server is authoritative; this scene reads `RoomSnapshot.state` and draws
 * what the server says. No tickArena() here — the local sim doesn't run.
 *
 * Input flow:
 *   - InputController emits `input:attack/shoot/skill` on the local bus.
 *   - This scene listens to those and forwards them to the server via
 *     `netClient.sendInput(dx, dy, edges)` along with the move vector.
 *
 * Movement is sent on every frame the vector or any edge changes (the
 * NetClient coalesces no-op emissions). RTT is hidden by trusting the
 * server — no client-side prediction in this first cut, since the F2 codebase
 * already feels good at 50-150ms RTT against an LAN/VPS server.
 */
export class NetArenaScene extends BaseScene {
  static readonly KEY = 'NetArena'

  private playerGraphics!: Phaser.GameObjects.Graphics
  private enemyGraphics = new Map<string, Phaser.GameObjects.Graphics>()
  private peerGraphics = new Map<string, Phaser.GameObjects.Graphics>()

  private stickman!: StickmanRenderer
  private busUnsubs: Array<() => void> = []
  private netUnsub: (() => void) | null = null
  private snap: RoomSnapshot = netClient.getSnapshot()

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
    this.playerGraphics = this.add.graphics()
    this.playerGraphics.setDepth(1000)

    // Edge inputs from the local InputController → buffered, sent on next frame.
    this.busUnsubs.push(
      this.bus.on('input:attack', () => {
        this.pendingAttack = true
      }),
    )
    this.busUnsubs.push(
      this.bus.on('input:shoot', () => {
        this.pendingShoot = true
      }),
    )
    this.busUnsubs.push(
      this.bus.on('input:skill', ({ slot }) => {
        this.pendingSkill = slot
      }),
    )

    this.netUnsub = netClient.subscribe((s) => {
      this.snap = s
      // If the server says it's over (gameover or error), bail to menu.
      if (s.phase === 'gameover' || s.phase === 'error' || s.phase === 'idle') {
        this.scene.start('MainMenu')
      }
    })

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  override update(_time: number, _deltaMs: number): void {
    const moveVec = this.services.input.getMoveVector()

    // Forward input to the server. The NetClient coalesces dups so emitting
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

    this.renderPlayers(state.players)
    this.renderEnemies(state.enemies)
    this.reapStaleEnemies(state.enemies)

    // Camera follows the local player.
    const me = state.players.find((p) => p.sessionId === this.snap.sessionId)
    if (me) this.cameras.main.centerOn(me.x, me.y)
  }

  // ---------------------------------------------------------------- renderers

  private renderPlayers(players: ReadonlyArray<NetPlayer>): void {
    // Draw "self" with the same renderer as single-player so it feels familiar.
    // Peers get a separate Graphics object each, with a slight tint.
    for (const p of players) {
      if (p.sessionId === this.snap.sessionId) {
        this.playerGraphics.clear()
        this.playerGraphics.setPosition(p.x, p.y)
        this.stickman.draw(this.playerGraphics, this.toRenderable(p, 0x000000))
      } else {
        let g = this.peerGraphics.get(p.sessionId)
        if (!g) {
          g = this.add.graphics()
          g.setDepth(1000)
          this.peerGraphics.set(p.sessionId, g)
        }
        g.clear()
        g.setPosition(p.x, p.y)
        this.stickman.draw(g, this.toRenderable(p, 0x335533))
      }
    }

    // Reap peer graphics whose owner left.
    const live = new Set(players.map((p) => p.sessionId))
    for (const [sid, g] of this.peerGraphics) {
      if (!live.has(sid)) {
        g.destroy()
        this.peerGraphics.delete(sid)
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
      g.clear()
      g.setPosition(e.x, e.y)
      // Use stickman renderer with an enemy-ish tint for now. Real enemy
      // rendering needs the type's accessory/clothing — kept minimal here
      // to prove the wire works.
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
    }
  }

  private reapStaleEnemies(enemies: ReadonlyArray<NetEnemy>): void {
    const live = new Set(enemies.map((e) => e.id))
    for (const [id, g] of this.enemyGraphics) {
      if (!live.has(id)) {
        g.destroy()
        this.enemyGraphics.delete(id)
      }
    }
  }

  private toRenderable(p: NetPlayer, color: number): StickmanRenderState {
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
      color,
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
    // Drop the connection — entering the menu means leaving the room.
    void netClient.leave()
  }
}

function enemyColorOf(typeId: string): number {
  // Cheap: hash typeId into a stable hue so each enemy type reads distinct
  // even before sprites land.
  let hash = 0
  for (const c of typeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
  return 0x202020 + (Math.abs(hash) & 0x3f3f3f)
}
