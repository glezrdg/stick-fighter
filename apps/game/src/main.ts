import Phaser from 'phaser'
import { render } from 'solid-js/web'

import { BootScene } from './scenes/BootScene'
import { HudRoot } from './ui/HudRoot'

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game-canvas-container',
  backgroundColor: '#1a1f24',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 540,
    height: 960,
  },
  render: {
    antialias: false,
    pixelArt: true,
  },
  scene: [BootScene],
})

const hudRoot = document.getElementById('hud-root')
if (hudRoot) {
  render(() => HudRoot({ initialHp: 100, maxHp: 100 }), hudRoot)
}

// Expose for debugging during F0/F1 — remove once we have a real debug overlay.
declare global {
  interface Window {
    __game?: Phaser.Game
  }
}
window.__game = game
