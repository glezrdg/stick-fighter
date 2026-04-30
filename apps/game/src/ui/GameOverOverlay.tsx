import type { SaveCurrent } from '@stick/shared'
import { type Component, Show, createSignal, onCleanup } from 'solid-js'

import { type EventBus } from '../app/eventBus'

import { PrimaryButton, SecondaryButton } from './MainMenuOverlay'

interface GameOverOverlayProps {
  bus: EventBus
  getSave: () => SaveCurrent
}

interface RunSummary {
  wave: number
  kills: number
  gold: number
}

/**
 * Game-over Solid overlay — replica el `.defeat-text` (legacy 382-403) con
 * la animación `defeatIn` (scale 2 + rotate -10deg → scale 1) + grid de stats
 * y dos botones (REINTENTAR / VOLVER).
 */
export const GameOverOverlay: Component<GameOverOverlayProps> = (props) => {
  const [visible, setVisible] = createSignal(false)
  const [summary, setSummary] = createSignal<RunSummary>({ wave: 0, kills: 0, gold: 0 })

  const offEnter = props.bus.on('ui:scene:enter', ({ name }) => setVisible(name === 'gameover'))
  const offRunEnd = props.bus.on('run:end', ({ wave, kills, gold }) =>
    setSummary({ wave, kills, gold }),
  )

  onCleanup(() => {
    offEnter()
    offRunEnd()
  })

  const retry = () => {
    setVisible(false)
    props.bus.emit('ui:menu:start-run', {})
  }
  const back = () => {
    setVisible(false)
    props.bus.emit('ui:menu:return', {})
  }

  return (
    <Show when={visible()}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          'justify-content': 'center',
          padding: '20px',
          gap: '24px',
          'pointer-events': 'auto',
          'z-index': 30,
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(255, 0, 0, 0.18) 0%, transparent 60%), linear-gradient(180deg, #1a0808 0%, #000 100%)',
        }}
      >
        {/* DEFEAT title */}
        <div
          style={{
            'font-family': "'Black Ops One', 'Impact', sans-serif",
            'font-size': 'clamp(40px, 11vw, 76px)',
            color: '#ff2a2a',
            'letter-spacing': 'clamp(2px, 0.8vw, 6px)',
            'text-shadow': '0 0 40px #ff0000, 0 0 14px #ff5050, 4px 4px 0 #000',
            animation: 'defeatIn 1.4s ease-out forwards',
          }}
        >
          DERROTA
        </div>

        {/* Stats grid 2×2 (legacy 336-354) */}
        <div
          style={{
            display: 'grid',
            'grid-template-columns': 'repeat(2, 1fr)',
            gap: '10px',
            width: '100%',
            'max-width': '320px',
          }}
        >
          <StatCell value={summary().wave} label="OLEADA" />
          <StatCell value={summary().kills} label="BAJAS" />
          <StatCell value={`+${summary().gold}`} label="ORO" />
          <StatCell value={props.getSave().bestWave} label="MEJOR" />
        </div>

        <div
          style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '12px',
            width: '100%',
            'max-width': '320px',
          }}
        >
          <PrimaryButton label="⚔ REINTENTAR" onClick={retry} />
          <SecondaryButton label="VOLVER" onClick={back} />
        </div>
      </div>
    </Show>
  )
}

const StatCell: Component<{ value: string | number; label: string }> = (props) => (
  <div
    style={{
      background: 'linear-gradient(180deg, rgba(255, 42, 42, 0.06), rgba(0, 0, 0, 0.5))',
      border: '2px solid #4a3030',
      'border-radius': '10px',
      padding: '12px 6px',
      'text-align': 'center',
      display: 'flex',
      'flex-direction': 'column',
      gap: '2px',
    }}
  >
    <div
      style={{
        'font-family': "'Russo One', sans-serif",
        'font-size': '24px',
        color: '#ffd54a',
        'letter-spacing': '1px',
        'text-shadow': '1px 1px 0 #000',
      }}
    >
      {props.value}
    </div>
    <div
      style={{
        'font-family': "'Inter', sans-serif",
        'font-weight': 800,
        'font-size': '11px',
        color: '#c0a0a0',
        'letter-spacing': '2px',
        'text-transform': 'uppercase',
      }}
    >
      {props.label}
    </div>
  </div>
)
