import Phaser from 'phaser'
import { render } from 'solid-js/web'

import { attachInput, bootstrapPreGame, type Services } from './app/di'
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

// Phase 1: services that don't need the Phaser canvas.
const partialServices = bootstrapPreGame()

// Mount the Solid HUD overlay (HUD + virtual joystick visual).
const hudRoot = document.getElementById('hud-root')
if (hudRoot) {
  render(
    () => (
      <>
        <HudRoot bus={partialServices.bus} initialHp={100} initialMaxHp={100} />
        <JoystickOverlay bus={partialServices.bus} />
      </>
    ),
    hudRoot,
  )
}

// Construct Phaser. Scenes capture a reference to the partial services object;
// we mutate it below to add InputController before the first scene.create() fires.
const servicesRef = partialServices as Services
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
    new BootScene(servicesRef),
    new PreloadScene(servicesRef),
    new MainMenuScene(servicesRef),
    new ArenaScene(servicesRef),
    new GameOverScene(servicesRef),
  ],
})

// Phase 2: attach the InputController. Mutates `partialServices` in place,
// which is the same object Scenes are holding.
const input = new InputController({ canvas: game.canvas, bus: partialServices.bus })
const services = attachInput(partialServices, input)

// Expose for debugging during F1; remove once we have a real debug overlay.
declare global {
  interface Window {
    __game?: Phaser.Game
    __services?: Services
  }
}
window.__game = game
window.__services = services
