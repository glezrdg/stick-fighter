import { attackPatterns, getEnemyType, getWaveBuff } from '@stick/content'
import {
  type ClientMsg,
  type LobbyMsg,
  type NetCosmetics,
  type NetEnemy,
  type NetLoadout,
  type NetObstacle,
  type NetPlayer,
  type NetProjectile,
  type PhaseMsg,
  type ServerMsg,
  type StateMsg,
  type WaveBuffEndMsg,
  type WaveBuffOfferMsg,
  type WaveBuffResolvedMsg,
  type WaveBuffVotesMsg,
  encodeMsg,
} from '@stick/shared'
import {
  ARENA,
  BuffSystem,
  CombatSystem,
  type Enemy,
  EnemySystem,
  type EffectiveStats,
  type EventBus as SimBus,
  type Obstacle,
  ObstacleSystem,
  type Player,
  ProjectileSystem,
  type Rng,
  type RunBuffs,
  type RunState,
  SkillSystem,
  SWORD_TORNADO_DMG_MUL,
  SWORD_TORNADO_RADIUS,
  SWORD_TORNADO_TICK_SEC,
  WaveBuffSystem,
  WaveSystem,
  createEventBus,
  createPlayer,
  createRng,
  createRunState,
  emptyRunBuffs,
  updateMovement,
} from '@stick/sim'
import type { WebSocket } from 'ws'

/**
 * One Room = one 2P co-op lobby. Lifecycle:
 *
 *   1. `new StickFightRoom(code)`     — empty, phase: 'lobby'
 *   2. `addClient(ws, name)`          — host or friend joins
 *   3. both flip ready → `startRun()` — phase: 'playing', sim systems boot
 *   4. `tick(dt)` runs at 30 Hz       — sim advances, full state broadcast
 *   5. last client leaves OR all dead → `dispose()` (server unregisters)
 *
 * Tick = full state broadcast. ~3-5 KB/tick at 30Hz = ~150 KB/s/client.
 * No delta encoding: easier to debug (DevTools → WS frames are readable JSON),
 * no codec to break (the lesson from the Colyseus attempts).
 */

/** Server-side default for clients that don't declare cosmetics at handshake. */
const DEFAULT_COSMETICS: NetCosmetics = {
  skin: 'default',
  weapon: 'katana',
  weaponLevel: 1,
  aura: 'yellow',
}

/** Default loadout para clientes que no declaran uno: starter weapon (fists),
 *  sin skills, level 1. Equivalente a un fresh save. */
const DEFAULT_LOADOUT: NetLoadout = {
  ownedSkills: [],
  equippedSkills: [null, null],
  weaponId: 'fists',
  weaponLevel: 1,
}

/** Left4Dead-style revival: peer must kill this many enemies to bring you back.
 *  Bajamos de 5 a 3 — con un solo player ataquibles los enemies, 5 tarda
 *  demasiado y la mayoría de los runs terminaban por timeout en vez de revival. */
const REVIVAL_KILLS_REQUIRED = 3
/** Max time spent downed before the run ends if no revive happens. Subimos
 *  de 30s a 60s para dar margen real para reanimar entre waves. */
const DOWNED_TIMEOUT_MS = 60_000
/** HP fraction the revived player gets restored to. Subimos de 0.5 a 0.75
 *  porque con 50% el revivido moría en 1-2 segundos rodeado de enemies. */
const REVIVAL_HP_FRACTION = 0.75
/** Invulnerability seconds granted after revive so you don't insta-die again.
 *  Subimos de 2s a 4s — con 2s los enemies seguían pegando swings que ya
 *  tenían animación en curso y conectaban apenas expiraban iframes. */
const REVIVAL_IFRAMES_SEC = 4.0
/** Empujamos enemies dentro de este radio cuando un player revive, así no
 *  reaparece rodeado y muere instantáneo apenas expire el iframe. */
const REVIVAL_PUSH_RADIUS = 100
const REVIVAL_PUSH_FORCE = 8

/** Wave-buff voting window: si nadie vota antes de esto, autopick random. */
const WAVE_BUFF_TIMEOUT_MS = 30_000
/** Estado del proceso de votación entre waves. Nullable: null = playing normal. */
interface PendingBuffPhase {
  wave: number
  buffIds: readonly string[]
  expiresAt: number
  /** sessionId → buffId votado. Ausente = aún no votó. */
  votes: Map<string, string>
}

export interface RoomClient {
  /** WebSocket activo. Null durante una ventana de gracia post-disconnect
   *  (ver `disconnectedAt`). El sim sigue corriendo con input cero hasta
   *  que el cliente reconecte vía RejoinReq o expire el grace. */
  ws: WebSocket | null
  sessionId: string
  name: string
  slot: 0 | 1
  ready: boolean
  /** Timestamp (ms) cuando se cerró el WS. Null mientras está conectado.
   *  Si pasa más de RECONNECT_GRACE_MS, lo limpiamos como timeout real. */
  disconnectedAt: number | null
  /** What this player wants to look like — sent at handshake, retransmitted
   *  every tick in NetPlayer. Server treats it as opaque cosmetic data; the
   *  renderer on each client maps these ids to colors/shapes via
   *  `@stick/content`. */
  cosmetics: NetCosmetics
  /** Last input received from this client. Server samples it each tick. */
  input: { dx: number; dy: number; attack: boolean; shoot: boolean; skill: 0 | 1 | null }
  /** Authoritative sim entity (mirrors `sessionId`). */
  sim: Player
  /** Per-player combo state machine. */
  combat: CombatSystem
  /** Last echo of the server's ping nonce (for RTT, future use). */
  lastPongAt: number
  /** Downed (Left4Dead-style) state. While true, sim isn't ticked — the
   *  player lies on the floor at hp=0 until peer kills enough enemies. */
  downed: boolean
  /** Timestamp (Date.now()) when this player went down; null otherwise. */
  downedAt: number | null
  /** Counter of enemies the peer has killed since this player went down. */
  killsByPeerSinceDown: number
  /** Run buff accumulator. Acumula a través de las cards entre waves; se
   *  consulta vía closures cuando CombatSystem necesita dmg/crit. */
  runBuffs: RunBuffs
  /** Loadout (skills owned + equipped + weapon). Inmutable durante el run. */
  loadout: NetLoadout
  /** Stats efectivos derivados de loadout + runBuffs. Recomputado al spawn
   *  y tras cada wave-buff aplicado. Source of truth para dmg/crit/gold/maxHp. */
  effectiveStats: EffectiveStats
  /** Per-client RunState — albergue de timers de skills (tornadoTimer/Acc),
   *  cooldowns y demás estado que sim/`SkillSystem` y SkillContext exigen. */
  runState: RunState
  /** SkillSystem per-client — maneja cooldowns + dispatch a Skill.execute().
   *  Bus compartido con el resto de la sala; los efectos (damage AOE, FX
   *  events) afectan al mundo común. */
  skills: SkillSystem
}

