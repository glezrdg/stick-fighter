import {
  type LeaderboardResponse,
  type RunReport,
  type RunSubmitResponse,
  LeaderboardResponseSchema,
  RunSubmitResponseSchema,
} from '@stick/shared'

/**
 * Cliente HTTP del backend stick-fighter-api. Lee `VITE_API_URL` (Vite env)
 * — si está vacío o el fetch falla, los métodos resuelven con `null` y el
 * cliente sigue funcionando offline. La cola de submits offline llega en F4.5.
 */

const API_BASE: string =
  (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export const ApiClient = {
  isConfigured(): boolean {
    return API_BASE.length > 0
  },

  async submitRun(report: RunReport): Promise<RunSubmitResponse | null> {
    if (!API_BASE) return null
    try {
      const res = await fetch(`${API_BASE}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
        credentials: 'include',
      })
      if (!res.ok) return null
      const json: unknown = await res.json()
      const parsed = RunSubmitResponseSchema.safeParse(json)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  },

  async fetchLeaderboard(
    opts: { top?: number; weapon?: string } = {},
  ): Promise<LeaderboardResponse | null> {
    if (!API_BASE) return null
    try {
      const params = new URLSearchParams()
      if (opts.top !== undefined) params.set('top', String(opts.top))
      if (opts.weapon) params.set('weapon', opts.weapon)
      const qs = params.toString()
      const url = `${API_BASE}/leaderboard${qs ? `?${qs}` : ''}`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) return null
      const json: unknown = await res.json()
      const parsed = LeaderboardResponseSchema.safeParse(json)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  },

  async health(): Promise<boolean> {
    if (!API_BASE) return false
    try {
      const res = await fetch(`${API_BASE}/health`)
      return res.ok
    } catch {
      return false
    }
  },
} as const
