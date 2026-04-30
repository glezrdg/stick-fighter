import type { LeaderboardEntry } from '@stick/shared'
import { type Component, For, Show, createResource, createSignal } from 'solid-js'

import { ApiClient } from '../platform/api'

interface LeaderboardPanelProps {
  /** How many top entries to fetch. Defaults to 10. */
  top?: number
  /** Optional weapon filter. */
  weapon?: string
  /** Highlight a rank (e.g., the rank just earned this run). */
  highlightRank?: number | null
}

/**
 * Top-N leaderboard pulled from the backend. Refreshes on click of the title.
 * Renders a "BACKEND OFFLINE" badge if `VITE_API_URL` isn't configured or the
 * fetch fails — never blocks the UI.
 */
export const LeaderboardPanel: Component<LeaderboardPanelProps> = (props) => {
  const [refreshKey, setRefreshKey] = createSignal(0)
  const [data] = createResource(
    () => ({ key: refreshKey(), top: props.top ?? 10, weapon: props.weapon }),
    async (args) => {
      if (!ApiClient.isConfigured()) return null
      const opts: Parameters<typeof ApiClient.fetchLeaderboard>[0] = { top: args.top }
      if (args.weapon !== undefined) opts.weapon = args.weapon
      return ApiClient.fetchLeaderboard(opts)
    },
  )

  return (
    <div
      style={{
        width: '100%',
        background: 'linear-gradient(180deg, rgba(255, 42, 42, 0.05), rgba(0, 0, 0, 0.55))',
        border: '2px solid #4a3030',
        'border-radius': '10px',
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          'margin-bottom': '8px',
        }}
      >
        <div
          style={{
            'font-family': "'Russo One', sans-serif",
            'font-size': '14px',
            color: '#ffd54a',
            'letter-spacing': '2px',
            'text-shadow': '1px 1px 0 #000',
          }}
        >
          🏆 LEADERBOARD
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          style={{
            'font-family': "'Inter', sans-serif",
            'font-size': '10px',
            'font-weight': 700,
            'letter-spacing': '1px',
            color: '#c0a0a0',
            background: 'transparent',
            border: '1px solid #4a3030',
            'border-radius': '6px',
            padding: '3px 8px',
            cursor: 'pointer',
          }}
        >
          ↻
        </button>
      </div>

      <Show when={!ApiClient.isConfigured()}>
        <PanelMessage tone="warn">BACKEND OFFLINE</PanelMessage>
      </Show>
      <Show when={ApiClient.isConfigured() && data.loading}>
        <PanelMessage tone="info">cargando…</PanelMessage>
      </Show>
      <Show when={ApiClient.isConfigured() && !data.loading && !data()}>
        <PanelMessage tone="warn">NO PUDIMOS CONECTAR</PanelMessage>
      </Show>

      <Show when={data() && (data() as { entries: LeaderboardEntry[] }).entries.length === 0}>
        <PanelMessage tone="info">aún no hay runs</PanelMessage>
      </Show>

      <Show when={data() && (data() as { entries: LeaderboardEntry[] }).entries.length > 0}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px' }}>
          <For each={(data() as { entries: LeaderboardEntry[] }).entries}>
            {(entry) => <Row entry={entry} highlight={entry.rank === props.highlightRank} />}
          </For>
        </div>
      </Show>
    </div>
  )
}

const Row: Component<{ entry: LeaderboardEntry; highlight: boolean }> = (props) => (
  <div
    style={{
      display: 'grid',
      'grid-template-columns': '32px 1fr auto',
      'align-items': 'center',
      gap: '8px',
      padding: '4px 6px',
      'border-radius': '6px',
      background: props.highlight ? 'rgba(255, 213, 74, 0.18)' : 'transparent',
      border: props.highlight ? '1px solid #ffd54a' : '1px solid transparent',
    }}
  >
    <div
      style={{
        'font-family': "'Russo One', sans-serif",
        'font-size': '13px',
        color: rankColor(props.entry.rank),
        'text-align': 'center',
        'text-shadow': '1px 1px 0 #000',
      }}
    >
      #{props.entry.rank}
    </div>
    <div
      style={{
        'font-family': "'Inter', sans-serif",
        'font-size': '12px',
        'font-weight': 700,
        color: '#fff',
        'white-space': 'nowrap',
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        'text-shadow': '1px 1px 0 #000',
      }}
    >
      {props.entry.name}
    </div>
    <div
      style={{
        'font-family': "'Russo One', sans-serif",
        'font-size': '12px',
        color: '#ffd54a',
        'letter-spacing': '1px',
      }}
    >
      ola {props.entry.wave}
    </div>
  </div>
)

const PanelMessage: Component<{ tone: 'warn' | 'info'; children: string }> = (props) => (
  <div
    style={{
      'font-family': "'Inter', sans-serif",
      'font-size': '11px',
      'font-weight': 700,
      'letter-spacing': '1.5px',
      color: props.tone === 'warn' ? '#ff8080' : '#888',
      'text-align': 'center',
      padding: '6px 0',
    }}
  >
    {props.children}
  </div>
)

function rankColor(rank: number): string {
  if (rank === 1) return '#ffd54a'
  if (rank === 2) return '#cfd8dc'
  if (rank === 3) return '#cd7f32'
  return '#c0a0a0'
}