const SIM_TICK_HZ = 30
const SIM_TICK_MS = 1000 / SIM_TICK_HZ
/** Grace post-disconnect antes de matar el slot. Suficiente para mobile
 *  Safari (~30s background timeout) más buffer para reabrir la app. */
const RECONNECT_GRACE_MS = 60_000

export class StickFightRoom {
  readonly code: string
  /** Monotonic tick counter. Resets on phase transition to 'playing'. */
  private tick = 0
  private phase: 'lobby' | 'playing' | 'gameover' = 'lobby'
  private seed = 0

  private readonly clients = new Map<string, RoomClient>()
  private nextSessionSeq = 0

  // Sim systems (instantiated on phase transition lobby → playing).
  private bus: SimBus | null = null
  private rng: Rng | null = null
  private waves: WaveSystem | null = null
  private enemies: EnemySystem | null = null
  private projectiles: ProjectileSystem | null = null
  private obstacles: ObstacleSystem | null = null

  /** setInterval handle for the sim tick. */
  private tickHandle: NodeJS.Timeout | null = null
  /** Used to compute dt (real ms between ticks). */
  private lastTickAt = 0

  /** Run-level counters mirrored from sim events into the broadcast snapshot. */
  private gold = 0
  private wave = 0
  private alive = 0
  private total = 0
  /** Total kills del run. Co-op shared (incrementa por cualquier kill).
   *  Usado para construir el RunReport submiteado al leaderboard al gameover. */
  private kills = 0
  /** Real timestamp (ms) cuando arrancó el run, para calcular durationSec. */
  private runStartedAt = 0

  /** Wave-buff: si != null, el tick global no avanza combate; los clientes
   *  ven las 3 cartas y deben votar. Se limpia al resolver. */
  private pendingBuffPhase: PendingBuffPhase | null = null

  constructor(
    code: string,
    private readonly onDispose: (code: string) => void,
  ) {
    this.code = code
  }

  /** Capacity check used by the server before calling `addClient`. */
  isFull(): boolean {
    return this.clients.size >= 2
  }

  isLocked(): boolean {
    return this.phase !== 'lobby'
  }

  /**
   * Add a freshly-connected client. Caller has already validated the
   * lobby code + capacity. Sends the lobby msg back over `ws`.
   */
  addClient(
    ws: WebSocket,
    name: string,
    cosmetics?: NetCosmetics,
    loadout?: NetLoadout,
  ): RoomClient {
    const sessionId = `s${this.code}-${this.nextSessionSeq++}`
    const slot: 0 | 1 = this.clients.size === 0 ? 0 : 1
    const spawnX = slot === 0 ? ARENA.width / 2 - 60 : ARENA.width / 2 + 60
    const spawnY = ARENA.height / 2
    const runBuffs = emptyRunBuffs()
    const effectiveLoadout = loadout ?? DEFAULT_LOADOUT
    // Compute stats efectivos UNA VEZ al ingresar — incluye weapon damage
    // base × levelBonus, golden passive, shield HP bonus, cdReduce.
    // Sin esto el server ignoraba el arma equipada (siempre dmg=1).
    const effectiveStats = computeStatsFor(runBuffs, effectiveLoadout)
    // Spawn con el maxHp efectivo (base 100 + shield bonus 30 si owned).
    const sim = createPlayer({ x: spawnX, y: spawnY, maxHp: effectiveStats.maxHp })

    // The combat system needs `getEnemies` — we late-bind it via a closure so
    // the WaveSystem (created later in startRun) can be referenced safely.
    // dmgMul/critChance también via closure: leen `effectiveStats` que se
    // recompone cuando el server resuelve una wave-buff card.
    const sharedBus = this.busOrFallback()
    const combat = new CombatSystem({
      bus: sharedBus,
      attackPatterns,
      getEnemies: () => this.waves?.getEnemies() ?? [],
      rngNext: () => this.rng?.next() ?? 0,
      getDmgMul: () => client.effectiveStats.dmgMul,
      getCritChance: () => client.effectiveStats.critChance,
      // Sin esto, tryShoot setea el cooldown pero la flecha NUNCA SPAWNEA.
      // ProjectileSystem.spawn lo llama el callback; ownerId='player' marca
      // la flecha como friendly (collide con enemies, no con peers).
      onShoot: ({ x, y, dirX, dirY, speed, dmg, life, radius }) => {
        this.projectiles?.spawn({
          type: 'arrow',
          x,
          y,
          dirX,
          dirY,
          speed,
          dmg,
          life,
          radius,
          ownerId: 'player',
        })
      },
    })
    const skills = new SkillSystem({ bus: sharedBus })
    const runState = createRunState({ seed: this.seed, playerMaxHp: effectiveStats.maxHp })

    const client: RoomClient = {
      ws,
      sessionId,
      name,
      slot,
      ready: false,
      disconnectedAt: null,
      cosmetics: cosmetics ?? DEFAULT_COSMETICS,
      input: { dx: 0, dy: 0, attack: false, shoot: false, skill: null },
      sim,
      combat,
      lastPongAt: Date.now(),
      downed: false,
      downedAt: null,
      killsByPeerSinceDown: 0,
      runBuffs,
      loadout: effectiveLoadout,
      effectiveStats,
      runState,
      skills,
    }
    this.clients.set(sessionId, client)
    console.info(
      `[stick_fight] ${this.code}: ${sessionId} (${name}) joined — weapon=${effectiveLoadout.weaponId}#${effectiveLoadout.weaponLevel} skills=[${effectiveLoadout.equippedSkills.join(',')}] owned=[${effectiveLoadout.ownedSkills.join(',')}] cosmeticsSkin=${client.cosmetics.skin}`,
    )

    // Send lobby snapshot to the new client.
    this.send(client.ws, this.lobbyMsg())
    // Notify the others (peer joined → re-send fresh lobby snapshot).
    this.broadcastExcept(client.sessionId, this.lobbyMsg())

    return client
  }

