import { BaseScene } from './BaseScene'

/**
 * Empty Phaser scene — the actual MainMenu is rendered in Solid via
 * `MainMenuOverlay` (full DOM control over fonts/glows/animations).
 * This scene only exists to hold a "non-arena" state and bridge the
 * UI's "start run" event to a Phaser `scene.start('Arena')` call.
 */
export class MainMenuScene extends BaseScene {
  static readonly KEY = 'MainMenu'

  private busUnsubs: Array<() => void> = []

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(MainMenuScene.KEY, services)
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0e1317')
    this.bus.emit('ui:scene:enter', { name: 'menu' })

    this.busUnsubs.push(
      this.bus.on('ui:menu:start-run', () => {
        this.scene.start('Arena')
      }),
    )

    // Co-op multi: LobbyOverlay confirms server phase=playing and emits this.
    this.busUnsubs.push(
      this.bus.on('ui:menu:start-netarena', () => {
        this.scene.start('NetArena')
      }),
    )

    this.events.once('shutdown', () => this.cleanup())
    this.events.once('destroy', () => this.cleanup())
  }

  private cleanup(): void {
    for (const off of this.busUnsubs) off()
    this.busUnsubs = []
  }
}
