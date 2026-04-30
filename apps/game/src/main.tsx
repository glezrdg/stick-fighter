import Phaser from 'phaser'
import { render } from 'solid-js/web'

import { attachInput, bootstrapPreGame, type Services } from './app/di'
import { InputController } from './core/input/InputController'
import { ArenaScene } from './scenes/ArenaScene'
import { BootScene } from './scenes/BootScene'
import { GameOverScene } from './scenes/GameOverScene'
import { MainMenuScene } from './scenes/MainMenuScene'
import { PreloadScene } from './scenes/PreloadScene'
import { AudioSystem } from './systems/AudioSystem'
// Side-effect: every skill registers itself into the registry on import.
import './skills'
import { HudRoot } from './ui/HudRoot'
import { JoystickOverlay } from './ui/JoystickOverlay'
import { PauseMenu } from './ui/PauseMenu'
import { ShopOverlay } from './ui/ShopOverlay'
import { TutorialOverlay } from './ui/TutorialOverlay'
import { WaveBuffCards } from './ui/WaveBuffCards'

declare global {
  interface Window {
    __game?: Phaser.Game
    __services?: Services
  }
}

async function main(): Promise<void> {
  // Phase 1: services that don't need the Phaser canvas (loads save).
  const partialServices = await bootstrapPreGame()

  // Mount the Solid HUD overlay (HUD + virtual joystick visual + shop + tutorial).
  const hudRoot = document.getElementById('hud-root')
  if (hudRoot) {
    render(
      () => (
        <>
          <HudRoot bus={partialServices.bus} initialHp={100} initialMaxHp={100} />
          <JoystickOverlay bus={partialServices.bus} />
          <WaveBuffCards bus={partialServices.bus} />
          <ShopOverlay
            bus={partialServices.bus}
            saveStore={partialServices.saveStore}
            getSave={() => partialServices.save}
            setSave={(next) => {
              partialServices.save = next
            }}
          />
          <PauseMenu
            bus={partialServices.bus}
            saveStore={partialServices.saveStore}
            getSave={() => partialServices.save}
          />
          <TutorialOverlay bus={partialServices.bus} getSave={() => partialServices.save} />
        </>
      ),
      hudRoot,
    )
  }

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

  // Audio: subscribed to bus events; unlocked on first user gesture (iOS quirk).
  const audio = new AudioSystem({
    bus: partialServices.bus,
    getSettings: () => partialServices.save.settings,
  })
  audio.init()
  const unlockAudio = () => audio.unlock()
  window.addEventListener('pointerdown', unlockAudio, { once: true })
  window.addEventListener('keydown', unlockAudio, { once: true })
  partialServices.bus.on('settings:changed', () => audio.applySettings())

  window.__game = game
  window.__services = services
}

main().catch((err) => {
  console.error('[main] bootstrap failed:', err)
})