  /** Apply an incoming message from a known client. */
  handleMessage(client: RoomClient, msg: ClientMsg): void {
    switch (msg.t) {
      case 'ready':
        client.ready = true
        this.broadcast(this.lobbyMsg())
        if (this.phase === 'lobby' && this.allReady()) this.startRun()
        return
      case 'input': {
        // Clamp to [-1, 1] and renormalize if magnitude > 1.
        const cx = clamp01(msg.dx)
        const cy = clamp01(msg.dy)
        const mag = Math.hypot(cx, cy)
        if (mag <= 1) {
          client.input.dx = cx
          client.input.dy = cy
        } else {
          client.input.dx = cx / mag
          client.input.dy = cy / mag
        }
        // Edge actions are one-shot: store true, the next tick consumes them.
        if (msg.attack) client.input.attack = true
        if (msg.shoot) client.input.shoot = true
        if (msg.skill === 0 || msg.skill === 1) client.input.skill = msg.skill
        return
      }
      case 'leave':
        this.removeClient(client.sessionId, 'consented')
        return
      case 'wave-buff:vote':
        this.handleBuffVote(client, msg.buffId)
        return
      case 'host':
      case 'join':
        // Already-connected client trying to handshake again — ignore.
        return
    }
  }

  /**
   * Disconnect (network drop, mobile background, tab closed). En lobby
   * removemos directo (no hay nada que preservar). En playing o gameover
   * empezamos una ventana de gracia: el slot queda zombie por
   * `RECONNECT_GRACE_MS` antes de matarse. Mientras tanto el cliente
   * puede reclamarlo con un `rejoin` que matchee sessionId.
   */
  handleSocketClose(client: RoomClient): void {
    if (this.phase === 'lobby') {
      this.removeClient(client.sessionId, 'timeout')
      return
    }
    if (client.disconnectedAt !== null) return // ya marcado
    client.ws = null
    client.disconnectedAt = Date.now()
    // Reset transient input para que el sim no quede pegado en una direction.
    client.input.dx = 0
    client.input.dy = 0
    client.input.attack = false
    client.input.shoot = false
    client.input.skill = null
    console.info(
      `[stick_fight] ${this.code}: ${client.sessionId} (${client.name}) disconnected — ${RECONNECT_GRACE_MS / 1000}s grace`,
    )
  }

  /**
   * Reclama un slot zombie. Llamado por el server tras parsear un RejoinReq
   * exitoso. Devuelve el client si OK, null si el sessionId no existe / ya
   * está conectado / código no matchea.
   */
  rejoinClient(ws: WebSocket, sessionId: string): RoomClient | null {
    const c = this.clients.get(sessionId)
    if (!c) return null
    if (c.ws !== null) return null // ya conectado, doble-rejoin no permitido
    c.ws = ws
    c.disconnectedAt = null
    console.info(`[stick_fight] ${this.code}: ${sessionId} (${c.name}) rejoined`)
    // El cliente que reconectó necesita re-sincronizar UI: su lobbyMsg con
    // sessionId/slot scoped + el state actual (lo recibirá en el próximo tick).
    this.send(c.ws, this.lobbyMsgFor(c))
    return c
  }

  // -------------------------------------------------------------------- inner

  private allReady(): boolean {
    if (this.clients.size === 0) return false
    for (const c of this.clients.values()) if (!c.ready) return false
    return true
  }

