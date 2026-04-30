// Seedable PRNG (mulberry32). Reemplaza todos los Math.random() del juego.
// Determinista por seed → habilita tests reproducibles, replays y multiplayer
// server-authoritative. ESLint bloquea Math.random() en este package.

export interface Rng {
  /** Random number in [0, 1). */
  next(): number
  /** Random integer in [min, max) (max excluded). */
  int(min: number, max: number): number
  /** Random float in [min, max]. */
  float(min: number, max: number): number
  /** True with probability p (0..1). */
  chance(p: number): boolean
  /** Pick a random element from a non-empty array. */
  pick<T>(arr: readonly T[]): T
  /** Fisher-Yates shuffle in-place; returns the same array. */
  shuffle<T>(arr: T[]): T[]
  /** The seed this RNG was created with (for replay/leaderboard). */
  readonly seed: number
}

export function createRng(seed: number): Rng {
  // mulberry32 — small, fast, good enough for game RNG (NOT cryptographic).
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number): number => {
    if (max <= min) throw new Error(`rng.int: max (${max}) must be > min (${min})`)
    return Math.floor(next() * (max - min)) + min
  }

  const float = (min: number, max: number): number => next() * (max - min) + min
  const chance = (p: number): boolean => next() < p

  function pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('rng.pick: array is empty')
    return arr[Math.floor(next() * arr.length)]!
  }

  function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      const tmp = arr[i]!
      arr[i] = arr[j]!
      arr[j] = tmp
    }
    return arr
  }

  return { seed, next, int, float, chance, pick, shuffle }
}

/** Generate a non-zero seed from current time (use only when no explicit seed is available). */
export function timeSeed(): number {
  // XOR with a constant to avoid all-zero state if Date.now() is patched.
  return (Date.now() ^ 0x9e3779b9) >>> 0
}
