import { type WaveBuff, getWaveBuff } from '@stick/content'
import { type EventBus } from '@stick/sim'
import { type Component, For, Show, createSignal, onCleanup } from 'solid-js'

import { netClient, type RoomSnapshot } from '../net/NetClient'

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
  // Net-only state: cuando hay multi, leemos del NetClient quién votó qué
  // para pintar el indicador "✓ vos / esperando peer". En SP esto queda en
  // arrays vacíos / null y no se muestra nada extra.
  const [snap, setSnap] = createSignal<RoomSnapshot>(netClient.getSnapshot())
  // Voto local: el server elige qué buff gana, pero queremos pintar la
  // carta seleccionada en el cliente local apenas hace clic (la
  // confirmación llega ~1 tick después por la red).
  const [localVote, setLocalVote] = createSignal<string | null>(null)

  const offOffer = props.bus.on('wave:buff:offer', ({ wave, buffIds }) => {
    setOffer({ wave, buffs: buffIds.map((id) => getWaveBuff(id)) })
    setLocalVote(null)
  })
  const offResume = props.bus.on('wave:resume', () => {
    setOffer(null)
    setLocalVote(null)
  })
  const offNet = netClient.subscribe((s) => setSnap(s))

  onCleanup(() => {
    offOffer()
    offResume()
    offNet()
  })

  const pick = (id: string) => {
    setLocalVote(id)
    props.bus.emit('wave:buff:pick', { buffId: id })
  }

  /** Lo que votó el peer remoto, si lo hubo. Null si no hay multi o si peer no votó. */
  const peerVote = (): string | null => {
    const me = snap().sessionId
    if (!me) return null
    for (const v of snap().waveBuffVotes) {
      if (v.sessionId !== me) return v.buffId
    }
    return null
  }

  /** True si hay sesión de multi activa (oculta indicadores en SP). */
  const isMulti = (): boolean => snap().sessionId !== null && snap().players.length > 0

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
              {(buff) => (
                <BuffCard
                  buff={buff}
                  onPick={() => pick(buff.id)}
                  selfVoted={localVote() === buff.id}
                  peerVoted={peerVote() === buff.id}
                  isMulti={isMulti()}
                  alreadyVoted={localVote() !== null}
                />
              )}
            </For>
          </div>

          {/* Banner "esperando al peer" cuando ya votaste pero el otro todavía no.
              Solo en multi y solo después de tu voto local. */}
          <Show when={isMulti() && localVote() !== null && peerVote() === null}>
            <div
              style={{
                'font-family': "'Russo One', sans-serif",
                'font-size': '12px',
                color: '#aaa',
                'letter-spacing': '3px',
                'text-shadow': '1px 1px 0 #000',
                'margin-top': '4px',
              }}
            >
              ✓ TU VOTO REGISTRADO — ESPERANDO AL OTRO…
            </div>
          </Show>
          {/* Si peer votó pero vos no, animarlo a apurarse. */}
          <Show when={isMulti() && localVote() === null && peerVote() !== null}>
            <div
              style={{
                'font-family': "'Russo One', sans-serif",
                'font-size': '12px',
                color: '#ffd54a',
                'letter-spacing': '3px',
                'text-shadow': '1px 1px 0 #000',
                'margin-top': '4px',
              }}
            >
              TU COMPAÑERO YA VOTÓ — ELEGÍ UNA
            </div>
          </Show>
        </div>
      )}
    </Show>
  )
}

const BuffCard: Component<{
  buff: WaveBuff
  onPick: () => void
  selfVoted: boolean
  peerVoted: boolean
  isMulti: boolean
  alreadyVoted: boolean
}> = (props) => {
  const [hover, setHover] = createSignal(false)
  // Highlights: dorado si vos votaste, verde si peer votó, ambos si coinciden.
  const borderColor = (): string => {
    if (props.selfVoted && props.peerVoted) return '#7fff7f' // ambos = guaranteed winner
    if (props.selfVoted) return '#ffd54a'
    if (props.peerVoted) return '#7fc97f'
    return '#ff2a2a'
  }
  return (
    <button
      type="button"
      onClick={props.onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      // No disable después del primer voto — el server acepta cambios y resuelve
      // con el último valor recibido por sessionId. Permite "cambiar de opinión".
      style={{
        position: 'relative',
        width: '180px',
        background: 'linear-gradient(180deg, #2a1810 0%, #1a0808 100%)',
        border: `2px solid ${borderColor()}`,
        'border-radius': '12px',
        padding: '14px',
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        gap: '10px',
        cursor: 'pointer',
        color: '#fff',
        'box-shadow':
          props.selfVoted || props.peerVoted
            ? `0 3px 0 #000, 0 0 22px ${borderColor()}aa`
            : hover()
              ? '0 3px 0 #000, 0 0 18px rgba(255, 42, 42, 0.55)'
              : '0 3px 0 #000, 0 0 10px rgba(255, 42, 42, 0.2)',
        transform: hover() ? 'translateY(-2px)' : 'none',
        transition: 'transform 0.05s ease-out, box-shadow 0.1s ease-out, border-color 0.15s',
        'font-family': "'Russo One', sans-serif",
      }}
    >
      {/* Badges de voto en multi: esquina superior, "VOS" + "PEER". */}
      <Show when={props.isMulti && (props.selfVoted || props.peerVoted)}>
        <div
          style={{
            position: 'absolute',
            top: '-10px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '4px',
          }}
        >
          <Show when={props.selfVoted}>
            <span
              style={{
                background: '#ffd54a',
                color: '#1a0808',
                padding: '2px 8px',
                'border-radius': '8px',
                'font-size': '10px',
                'letter-spacing': '2px',
                border: '2px solid #1a0808',
                'box-shadow': '0 2px 0 #000',
              }}
            >
              ✓ VOS
            </span>
          </Show>
          <Show when={props.peerVoted}>
            <span
              style={{
                background: '#7fc97f',
                color: '#0a1a0a',
                padding: '2px 8px',
                'border-radius': '8px',
                'font-size': '10px',
                'letter-spacing': '2px',
                border: '2px solid #1a0808',
                'box-shadow': '0 2px 0 #000',
              }}
            >
              ✓ PEER
            </span>
          </Show>
        </div>
      </Show>

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
