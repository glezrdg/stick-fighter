import { type EnemyType, getEnemyType } from '@stick/content'
import type { Rng } from '@stick/sim'

import type { EventBus } from '../app/eventBus'
import { ARENA } from '../core/arena'
import { type Enemy, createEnemy } from '../entities/Enemy'

/** Seconds between consecutive spawns. */
const SPAWN_INTERVAL_SEC = 0.4
/** Seconds of pause between the last kill and the next wave starting. */
const INTER_WAVE_DELAY_SEC = 1.5

export interface WaveSystemOptions {
  bus: EventBus
  rng: Rng
}

/**
 * Wave lifecycle + spawning. Replaces the legacy `startWave`, `pickEnemyType`,
 * and the inline scaling math (lines 1051-1102, 1113-1114).
 *
 * Per-wave totals: `5 + floor(wave * 2.5) + floor(wave / 2)` (legacy 1054).
 * HP / DMG scaling applied at spawn time (legacy 1113-1114).
 *
 * Pool weights (legacy 1085-1102):
 *   grunt always available; ninja from wave 2; spear w3; brute w4; dual w5;
 *   berserk w6; mage w7; heavy w8. Grunt slots are pruned by `min(15, wave*2)`
 *   each wave, so by ~wave 8+ they're gone entirely and tougher enemies dominate.
 *
 * Boss waves: every wave divisible by 5 spawns a single boss as the FIRST
 * enemy of the wave (replacing one of the regular slots).
 */
export class WaveSystem {
  private readonly bus: EventBus
  private readonly rng: Rng
  private readonly enemies: Enemy[] = []

  private currentWave = 0
  private waveTotal = 0
  private toSpawn = 0
  private spawned = 0
  private spawnTimer = 0
  private interWaveTimer = 0
  private state: 'idle' | 'spawning' | 'awaiting-clear' | 'between-waves' = 'idle'

  constructor(opts: WaveSystemOptions) {
    this.bus = opts.bus
    this.rng = opts.rng
  }

  startNextWave(): void {
    this.currentWave++
    this.waveTotal = totalEnemiesForWave(this.currentWave)
    this.toSpawn = this.waveTotal
    this.spawned = 0
    this.spawnTimer = 0
    this.state = 'spawning'
    this.bus.emit('wave:start', { wave: this.currentWave, totalEnemies: this.waveTotal })
  }

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
          this.spawnNext()
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

  private spawnNext(): void {
    const isBossSlot = this.currentWave % 5 === 0 && this.spawned === 0
    const typeId = isBossSlot ? 'boss' : pickEnemyType(this.currentWave, this.rng)
    const type: EnemyType = getEnemyType(typeId)
    const { x, y } = this.pickSpawnPoint()
    const hpScale = hpScaleForWave(this.currentWave)
    const dmgScale = dmgScaleForWave(this.currentWave)
    const hp = Math.ceil(type.hp * hpScale)
    const dmg = Math.ceil(type.dmg * dmgScale)
    this.enemies.push(createEnemy({ type, x, y, hp, dmg }))
    this.spawned++
  }

  private pickSpawnPoint(): { x: number; y: number } {
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
}

// ---- Pure helpers (exported for tests + future server-side reuse) -------

/** Total enemies in a given wave (legacy line 1054). */
export function totalEnemiesForWave(wave: number): number {
  return 5 + Math.floor(wave * 2.5) + Math.floor(wave / 2)
}

/** HP multiplier applied to each enemy spawned in this wave (legacy 1113). */
export function hpScaleForWave(wave: number): number {
  return 1 + Math.floor(wave / 5) * 0.5 + wave * 0.05
}

/** Damage multiplier applied to each enemy spawned in this wave (legacy 1114). */
export function dmgScaleForWave(wave: number): number {
  return 1 + Math.floor(wave / 5) * 0.2 + wave * 0.03
}

/** Weighted enemy-type pool by wave (legacy 1085-1102). Boss is handled
 *  separately as the first spawn of every wave divisible by 5. */
export function pickEnemyType(wave: number, rng: Rng): string {
  const pool: string[] = []
  pushN(pool, 'grunt', 20)
  if (wave >= 2) pushN(pool, 'ninja', 8)
  if (wave >= 3) pushN(pool, 'spear', 6)
  if (wave >= 4) pushN(pool, 'brute', 8)
  if (wave >= 5) pushN(pool, 'dual', 7)
  if (wave >= 6) pushN(pool, 'berserk', 5)
  if (wave >= 7) pushN(pool, 'mage', 5)
  if (wave >= 8) pushN(pool, 'heavy', 4)

  // Drop early grunt slots so harder enemies dominate later waves.
  const gruntsToRemove = Math.min(15, wave * 2)
  pool.splice(0, gruntsToRemove)

  // Defensive: pool always contains at least one item.
  return pool.length === 0 ? 'grunt' : rng.pick(pool)
}

function pushN<T>(arr: T[], v: T, n: number): void {
  for (let i = 0; i < n; i++) arr.push(v)
}