  private startRun(): void {
    this.seed = Math.floor(Math.random() * 0xffffffff)
    this.phase = 'playing'
    this.tick = 0
    this.lastTickAt = Date.now()
    this.runStartedAt = Date.now()
    this.kills = 0
    this.gold = 0

    this.bus = createEventBus()
    this.rng = createRng(this.seed)
    this.projectiles = new ProjectileSystem({
      bus: this.bus,
      // Player arrows colisionan contra enemies — sin esto las flechas
      // vuelan eternamente sin hacer daño. Misma firma que SP.
      getEnemies: () => this.waves?.getEnemies() ?? [],
    })
    this.enemies = new EnemySystem({
      bus: this.bus,
      rng: this.rng,
      projectiles: this.projectiles,
    })
    this.waves = new WaveSystem({ bus: this.bus, rng: this.rng })
    this.obstacles = new ObstacleSystem({ bus: this.bus, rng: this.rng })
    this.obstacles.generate()

    // Mirror sim events into broadcast counters.
    this.bus.on('wave:start', ({ wave, totalEnemies }) => {
      this.wave = wave
      this.total = totalEnemies
      this.alive = totalEnemies
    })
    this.bus.on('wave:enemies:changed', ({ alive, total }) => {
      this.alive = alive
      this.total = total
    })

    // Cada kill: reviva counters + drop de gold (co-op shared wallet).
    // El sim no emite gold:changed por su cuenta; era un hook speculativo.
    // Acá computamos la recompensa con el goldMul más alto de los players
    // vivos (premia tener `golden` passive equipado por al menos uno).
    this.bus.on('enemy:death', ({ enemyId, byPlayer }) => {
      // Revival progress (any kill counts — ver F5R'-C-3).
      for (const c of this.clients.values()) {
        if (!c.downed) continue
        c.killsByPeerSinceDown++
        console.info(
          `[stick_fight] ${this.code}: ${c.sessionId} (${c.name}) revival ${c.killsByPeerSinceDown}/${REVIVAL_KILLS_REQUIRED}`,
        )
        if (c.killsByPeerSinceDown >= REVIVAL_KILLS_REQUIRED) {
          this.reviveClient(c)
        }
      }
      if (!byPlayer) return
      this.kills++
      // Look up the dead enemy in the wave system to read its content config.
      // The enemy aún está en la lista (CombatSystem emite antes de reapDead).
      const enemy = this.waves?.getEnemies().find((e) => e.id === enemyId)
      if (!enemy) return
      let goldReward = 0
      try {
        goldReward = getEnemyType(enemy.typeId).goldReward
      } catch {
        return
      }
      const bestMul = this.bestGoldMul()
      const gain = Math.floor(goldReward * bestMul)
      if (gain <= 0) return
      this.gold += gain
    })

    // Wave terminada → pausamos el tick global y abrimos votación de buff.
    this.bus.on('wave:complete', ({ wave }) => this.openBuffPhase(wave))

    // Re-bind each client's CombatSystem now that bus/rng are real (the
    // closures in the constructors already point to `this.waves` etc.).
    // Nothing to do — the closures resolve lazily.

    this.broadcast({ t: 'phase', phase: 'playing', seed: this.seed } satisfies PhaseMsg)
    this.broadcast(this.lobbyMsg())
    this.waves.startNextWave()

    this.tickHandle = setInterval(() => this.tickOnce(), SIM_TICK_MS)
  }

  private tickOnce(): void {
    const now = Date.now()
    const dt = (now - this.lastTickAt) / 1000
    this.lastTickAt = now
    if (dt <= 0 || dt > 1) {
      // Sanity: skip ticks with absurd dt (server hiccup, tab thaw).
      return
    }

    // Reap zombies: clientes con WS cerrado por más del grace window.
    for (const c of Array.from(this.clients.values())) {
      if (c.disconnectedAt !== null && now - c.disconnectedAt > RECONNECT_GRACE_MS) {
        console.info(
          `[stick_fight] ${this.code}: ${c.sessionId} (${c.name}) reconnect grace expired — kicking`,
        )
        this.removeClient(c.sessionId, 'timeout')
      }
    }

    if (this.phase !== 'playing' || !this.waves || !this.enemies || !this.projectiles) return

    // Wave-buff voting: si está abierto, no avanzamos sim. Solo chequeamos
    // timeout (autopick) y seguimos broadcasteando state para que el HUD
    // de cada cliente refleje lo último (HP, gold, etc.).
    if (this.pendingBuffPhase) {
      if (now >= this.pendingBuffPhase.expiresAt) this.autopickRemainingAndClose()
      // Pausar el rescue clock: el time-to-revive no debe correr mientras los
      // jugadores están votando y no pueden matar enemies.
      for (const c of this.clients.values()) {
        if (c.downed && c.downedAt !== null) c.downedAt += SIM_TICK_MS
      }
      this.tick++
      this.broadcast(this.stateMsg())
      return
    }

    // Per-player: input + movement + combat tick + edge actions.
    // Downed players are skipped — they lie on the floor at hp=0 waiting
    // for a peer to revive them.
    for (const c of this.clients.values()) {
      if (c.downed) {
        // Pin the sim so it doesn't drift (no input, no AI consequences).
        c.sim.vx = 0
        c.sim.vy = 0
        c.input.attack = false
        c.input.shoot = false
        c.input.skill = null
        continue
      }
      updateMovement(c.sim, { x: c.input.dx, y: c.input.dy }, dt)
      c.combat.update(c.sim, dt)
      // Tick de cooldowns de skills. SkillSystem.update emite
      // 'skill:cooldown:changed' al bus compartido — Sprint 2.4 lo broadcastea.
      c.skills.update(c.runState, dt)
      // Regen pasivo. `effectiveStats.regenPerSec` ya combina runBuffs.regen
      // con el bonus implícito que pueda venir de skills futuras.
      if (c.effectiveStats.regenPerSec > 0 && c.sim.hp > 0) {
        c.sim.hp = Math.min(c.sim.maxHp, c.sim.hp + c.effectiveStats.regenPerSec * dt)
      }
      // Tornado AOE per-client: si la skill seteó tornadoTimer, drainamos +
      // aplicamos daño cada SWORD_TORNADO_TICK_SEC. Copia 1:1 de loop.ts.
      this.tickTornado(c, dt)
      if (c.input.attack) {
        c.combat.tryAttack(c.sim)
        c.input.attack = false
      }
      if (c.input.shoot) {
        c.combat.tryShoot(c.sim)
        c.input.shoot = false
      }
      // Skill cast: el cliente envía slot 0|1 cuando aprieta Q/E. Lo
      // consumimos one-shot y lo pasamos a SkillSystem.cast() — misma
      // ruta que SP, mismas skills (kiBlast, swordTornado, finalFlash, etc).
      if (c.input.skill !== null && this.waves) {
        const slot = c.input.skill
        const skillId = c.loadout.equippedSkills[slot]
        if (skillId) {
          const fired = c.skills.cast({
            slot,
            skillId,
            cdMul: c.effectiveStats.cdMul,
            ctx: {
              player: c.sim,
              enemies: this.waves.getEnemies(),
              bus: this.bus!,
              rng: this.rng!,
              runState: c.runState,
              dmgMul: c.effectiveStats.dmgMul,
            },
          })
          // Broadcast a TODOS para que cada cliente pinte el FX (aura burst,
          // shockwave, etc) en la posición del caster. Sin esto las skills
          // del peer son invisibles — solo se ven por el daño aplicado.
          if (fired) {
            this.broadcast({
              t: 'skill:cast',
              sessionId: c.sessionId,
              skillId,
              x: c.sim.x,
              y: c.sim.y,
              facingX: c.sim.facingX,
              facingY: c.sim.facingY,
            })
          }
        }
        c.input.skill = null
      }

      // Did this player just go down?
      if (c.sim.hp <= 0) {
        this.markDowned(c)
      }
    }

    // Shared world tick. EnemySystem en multi recibe TODOS los players vivos
    // y cada enemy elige su target (el más cercano). Sin esto, los enemies
    // se pegaban siempre al host (slot 0) y el peer (slot 1) era invisible.
    const alivePlayers: Player[] = []
    for (const c of this.clients.values()) if (!c.downed) alivePlayers.push(c.sim)
    const enemiesList = this.waves.getEnemies()
    if (alivePlayers.length > 0) {
      this.enemies.updateMulti(enemiesList, alivePlayers, dt)
      // Projectile target: por ahora usamos el primero (el ProjectileSystem
      // chequea collision contra ese target). En F multi-target completo,
      // querríamos que cada projectile recuerde su target original.
      this.projectiles.update(alivePlayers[0]!, dt)
      this.waves.update(dt)
      this.waves.reapDead()
      if (this.obstacles) {
        this.obstacles.update(dt)
        for (const c of this.clients.values()) {
          if (!c.downed) this.obstacles.applyPlayerCollision(c.sim)
        }
        for (const e of enemiesList) {
          this.obstacles.applyCollision(e, 16)
        }
      }
    }

    // Watchdog: end the run if everyone is downed, or if the downed peer's
    // timer expired with no rescue. Only one player downed → the run keeps
    // going until either the revival happens or the survivor also falls.
    this.checkGameOver()

    this.tick++
    this.broadcast(this.stateMsg())
  }

