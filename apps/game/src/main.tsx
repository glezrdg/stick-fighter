import Phaser from 'phaser'
import { render } from 'solid-js/web'

import { bootstrap } from './app/di'
import { InputController } from './core/input/InputController'
import { ArenaScene } from './scenes/ArenaScene'
import { BootScene } from './scenes/BootScene'
import { GameOverScene } from './scenes/GameOverScene'
import { MainMenuScene } from './scenes/MainMenuScene'
import { PreloadScene } from './scenes/PreloadScene'
// Side-effect: every skill registers itself into the registry on import.
import './skills'
import { HudRoot } from './ui/HudRoot'
import { JoystickOverlay } from './ui/JoystickOverlay'

// 1. Bootstrap DI (event bus, RNG, save store).
const services = bootstrap()

// 2. Mount the Solid HUD overlay (HUD + virtual joystick visual).
const hudRoot = document.getElementById('hud-root')
if (hudRoot) {
  render(
    () => (
      <>
        <HudRoot bus={services.bus} initialHp={100} initialMaxHp={100} />
        <JoystickOverlay bus={services.bus} />
      </>
    ),
    hudRoot,
  )
}

// 3. Start Phaser.
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
  scene: [
    new BootScene(services),
    new PreloadScene(services),
    new MainMenuScene(services),
    new ArenaScene(services),
    new GameOverScene(services),
  ],
})

// 4. Wire the InputController to Phaser's canvas once it exists.
const input = new InputController({ canvas: game.canvas, bus: services.bus })

// Expose for debugging during F1; remove once we have a real debug overlay.
declare global {
  interface Window {
    __game?: Phaser.Game
    __services?: typeof services
    __input?: InputController
  }
}
window.__game = game
window.__services = services
window.__input = input
