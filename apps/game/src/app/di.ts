import type { SaveCurrent } from '@stick/shared'
import { type EventBus, type Rng, createEventBus, createRng, timeSeed } from '@stick/sim'

import type { InputController } from '../core/input/InputController'
import { SaveStore } from '../core/meta/saveStore'

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
  /** Mutable reference to the loaded save. Sceens that change it (shop,
   *  end-of-run gold) MUST call `saveStore.save(save)` to persist. */
  save: SaveCurrent
  input: InputController
}

export interface BootstrapOptions {
  /** Optional fixed seed; for tests, replays, or reproducible runs. */
  seed?: number
}

/**
 * Phase 1: everything that doesn't need the Phaser canvas. Returns the
 * services object minus `input` — tests and offline tools can use it as-is.
 *
 * Async because we need to await the save to load (validated + migrated)
 * before any scene tries to read it.
 */
export async function bootstrapPreGame(
  opts: BootstrapOptions = {},
): Promise<Omit<Services, 'input'>> {
  const seed = opts.seed ?? timeSeed()
  const saveStore = new SaveStore()
  const save = await saveStore.load()
  applyDevWalletIfLocalhost(save, saveStore)
  return {
    bus: createEventBus(),
    rng: createRng(seed),
    saveStore,
    save,
  }
}

/**
 * Dev-only top-up: when running on localhost / 127.0.0.1, ensure the wallet
 * has plenty of gold and gems for shop testing. No-op in production builds.
 * Skipped if `?nocheats=1` is in the URL so a dev can still validate the
 * "fresh save" experience.
 */
function applyDevWalletIfLocalhost(save: SaveCurrent, saveStore: SaveStore): void {
  if (typeof window === 'undefined') return
  const host = window.location.hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
  if (!isLocal) return
  if (window.location.search.includes('nocheats=1')) return

  const DEV_GOLD = 99_999
  const DEV_GEMS = 999
  let mutated = false
  if (save.gold < DEV_GOLD) {
    save.gold = DEV_GOLD
    mutated = true
  }
  if (save.gems < DEV_GEMS) {
    save.gems = DEV_GEMS
    mutated = true
  }
  if (mutated) {
    void saveStore.save(save)
    console.info('[dev] localhost wallet topped up — pass ?nocheats=1 to disable')
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
