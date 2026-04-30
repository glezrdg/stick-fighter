import { BaseScene } from './BaseScene'

export class MainMenuScene extends BaseScene {
  static readonly KEY = 'MainMenu'

  constructor(services: ConstructorParameters<typeof BaseScene>[1]) {
    super(MainMenuScene.KEY, services)
  }

  create(): void {
    const { width, height } = this.scale
    const cx = width / 2
    const cy = height / 2
    const save = this.services.save

    this.add
      .text(cx, cy - 130, 'STICK FIGHTER', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '52px',
        fontStyle: 'bold',
        color: '#ff2a2a',
      })
      .setOrigin(0.5)

    this.add
      .text(cx, cy - 70, `Best wave: ${save.bestWave}   ·   🪙 ${save.gold}`, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
        color: '#ffd54a',
      })
      .setOrigin(0.5)

    const startText = this.makeButton(cx, cy + 10, '▶  JUGAR', () => this.scene.start('Arena'))
    this.tweens.add({
      targets: startText,
      alpha: 0.5,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    this.makeButton(cx, cy + 70, '🛒  TIENDA', () => this.bus.emit('ui:shop:open', {}))

    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('Arena'))
    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('Arena'))
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void) {
    const txt = this.add
      .text(x, y, label, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#ffffff',
        backgroundColor: '#1a1f24',
        padding: { left: 18, right: 18, top: 8, bottom: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
    txt.on('pointerdown', onClick)
    txt.on('pointerover', () => txt.setColor('#ffd54a'))
    txt.on('pointerout', () => txt.setColor('#ffffff'))
    return txt
  }
}
