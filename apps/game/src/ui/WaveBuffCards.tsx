import { type WaveBuff, getWaveBuff } from '@stick/content'
import { type Component, For, Show, createSignal, onCleanup } from 'solid-js'

import { type EventBus } from '../app/eventBus'

interface WaveBuffCardsProps {
  bus: EventBus
}

/**
 * Wave-clear buff overlay. Listens for `wave:buff:offer`, renders the 3 cards
 * full-screen on top of the canvas, and emits `wave:buff:pick` on click. The
 * scene clears the offer by listening for `wave:resume`.
 */
export const WaveBuffCards: Component<WaveBuffCardsProps> = (props) => {
  const [offer, setOffer] = createSignal<{ wave: number; buffs: WaveBuff[] } | null>(null)

  const offOffer = props.bus.on('wave:buff:offer', ({ wave, buffIds }) => {
    setOffer({ wave, buffs: buffIds.map((id) => getWaveBuff(id)) })
  })
  const offResume = props.bus.on('wave:resume', () => setOffer(null))

  onCleanup(() => {
    offOffer()
    offResume()
  })

  const pick = (id: string) => {
    props.bus.emit('wave:buff:pick', { buffId: id })
  }

  return (
    <Show when={offer()}>
      {(o) => (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.78)',
            display: 'flex',
            'flex-direction': 'column',
            'align-items': 'center',
            'justify-content': 'center',
            gap: '24px',
            'font-family': 'Inter, system-ui, sans-serif',
            color: '#fff',
            'pointer-events': 'auto',
            'z-index': 10,
          }}
        >
          <div
            style={{
              'font-size': '32px',
              'font-weight': 800,
              'letter-spacing': '2px',
              color: '#ffd54a',
              'text-shadow': '2px 2px 0 #000',
            }}
          >
            ¡OLEADA {o().wave} SUPERADA!
          </div>
          <div style={{ 'font-size': '13px', opacity: 0.85 }}>Elige una mejora</div>
          <div
            style={{
              display: 'flex',
              gap: '18px',
              'flex-wrap': 'wrap',
              'justify-content': 'center',
            }}
          >
            <For each={o().buffs}>
              {(buff) => <BuffCard buff={buff} onPick={() => pick(buff.id)} />}
            </For>
          </div>
        </div>
      )}
    </Show>
  )
}

const BuffCard: Component<{ buff: WaveBuff; onPick: () => void }> = (props) => {
  const [hover, setHover] = createSignal(false)
  return (
    <button
      type="button"
      onClick={props.onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '200px',
        background: 'rgba(20, 24, 30, 0.95)',
        border: `2px solid ${hover() ? '#ffd54a' : '#404850'}`,
        'border-radius': '10px',
        padding: '18px 14px',
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        gap: '10px',
        cursor: 'pointer',
        color: '#fff',
        'font-family': 'Inter, system-ui, sans-serif',
        transform: hover() ? 'translateY(-4px)' : 'none',
        transition: 'transform 0.15s ease-out, border-color 0.15s ease-out',
      }}
    >
      <div style={{ 'font-size': '40px', 'line-height': 1 }}>{props.buff.icon}</div>
      <div
        style={{
          'font-size': '13px',
          'font-weight': 800,
          'letter-spacing': '1px',
          color: '#ffd54a',
        }}
      >
        {props.buff.name}
      </div>
      <div style={{ 'font-size': '12px', opacity: 0.85, 'text-align': 'center' }}>
        {props.buff.desc}
      </div>
    </button>
  )
}
