import type { SaveCurrent } from '@stick/shared'
import { type Component, Show, createSignal, onCleanup } from 'solid-js'

import { type EventBus } from '../app/eventBus'

interface MainMenuOverlayProps {
  bus: EventBus
  getSave: () => SaveCurrent
}

/**
 * MainMenu Solid overlay — replica el modal-box del legacy (líneas 405-431).
 * Triple gradient (radial rojo arriba + radial dorado abajo + linear bg-1→bg-2),
 * border 3px var(--red), glow 50px, título con gradient text gold→red.
 *
 * Se muestra cuando Phaser entra a `MainMenuScene` (que ahora solo emite el
 * evento `ui:scene:enter` con name='menu' y se queda en negro).
 */
export const MainMenuOverlay: Component<MainMenuOverlayProps> = (props) => {
  const [visible, setVisible] = createSignal(false)
  const [, setRev] = createSignal(0)

  const offEnter = props.bus.on('ui:scene:enter', ({ name }) => setVisible(name === 'menu'))
  const offShop = props.bus.on('ui:shop:open', () => setRev((r) => r + 1))
  const offShopClose = props.bus.on('ui:shop:close', () => setRev((r) => r + 1))
  onCleanup(() => {
    offEnter()
    offShop()
    offShopClose()
  })

  const startRun = () => {
    setVisible(false)
    props.bus.emit('ui:menu:start-run', {})
  }

  return (
    <Show when={visible()}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          padding: '20px',
          'pointer-events': 'auto',
          'z-index': 30,
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(255, 42, 42, 0.18) 0%, transparent 60%), linear-gradient(180deg, #1a1f24 0%, #0e1317 100%)',
        }}
      >
        <div
          style={{
            width: '100%',
            'max-width': '420px',
            background:
              'radial-gradient(ellipse at 50% 25%, rgba(255, 42, 42, 0.20) 0%, transparent 65%), radial-gradient(ellipse at 50% 80%, rgba(255, 213, 74, 0.08) 0%, transparent 60%), linear-gradient(180deg, #1a1f24 0%, #0e1317 100%)',
            border: '3px solid #ff2a2a',
            'border-radius': '16px',
            'box-shadow': '0 0 50px rgba(255, 42, 42, 0.5), 0 12px 40px rgba(0, 0, 0, 0.85)',
            padding: '28px 24px',
            display: 'flex',
            'flex-direction': 'column',
            'align-items': 'center',
            gap: '18px',
          }}
        >
          {/* Title — gradient gold→red, drop-shadow rojo (legacy 415-421) */}
          <h1
            style={{
              'font-family': "'Black Ops One', 'Impact', sans-serif",
              'font-size': 'clamp(36px, 10vw, 56px)',
              'letter-spacing': 'clamp(2px, 1vw, 5px)',
              'background-image': 'linear-gradient(180deg, #ffd54a 0%, #ff5050 60%, #ff2a2a 100%)',
              '-webkit-background-clip': 'text',
              'background-clip': 'text',
              color: 'transparent',
              filter: 'drop-shadow(3px 3px 0 #000) drop-shadow(0 0 14px rgba(255, 42, 42, 0.7))',
              'line-height': 1,
              margin: 0,
              'text-align': 'center',
            }}
          >
            STICK FIGHTER
          </h1>
          <div
            style={{
              'font-family': "'Inter', sans-serif",
              'font-style': 'italic',
              'font-size': '13px',
              color: '#d0a0a0',
              'letter-spacing': '2px',
              'text-shadow': '1px 1px 0 #000',
            }}
          >
            — el filo del silencio —
          </div>

          {/* Stats row (legacy menu-stat 426-429) */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              'flex-wrap': 'wrap',
              'justify-content': 'center',
            }}
          >
            <MenuStat icon="🪙" label={`${props.getSave().gold}`} />
            <MenuStat icon="💎" label={`${props.getSave().gems}`} />
            <MenuStat icon="🏆" label={`OLA ${props.getSave().bestWave}`} />
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              'flex-direction': 'column',
              gap: '12px',
              width: '100%',
              'margin-top': '6px',
            }}
          >
            <PrimaryButton label="⚔ COMBATIR" onClick={startRun} />
            <SecondaryButton
              label="🎨 TIENDA · SKINS"
              onClick={() => props.bus.emit('ui:shop:open', {})}
            />
          </div>

          <div
            style={{
              'font-family': "'Russo One', sans-serif",
              'font-size': '10px',
              color: '#666',
              'letter-spacing': '2px',
              'margin-top': '8px',
            }}
          >
            v2 · BUILD F2.8
          </div>
        </div>
      </div>
    </Show>
  )
}

