import { type Component, Show, createSignal, onCleanup } from 'solid-js'

import { netClient, type NetTelemetry } from '../net/NetClient'

/**
 * Telemetry overlay activado con `?debug=1` en query string. Pinta métricas
 * netcode + FPS para validar performance — especialmente en mobile low-end.
 *
 * Métricas:
 *   - FPS local (rolling avg sobre 1s)
 *   - tickrate efectivo recibido (msgs/s del server)
 *   - bytes/s in (tamaño promedio × frequency)
 *   - p95 parse time per msg (ms)
 *   - last msg size + decode time (debugging individual frames)
 *
 * Sin acoplamiento al gameplay: si la flag está off el componente no se monta.
 */

const REFRESH_INTERVAL_MS = 500
const FPS_SAMPLE_WINDOW_MS = 1000

interface TelemetryOverlayProps {
  enabled: boolean
}

export const TelemetryOverlay: Component<TelemetryOverlayProps> = (props) => {
  const [tel, setTel] = createSignal<NetTelemetry>(netClient.getTelemetry())
  const [fps, setFps] = createSignal(0)

  // FPS via requestAnimationFrame — independiente del Phaser game loop para
  // detectar si el render fluyo se interrumpe a nivel browser.
  let frameTimes: number[] = []
  let rafHandle = 0
  const tick = (ts: number) => {
    frameTimes.push(ts)
    const cutoff = ts - FPS_SAMPLE_WINDOW_MS
    frameTimes = frameTimes.filter((t) => t >= cutoff)
    rafHandle = requestAnimationFrame(tick)
  }

  const refresh = () => {
    setTel(netClient.getTelemetry())
    if (frameTimes.length >= 2) {
      const span = (frameTimes[frameTimes.length - 1] ?? 0) - (frameTimes[0] ?? 0)
      const f = span > 0 ? ((frameTimes.length - 1) * 1000) / span : 0
      setFps(Math.round(f))
    }
  }

  if (props.enabled) {
    rafHandle = requestAnimationFrame(tick)
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS)
    onCleanup(() => {
      cancelAnimationFrame(rafHandle)
      clearInterval(interval)
    })
  }

  const fpsColor = (): string => {
    const f = fps()
    if (f >= 55) return '#7fff7f'
    if (f >= 30) return '#ffd54a'
    return '#ff8080'
  }

  const tickColor = (): string => {
    const t = tel().tickRateHz
    if (t >= 28) return '#7fff7f'
    if (t >= 15) return '#ffd54a'
    return '#ff8080'
  }

  const parseColor = (): string => {
    const p = tel().parseP95Ms
    if (p < 2) return '#7fff7f'
    if (p < 5) return '#ffd54a'
    return '#ff8080'
  }

  return (
    <Show when={props.enabled}>
      <div
        style={{
          position: 'fixed',
          top: '8px',
          right: '8px',
          'min-width': '140px',
          padding: '8px 10px',
          background: 'rgba(0, 0, 0, 0.78)',
          border: '1px solid #444',
          'border-radius': '6px',
          'font-family': "'JetBrains Mono', monospace",
          'font-size': '10px',
          color: '#ddd',
          'line-height': 1.4,
          'z-index': 9999,
          'pointer-events': 'none',
          'text-shadow': '1px 1px 0 #000',
        }}
      >
        <div style={{ color: '#888', 'margin-bottom': '4px', 'letter-spacing': '1px' }}>
          ▸ TELEMETRY
        </div>
        <Row label="FPS" value={`${fps()}`} color={fpsColor()} />
        <Row
          label="tick"
          value={`${tel().tickRateHz.toFixed(1)} Hz`}
          color={tickColor()}
          hidden={tel().tickRateHz === 0}
        />
        <Row label="bytes/s" value={fmtBytes(tel().bytesPerSec)} hidden={tel().bytesPerSec === 0} />
        <Row
          label="parse p95"
          value={`${tel().parseP95Ms.toFixed(2)} ms`}
          color={parseColor()}
          hidden={tel().parseP95Ms === 0}
        />
        <Row
          label="last"
          value={`${fmtBytes(tel().lastMsgBytes)} / ${tel().lastMsgParseMs.toFixed(2)} ms`}
          hidden={tel().lastMsgBytes === 0}
        />
        <Row label="proto" value={`v${tel().netcodeVersion}`} />
      </div>
    </Show>
  )
}

const Row: Component<{ label: string; value: string; color?: string; hidden?: boolean }> = (
  props,
) => (
  <Show when={!props.hidden}>
    <div style={{ display: 'flex', 'justify-content': 'space-between', gap: '8px' }}>
      <span style={{ color: '#888' }}>{props.label}</span>
      <span style={{ color: props.color ?? '#ddd' }}>{props.value}</span>
    </div>
  </Show>
)

function fmtBytes(n: number): string {
  if (n < 1024) return `${n.toFixed(0)} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}
