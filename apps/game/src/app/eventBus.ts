/**
 * Typed event bus — the spine of the desacoplamiento between systems.
 *
 * Game systems (combat, gore, audio, HUD, achievements, analytics, …) communicate
 * through this bus instead of holding references to each other. AudioSystem
 * doesn't know who emitted `combat:hit`; HudController doesn't know who emitted
 * `player:hp:changed`. This is what kills the "everything-touches-everything"
 * coupling of the legacy single-file game.
 *
 * Rules:
 *   - Add new events to `GameEvents` below — never use string events outside this map.
 *   - Handlers must NOT throw; the bus catches anyway, but unhandled errors
 *     are logged (and would surface in Sentry once wired).
 *   - For request/response patterns, use a callback in the payload — do NOT
 *     try to make the bus return values.
 */

/** Catalog of every event the game can emit. Add new events here. */
export type GameEvents = {
  // ---- Run lifecycle ------------------------------------------------
  'run:start': { seed: number }
  'run:end': { wave: number; kills: number; gold: number; reason: 'death' | 'quit' }

  // ---- Player ------------------------------------------------------
  'player:hp:changed': { hp: number; maxHp: number }
  'player:hurt': { dmg: number; remainingHp: number; src: 'melee' | 'projectile' | 'aoe' }
  'player:death': Record<string, never>

  // ---- Combat ------------------------------------------------------
  'combat:hit': { attackerId: string; targetId: string; dmg: number; crit: boolean }
  'enemy:death': { enemyId: string; byPlayer: boolean }
  'combo:advance': { count: number }
  'combo:reset': Record<string, never>

  // ---- Currency ----------------------------------------------------
  'gold:changed': { gold: number; delta: number }
  'kills:changed': { kills: number }

  // ---- Waves -------------------------------------------------------
  'wave:start': { wave: number; totalEnemies: number }
  'wave:complete': { wave: number }

  // ---- Skills ------------------------------------------------------
  'skill:cast': { skillId: string; slot: 0 | 1 }
  'skill:cooldown:changed': { slot: 0 | 1; remaining: number; total: number }
  /** Emitted on run start so the HUD can render the equipped skill icons. */
  'skills:equipped': { slot0: string | null; slot1: string | null }

  // ---- UI ----------------------------------------------------------
  'ui:shop:open': Record<string, never>
  'ui:shop:close': Record<string, never>
  'ui:shop:purchase': { itemId: string; cost: number }

  // ---- Input (raw) -------------------------------------------------
  // The InputController emits these. Game systems decide whether they
  // can act on them (cooldowns, scene state, etc.).
  'input:attack': Record<string, never>
  'input:shoot': Record<string, never>
  'input:skill': { slot: 0 | 1 }
  'input:joystick:start': { screenX: number; screenY: number }
  'input:joystick:move': { vx: number; vy: number }
  'input:joystick:end': Record<string, never>
}

export type EventBus = {
  on<K extends keyof GameEvents>(key: K, handler: (payload: GameEvents[K]) => void): () => void
  off<K extends keyof GameEvents>(key: K, handler: (payload: GameEvents[K]) => void): void
  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void
  /** Remove every handler. Useful in tests and on scene shutdown. */
  clear(): void
}

type AnyHandler = (payload: unknown) => void

export function createEventBus(): EventBus {
  const handlers = new Map<keyof GameEvents, Set<AnyHandler>>()

  return {
    on(key, handler) {
      let set = handlers.get(key)
      if (!set) {
        set = new Set()
        handlers.set(key, set)
      }
      const erased = handler as AnyHandler
      set.add(erased)
      return () => {
        set?.delete(erased)
      }
    },
    off(key, handler) {
      handlers.get(key)?.delete(handler as AnyHandler)
    },
    emit(key, payload) {
      const set = handlers.get(key)
      if (!set || set.size === 0) return
      // Snapshot so handlers that unsubscribe themselves don't perturb the loop.
      for (const h of [...set]) {
        try {
          h(payload)
        } catch (err) {
          console.error(`[eventBus] handler for "${String(key)}" threw:`, err)
        }
      }
    },
    clear() {
      handlers.clear()
    },
  }
}
