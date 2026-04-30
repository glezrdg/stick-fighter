import type { SaveCurrent } from '@stick/shared'
import { type EventBus } from '@stick/sim'
import { type Component, Show, createEffect, createSignal, onCleanup } from 'solid-js'

import { netClient, type RoomPlayer, type RoomSnapshot } from '../net/NetClient'
import { NetClient } from '../net/NetClient'
import { AuthStore } from '../platform/authStore'

interface LobbyOverlayProps {
  bus: EventBus
  open: () => boolean
  onClose: () => void
  getSave: () => SaveCurrent
}

type Mode = 'menu' | 'host' | 'join'

/**
 * Multiplayer lobby modal: host or join a room. The host sees a 4-letter
 * code to share; the friend types the same code. Both flip "ready" and the
 * server starts the run (phase 3c will wire the actual gameplay).
 */
export const LobbyOverlay: Component<LobbyOverlayProps> = (props) => {
  const [mode, setMode] = createSignal<Mode>('menu')
  const [code, setCode] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [snapshot, setSnapshot] = createSignal<RoomSnapshot | null>(null)

  // Subscribe to room state for as long as the modal is open.
  const off = netClient.subscribe((snap) => setSnapshot(snap))
  onCleanup(off)

  // When the server flips phase=playing, leave the lobby modal mounted but
  // hand off to NetArenaScene which renders the multiplayer arena from the
  // same room state. We don't `netClient.leave()` here — the scene re-uses
  // the live connection.
  createEffect(() => {
    const snap = snapshot()
    if (snap?.phase === 'playing' && props.open()) {
      props.onClose()
      props.bus.emit('ui:menu:start-netarena', {})
    }
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
    // Only disconnect if we haven't already transitioned to gameplay.
    if (snapshot()?.phase !== 'playing') {
      void netClient.leave()
      setSnapshot(null)
    }
    reset()
    props.onClose()
  }

  const host = async () => {
    setError(null)
    setBusy(true)
    try {
      const snap = await netClient.hostRoom(playerName())
      if (!snap) {
        setError('no se pudo crear la sala — ¿servidor offline?')
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
      const snap = await netClient.joinRoom(playerName(), code().trim())
      if (!snap) {
        setError('código inválido o sala llena')
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

  return (
    <Show when={props.open()}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          padding: '20px',
          'pointer-events': 'auto',
          'z-index': 40,
          background: 'rgba(0, 0, 0, 0.85)',
        }}
      >
        <div
          style={{
            width: '100%',
            'max-width': '380px',
            background:
              'radial-gradient(ellipse at 50% 25%, rgba(123, 224, 196, 0.16) 0%, transparent 65%), linear-gradient(180deg, #1a1f24 0%, #0e1317 100%)',
            border: '3px solid #7be0c4',
            'border-radius': '16px',
            'box-shadow': '0 0 40px rgba(123, 224, 196, 0.4)',
            padding: '24px 22px',
            display: 'flex',
            'flex-direction': 'column',
            gap: '14px',
          }}
        >
          <h2
            style={{
              'font-family': "'Black Ops One', 'Impact', sans-serif",
              'font-size': '24px',
              'letter-spacing': '4px',
              color: '#7be0c4',
              'text-shadow': '2px 2px 0 #000, 0 0 12px rgba(123,224,196,0.4)',
              margin: 0,
              'text-align': 'center',
            }}
          >
            CO-OP MULTIJUGADOR
          </h2>

          <Show when={!NetClient.isConfigured()}>
            <PanelMessage tone="warn">
              VITE_REALTIME_URL no configurado — multijugador deshabilitado
            </PanelMessage>
          </Show>

          <Show when={NetClient.isConfigured()}>
            {/* MENU: host or join */}
            <Show when={mode() === 'menu'}>
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
                <ActionButton label="🎮 CREAR SALA" onClick={host} disabled={busy()} />
                <div
                  style={{
                    height: '1px',
                    background: '#444',
                    margin: '4px 0',
                  }}
                />
                <label
                  style={{
                    display: 'flex',
                    'flex-direction': 'column',
                    gap: '6px',
                    'font-family': "'Russo One', sans-serif",
                    'font-size': '11px',
                    'letter-spacing': '2px',
                    color: '#c0a0a0',
                  }}
                >
                  CÓDIGO DE SALA
                  <input
                    type="text"
                    value={code()}
                    maxLength={4}
                    placeholder="ABCD"
                    onInput={(e) => setCode(e.currentTarget.value.toUpperCase())}
                    style={{
                      'font-family': "'Black Ops One', 'Impact', sans-serif",
                      'font-size': '32px',
                      'letter-spacing': '8px',
                      'text-align': 'center',
                      color: '#fff',
                      background: 'rgba(0, 0, 0, 0.55)',
                      border: '2px solid #7be0c4',
                      'border-radius': '8px',
                      padding: '12px',
                      outline: 'none',
                      'text-shadow': '1px 1px 0 #000',
                    }}
                  />
                </label>
                <ActionButton
                  label="⚔ UNIRME"
                  onClick={join}
                  disabled={busy() || code().trim().length !== 4}
                />
              </div>
            </Show>

            {/* HOST or JOIN: show lobby state */}
            <Show when={mode() !== 'menu' && snapshot()}>
              <LobbyView snap={snapshot()!} onReady={ready} />
            </Show>
          </Show>

          <Show when={error()}>
            <div
              style={{
                'font-family': "'Inter', sans-serif",
                'font-size': '12px',
                color: '#ff8080',
                'text-align': 'center',
              }}
            >
              {error()}
            </div>
          </Show>

          <button
            type="button"
            onClick={close}
            style={{
              'font-family': "'Russo One', sans-serif",
              'font-size': '11px',
              'letter-spacing': '2px',
              color: '#888',
              background: 'transparent',
              border: 'none',
              padding: '4px',
              cursor: 'pointer',
            }}
          >
            cerrar
          </button>
        </div>
      </div>
    </Show>
  )
}

const LobbyView: Component<{ snap: RoomSnapshot; onReady: () => void }> = (props) => (
  <div style={{ display: 'flex', 'flex-direction': 'column', gap: '14px' }}>
    <div style={{ 'text-align': 'center' }}>
      <div
        style={{
          'font-family': "'Russo One', sans-serif",
          'font-size': '11px',
          'letter-spacing': '2px',
          color: '#888',
        }}
      >
        CÓDIGO DE LA SALA
      </div>
      <div
        style={{
          'font-family': "'Black Ops One', 'Impact', sans-serif",
          'font-size': '40px',
          'letter-spacing': '12px',
          color: '#7be0c4',
          'text-shadow': '0 0 16px rgba(123,224,196,0.6), 2px 2px 0 #000',
          'margin-top': '4px',
        }}
      >
        {props.snap.lobbyCode}
      </div>
    </div>

    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
      {props.snap.players.map((p) => (
        <PlayerRow player={p} />
      ))}
      {props.snap.players.length < 2 && (
        <div
          style={{
            'font-family': "'Inter', sans-serif",
            'font-size': '11px',
            color: '#888',
            'text-align': 'center',
            padding: '6px',
            border: '1px dashed #444',
            'border-radius': '6px',
          }}
        >
          esperando al segundo jugador…
        </div>
      )}
    </div>

    <Show when={props.snap.phase === 'lobby'}>
      <ActionButton
        label={props.snap.players.length >= 2 ? '✓ LISTO' : 'esperando…'}
        onClick={props.onReady}
        disabled={props.snap.players.length < 2}
      />
    </Show>
    <Show when={props.snap.phase === 'playing'}>
      <div
        style={{
          'font-family': "'Russo One', sans-serif",
          'font-size': '13px',
          color: '#ffd54a',
          'text-align': 'center',
        }}
      >
        ⚔ partida en curso · seed {props.snap.seed}
      </div>
    </Show>
  </div>
)

const PlayerRow: Component<{ player: RoomPlayer }> = (props) => (
  <div
    style={{
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      padding: '8px 12px',
      background: 'rgba(0, 0, 0, 0.4)',
      border: `1.5px solid ${props.player.ready ? '#7be0c4' : '#444'}`,
      'border-radius': '8px',
      'font-family': "'Russo One', sans-serif",
      'font-size': '13px',
      'letter-spacing': '1px',
    }}
  >
    <span style={{ color: '#ffd54a' }}>⚔ {props.player.displayName}</span>
    <span style={{ color: props.player.ready ? '#7be0c4' : '#888' }}>
      {props.player.ready ? 'LISTO' : '…'}
    </span>
  </div>
)

const ActionButton: Component<{ label: string; onClick: () => void; disabled?: boolean }> = (
  props,
) => (
  <button
    type="button"
    onClick={props.onClick}
    disabled={props.disabled ?? false}
    style={{
      'font-family': "'Russo One', sans-serif",
      'font-size': '14px',
      'letter-spacing': '3px',
      color: '#fff',
      background: props.disabled
        ? 'linear-gradient(180deg, #555, #333)'
        : 'linear-gradient(180deg, #5fc0a0, #2a7060)',
      border: '2px solid #ffd54a',
      'border-radius': '10px',
      padding: '12px 18px',
      cursor: props.disabled ? 'not-allowed' : 'pointer',
      'box-shadow': '0 4px 0 #1a4a3a, 0 0 14px rgba(123, 224, 196, 0.35)',
      'text-shadow': '1px 1px 0 #000',
    }}
  >
    {props.label}
  </button>
)

const PanelMessage: Component<{ tone: 'warn'; children: string }> = (props) => (
  <div
    style={{
      'font-family': "'Inter', sans-serif",
      'font-size': '11px',
      'font-weight': 700,
      'letter-spacing': '1px',
      color: props.tone === 'warn' ? '#ff8080' : '#888',
      'text-align': 'center',
      padding: '10px 12px',
      background: 'rgba(255, 100, 100, 0.08)',
      border: '1px solid #5a2020',
      'border-radius': '8px',
    }}
  >
    {props.children}
  </div>
)
