import type { SaveCurrent } from '@stick/shared'
import { type EventBus } from '@stick/sim'
import { type Component, Show, createSignal, onCleanup } from 'solid-js'

interface TutorialOverlayProps {
  bus: EventBus
  getSave: () => SaveCurrent
}

interface TutorialStep {
  text: string
  durationMs: number
}

/**
 * First-run tutorial. Shows a sequence of fading hint banners during the
 * very first run (`save.bestWave === 0`). Subsequent runs skip it. Hints
 * are scripted to the lifecycle events (run:start, wave:complete) rather
 * than to time, so the tutorial paces itself with the player.
 */
export const TutorialOverlay: Component<TutorialOverlayProps> = (props) => {
  const [hint, setHint] = createSignal<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  const show = (steps: TutorialStep[]) => {
    if (props.getSave().bestWave > 0) return
    let i = 0
    const next = () => {
      if (timer) clearTimeout(timer)
      const step = steps[i]
      if (!step) {
        setHint(null)
        return
      }
      setHint(step.text)
      timer = setTimeout(() => {
        i++
        next()
      }, step.durationMs)
    }
    next()
  }

  const offRun = props.bus.on('run:start', () => {
    show([
      { text: '🕹️ Mueve con WASD o el joystick virtual', durationMs: 3500 },
      { text: '⚔ Click / ESPACIO para atacar — combo de 6 golpes', durationMs: 4000 },
      { text: 'Q / E para skills · ESC para salir', durationMs: 3500 },
    ])
  })
  const offComplete = props.bus.on('wave:complete', ({ wave }) => {
    if (wave === 1)
      show([{ text: '✨ Elige una mejora para la siguiente oleada', durationMs: 3500 }])
  })

  onCleanup(() => {
    offRun()
    offComplete()
    if (timer) clearTimeout(timer)
  })

  return (
    <Show when={hint()}>
      {(t) => (
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.78)',
            color: '#fff',
            padding: '8px 14px',
            'border-radius': '6px',
            'font-family': 'Inter, system-ui, sans-serif',
            'font-size': '13px',
            'font-weight': 600,
            border: '1px solid #ffd54a',
            'pointer-events': 'none',
            'z-index': 8,
            'box-shadow': '0 2px 12px rgba(255, 213, 74, 0.3)',
            animation: 'fadeIn 0.4s ease-out',
          }}
        >
          {t()}
        </div>
      )}
    </Show>
  )
}
