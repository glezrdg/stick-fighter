import { type Component, Show, createSignal } from 'solid-js'

import { ApiClient } from '../platform/api'

interface AuthOverlayProps {
  open: () => boolean
  onClose: () => void
  onSuccess: (displayName: string) => void
}

type Mode = 'login' | 'register'

/**
 * Login + register modal. Triggered from the MainMenu auth button. The
 * `onSuccess` callback receives the new displayName so the menu can sync
 * its name input + leaderboard refresh.
 */
export const AuthOverlay: Component<AuthOverlayProps> = (props) => {
  const [mode, setMode] = createSignal<Mode>('login')
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [displayName, setDisplayName] = createSignal('')
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const reset = () => {
    setError(null)
    setEmail('')
    setPassword('')
    setDisplayName('')
  }

  const submit = async () => {
    setError(null)
    if (!email() || !password()) {
      setError('email y contraseña son obligatorios')
      return
    }
    if (password().length < 8) {
      setError('la contraseña debe tener al menos 8 caracteres')
      return
    }
    if (mode() === 'register' && displayName().trim().length < 2) {
      setError('el nombre debe tener al menos 2 caracteres')
      return
    }
    setBusy(true)
    try {
      const res =
        mode() === 'login'
          ? await ApiClient.login({ email: email(), password: password() })
          : await ApiClient.register({
              email: email(),
              password: password(),
              displayName: displayName().trim(),
            })
      if (!res) {
        setError(
          mode() === 'login'
            ? 'credenciales inválidas o backend offline'
            : 'no pudimos registrar (¿email ya en uso?)',
        )
        return
      }
      props.onSuccess(res.user.displayName)
      reset()
      props.onClose()
    } finally {
      setBusy(false)
    }
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
              'radial-gradient(ellipse at 50% 25%, rgba(255, 42, 42, 0.16) 0%, transparent 65%), linear-gradient(180deg, #1a1f24 0%, #0e1317 100%)',
            border: '3px solid #ff2a2a',
            'border-radius': '16px',
            'box-shadow': '0 0 40px rgba(255, 42, 42, 0.4), 0 12px 40px rgba(0, 0, 0, 0.85)',
            padding: '24px 22px',
            display: 'flex',
            'flex-direction': 'column',
            gap: '14px',
          }}
        >
          <h2
            style={{
              'font-family': "'Black Ops One', 'Impact', sans-serif",
              'font-size': '28px',
              'letter-spacing': '4px',
              color: '#ffd54a',
              'text-shadow': '2px 2px 0 #000, 0 0 12px rgba(255,213,74,0.4)',
              margin: 0,
              'text-align': 'center',
            }}
          >
            {mode() === 'login' ? 'INGRESAR' : 'CREAR CUENTA'}
          </h2>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '6px', 'justify-content': 'center' }}>
            <TabButton
              active={mode() === 'login'}
              label="LOGIN"
              onClick={() => {
                setMode('login')
                setError(null)
              }}
            />
            <TabButton
              active={mode() === 'register'}
              label="REGISTRO"
              onClick={() => {
                setMode('register')
                setError(null)
              }}
            />
          </div>

          <Field label="EMAIL" type="email" value={email()} onInput={setEmail} />
          <Field
            label="CONTRASEÑA"
            type="password"
            value={password()}
            onInput={setPassword}
            placeholder="mín. 8 caracteres"
          />
          <Show when={mode() === 'register'}>
            <Field
              label="NOMBRE DE GUERRERO"
              type="text"
              value={displayName()}
              onInput={setDisplayName}
              maxLength={20}
            />
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
            onClick={submit}
            disabled={busy()}
            style={{
              'font-family': "'Russo One', sans-serif",
              'font-size': '14px',
              'letter-spacing': '3px',
              color: '#fff',
              background: busy()
                ? 'linear-gradient(180deg, #555, #333)'
                : 'linear-gradient(180deg, #ff3030, #8b0000)',
              border: '2px solid #ffd54a',
              'border-radius': '10px',
              padding: '12px 18px',
              cursor: busy() ? 'wait' : 'pointer',
              'box-shadow': '0 4px 0 #4a0000, 0 0 18px rgba(255, 42, 42, 0.45)',
              'text-shadow': '1px 1px 0 #000',
            }}
          >
            {busy() ? 'enviando…' : mode() === 'login' ? 'ENTRAR' : 'CREAR'}
          </button>

          <button
            type="button"
            onClick={() => {
              reset()
              props.onClose()
            }}
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
            cancelar
          </button>
        </div>
      </div>
    </Show>
  )
}

const TabButton: Component<{ active: boolean; label: string; onClick: () => void }> = (props) => (
  <button
    type="button"
    onClick={props.onClick}
    style={{
      background: props.active
        ? 'linear-gradient(180deg, rgba(255, 42, 42, 0.3), rgba(139, 0, 0, 0.4))'
        : 'transparent',
      color: props.active ? '#fff' : '#888',
      border: props.active ? '2px solid #ff2a2a' : '2px solid #444',
      'border-radius': '8px',
      padding: '6px 14px',
      cursor: 'pointer',
      'font-family': "'Russo One', sans-serif",
      'font-size': '11px',
      'letter-spacing': '2px',
      'text-shadow': '1px 1px 0 #000',
    }}
  >
    {props.label}
  </button>
)

const Field: Component<{
  label: string
  type: 'text' | 'email' | 'password'
  value: string
  onInput: (v: string) => void
  placeholder?: string
  maxLength?: number
}> = (props) => (
  <label
    style={{
      display: 'flex',
      'flex-direction': 'column',
      gap: '4px',
      'font-family': "'Russo One', sans-serif",
      'font-size': '10px',
      'letter-spacing': '2px',
      color: '#c0a0a0',
    }}
  >
    {props.label}
    <input
      type={props.type}
      value={props.value}
      placeholder={props.placeholder ?? ''}
      maxLength={props.maxLength}
      onInput={(e) => props.onInput(e.currentTarget.value)}
      autocomplete={
        props.type === 'password'
          ? 'current-password'
          : props.type === 'email'
            ? 'email'
            : undefined
      }
      style={{
        'font-family': "'Inter', sans-serif",
        'font-size': '14px',
        color: '#fff',
        background: 'rgba(0, 0, 0, 0.55)',
        border: '2px solid #5a2020',
        'border-radius': '8px',
        padding: '10px 12px',
        outline: 'none',
      }}
    />
  </label>
)
