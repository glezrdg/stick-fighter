import { type AuthResponse, AuthResponseSchema } from '@stick/shared'

/**
 * Persistent auth state. We only need the access + refresh tokens and the
 * minimal user profile; the API is the source of truth, so we don't
 * shadow displayName/email anywhere else.
 *
 * localStorage is fine for F5 (single-tab, low value-of-token, no XSS
 * surface beyond what the rest of the SPA already trusts). When mobile
 * lands in F6 we'll proxy this through `@capacitor/preferences`.
 */

const STORAGE_KEY = 'stickFighter.auth.v1'

type Listener = (state: AuthState | null) => void

export interface AuthState {
  user: AuthResponse['user']
  accessToken: string
  refreshToken: string
}

function read(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data: unknown = JSON.parse(raw)
    const parsed = AuthResponseSchema.safeParse(data)
    if (!parsed.success) return null
    return {
      user: parsed.data.user,
      accessToken: parsed.data.accessToken,
      refreshToken: parsed.data.refreshToken,
    }
  } catch {
    return null
  }
}

function write(state: AuthState | null): void {
  try {
    if (state === null) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    }
  } catch {
    // Storage disabled / quota — fail silently. Token will live for the
    // tab session via the in-memory cache below.
  }
}

let cached = read()
const listeners = new Set<Listener>()

export const AuthStore = {
  get(): AuthState | null {
    return cached
  },
  isAuthenticated(): boolean {
    return cached !== null
  },
  set(state: AuthState | null): void {
    cached = state
    write(state)
    for (const fn of [...listeners]) {
      try {
        fn(state)
      } catch (err) {
        console.error('[authStore] listener threw:', err)
      }
    }
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  },
  /** Update only the tokens (after a successful refresh) without changing the user. */
  rotateTokens(opts: { accessToken: string; refreshToken: string }): void {
    if (!cached) return
    AuthStore.set({ ...cached, ...opts })
  },
} as const
