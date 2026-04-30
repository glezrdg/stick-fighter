import type { EventBus } from '@stick/sim'
import { type Component, Show, createSignal, onCleanup } from 'solid-js'

/**
 * Touch-only action buttons (legacy lines 180-251). Mounted as a Solid
 * overlay over the canvas. Visible only on coarse pointer devices (touch
 * phones/tablets) — on desktop the player uses keyboard, so showing the
 * buttons just clutters the screen.
 *
 * Layout (bottom-right corner):
 *   [Q]  [E]
 *   🏹   ⚔
 *
 *   Q / E above, attack ⚔ + bow 🏹 stacked below. The attack/bow buttons
 *   are big (clamp 64-80px) for thumb reach; the skill buttons are
 *   smaller circles with their key letter as label fallback.
 */

interface TouchButtonsProps {
  bus: EventBus
}

export const TouchButtons: Component<TouchButtonsProps> = (props) => {
  // Detect touch by media query — `pointer: coarse` is true on phones/tablets,
  // false on mouse/trackpad desktops. Re-evaluate on resize because some
  // browsers flip it when the user plugs in a mouse.
  const [isTouch, setIsTouch] = createSignal(detectTouch())
  const onResize = () => setIsTouch(detectTouch())
  window.addEventListener('resize', onResize)
  onCleanup(() => window.removeEventListener('resize', onResize))

  const fireAttack = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    props.bus.emit('input:attack', {})
  }
  const fireShoot = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    props.bus.emit('input:shoot', {})
  }
  const fireSkill = (slot: 0 | 1) => (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    props.bus.emit('input:skill', { slot })
  }

  return (
    <Show when={isTouch()}>
      {/* Skill buttons row — Q (slot 0) and E (slot 1) */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(108px + var(--safe-bottom, 0px))',
          right: 'calc(18px + var(--safe-right, 0px))',
          display: 'flex',
          gap: '8px',
          'pointer-events': 'auto',
          'z-index': 14,
        }}
      >
        <SkillButton label="Q" onPress={fireSkill(0)} />
        <SkillButton label="E" onPress={fireSkill(1)} />
      </div>

      {/* Bow + Attack row */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(24px + var(--safe-bottom, 0px))',
          right: 'calc(18px + var(--safe-right, 0px))',
          display: 'flex',
          'align-items': 'flex-end',
          gap: '10px',
          'pointer-events': 'auto',
          'z-index': 14,
        }}
      >
        {/* Bow (smaller, sits to the left of attack) */}
        <button
          type="button"
          aria-label="Disparar arco"
          onTouchStart={fireShoot}
          onMouseDown={fireShoot}
          style={{
            width: 'clamp(54px, 14vw, 64px)',
            height: 'clamp(54px, 14vw, 64px)',
            'border-radius': '50%',
            background: 'radial-gradient(circle at 50% 35%, #5a3a14 0%, #2a1a04 100%)',
            border: '3px solid #a06820',
            color: '#fff',
            'font-size': 'clamp(24px, 6.5vw, 30px)',
            'box-shadow': '0 6px 0 #1a1004, 0 0 12px rgba(160, 104, 32, 0.5)',
            cursor: 'pointer',
            'user-select': 'none',
            '-webkit-tap-highlight-color': 'transparent',
            'touch-action': 'manipulation',
          }}
        >
          🏹
        </button>
        {/* Attack (primary, larger) */}
        <button
          type="button"
          aria-label="Atacar con espada"
          onTouchStart={fireAttack}
          onMouseDown={fireAttack}
          style={{
            width: 'clamp(64px, 18vw, 80px)',
            height: 'clamp(64px, 18vw, 80px)',
            'border-radius': '50%',
            background: 'radial-gradient(circle at 50% 35%, #ff5050 0%, #800 100%)',
            border: '3px solid #ffd54a',
            color: '#fff',
            'font-size': 'clamp(28px, 9vw, 36px)',
            'box-shadow': '0 6px 0 #500, 0 0 16px rgba(255, 213, 74, 0.55)',
            cursor: 'pointer',
            'user-select': 'none',
            '-webkit-tap-highlight-color': 'transparent',
            'touch-action': 'manipulation',
          }}
        >
          ⚔
        </button>
      </div>
    </Show>
  )
}

const SkillButton: Component<{ label: string; onPress: (e: Event) => void }> = (props) => (
  <button
    type="button"
    aria-label={`Skill ${props.label}`}
    onTouchStart={props.onPress}
    onMouseDown={props.onPress}
    style={{
      width: '54px',
      height: '54px',
      'border-radius': '50%',
      background: 'radial-gradient(circle at 50% 35%, #555 0%, #222 100%)',
      border: '3px solid #888',
      color: '#fff',
      'font-family': "'Russo One', sans-serif",
      'font-size': '18px',
      'letter-spacing': '1px',
      'box-shadow': '0 4px 0 #000, 0 0 8px rgba(255, 213, 74, 0.4)',
      cursor: 'pointer',
      'user-select': 'none',
      '-webkit-tap-highlight-color': 'transparent',
      'touch-action': 'manipulation',
    }}
  >
    {props.label}
  </button>
)

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false
  // `(pointer: coarse)` matches when the primary input is a finger (touch).
  // We OR with a heuristic for narrow viewports so old browsers without
  // `pointer:` support still get the buttons on phone-sized screens.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const narrow = window.innerWidth <= 600
  return coarse || narrow
}
