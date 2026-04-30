import type { Behavior } from './Behavior'

/**
 * Registry of enemy behaviors. Each behavior file calls `register(id, fn)`
 * as a side-effect of being imported (see `behaviors/meleeChase.ts`). This
 * mirrors the Skill registry pattern.
 */
const behaviors = new Map<string, Behavior>()

export function register(id: string, fn: Behavior): void {
  if (behaviors.has(id)) {
    throw new Error(`[enemies] duplicate behavior id "${id}"`)
  }
  behaviors.set(id, fn)
}

export function get(id: string): Behavior {
  const b = behaviors.get(id)
  if (!b) throw new Error(`[enemies] unknown behavior id "${id}"`)
  return b
}

export function tryGet(id: string): Behavior | undefined {
  return behaviors.get(id)
}

/** Test helper. Don't call from production code. */
export function _resetForTest(): void {
  behaviors.clear()
}
