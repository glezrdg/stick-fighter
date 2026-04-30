import { type Rng, createRng, timeSeed } from '@stick/sim'

import { SaveStore } from '../core/meta/saveStore'

import { type EventBus, createEventBus } from './eventBus'

/**
 * Tiny DI container. Holds the long-lived services that systems and scenes
 * receive through their constructors. **Never reach for a service via a
 * global import** — pass it through.
 *
 * Services live for the entire app session. Per-run state (player, enemies,
 * wave timers) belongs in `RunState`, not here.
 *
 * For multiplayer (F5) we may swap a service (e.g. NetworkedRng instead of
 * local Rng); the consumers don't need to change because they receive the
 * service interface, not the concrete impl.
 */
export interface Services {
  readonly bus: EventBus
  readonly rng: Rng
  readonly saveStore: SaveStore
}

export interface BootstrapOptions {
  /** Optional fixed seed; for tests, replays, or reproducible runs. */
  seed?: number
}

export function bootstrap(opts: BootstrapOptions = {}): Services {
  const seed = opts.seed ?? timeSeed()
  return {
    bus: createEventBus(),
    rng: createRng(seed),
    saveStore: new SaveStore(),
  }
}
