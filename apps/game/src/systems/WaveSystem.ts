import { type EnemyType, getEnemyType } from '@stick/content'
import type { Rng } from '@stick/sim'

import type { EventBus } from '../app/eventBus'
import { ARENA } from '../core/arena'
import { type Enemy, createEnemy } from '../entities/Enemy'

/** How many enemies a wave contains. F1.4 keeps it static; F2 scales by wave number. */
const WAVE_SIZE = 5
/** Seconds between consecutive spawns. */
const SPAWN_INTERVAL_SEC = 0.4
/** Seconds of pause between the last kill and the next wave starting. */
const INTER_WAVE_DELAY_SEC = 1.5

export interface WaveSystemOptions {
  bus: EventBus
  rng: Rng
}

/**
 * Manages wave lifecycle: spawn enemies from arena edges, count down spawns
 * and alive enemies, fire wave:start / wave:complete events on the bus.
 */
export class WaveSystem {
  private readonly bus: EventBus
  private readonly rng: Rng
  /** Currently-active enemies (live and dead — caller is responsible for removal). */
  private readonly enemies: Enemy[] = []

  private currentWave = 0
  private toSpawn = 0
  private spawnTimer = 0
  private interWaveTimer = 0
  private state: 'idle' | 'spawning' | 'awaiting-clear' | 'between-waves' = 'idle'

  constructor(opts: WaveSystemOptions) {
    this.bus = opts.bus
    this.rng = opts.rng

    this.bus.on('enemy:death', () => this.onEnemyDeath())
  }

  startNextWave(): void {
    this.currentWave++
    this.toSpawn = WAVE_SIZE
    this.spawnTimer = 0
    this.state = 'spawning'
    this.bus.emit('wave:start', { wave: this.currentWave, totalEnemies: WAVE_SIZE })
  }

  /** Externally readable. ArenaScene reads this to render and pass to systems. */
  getEnemies(): Enemy[] {
    return this.enemies
  }

  get wave(): number {
    return this.currentWave
  }

  update(dt: number): void {
    switch (this.state) {
      case 'spawning': {
        this.spawnTimer -= dt
        while (this.spawnTimer <= 0 && this.toSpawn > 0) {
          this.spawnEnemy('grunt')
          this.toSpawn--
          this.spawnTimer += SPAWN_INTERVAL_SEC
        }
        if (this.toSpawn === 0) this.state = 'awaiting-clear'
        break
      }
      case 'awaiting-clear': {
        if (this.allDead()) {
          this.bus.emit('wave:complete', { wave: this.currentWave })
          this.interWaveTimer = INTER_WAVE_DELAY_SEC
          this.state = 'between-waves'
        }
        break
      }
      case 'between-waves': {
        this.interWaveTimer -= dt
        if (this.interWaveTimer <= 0) this.startNextWave()
        break
      }
      case 'idle':
        break
    }
  }

  /** Removes any enemy whose hp is <= 0. Call after EnemySystem.update(). */
  reapDead(): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]
      if (e && e.hp <= 0) this.enemies.splice(i, 1)
    }
  }

  private spawnEnemy(typeId: string): void {
    const type: EnemyType = getEnemyType(typeId)
    const { x, y } = this.pickSpawnPoint()
    this.enemies.push(createEnemy({ type, x, y }))
  }

  private pickSpawnPoint(): { x: number; y: number } {
    // Pick one of the four arena edges, then a random position along it.
    const edge = this.rng.int(0, 4)
    const margin = 50
    const w = ARENA.width
    const h = ARENA.height
    switch (edge) {
      case 0:
        return { x: this.rng.float(margin, w - margin), y: margin }
      case 1:
        return { x: w - margin, y: this.rng.float(margin, h - margin) }
      case 2:
        return { x: this.rng.float(margin, w - margin), y: h - margin }
      default:
        return { x: margin, y: this.rng.float(margin, h - margin) }
    }
  }

  private allDead(): boolean {
    for (const e of this.enemies) if (e.hp > 0) return false
    return true
  }

  private onEnemyDeath(): void {
    // The actual removal happens in `reapDead()` after the frame; we just
    // need to ensure state transitions don't fire prematurely.
  }
}
