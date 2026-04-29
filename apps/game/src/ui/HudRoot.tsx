import { createSignal, type Component } from 'solid-js'

interface HudRootProps {
  initialHp: number
  maxHp: number
}

export const HudRoot: Component<HudRootProps> = (props) => {
  // F0 placeholder — in F1 this subscribes to the typed event bus (`hp:changed`) instead.
  const [hp] = createSignal(props.initialHp)

  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        right: '12px',
        display: 'flex',
        'justify-content': 'space-between',
        'font-family': 'Inter, system-ui, sans-serif',
        'font-size': '12px',
        color: '#fff',
        'text-shadow': '1px 1px 0 #000',
      }}
    >
      <span>
        HP {hp()} / {props.maxHp}
      </span>
      <span style={{ color: '#ffd54a' }}>HUD: Solid.js mounted ✓</span>
    </div>
  )
}
