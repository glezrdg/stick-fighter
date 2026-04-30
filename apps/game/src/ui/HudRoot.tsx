import { type Component, createSignal, onCleanup } from 'solid-js'

import { type EventBus } from '../app/eventBus'

interface HudRootProps {
  bus: EventBus
  initialHp: number
  initialMaxHp: number
}

/**
 * HUD overlay rendered on top of the Phaser canvas.
 *
 * Subscribes to the typed event bus — never reads from the game systems
 * directly. This is the pattern: gameplay emits events, UI reacts. Replace
 * the pretty styling later; the wiring is the point.
 */
export const HudRoot: Component<HudRootProps> = (props) => {
  const [hp, setHp] = createSignal(props.initialHp)
  const [maxHp, setMaxHp] = createSignal(props.initialMaxHp)
  const [gold, setGold] = createSignal(0)
  const [wave, setWave] = createSignal(0)

  const offHp = props.bus.on('player:hp:changed', ({ hp, maxHp }) => {
    setHp(hp)
    setMaxHp(maxHp)
  })
  const offGold = props.bus.on('gold:changed', ({ gold }) => setGold(gold))
  const offWave = props.bus.on('wave:start', ({ wave }) => setWave(wave))

  onCleanup(() => {
    offHp()
    offGold()
    offWave()
  })

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        right: '12px',
        display: 'flex',
        'justify-content': 'space-between',
        'align-items': 'center',
        'font-family': 'Inter, system-ui, sans-serif',
        'font-size': '12px',
        color: '#fff',
        'text-shadow': '1px 1px 0 #000',
      }}
    >
      <span>
        HP {hp()} / {maxHp()}
      </span>
      <span style={{ color: '#ff2a2a' }}>WAVE {wave()}</span>
      <span style={{ color: '#ffd54a' }}>GOLD {gold()}</span>
    </div>
  )
}
