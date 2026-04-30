import type { SaveCurrent } from '@stick/shared'
import { type EventBus } from '@stick/sim'
import { type Component, Show, createEffect, createSignal, onCleanup } from 'solid-js'

import { netClient, type RoomSnapshot } from '../net/NetClient'
import { AuthStore } from '../platform/authStore'

interface LobbyOverlayProps {
  bus: EventBus
  open: () => boolean
  onClose: () => void
  getSave: () => SaveCurrent
}

type Mode = 'menu' | 'host' | 'join'

/**
 * Multiplayer lobby modal. Host creates a room → server returns 4-letter code.
 * Friend types the code → both flip ready → server transitions to 'playing'
 * → we hand off to NetArenaScene.
 *
 * Pivoted to raw WS + JSON; this overlay just talks to `netClient` whose API
 * doesn't know which transport sits underneath.
 */
export const LobbyOverlay: Component<LobbyOverlayProps> = (props) => {
  const [mode, setMode] = createSignal<Mode>('menu')
  const [code, setCode] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [snap, setSnap] = createSignal<RoomSnapshot>(netClient.getSnapshot())

  const off = netClient.subscribe((s) => setSnap(s))
  onCleanup(off)

  // When the server flips phase=playing, hand off to the multiplayer scene.
  createEffect(() => {
    const s = snap()
    if (s.phase === 'playing' && props.open()) {
      props.onClose()
      props.bus.emit('ui:menu:start-netarena', {})
    }
    if (s.error) setError(s.error.msg)
  })

  const playerName = (): string => {
    const auth = AuthStore.get()
    if (auth) return auth.user.displayName
    return props.getSave().playerName?.trim() || 'Anónimo'
  }

  const reset = () => {
    setMode('menu')
    setCode('')
    setBusy(false)
    setError(null)
  }

  const close = () => {
    if (snap().phase !== 'playing') {
      void netClient.leave()
    }
    reset()
    props.onClose()
  }

  const host = async () => {
    setError(null)
    setBusy(true)
    try {
      const result = await netClient.hostRoom(playerName())
      if (!result || result.phase === 'error') {
        setError(result?.error?.msg ?? 'no se pudo crear la sala — ¿servidor offline?')
        return
      }
      setMode('host')
    } finally {
      setBusy(false)
    }
  }

  const join = async () => {
    setError(null)
    if (code().trim().length !== 4) {
      setError('el código tiene 4 letras')
      return
    }
    setBusy(true)
    try {
      const result = await netClient.joinRoom(playerName(), code().trim())
      if (!result || result.phase === 'error') {
        setError(result?.error?.msg ?? 'código inválido o sala llena')
        return
      }
      setMode('join')
    } finally {
      setBusy(false)
    }
  }

  const ready = () => {
    netClient.sendReady()
  }

  const isReady = () => {
    const s = snap()
    if (!s.sessionId) return false
    return s.players.find((p) => p.sessionId === s.sessionId)?.ready ?? false
  }

  return (
    <Show when={props.open()}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          background: 'rgba(0,0,0,0.7)',
          'z-index': 60,
          padding: '20px',
        }}
      >
        <div
          style={{
            width: '100%',
            'max-width': '380px',
            background:
              'radial-gradient(ellipse at 50% 25%, rgba(255, 213, 74, 0.18) 0%, transparent 65%), linear-gradient(180deg, #1a1f24 0%, #0e1317 100%)',
            border: '3px solid #ffd54a',
            'border-radius': '14px',
            'box-shadow': '0 0 36px rgba(255, 213, 74, 0.45), 0 12px 30px #000',
            padding: '24px',
            display: 'flex',
            'flex-direction': 'column',
            'align-items': 'center',
            gap: '14px',
            color: '#e6e6e6',
            'font-family': "'Inter', sans-serif",
          }}
        >
          <h2
            style={{
              'font-family': "'Black Ops One', 'Impact', sans-serif",
              'font-size': '26px',
              'letter-spacing': '3px',
              margin: 0,
              color: '#ffd54a',
              'text-shadow': '2px 2px 0 #000',
            }}
          >
            CO-OP 2P
          </h2>

          {/* Mode: menu (host or join chooser) */}
          <Show when={mode() === 'menu' && snap().phase !== 'lobby' && snap().phase !== 'playing'}>
            <p style={{ 'font-size': '12px', color: '#aaa', margin: 0, 'text-align': 'center' }}>
              jugá con un amigo. uno crea la sala, el otro entra con el código.
            </p>
            <button type="button" disabled={busy()} onClick={host} style={btnPrimary}>
              {busy() ? '…conectando' : '🪄 CREAR SALA'}
            </button>
            <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
              <input
                value={code()}
                placeholder="ABCD"
                maxLength={4}
                onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
                style={{
                  flex: 1,
                  padding: '10px',
                  background: '#0e1317',
                  border: '2px solid #4a3030',
                  'border-radius': '6px',
                  color: '#ffd54a',
                  'font-family': "'Russo One', sans-serif",
                  'letter-spacing': '4px',
                  'text-align': 'center',
                  'font-size': '18px',
                }}
              />
              <button
                type="button"
                disabled={busy() || code().length !== 4}
                onClick={join}
                style={btnSecondary}
              >
                {busy() ? '…' : 'UNIRSE'}
              </button>
            </div>
          </Show>

          {/* Mode: in lobby (host or join) */}
          <Show when={mode() !== 'menu' && snap().phase === 'lobby'}>
            <Show when={mode() === 'host'}>
              <div style={{ 'text-align': 'center' }}>
                <div style={{ 'font-size': '11px', color: '#aaa', 'letter-spacing': '2px' }}>
                  CÓDIGO PARA TU AMIGO
                </div>
                <div
                  style={{
                    'font-family': "'Black Ops One', 'Impact', sans-serif",
                    'font-size': '52px',
                    color: '#ffd54a',
                    'letter-spacing': '10px',
                    'text-shadow': '3px 3px 0 #000, 0 0 18px rgba(255,213,74,0.5)',
                    'margin-top': '4px',
                  }}
                >
                  {snap().code ?? '…'}
                </div>
              </div>
            </Show>

            <div
              style={{
                width: '100%',
                display: 'flex',
                'flex-direction': 'column',
                gap: '6px',
              }}
            >
              <div style={{ 'font-size': '11px', color: '#aaa', 'letter-spacing': '2px' }}>
                JUGADORES ({snap().players.length}/2)
              </div>
              {snap().players.map((p) => (
                <div
                  style={{
                    display: 'flex',
                    'justify-content': 'space-between',
                    padding: '8px 12px',
                    background: '#0e1317',
                    border: '1.5px solid #333',
                    'border-radius': '6px',
                    'font-size': '13px',
                  }}
                >
                  <span>
                    {p.slot === 0 ? '👑' : '🤝'} {p.name}
                    {p.sessionId === snap().sessionId ? ' (vos)' : ''}
                  </span>
                  <span style={{ color: p.ready ? '#7fff7f' : '#888' }}>
                    {p.ready ? '✓ LISTO' : '…'}
                  </span>
                </div>
              ))}
            </div>

            <button type="button" disabled={isReady()} onClick={ready} style={btnPrimary}>
              {isReady() ? 'ESPERANDO AL OTRO…' : '✓ ESTOY LISTO'}
            </button>
          </Show>

          <Show when={error()}>
            <div style={{ color: '#ff8080', 'font-size': '11px', 'text-align': 'center' }}>
              {error()}
            </div>
          </Show>

          <button
            type="button"
            onClick={close}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              'font-size': '11px',
              'letter-spacing': '2px',
              cursor: 'pointer',
              'margin-top': '4px',
            }}
          >
            ✕ CANCELAR
          </button>
        </div>
      </div>
    </Show>
  )
}

const btnPrimary = {
  width: '100%',
  padding: '12px',
  'font-family': "'Russo One', sans-serif",
  'font-size': '14px',
  'letter-spacing': '3px',
  background: 'linear-gradient(180deg, #ffd54a, #c89f1a)',
  color: '#1a1f24',
  border: '2px solid #1a1f24',
  'border-radius': '8px',
  'box-shadow': '0 3px 0 #000, 0 0 14px rgba(255,213,74,0.4)',
  cursor: 'pointer',
} as const

const btnSecondary = {
  padding: '10px 14px',
  'font-family': "'Russo One', sans-serif",
  'font-size': '12px',
  'letter-spacing': '2px',
  background: '#2a2a2a',
  color: '#ffd54a',
  border: '2px solid #ffd54a',
  'border-radius': '6px',
  cursor: 'pointer',
} as const
