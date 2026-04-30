import type { EventBus } from '@stick/sim'
import { type Component, Show, createSignal, onCleanup } from 'solid-js'

import { JOYSTICK_MAX_RADIUS } from '../core/input/InputController'

interface JoystickOverlayProps {
  bus: EventBus
}

const BASE_DIAMETER = 110
const KNOB_DIAMETER = 50

/**
 * Visual virtual joystick. Subscribes to input:joystick:* events and renders
 * a circular base + knob at the touch position. The InputController is the
 * source of truth for state; this is purely cosmetic.
 */
export const JoystickOverlay: Component<JoystickOverlayProps> = (props) => {
  const [visible, setVisible] = createSignal(false)
  const [center, setCenter] = createSignal({ x: 0, y: 0 })
  const [knob, setKnob] = createSignal({ x: 0, y: 0 })

  const offStart = props.bus.on('input:joystick:start', ({ screenX, screenY }) => {
    setCenter({ x: screenX, y: screenY })
    setKnob({ x: 0, y: 0 })
    setVisible(true)
  })
  const offMove = props.bus.on('input:joystick:move', ({ vx, vy }) => {
    setKnob({ x: vx * JOYSTICK_MAX_RADIUS, y: vy * JOYSTICK_MAX_RADIUS })
  })
  const offEnd = props.bus.on('input:joystick:end', () => setVisible(false))

  onCleanup(() => {
    offStart()
    offMove()
    offEnd()
  })

  return (
    <Show when={visible()}>
      <div
        style={{
          position: 'absolute',
          left: `${center().x - BASE_DIAMETER / 2}px`,
          top: `${center().y - BASE_DIAMETER / 2}px`,
          width: `${BASE_DIAMETER}px`,
          height: `${BASE_DIAMETER}px`,
          'border-radius': '50%',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          'pointer-events': 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${BASE_DIAMETER / 2 - KNOB_DIAMETER / 2}px`,
            top: `${BASE_DIAMETER / 2 - KNOB_DIAMETER / 2}px`,
            width: `${KNOB_DIAMETER}px`,
            height: `${KNOB_DIAMETER}px`,
            'border-radius': '50%',
            background: 'rgba(255, 213, 74, 0.7)',
            border: '2px solid rgba(255, 213, 74, 1)',
            transform: `translate(${knob().x}px, ${knob().y}px)`,
            'will-change': 'transform',
          }}
        />
      </div>
    </Show>
  )
}