  /** Returns the first non-downed client (used by EnemySystem for AI target). */
  private firstAlive(): RoomClient | undefined {
    for (const c of this.clients.values()) if (!c.downed) return c
    return undefined
  }

  /** Mejor goldMul entre los vivos. En co-op con shared wallet, esto premia
   *  que cualquiera tenga `golden` passive equipado o haya pickeado +oro. */
  private bestGoldMul(): number {
    let best = 1
    for (const c of this.clients.values()) {
      if (c.downed) continue
      if (c.effectiveStats.goldMul > best) best = c.effectiveStats.goldMul
    }
    return best
  }

  /** Tornado per-client: drena el timer + aplica AOE damage a enemies en
   *  radio cada SWORD_TORNADO_TICK_SEC. Copiado de loop.ts (sim) — sin
   *  poder llamar a tickArena() entero porque es per-room (1 mundo, 2 sims). */
  private tickTornado(c: RoomClient, dt: number): void {
    const rs = c.runState
    if (rs.tornadoTimer > 0) {
      rs.tornadoTimer = Math.max(0, rs.tornadoTimer - dt)
      rs.tornadoTickAcc += dt
      while (rs.tornadoTickAcc >= SWORD_TORNADO_TICK_SEC) {
        rs.tornadoTickAcc -= SWORD_TORNADO_TICK_SEC
        this.applyTornadoDamage(c, c.effectiveStats.dmgMul * SWORD_TORNADO_DMG_MUL)
      }
    } else {
      rs.tornadoTickAcc = 0
    }
  }

  /** Damage pulse ring around the player. Hits every alive enemy within radius. */
  private applyTornadoDamage(c: RoomClient, dmg: number): void {
    if (!this.waves) return
    const enemies = this.waves.getEnemies()
    for (const e of enemies) {
      const dx = e.x - c.sim.x
      const dy = e.y - c.sim.y
      if (Math.hypot(dx, dy) > SWORD_TORNADO_RADIUS) continue
      e.hp -= dmg
      e.hurtFlash = 0.18
      if (e.hp <= 0) {
        // Emite enemy:death — los listeners (revival, gold, audio) reaccionan.
        this.bus!.emit('enemy:death', { enemyId: e.id, byPlayer: true })
      } else {
        this.bus!.emit('combat:hit', {
          attackerId: c.sessionId,
          targetId: e.id,
          dmg,
          crit: false,
        })
      }
    }
  }

  /** Transition a client from alive → downed: hp=0, sim frozen, peer's
   *  revival counter reset, broadcast handled implicitly by next tick. */
  private markDowned(c: RoomClient): void {
    c.downed = true
    c.downedAt = Date.now()
    c.killsByPeerSinceDown = 0
    c.sim.hp = 0
    c.sim.vx = 0
    c.sim.vy = 0
    c.sim.iframes = 0
    c.sim.attackTimer = 0
    c.sim.attackKind = null
    console.info(`[stick_fight] ${this.code}: ${c.sessionId} (${c.name}) downed`)
  }

