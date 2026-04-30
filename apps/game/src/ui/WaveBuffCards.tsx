import { type WaveBuff, getWaveBuff } from '@stick/content'
import { type EventBus } from '@stick/sim'
import { type Component, For, Show, createSignal, onCleanup } from 'solid-js'

interface WaveBuffCardsProps {
  bus: EventBus
}

/**
 * Wave-clear buff overlay — `.lvlup-card` del legacy (LEGACY_SPEC §5.3).
 *
 * Cards: bg `linear-gradient(180deg, #2a1810, #1a0808)` (rojo muy oscuro),
 * border 2px var(--red), glow 10px rojo. Hover: glow 18px rojo más intenso.
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
            background:
              'radial-gradient(ellipse at 50% 30%, rgba(255, 42, 42, 0.25) 0%, transparent 60%), rgba(0, 0, 0, 0.85)',
            display: 'flex',
            'flex-direction': 'column',
            'align-items': 'center',
            'justify-content': 'center',
            gap: '24px',
            padding: '20px',
            'pointer-events': 'auto',
            'z-index': 12,
          }}
        >
          {/* Title — gradient gold→red, Black Ops One */}
          <div
            style={{
              'font-family': "'Black Ops One', 'Impact', sans-serif",
              'font-size': 'clamp(28px, 8vw, 40px)',
              'letter-spacing': 'clamp(2px, 1vw, 5px)',
              'background-image': 'linear-gradient(180deg, #ffd54a 0%, #fff 50%, #ff2a2a 100%)',
              '-webkit-background-clip': 'text',
              'background-clip': 'text',
              color: 'transparent',
              filter: 'drop-shadow(2px 2px 0 #000) drop-shadow(0 0 14px rgba(255, 42, 42, 0.7))',
              'text-align': 'center',
            }}
          >
            ¡OLEADA {o().wave} SUPERADA!
          </div>
          <div
            style={{
              'font-family': "'Russo One', sans-serif",
              'font-size': '13px',
              color: '#ffd54a',
              'letter-spacing': '4px',
              'text-shadow': '1px 1px 0 #000',
            }}
          >
            ELIGE UNA BENDICIÓN
          </div>

          <div
            style={{
              display: 'flex',
              gap: '14px',
              'flex-wrap': 'wrap',
              'justify-content': 'center',
              'max-width': '600px',
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
        width: '180px',
        background: 'linear-gradient(180deg, #2a1810 0%, #1a0808 100%)',
        border: '2px solid #ff2a2a',
        'border-radius': '12px',
        padding: '14px',
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        gap: '10px',
        cursor: 'pointer',
        color: '#fff',
        'box-shadow': hover()
          ? '0 3px 0 #000, 0 0 18px rgba(255, 42, 42, 0.55)'
          : '0 3px 0 #000, 0 0 10px rgba(255, 42, 42, 0.2)',
        transform: hover() ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.05s ease-out, box-shadow 0.1s ease-out',
        'font-family': "'Russo One', sans-serif",
      }}
    >
      <div style={{ 'font-size': '40px', filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.6))' }}>
        {props.buff.icon}
      </div>
      <div
        style={{
          'font-family': "'Russo One', sans-serif",
          'font-size': '15px',
          color: '#ffd54a',
          'letter-spacing': '2px',
          'text-shadow': '1px 1px 0 #000',
          'text-align': 'center',
        }}
      >
        {props.buff.name}
      </div>
      <div
        style={{
          'font-family': "'Inter', sans-serif",
          'font-weight': 600,
          'font-size': '12px',
          color: '#f0d0d0',
          'text-align': 'center',
          'line-height': 1.4,
        }}
      >
        {props.buff.desc}
      </div>
    </button>
  )
}
