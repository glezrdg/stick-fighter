import type { SaveCurrent } from '@stick/shared'
import { type EventBus } from '@stick/sim'
import { type Component, Show, createSignal, onCleanup } from 'solid-js'

import { netClient, type RoomSnapshot } from '../net/NetClient'

import { LeaderboardPanel } from './LeaderboardPanel'
import { PrimaryButton, SecondaryButton } from './MainMenuOverlay'

interface GameOverOverlayProps {
  bus: EventBus
  getSave: () => SaveCurrent
}

interface RunSummary {
  wave: number
  kills: number
  gold: number
}

type SubmitStatus = 'pending' | 'accepted' | 'queued' | 'failed' | 'no-backend'

/**
 * Game-over Solid overlay — replica el `.defeat-text` (legacy 382-403) con
 * la animación `defeatIn` (scale 2 + rotate -10deg → scale 1) + grid de stats
 * y dos botones (REINTENTAR / VOLVER).
 */
export const GameOverOverlay: Component<GameOverOverlayProps> = (props) => {
  const [visible, setVisible] = createSignal(false)
  const [summary, setSummary] = createSignal<RunSummary>({ wave: 0, kills: 0, gold: 0 })
  const [submit, setSubmit] = createSignal<{ status: SubmitStatus; rank: number | null }>({
    status: 'pending',
    rank: null,
  })
  const [snap, setSnap] = createSignal<RoomSnapshot>(netClient.getSnapshot())

  const offEnter = props.bus.on('ui:scene:enter', ({ name }) => {
    setVisible(name === 'gameover')
  })
  const offRunEnd = props.bus.on('run:end', ({ wave, kills, gold }) => {
    setSummary({ wave, kills, gold })
    setSubmit({ status: 'pending', rank: null })
  })
  const offSubmitted = props.bus.on('run:submitted', ({ status, rank }) => {
    setSubmit({ status, rank })
  })
  const offNet = netClient.subscribe((s) => setSnap(s))

  onCleanup(() => {
    offEnter()
    offRunEnd()
    offSubmitted()
    offNet()
  })

  /** True cuando el gameover es de una sala multiplayer activa. Multi y SP
   *  comparten el overlay pero los botones difieren: en multi REINTENTAR
   *  pide consenso y mantiene el room; en SP arranca un Arena solo nuevo. */
  const isMulti = (): boolean => snap().sessionId !== null && snap().code !== null

  /** Cuántos clientes activos pidieron restart vs cuántos faltan. Null en SP
   *  o si el server aún no broadcastea votes (antes del primer click). */
  const restartProgress = (): { mine: boolean; mineCount: number; needed: number } | null => {
    const s = snap()
    if (!isMulti() || !s.restartVotes) return null
    const mine = s.sessionId !== null && s.restartVotes.votes.includes(s.sessionId)
    return { mine, mineCount: s.restartVotes.votes.length, needed: s.restartVotes.needed }
  }

  /** Label dinámico del botón principal. En multi mostramos el contador de
   *  votos y bloqueamos doble-click. */
  const retryLabel = (): string => {
    if (!isMulti()) return '⚔ REINTENTAR'
    const p = restartProgress()
    if (!p || p.needed <= 1) return '⚔ REINTENTAR'
    if (p.mine) return `⏳ REINTENTAR (${p.mineCount}/${p.needed})`
    return `⚔ REINTENTAR (${p.mineCount}/${p.needed})`
  }

  const retryDisabled = (): boolean => {
    const p = restartProgress()
    return !!p && p.mine && p.mineCount < p.needed
  }

  const retry = () => {
    if (isMulti()) {
      // En multi pedimos restart al server; el snapshot va a actualizarse con
      // los votes y, cuando todos los activos consenten, phase pasa a 'lobby'.
      // El listener de phase abajo nos saca del overlay automáticamente.
      netClient.requestRestart()
      return
    }
    setVisible(false)
    props.bus.emit('ui:menu:start-run', {})
  }
  const back = () => {
    if (isMulti()) {
      // Salir voluntariamente del room; el peer queda solo (o decidirá leave también).
      void netClient.leave()
    }
    setVisible(false)
    props.bus.emit('ui:menu:return', {})
  }

  return (
    <Show when={visible()}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          'justify-content': 'flex-start',
          padding: '20px',
          gap: '20px',
          'pointer-events': 'auto',
          'z-index': 30,
          'overflow-y': 'auto',
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(255, 0, 0, 0.18) 0%, transparent 60%), linear-gradient(180deg, #1a0808 0%, #000 100%)',
        }}
      >
        {/* DEFEAT title */}
        <div
          style={{
            'font-family': "'Black Ops One', 'Impact', sans-serif",
            'font-size': 'clamp(40px, 11vw, 76px)',
            color: '#ff2a2a',
            'letter-spacing': 'clamp(2px, 0.8vw, 6px)',
            'text-shadow': '0 0 40px #ff0000, 0 0 14px #ff5050, 4px 4px 0 #000',
            animation: 'defeatIn 1.4s ease-out forwards',
          }}
        >
          DERROTA
        </div>

        {/* Stats grid 2×2 (legacy 336-354) */}
        <div
          style={{
            display: 'grid',
            'grid-template-columns': 'repeat(2, 1fr)',
            gap: '10px',
            width: '100%',
            'max-width': '320px',
          }}
        >
          <StatCell value={summary().wave} label="OLEADA" />
          <StatCell value={summary().kills} label="BAJAS" />
          <StatCell value={`+${summary().gold}`} label="ORO" />
          <StatCell value={props.getSave().bestWave} label="MEJOR" />
        </div>

        <SubmissionBadge status={submit().status} rank={submit().rank} />

        <div
          style={{
            display: 'flex',
            'flex-direction': 'column',
            gap: '12px',
            width: '100%',
            'max-width': '320px',
          }}
        >
          <PrimaryButton label={retryLabel()} onClick={retry} disabled={retryDisabled()} />
          <Show when={restartProgress()?.mine && (restartProgress()?.needed ?? 0) > 1}>
            <div
              style={{
                'font-family': "'Russo One', sans-serif",
                'font-size': '12px',
                color: '#aaa',
                'letter-spacing': '2px',
                'text-shadow': '1px 1px 0 #000',
                'text-align': 'center',
              }}
            >
              ESPERANDO AL OTRO ({restartProgress()?.mineCount ?? 0}/
              {restartProgress()?.needed ?? 0})…
            </div>
          </Show>
          <SecondaryButton label={isMulti() ? 'SALIR DE LA SALA' : 'VOLVER'} onClick={back} />
        </div>

        <div style={{ width: '100%', 'max-width': '420px', 'margin-top': '6px' }}>
          <LeaderboardPanel top={10} highlightRank={submit().rank} />
        </div>
      </div>
    </Show>
  )
}

