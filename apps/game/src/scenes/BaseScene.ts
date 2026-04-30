import Phaser from 'phaser'

import type { Services } from '../app/di'

/**
 * Abstract base for every game scene. Standardizes service injection
 * (constructor) and gives subclasses a `bus` shortcut.
 *
 * Scenes are registered in `main.ts` as instances (not classes), one per
 * scene key, so the constructor injection is straightforward.
 */
export abstract class BaseScene extends Phaser.Scene {
  protected readonly services: Services

  constructor(key: string, services: Services) {
    super({ key })
    this.services = services
  }

  protected get bus() {
    return this.services.bus
  }

  protected get rng() {
    return this.services.rng
  }
}
