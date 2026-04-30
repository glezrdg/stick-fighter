import { BaseScene } from './BaseScene'

/**
 * Asset preload. F1.2 has no assets to load (`StickmanRenderer` uses Phaser
 * Graphics primitives). Once F2.5 introduces sprite atlases this scene
 * grows to load them with a real progress bar.
 */
export class PreloadScene extends BaseScene {
  static readonly KEY = 'Preload'

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(PreloadScene.KEY, services)
  }

  preload(): void {
    // Future: this.load.atlas('characters', ...)
  }

  create(): void {
    this.scene.start('MainMenu')
  }
}