const MenuStat: Component<{ icon: string; label: string }> = (props) => (
  <div
    style={{
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      padding: '6px 12px',
      background: 'linear-gradient(180deg, rgba(255, 42, 42, 0.12), rgba(0, 0, 0, 0.55))',
      border: '1.5px solid #5a2020',
      'border-radius': '8px',
      'font-family': "'Russo One', sans-serif",
      'font-size': '14px',
      color: '#ffd54a',
      'letter-spacing': '1px',
      'text-shadow': '1px 1px 0 #000',
    }}
  >
    <span>{props.icon}</span>
    <span>{props.label}</span>
  </div>
)

export const PrimaryButton: Component<{ label: string; onClick: () => void }> = (props) => (
  <button
    type="button"
    onClick={props.onClick}
    style={{
      'font-family': "'Russo One', sans-serif",
      'font-size': '15px',
      'letter-spacing': '3px',
      'text-transform': 'uppercase',
      color: '#fff',
      background: 'linear-gradient(180deg, #ff3030, #8b0000)',
      border: '2px solid #ffd54a',
      'border-radius': '10px',
      padding: '14px 18px',
      cursor: 'pointer',
      'box-shadow':
        '0 4px 0 #4a0000, 0 0 18px rgba(255, 42, 42, 0.45), inset 0 1px 0 rgba(255,255,255,0.15)',
      'text-shadow': '1px 1px 0 #000',
      transition: 'transform 0.05s ease-out, box-shadow 0.05s ease-out',
    }}
    onMouseDown={(e) => {
      e.currentTarget.style.transform = 'translateY(3px)'
      e.currentTarget.style.boxShadow =
        '0 1px 0 #4a0000, 0 0 8px rgba(255, 42, 42, 0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
    }}
    onMouseUp={(e) => {
      e.currentTarget.style.transform = ''
      e.currentTarget.style.boxShadow =
        '0 4px 0 #4a0000, 0 0 18px rgba(255, 42, 42, 0.45), inset 0 1px 0 rgba(255,255,255,0.15)'
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = ''
      e.currentTarget.style.boxShadow =
        '0 4px 0 #4a0000, 0 0 18px rgba(255, 42, 42, 0.45), inset 0 1px 0 rgba(255,255,255,0.15)'
    }}
  >
    {props.label}
  </button>
)

export const SecondaryButton: Component<{ label: string; onClick: () => void }> = (props) => (
  <button
    type="button"
    onClick={props.onClick}
    style={{
      'font-family': "'Russo One', sans-serif",
      'font-size': '14px',
      'letter-spacing': '3px',
      'text-transform': 'uppercase',
      color: '#fff',
      background: 'linear-gradient(180deg, #3a3a3a, #1a1a1a)',
      border: '2px solid #888',
      'border-radius': '10px',
      padding: '12px 18px',
      cursor: 'pointer',
      'box-shadow': '0 4px 0 #000, inset 0 1px 0 rgba(255,255,255,0.1)',
      'text-shadow': '1px 1px 0 #000',
      transition: 'transform 0.05s ease-out, box-shadow 0.05s ease-out',
    }}
  >
    {props.label}
  </button>
)
