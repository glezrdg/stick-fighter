/**
 * Per-frame performance timings — recolectados durante el render loop de
 * NetArenaScene y leídos por TelemetryOverlay para mostrar dónde se va
 * el budget de cada frame. Diagnóstico crítico cuando el FPS está bien
 * en el rAF counter pero el render se siente saltón en mobile real.
 *
 * Uso:
 *   import { perfTimings } from '../app/perfTimings'
 *   perfTimings.begin('renderPlayers')
 *   ...trabajo...
 *   perfTimings.end('renderPlayers')
 *
 *   // En el overlay:
 *   const { renderPlayers } = perfTimings.snapshot()
 *
 * Costo: 2 × performance.now() + 2 array ops por sample. ~µs.
 * Window rolling de 60 muestras (1 segundo a 60fps), p95 calculado on-demand.
 */

const SAMPLE_BUFFER_SIZE = 60

/** Stages que medimos por frame. Agregar acá si querés instrumentar otra
 *  parte del pipeline; los timings huérfanos (begin sin end) se descartan. */
export type PerfStage =
  | 'frameTotal'
  | 'applyServerMsg' // tiempo gastado en el snapshot listener (diff + emits)
  | 'renderPlayers'
  | 'renderEnemies'
  | 'renderProjectiles'
  | 'renderObstacles'
  | 'renderGore'
  | 'renderProps'
  | 'renderParticles'
  | 'renderDeathFx'
  | 'diffAndEmit'

class PerfTimings {
  private samples = new Map<PerfStage, number[]>()
  private starts = new Map<PerfStage, number>()
  private indices = new Map<PerfStage, number>()
  /** Frame interval jitter — variance de los dt entre frames consecutivos.
   *  Si el rAF interval es estable a 16.6ms ±0.5ms, el browser está sano.
   *  Si oscila ±5ms+ hay GC pauses o frame drops. */
  private lastFrameTs = 0
  private frameDeltas: number[] = []
  private frameDeltaIdx = 0

  begin(stage: PerfStage): void {
    this.starts.set(stage, performance.now())
  }

  end(stage: PerfStage): void {
    const t0 = this.starts.get(stage)
    if (t0 === undefined) return
    this.starts.delete(stage)
    const dt = performance.now() - t0
    let buf = this.samples.get(stage)
    if (!buf) {
      buf = []
      this.samples.set(stage, buf)
    }
    if (buf.length < SAMPLE_BUFFER_SIZE) {
      buf.push(dt)
    } else {
      const idx = this.indices.get(stage) ?? 0
      buf[idx] = dt
      this.indices.set(stage, (idx + 1) % SAMPLE_BUFFER_SIZE)
    }
  }

  /** Llamar al inicio de cada frame. Mide el delta vs el frame anterior. */
  recordFrameTick(): void {
    const now = performance.now()
    if (this.lastFrameTs > 0) {
      const dt = now - this.lastFrameTs
      if (this.frameDeltas.length < SAMPLE_BUFFER_SIZE) {
        this.frameDeltas.push(dt)
      } else {
        this.frameDeltas[this.frameDeltaIdx] = dt
        this.frameDeltaIdx = (this.frameDeltaIdx + 1) % SAMPLE_BUFFER_SIZE
      }
    }
    this.lastFrameTs = now
  }

  /** Snapshot para el overlay. Cada stage tiene avg + p95 sobre el ring
   *  buffer actual. Si el stage nunca se llamó retorna 0/0. */
  snapshot(): Record<PerfStage, { avg: number; p95: number; samples: number }> & {
    frameInterval: { avg: number; p95: number; samples: number }
  } {
    const out = {} as Record<PerfStage, { avg: number; p95: number; samples: number }> & {
      frameInterval: { avg: number; p95: number; samples: number }
    }
    const stages: PerfStage[] = [
      'frameTotal',
      'applyServerMsg',
      'renderPlayers',
      'renderEnemies',
      'renderProjectiles',
      'renderObstacles',
      'renderGore',
      'renderProps',
      'renderParticles',
      'renderDeathFx',
      'diffAndEmit',
    ]
    for (const s of stages) {
      out[s] = stat(this.samples.get(s) ?? [])
    }
    out.frameInterval = stat(this.frameDeltas)
    return out
  }

  reset(): void {
    this.samples.clear()
    this.starts.clear()
    this.indices.clear()
    this.frameDeltas = []
    this.frameDeltaIdx = 0
    this.lastFrameTs = 0
  }
}

function stat(buf: number[]): { avg: number; p95: number; samples: number } {
  if (buf.length === 0) return { avg: 0, p95: 0, samples: 0 }
  let sum = 0
  for (const v of buf) sum += v
  const avg = sum / buf.length
  const sorted = buf.slice().sort((a, b) => a - b)
  const idx = Math.floor(sorted.length * 0.95)
  const p95 = sorted[Math.min(idx, sorted.length - 1)] ?? 0
  return { avg, p95, samples: buf.length }
}

export const perfTimings = new PerfTimings()
