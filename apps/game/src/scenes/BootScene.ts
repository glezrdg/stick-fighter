import { BaseScene } from './BaseScene'

/**
 * Initial scene. Kicks off the boot pipeline. Today it just hands off to
 * Preload immediately; in F2.5 it'll show a tiny splash and prepare the
 * loading bar before Preload runs.
 */
export class BootScene extends BaseScene {
  static readonly KEY = 'Boot'

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(BootScene.KEY, services)
  }

  create(): void {
    this.scene.start('Preload')
  }
}