  /** Revive a downed client. Restaura HP + iframes y empuja enemies cercanos
   *  hacia afuera para que no muera instantáneo apenas expire la gracia. */
  private reviveClient(c: RoomClient): void {
    c.downed = false
    c.downedAt = null
    c.killsByPeerSinceDown = 0
    c.sim.hp = Math.max(1, Math.floor(c.sim.maxHp * REVIVAL_HP_FRACTION))
    c.sim.iframes = REVIVAL_IFRAMES_SEC
    // Push de enemies cercanos en dirección opuesta al player para
    // descongestionar el spawn point.
    if (this.waves) {
      for (const e of this.waves.getEnemies()) {
        const dx = e.x - c.sim.x
        const dy = e.y - c.sim.y
        const dist = Math.hypot(dx, dy)
        if (dist > 0 && dist < REVIVAL_PUSH_RADIUS) {
          const inv = 1 / dist
          e.vx = dx * inv * REVIVAL_PUSH_FORCE
          e.vy = dy * inv * REVIVAL_PUSH_FORCE
          // Cancela cualquier swing en curso para que no nos peguen apenas
          // expire iframes.
          e.attackTimer = 0
          e.attackKind = null
        }
      }
    }
    console.info(
      `[stick_fight] ${this.code}: ${c.sessionId} (${c.name}) revived → hp=${c.sim.hp}/${c.sim.maxHp} iframes=${REVIVAL_IFRAMES_SEC}s`,
    )
  }

  /** End the run if (a) everyone is downed, or (b) the downed timer expired. */
  private checkGameOver(): void {
    if (this.clients.size === 0) return
    const all = Array.from(this.clients.values())
    const alive = all.filter((c) => !c.downed)
    if (alive.length === 0) {
      this.endRun('all-downed')
      return
    }
    // Single downed: did its rescue clock expire?
    const now = Date.now()
    for (const c of all) {
      if (c.downed && c.downedAt && now - c.downedAt > DOWNED_TIMEOUT_MS) {
        this.endRun('rescue-timeout')
        return
      }
    }
  }

  private endRun(reason: 'all-downed' | 'rescue-timeout'): void {
    if (this.phase !== 'playing') return
    this.phase = 'gameover'
    // Si había votación pendiente la cancelamos — el run terminó.
    this.pendingBuffPhase = null
    const durationSec = (Date.now() - this.runStartedAt) / 1000
    console.info(
      `[stick_fight] ${this.code}: gameover (${reason}) wave=${this.wave} kills=${this.kills} gold=${this.gold} dur=${durationSec.toFixed(1)}s`,
    )
    // El seed se reenvía para que cada cliente lo incluya en su RunReport
    // submiteado al api de leaderboard. El summary lleva los stats finales.
    this.broadcast({
      t: 'phase',
      phase: 'gameover',
      seed: this.seed,
      summary: {
        wave: this.wave,
        kills: this.kills,
        gold: this.gold,
        durationSec,
      },
    } satisfies PhaseMsg)
  }

  // ----------------------------------------------------- wave-buff voting

  /** Abre votación entre waves. Pausa el sim global, ofrece 3 cartas, espera
   *  votos. La siguiente wave arranca cuando se resuelve. */
  private openBuffPhase(wave: number): void {
    if (!this.rng) return
    if (this.pendingBuffPhase) return // defensa: ya abierto
    const offer = WaveBuffSystem.rollOffer(this.rng, 3)
    this.pendingBuffPhase = {
      wave,
      buffIds: offer.map((b) => b.id),
      expiresAt: Date.now() + WAVE_BUFF_TIMEOUT_MS,
      votes: new Map(),
    }
    this.broadcast({
      t: 'wave-buff:offer',
      wave,
      buffIds: this.pendingBuffPhase.buffIds,
      timeoutSec: Math.ceil(WAVE_BUFF_TIMEOUT_MS / 1000),
    } satisfies WaveBuffOfferMsg)
    this.broadcast(this.votesMsg())
  }

  private handleBuffVote(client: RoomClient, buffId: string): void {
    const phase = this.pendingBuffPhase
    if (!phase) return
    if (!phase.buffIds.includes(buffId)) return // pick inválido (anti-tampering)
    if (phase.votes.has(client.sessionId)) return // ya picó — no permitir cambio
    phase.votes.set(client.sessionId, buffId)

    // Aplicar SOLO a este cliente — cada quien recibe su propia bendición,
    // sin compartir con el peer. Esta es la diferencia clave vs el flow viejo
    // que mergeaba ambos votos en un único buff aplicado a los dos.
    this.applyBuffToClient(client, buffId)
    this.broadcast({
      t: 'wave-buff:resolved',
      sessionId: client.sessionId,
      wave: phase.wave,
      buffId,
      reason: 'picked',
    } satisfies WaveBuffResolvedMsg)
    console.info(
      `[stick_fight] ${this.code}: ${client.sessionId} (${client.name}) picked → ${buffId}`,
    )
    this.broadcast(this.votesMsg())

    // Todos los clientes activos picaron → cerrar fase y reanudar.
    if (this.allActivePicked()) this.closeBuffPhase()
  }

  /** Cuántos clientes "activos" deben picar antes de cerrar la fase. Excluye
   *  zombies con `ws=null` (en grace) — sus picks vendrán por autopick si
   *  nunca reconectan. Incluye downed (al revivir el buff sigue vigente). */
  private activeClientsCount(): number {
    let n = 0
    for (const c of this.clients.values()) if (c.ws) n++
    return n
  }

