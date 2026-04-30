import { type Rng, createRng, timeSeed } from '@stick/sim'

import type { InputController } from '../core/input/InputController'
import { SaveStore } from '../core/meta/saveStore'

import { type EventBus, createEventBus } from './eventBus'

/**
 * Long-lived services. Held by every Scene via `BaseScene.services`.
 * Per-run state (player, enemies, wave timers) belongs in `RunState`,
 * not here.
 *
 * Construction is two-phase because `InputController` needs the Phaser
 * canvas, which doesn't exist until `new Phaser.Game(...)` runs:
 *   1. `bootstrapPreGame()` creates everything that doesn't need the canvas.
 *   2. `attachInput(services, controller)` mutates the services object to
 *      attach the controller, before any Scene's `create()` fires.
 *
 * This is mildly icky but the alternatives are worse: passing input through
 * every `scene.start()` call, or wrapping it in lazy refs that every caller
 * has to deref. The mutation is contained to `main.tsx`.
 */
export interface Services {
  readonly bus: EventBus
  readonly rng: Rng
  readonly saveStore: SaveStore
  input: InputController
}

export interface BootstrapOptions {
  /** Optional fixed seed; for tests, replays, or reproducible runs. */
  seed?: number
}

/**
 * Phase 1: everything that doesn't need the Phaser canvas. Returns the
 * services object minus `input` — tests and offline tools can use it as-is.
 */
export function bootstrapPreGame(opts: BootstrapOptions = {}): Omit<Services, 'input'> {
  const seed = opts.seed ?? timeSeed()
  return {
    bus: createEventBus(),
    rng: createRng(seed),
    saveStore: new SaveStore(),
  }
}

/**
 * Phase 2: attach the InputController to the partial services object.
 * Mutates the same object so Scenes that captured the partial reference
 * see the updated value when their `create()` fires.
 */
export function attachInput(partial: Omit<Services, 'input'>, input: InputController): Services {
  return Object.assign(partial, { input }) as Services
}
