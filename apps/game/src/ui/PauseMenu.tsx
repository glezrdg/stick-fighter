import type { SaveCurrent } from '@stick/shared'
import { type EventBus } from '@stick/sim'
import { type Component, Show, createSignal, onCleanup } from 'solid-js'

import type { SaveStore } from '../core/meta/saveStore'

interface PauseMenuProps {
  bus: EventBus
  saveStore: SaveStore
  getSave: () => SaveCurrent
}

/**
 * Pause menu. Toggled with `ui:pause:toggle` (P key in ArenaScene).
 * Renders settings sliders bound to `save.settings` and a Quit button.
 * Settings persist immediately via SaveStore + emit `settings:changed` so
 * AudioSystem re-reads volumes.
 */
export const PauseMenu: Component<PauseMenuProps> = (props) => {
  const [open, setOpen] = createSignal(false)
  const [, setRev] = createSignal(0)

  const sync = () => setRev((r) => r + 1)

  const offToggle = props.bus.on('ui:pause:toggle', () => {
    const next = !open()
    setOpen(next)
    props.bus.emit('ui:pause:set', { paused: next })
  })
  const offSet = props.bus.on('ui:pause:set', ({ paused }) => setOpen(paused))

  onCleanup(() => {
    offToggle()
    offSet()
  })

  const setVolume = (key: 'masterVol' | 'sfxVol' | 'musicVol', value: number) => {
    const save = props.getSave()
    save.settings[key] = value
    sync()
    void props.saveStore.save(save)
    props.bus.emit('settings:changed', {})
  }

  const resume = () => {
    setOpen(false)
    props.bus.emit('ui:pause:set', { paused: false })
  }

  return (
    <Show when={open()}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          'justify-content': 'center',
          gap: '20px',
          'pointer-events': 'auto',
          'z-index': 15,
          'font-family': 'Inter, system-ui, sans-serif',
          color: '#fff',
        }}
      >
        <div
          style={{
            'font-size': '28px',
            'font-weight': 800,
            'letter-spacing': '4px',
            color: '#ffd54a',
          }}
        >
          PAUSA
        </div>

        <div
          style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '14px',
            width: '280px',
            background: 'rgba(20, 24, 30, 0.9)',
            border: '1px solid #404850',
            'border-radius': '8px',
            padding: '18px',
          }}
        >
          <Slider
            label="Master"
            value={props.getSave().settings.masterVol}
            onChange={(v) => setVolume('masterVol', v)}
          />
          <Slider
            label="SFX"
            value={props.getSave().settings.sfxVol}
            onChange={(v) => setVolume('sfxVol', v)}
          />
          <Slider
            label="Música"
            value={props.getSave().settings.musicVol}
            onChange={(v) => setVolume('musicVol', v)}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="button" onClick={resume} style={btn(true)}>
            ▶ Continuar
          </button>
        </div>

        <div style={{ 'font-size': '11px', opacity: 0.6 }}>P o ESC para reanudar</div>
      </div>
    </Show>
  )
}

const Slider: Component<{
  label: string
  value: number
  onChange: (v: number) => void
}> = (props) => (
  <label
    style={{
      display: 'flex',
      'align-items': 'center',
      gap: '12px',
      'font-size': '13px',
    }}
  >
    <span style={{ width: '70px' }}>{props.label}</span>
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={props.value}
      onInput={(e) => props.onChange(parseFloat(e.currentTarget.value))}
      style={{ flex: 1 }}
    />
    <span style={{ width: '36px', 'text-align': 'right', color: '#ffd54a' }}>
      {Math.round(props.value * 100)}
    </span>
  </label>
)

function btn(enabled: boolean): Record<string, string | number> {
  return {
    background: enabled ? '#ffd54a' : '#2a2f35',
    color: enabled ? '#000' : '#666',
    border: 'none',
    'border-radius': '6px',
    padding: '10px 18px',
    cursor: enabled ? 'pointer' : 'default',
    'font-size': '14px',
    'font-weight': '700',
    'letter-spacing': '1px',
  }
}