  private allActivePicked(): boolean {
    const phase = this.pendingBuffPhase
    if (!phase) return false
    let needed = 0
    for (const c of this.clients.values()) {
      if (!c.ws) continue
      if (!phase.votes.has(c.sessionId)) return false
      needed++
    }
    return needed > 0
  }

  /** Timeout llegó: cualquiera que no picó recibe random de la oferta. Per-cliente. */
  private autopickRemainingAndClose(): void {
    const phase = this.pendingBuffPhase
    if (!phase || !this.rng) return
    for (const c of this.clients.values()) {
      if (!c.ws) continue
      if (phase.votes.has(c.sessionId)) continue
      const idx = Math.floor(this.rng.next() * phase.buffIds.length)
      const pick = phase.buffIds[idx] ?? phase.buffIds[0]
      if (!pick) continue
      phase.votes.set(c.sessionId, pick)
      this.applyBuffToClient(c, pick)
      this.broadcast({
        t: 'wave-buff:resolved',
        sessionId: c.sessionId,
        wave: phase.wave,
        buffId: pick,
        reason: 'autopick',
      } satisfies WaveBuffResolvedMsg)
      console.info(`[stick_fight] ${this.code}: ${c.sessionId} (${c.name}) autopicked → ${pick}`)
    }
    this.broadcast(this.votesMsg())
    this.closeBuffPhase()
  }

  /** Cierra la fase: limpia el offer, reanuda el sim, arranca la siguiente wave. */
  private closeBuffPhase(): void {
    const phase = this.pendingBuffPhase
    if (!phase || !this.waves) return
    this.pendingBuffPhase = null
    this.broadcast({ t: 'wave-buff:end', wave: phase.wave } satisfies WaveBuffEndMsg)
    console.info(`[stick_fight] ${this.code}: wave ${phase.wave} buff phase closed`)
    this.waves.startNextWave()
  }

  /** Aplica un wave buff: muta `runBuffs` (acumulador), recompila stats
   *  efectivos vía `BuffSystem.computeStats()` y sincroniza el sim del
   *  player. Misma fórmula que SP — sin drift entre los dos lados. */
  private applyBuffToClient(c: RoomClient, buffId: string): void {
    const buff = getWaveBuff(buffId)
    const rb = c.runBuffs
    switch (buff.kind) {
      case 'dmg':
        rb.dmg += buff.value
        break
      case 'atkSpeed':
        rb.atkSpeed += buff.value
        break
      case 'crit':
        rb.crit += buff.value
        break
      case 'knockback':
        rb.knockback += buff.value
        break
      case 'gold':
        rb.gold += buff.value
        break
      case 'regen':
        rb.regen += buff.value
        break
      case 'hpMax':
        rb.hpMax += buff.value
        // No mutamos c.sim.maxHp directo: lo deriva el recompute abajo.
        // Sí healeamos por el delta — coincide con SP.
        c.sim.hp = c.sim.hp + buff.value
        break
      case 'heal':
        c.sim.hp = c.sim.maxHp
        break
    }
    // Recompute → propaga a CombatSystem (vía closure), regen tick, gold mul,
    // maxHp del sim, y broadcast (vía stateMsg lee de effectiveStats).
    c.effectiveStats = computeStatsFor(rb, c.loadout)
    c.sim.maxHp = c.effectiveStats.maxHp
    c.sim.hp = Math.min(c.sim.maxHp, c.sim.hp)
  }

  private votesMsg(): WaveBuffVotesMsg {
    const phase = this.pendingBuffPhase
    return {
      t: 'wave-buff:votes',
      votes: Array.from(this.clients.values()).map((c) => ({
        sessionId: c.sessionId,
        buffId: phase?.votes.get(c.sessionId) ?? null,
      })),
    }
  }

  private removeClient(sessionId: string, reason: 'consented' | 'timeout' | 'kicked'): void {
    const client = this.clients.get(sessionId)
    if (!client) return
    this.clients.delete(sessionId)
    try {
      client.ws?.close()
    } catch {
      // ignore — already closed
    }

    if (this.clients.size === 0) {
      // Empty room — stop ticking and tell the registry to forget us.
      if (this.tickHandle) {
        clearInterval(this.tickHandle)
        this.tickHandle = null
      }
      this.onDispose(this.code)
      return
    }

    this.broadcast({ t: 'peer-left', sessionId, reason } satisfies ServerMsg)
    this.broadcast(this.lobbyMsg())
  }

  // -------------------------------------------------------------------- msgs

  private lobbyMsg(): LobbyMsg | LobbyMsg {
    return {
      t: 'lobby',
      code: this.code,
      // Lobby is a snapshot — `sessionId` is per-receiver, not "the" id.
      // Each client should match by their own connection's sessionId in
      // the players array (we put their full list here).
      sessionId: '',
      slot: 0,
      players: Array.from(this.clients.values()).map((c) => ({
        sessionId: c.sessionId,
        name: c.name,
        slot: c.slot,
        ready: c.ready,
      })),
    }
  }

  /** Like `lobbyMsg()` but with sessionId/slot scoped to the receiver — used
   *  when sending to a specific client so they know which row is "them". */
  private lobbyMsgFor(client: RoomClient): LobbyMsg {
    return { ...this.lobbyMsg(), sessionId: client.sessionId, slot: client.slot }
  }

