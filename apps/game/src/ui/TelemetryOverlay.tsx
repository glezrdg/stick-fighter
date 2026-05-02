import { type Component, Show, createSignal, onCleanup } from 'solid-js'

import { perfTimings } from '../app/perfTimings'
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
  const [perf, setPerf] = createSignal(perfTimings.snapshot())

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
    setPerf(perfTimings.snapshot())
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

  /** Color del p95 de un stage. <2ms verde, <5ms amarillo, >=5ms rojo —
   *  cualquier stage que come >5ms del frame budget de 16.6ms es sospechoso. */
  const stageColor = (p95: number): string => {
    if (p95 === 0) return '#666'
    if (p95 < 2) return '#7fff7f'
    if (p95 < 5) return '#ffd54a'
    return '#ff8080'
  }
  const fmtMs = (n: number): string => n.toFixed(2)
  /** Suma de los stages "renderXxx" — útil para ver si todos los renders
   *  combinados pasan del frame budget aún cuando ninguno individual lo hace. */
  const totalRender = (): number => {
    const p = perf()
    return (
      p.renderPlayers.p95 +
      p.renderEnemies.p95 +
      p.renderProjectiles.p95 +
      p.renderObstacles.p95 +
      p.renderGore.p95 +
      p.renderProps.p95 +
      p.renderParticles.p95 +
      p.renderDeathFx.p95
    )
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

        {/* Per-frame timings — solo se muestran cuando hay samples (en el menú
            todavía no, en el arena sí). Cada row: avg / p95. Si frameTotal p95
            > 16ms = el frame se está pasando. Si totalRender > frameTotal: GC
            o algo entre stages. */}
        <Show when={perf().frameTotal.samples > 0}>
          <div
            style={{
              color: '#888',
              'margin-top': '6px',
              'margin-bottom': '2px',
              'letter-spacing': '1px',
              'border-top': '1px dashed #333',
              'padding-top': '4px',
            }}
          >
            ▸ PERF (avg/p95 ms)
          </div>
          <Row
            label="frame total"
            value={`${fmtMs(perf().frameTotal.avg)} / ${fmtMs(perf().frameTotal.p95)}`}
            color={stageColor(perf().frameTotal.p95 / 2)}
          />
          <Row
            label="frame Δt"
            value={`${fmtMs(perf().frameInterval.avg)} / ${fmtMs(perf().frameInterval.p95)}`}
            color={stageColor(Math.abs(perf().frameInterval.p95 - 16.6) / 2)}
          />
          <Row
            label="apply state"
            value={`${fmtMs(perf().applyServerMsg.avg)} / ${fmtMs(perf().applyServerMsg.p95)}`}
            color={stageColor(perf().applyServerMsg.p95)}
          />
          <Row
            label="diffAndEmit"
            value={`${fmtMs(perf().diffAndEmit.avg)} / ${fmtMs(perf().diffAndEmit.p95)}`}
            color={stageColor(perf().diffAndEmit.p95)}
          />
          <Row
            label="render players"
            value={`${fmtMs(perf().renderPlayers.avg)} / ${fmtMs(perf().renderPlayers.p95)}`}
            color={stageColor(perf().renderPlayers.p95)}
          />
          <Row
            label="render enemies"
            value={`${fmtMs(perf().renderEnemies.avg)} / ${fmtMs(perf().renderEnemies.p95)}`}
            color={stageColor(perf().renderEnemies.p95)}
          />
          <Row
            label="render projs"
            value={`${fmtMs(perf().renderProjectiles.avg)} / ${fmtMs(perf().renderProjectiles.p95)}`}
            color={stageColor(perf().renderProjectiles.p95)}
            hidden={perf().renderProjectiles.samples === 0}
          />
          <Row
            label="render obst"
            value={`${fmtMs(perf().renderObstacles.avg)} / ${fmtMs(perf().renderObstacles.p95)}`}
            color={stageColor(perf().renderObstacles.p95)}
          />
          <Row
            label="render gore"
            value={`${fmtMs(perf().renderGore.avg)} / ${fmtMs(perf().renderGore.p95)}`}
            color={stageColor(perf().renderGore.p95)}
          />
          <Row
            label="render props"
            value={`${fmtMs(perf().renderProps.avg)} / ${fmtMs(perf().renderProps.p95)}`}
            color={stageColor(perf().renderProps.p95)}
          />
          <Row
            label="render parts"
            value={`${fmtMs(perf().renderParticles.avg)} / ${fmtMs(perf().renderParticles.p95)}`}
            color={stageColor(perf().renderParticles.p95)}
          />
          <Row
            label="render fx"
            value={`${fmtMs(perf().renderDeathFx.avg)} / ${fmtMs(perf().renderDeathFx.p95)}`}
            color={stageColor(perf().renderDeathFx.p95)}
          />
          <Row
            label="Σ render"
            value={`${fmtMs(totalRender())}`}
            color={stageColor(totalRender() / 2)}
          />
        </Show>
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
