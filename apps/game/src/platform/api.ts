import {
  type AuthResponse,
  type LeaderboardResponse,
  type LoginRequest,
  type ProfileResponse,
  type RegisterRequest,
  type RunReport,
  type RunSubmitResponse,
  AuthResponseSchema,
  LeaderboardResponseSchema,
  ProfileResponseSchema,
  RunSubmitResponseSchema,
} from '@stick/shared'

import { AuthStore } from './authStore'

/**
 * Cliente HTTP del backend stick-fighter-api. Lee `VITE_API_URL` (Vite env);
 * si está vacío o el fetch falla, los métodos resuelven con `null` y el
 * cliente sigue funcionando offline.
 *
 * Auth: cuando hay un access token en `AuthStore`, se envía como
 * `Authorization: Bearer …`. Si la respuesta es 401, intenta una vez
 * refrescar el par access+refresh contra `/auth/refresh` y reintenta el
 * request original. Si el refresh falla, hace logout silencioso.
 */

const API_BASE: string =
  (import.meta.env?.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

interface AuthedFetchOptions extends RequestInit {
  /** When false, skip the Authorization header even if a token exists. */
  withAuth?: boolean
}

async function refreshTokens(): Promise<boolean> {
  const auth = AuthStore.get()
  if (!auth) return false
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    })
    if (!res.ok) {
      AuthStore.set(null)
      return false
    }
    const json: unknown = await res.json()
    const parsed = AuthResponseSchema.safeParse(json)
    if (!parsed.success) {
      AuthStore.set(null)
      return false
    }
    AuthStore.set({
      user: parsed.data.user,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken,
    })
    return true
  } catch {
    return false
  }
}

async function authedFetch(path: string, opts: AuthedFetchOptions = {}): Promise<Response | null> {
  if (!API_BASE) return null
  const url = `${API_BASE}${path}`
  const { withAuth = true, ...init } = opts
  const headers = new Headers(init.headers ?? {})
  const auth = AuthStore.get()
  if (withAuth && auth) {
    headers.set('Authorization', `Bearer ${auth.accessToken}`)
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  try {
    let res = await fetch(url, { ...init, headers, credentials: 'include' })
    if (res.status === 401 && withAuth && auth) {
      const refreshed = await refreshTokens()
      if (!refreshed) return res
      const newAuth = AuthStore.get()
      if (newAuth) headers.set('Authorization', `Bearer ${newAuth.accessToken}`)
      res = await fetch(url, { ...init, headers, credentials: 'include' })
    }
    return res
  } catch {
    return null
  }
}

export const ApiClient = {
  isConfigured(): boolean {
    return API_BASE.length > 0
  },

  // ---------- Auth ----------

  async register(req: RegisterRequest): Promise<AuthResponse | null> {
    const res = await authedFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(req),
      withAuth: false,
    })
    if (!res || !res.ok) return null
    const parsed = AuthResponseSchema.safeParse(await res.json())
    if (!parsed.success) return null
    AuthStore.set({
      user: parsed.data.user,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken,
    })
    return parsed.data
  },

  async login(req: LoginRequest): Promise<AuthResponse | null> {
    const res = await authedFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(req),
      withAuth: false,
    })
    if (!res || !res.ok) return null
    const parsed = AuthResponseSchema.safeParse(await res.json())
    if (!parsed.success) return null
    AuthStore.set({
      user: parsed.data.user,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken,
    })
    return parsed.data
  },

  async logout(): Promise<void> {
    const auth = AuthStore.get()
    AuthStore.set(null)
    if (!auth) return
    await authedFetch('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
      withAuth: false,
    })
  },

  async me(): Promise<ProfileResponse | null> {
    const res = await authedFetch('/auth/me')
    if (!res || !res.ok) return null
    const parsed = ProfileResponseSchema.safeParse(await res.json())
    return parsed.success ? parsed.data : null
  },

  // ---------- Runs / Leaderboard ----------

  async submitRun(report: RunReport): Promise<RunSubmitResponse | null> {
    const res = await authedFetch('/runs', {
      method: 'POST',
      body: JSON.stringify(report),
    })
    if (!res || !res.ok) return null
    const parsed = RunSubmitResponseSchema.safeParse(await res.json())
    return parsed.success ? parsed.data : null
  },

  async fetchLeaderboard(
    opts: { top?: number; weapon?: string } = {},
  ): Promise<LeaderboardResponse | null> {
    const params = new URLSearchParams()
    if (opts.top !== undefined) params.set('top', String(opts.top))
    if (opts.weapon) params.set('weapon', opts.weapon)
    const qs = params.toString()
    const res = await authedFetch(`/leaderboard${qs ? `?${qs}` : ''}`)
    if (!res || !res.ok) return null
    const parsed = LeaderboardResponseSchema.safeParse(await res.json())
    return parsed.success ? parsed.data : null
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