  private stateMsg(): StateMsg {
    const players: NetPlayer[] = []
    for (const c of this.clients.values()) {
      const es = c.effectiveStats
      players.push({
        sessionId: c.sessionId,
        name: c.name,
        slot: c.slot,
        x: c.sim.x,
        y: c.sim.y,
        vx: c.sim.vx,
        vy: c.sim.vy,
        facingX: c.sim.facingX,
        facingY: c.sim.facingY,
        walkPhase: c.sim.walkPhase,
        attackKind: c.sim.attackKind ?? '',
        attackTimer: c.sim.attackTimer,
        attackDuration: c.sim.attackDuration,
        attackDirX: c.sim.attackDirX,
        attackDirY: c.sim.attackDirY,
        bowTimer: c.sim.bowTimer,
        bowDuration: c.sim.bowDuration,
        bowDirX: c.sim.bowDirX,
        bowDirY: c.sim.bowDirY,
        hp: Math.max(0, Math.floor(c.sim.hp)),
        maxHp: c.sim.maxHp,
        cosmetics: c.cosmetics,
        downed: c.downed,
        revivalProgress: c.downed
          ? Math.min(1, c.killsByPeerSinceDown / REVIVAL_KILLS_REQUIRED)
          : 0,
        // Stats efectivos derivados por BuffSystem.computeStats() — incluyen
        // weapon damage × levelBonus, golden passive 1.5x, shield +30 HP, etc.
        // El cliente diff'ea esto para emitir `stats:changed` en su bus local.
        stats: {
          dmgMul: es.dmgMul,
          atkSpeedMul: es.atkSpeedMul,
          critChance: es.critChance,
          regenPerSec: es.regenPerSec,
          knockbackMul: es.knockbackMul,
          goldMul: es.goldMul,
        },
        skillSlots: c.loadout.equippedSkills,
        skillCooldowns: [
          { remaining: c.skills.getCooldown(0), total: c.skills.getCooldownTotal(0) },
          { remaining: c.skills.getCooldown(1), total: c.skills.getCooldownTotal(1) },
        ],
      })
    }

    const enemiesList: NetEnemy[] = []
    if (this.waves) {
      for (const e of this.waves.getEnemies() as Enemy[]) {
        enemiesList.push({
          id: e.id,
          typeId: e.typeId,
          x: e.x,
          y: e.y,
          vx: e.vx,
          vy: e.vy,
          facingX: e.facingX,
          facingY: e.facingY,
          walkPhase: e.walkPhase,
          attackKind: e.attackKind ?? '',
          attackTimer: e.attackTimer,
          attackDuration: e.attackDuration,
          attackDirX: e.attackDirX,
          attackDirY: e.attackDirY,
          hp: Math.max(0, Math.floor(e.hp)),
          maxHp: e.maxHp,
          hurtFlash: e.hurtFlash,
        })
      }
    }

    const obstaclesList: NetObstacle[] = []
    if (this.obstacles) {
      for (const o of this.obstacles.getAll() as Obstacle[]) {
        obstaclesList.push({
          id: o.id,
          type: o.type,
          x: o.x,
          y: o.y,
          r: o.r,
          hp: Math.max(0, Math.floor(o.hp)),
          hpMax: o.hpMax,
          hitFlash: o.hitFlash,
        })
      }
    }

    const projectilesList: NetProjectile[] = []
    if (this.projectiles) {
      for (const p of this.projectiles.getAll()) {
        projectilesList.push({
          id: p.id,
          type: p.type,
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          ownerId: p.ownerId,
        })
      }
    }

    return {
      t: 'state',
      tick: this.tick,
      players,
      enemies: enemiesList,
      obstacles: obstaclesList,
      projectiles: projectilesList,
      wave: this.wave,
      alive: this.alive,
      total: this.total,
      gold: this.gold,
    }
  }

  private send(ws: WebSocket | null, msg: ServerMsg): void {
    if (!ws) return // cliente en grace — no hay socket
    if (ws.readyState !== ws.OPEN) return
    try {
      ws.send(encodeMsg(msg))
    } catch (err) {
      console.error('[room] send failed:', err)
    }
  }

  private broadcast(msg: ServerMsg): void {
    if (msg.t === 'lobby') {
      // Lobby msg is per-receiver (sessionId/slot scoped) so we send a
      // fresh one per client.
      for (const c of this.clients.values()) this.send(c.ws, this.lobbyMsgFor(c))
      return
    }
    for (const c of this.clients.values()) this.send(c.ws, msg)
  }

  private broadcastExcept(sessionId: string, msg: ServerMsg): void {
    for (const c of this.clients.values()) {
      if (c.sessionId === sessionId) continue
      this.send(c.ws, msg.t === 'lobby' ? this.lobbyMsgFor(c) : msg)
    }
  }

  /** Returns `this.bus` if it's ready, otherwise a throwaway bus so
   *  CombatSystem can construct in lobby phase before startRun(). The
   *  combat system doesn't emit until tick(), by which point bus is real. */
  private busOrFallback(): SimBus {
    if (this.bus) return this.bus
    this.bus = createEventBus()
    return this.bus
  }

  /** Used by callers (e.g. graceful shutdown). */
  closeAll(): void {
    for (const c of this.clients.values()) {
      try {
        c.ws?.close(1001, 'server-shutdown')
      } catch {
        // ignore
      }
    }
    this.clients.clear()
    if (this.tickHandle) {
      clearInterval(this.tickHandle)
      this.tickHandle = null
    }
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < -1) return -1
  if (n > 1) return 1
  return n
}

/**
 * Wrapper sobre `BuffSystem.computeStats()` con args del room. Misma fórmula
 * que SP — sin drift entre los dos lados (Sprint 2 unificación).
 */
function computeStatsFor(rb: RunBuffs, loadout: NetLoadout): EffectiveStats {
  return BuffSystem.computeStats({
    ownedSkills: loadout.ownedSkills,
    runBuffs: rb,
    equippedWeaponId: loadout.weaponId,
    weaponLevel: loadout.weaponLevel,
  })
}
