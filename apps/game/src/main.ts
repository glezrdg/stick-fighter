import Phaser from 'phaser'
import { render } from 'solid-js/web'

import { bootstrap } from './app/di'
import { BootScene } from './scenes/BootScene'
import { HudRoot } from './ui/HudRoot'

// 1. Bootstrap DI (event bus, RNG, save store).
const services = bootstrap()

// 2. Mount the Solid HUD overlay. It subscribes to the bus from here on.
const hudRoot = document.getElementById('hud-root')
if (hudRoot) {
  render(() => HudRoot({ bus: services.bus, initialHp: 100, initialMaxHp: 100 }), hudRoot)
}

// 3. Start Phaser. The boot scene emits a few events to verify wiring end-to-end.
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
  scene: [new BootScene(services)],
})

// Expose for debugging during F1; remove once we have a real debug overlay.
declare global {
  interface Window {
    __game?: Phaser.Game
    __services?: typeof services
  }
}
window.__game = game
window.__services = services