const SubmissionBadge: Component<{ status: SubmitStatus; rank: number | null }> = (props) => {
  return (
    <div
      style={{
        'min-height': '28px',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
      }}
    >
      <Show when={props.status === 'pending'}>
        <BadgeText tone="muted">enviando run…</BadgeText>
      </Show>
      <Show when={props.status === 'accepted' && props.rank !== null}>
        <BadgeText tone="gold">{`🏆 RANK #${props.rank ?? ''} GLOBAL`}</BadgeText>
      </Show>
      <Show when={props.status === 'accepted' && props.rank === null}>
        <BadgeText tone="muted">run aceptada</BadgeText>
      </Show>
      <Show when={props.status === 'queued'}>
        <BadgeText tone="warn">offline · run en cola para reintentar</BadgeText>
      </Show>
      <Show when={props.status === 'failed'}>
        <BadgeText tone="warn">no se pudo enviar — quedó en cola</BadgeText>
      </Show>
      <Show when={props.status === 'no-backend'}>
        <BadgeText tone="muted">leaderboard local · sin backend</BadgeText>
      </Show>
    </div>
  )
}

const BadgeText: Component<{ tone: 'gold' | 'warn' | 'muted'; children: string }> = (props) => {
  const color = props.tone === 'gold' ? '#ffd54a' : props.tone === 'warn' ? '#ff8080' : '#a08080'
  return (
    <div
      style={{
        'font-family': "'Russo One', sans-serif",
        'font-size': '13px',
        'letter-spacing': '2px',
        color,
        'text-shadow': '1px 1px 0 #000',
      }}
    >
      {props.children}
    </div>
  )
}

const StatCell: Component<{ value: string | number; label: string }> = (props) => (
  <div
    style={{
      background: 'linear-gradient(180deg, rgba(255, 42, 42, 0.06), rgba(0, 0, 0, 0.5))',
      border: '2px solid #4a3030',
      'border-radius': '10px',
      padding: '12px 6px',
      'text-align': 'center',
      display: 'flex',
      'flex-direction': 'column',
      gap: '2px',
    }}
  >
    <div
      style={{
        'font-family': "'Russo One', sans-serif",
        'font-size': '24px',
        color: '#ffd54a',
        'letter-spacing': '1px',
        'text-shadow': '1px 1px 0 #000',
      }}
    >
      {props.value}
    </div>
    <div
      style={{
        'font-family': "'Inter', sans-serif",
        'font-weight': 800,
        'font-size': '11px',
        color: '#c0a0a0',
        'letter-spacing': '2px',
        'text-transform': 'uppercase',
      }}
    >
      {props.label}
    </div>
  </div>
)
