import { type EventBus, tryGetSkill as getSkill } from '@stick/sim'
import { type Component, For, Show, createEffect, createSignal, onCleanup } from 'solid-js'

interface HudRootProps {
  bus: EventBus
  initialHp: number
  initialMaxHp: number
}

interface SkillSlotState {
  skillId: string | null
  cooldownRemaining: number
  cooldownTotal: number
}

const emptySlot = (): SkillSlotState => ({
  skillId: null,
  cooldownRemaining: 0,
  cooldownTotal: 1,
})

/**
 * HUD overlay — paleta y tipografías matchean LEGACY_SPEC.md secciones 1-3:
 *   - Russo One para HUD numérico, Black Ops One para banner de oleada
 *   - Rojo `#ff2a2a` (HP, oleada), dorado `#ffd54a` (oro, combo label)
 *   - Glows red/gold sobre los bordes de barras y slots
 */
export const HudRoot: Component<HudRootProps> = (props) => {
  const [hp, setHp] = createSignal(props.initialHp)
  const [maxHp, setMaxHp] = createSignal(props.initialMaxHp)
  const [gold, setGold] = createSignal(0)
  const [wave, setWave] = createSignal(0)
  const [waveTotal, setWaveTotal] = createSignal(0)
  const [waveAlive, setWaveAlive] = createSignal(0)
  const [combo, setCombo] = createSignal(0)
  const [maxCombo, setMaxCombo] = createSignal(0)
  const [waveBanner, setWaveBanner] = createSignal<{ wave: number; key: number } | null>(null)
  const [slots, setSlots] = createSignal<[SkillSlotState, SkillSlotState]>([
    emptySlot(),
    emptySlot(),
  ])
  // Effective stats panel — populated by `stats:changed` from the scene.
  const [dmgMul, setDmgMul] = createSignal(1)
  const [atkSpeedMul, setAtkSpeedMul] = createSignal(1)
  const [critChance, setCritChance] = createSignal(0.05)
  const [regenPerSec, setRegenPerSec] = createSignal(0)
  const [knockbackMul, setKnockbackMul] = createSignal(1)
  const [goldMul, setGoldMul] = createSignal(1)
  // Mid-run modal abierto (wave-buff cards). El HUD se atenúa para no
  // pelear con el overlay rojo del modal — match con el feel de SP.
  const [modalOpen, setModalOpen] = createSignal(false)

  const updateSlot = (slot: 0 | 1, patch: Partial<SkillSlotState>) => {
    setSlots((cur) => {
      const next: [SkillSlotState, SkillSlotState] = [{ ...cur[0] }, { ...cur[1] }]
      Object.assign(next[slot], patch)
      return next
    })
  }

  const offHp = props.bus.on('player:hp:changed', ({ hp, maxHp }) => {
    setHp(hp)
    setMaxHp(maxHp)
  })
  const offGold = props.bus.on('gold:changed', ({ gold }) => setGold(gold))
  const offWave = props.bus.on('wave:start', ({ wave, totalEnemies }) => {
    setWave(wave)
    setWaveTotal(totalEnemies)
    setWaveAlive(totalEnemies)
    setWaveBanner({ wave, key: Date.now() })
  })
  const offWaveEnemies = props.bus.on('wave:enemies:changed', ({ alive, total }) => {
    setWaveAlive(alive)
    setWaveTotal(total)
  })
  const offEquipped = props.bus.on('skills:equipped', ({ slot0, slot1 }) => {
    setSlots([
      { skillId: slot0, cooldownRemaining: 0, cooldownTotal: 1 },
      { skillId: slot1, cooldownRemaining: 0, cooldownTotal: 1 },
    ])
  })
  const offCd = props.bus.on('skill:cooldown:changed', ({ slot, remaining, total }) => {
    updateSlot(slot, { cooldownRemaining: remaining, cooldownTotal: total })
  })
  const offCombo = props.bus.on('combo:advance', ({ count }) => {
    setCombo(count)
    if (count > maxCombo()) setMaxCombo(count)
  })
  const offComboReset = props.bus.on('combo:reset', () => setCombo(0))
  const offRunStart = props.bus.on('run:start', () => {
    setCombo(0)
    setMaxCombo(0)
  })
  const offStats = props.bus.on(
    'stats:changed',
    ({ dmgMul, atkSpeedMul, critChance, regenPerSec, knockbackMul, goldMul }) => {
      setDmgMul(dmgMul)
      setAtkSpeedMul(atkSpeedMul)
      setCritChance(critChance)
      setRegenPerSec(regenPerSec)
      setKnockbackMul(knockbackMul)
      setGoldMul(goldMul)
    },
  )
  const offBuffOpen = props.bus.on('wave:buff:offer', () => setModalOpen(true))
  const offBuffResume = props.bus.on('wave:resume', () => setModalOpen(false))

  // Auto-hide wave banner after the bannerIn animation finishes.
  createEffect(() => {
    const b = waveBanner()
    if (!b) return
    const id = setTimeout(() => setWaveBanner(null), 1900)
    onCleanup(() => clearTimeout(id))
  })

  onCleanup(() => {
    offHp()
    offGold()
    offWave()
    offWaveEnemies()
    offEquipped()
    offCd()
    offCombo()
    offComboReset()
    offStats()
    offRunStart()
    offBuffOpen()
    offBuffResume()
  })

  const hpPct = () => Math.max(0, Math.min(1, hp() / Math.max(1, maxHp())))

  return (
    <div
      style={{
        // Atenuamos TODO el HUD cuando hay un modal mid-run (wave-buff cards
        // sobre todo). Sin esto, los chips de stats y la HP bar se cuelan
        // por encima del overlay rojo y queda visualmente sucio.
        opacity: modalOpen() ? 0.18 : 1,
        transition: 'opacity 0.18s ease-out',
        // No reposicionamos: los children tienen `position: absolute` con
        // anchors al overlay padre — wrapper sin position no rompe el layout.
      }}
    >
      {/* ---- Top stack: HP bar + wave/gold info ---- */}
      <div
        style={{
          position: 'absolute',
          top: 'calc(14px + var(--safe-top, 0px))',
          left: 'calc(14px + var(--safe-left, 0px))',
          right: 'calc(14px + var(--safe-right, 0px))',
          display: 'flex',
          'flex-direction': 'column',
          gap: '6px',
        }}
      >
        {/* HP bar */}
        <div
          style={{
            position: 'relative',
            height: '18px',
            background: 'rgba(0, 0, 0, 0.65)',
            border: '2px solid #ff2a2a',
            'border-radius': '6px',
            overflow: 'hidden',
            'box-shadow': '0 0 10px rgba(255, 42, 42, 0.4), 0 2px 6px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div
            style={{
              width: `${hpPct() * 100}%`,
              height: '100%',
              background: 'linear-gradient(180deg, #ff5050 0%, #c41a1a 60%, #8b0000 100%)',
              transition: 'width 0.18s ease-out',
            }}
          />
          <span
            class="hp-text"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'font-family': "'Russo One', sans-serif",
              'font-size': '12px',
              'letter-spacing': '1px',
              color: '#fff',
              'text-shadow': '1px 1px 0 #000, 0 0 4px #000',
            }}
          >
            {hp()} / {maxHp()}
          </span>
        </div>
        {/* Wave / enemies / gold row */}
        <div
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
            'font-family': "'Russo One', sans-serif",
            'font-size': '13px',
            'letter-spacing': '1px',
            'text-shadow': '1px 1px 0 #000, 0 0 4px #000',
          }}
        >
          <span style={{ color: '#ff2a2a' }}>OLEADA {wave()}</span>
          <Show when={waveTotal() > 0}>
            <span style={{ color: '#fff', opacity: 0.9 }}>
              {waveAlive()} / {waveTotal()}
            </span>
          </Show>
          <span style={{ color: '#ffd54a' }}>🪙 {gold()}</span>
        </div>

        {/* Stats chips (legacy LEGACY_SPEC §3.1 stats-panel) */}
        <div
          style={{
            display: 'flex',
            'flex-wrap': 'wrap',
            gap: '6px',
            'justify-content': 'center',
            'margin-top': '4px',
          }}
        >
          <StatChip label="HP" value={`${maxHp()}`} color="#ff5050" icon="❤" />
          <StatChip label="DMG" value={`×${dmgMul().toFixed(2)}`} color="#ffd54a" icon="✕" />
          <StatChip label="VEL" value={`×${atkSpeedMul().toFixed(2)}`} color="#7be0c4" icon="⚡" />
          <StatChip
            label="CRT"
            value={`${Math.round(critChance() * 100)}%`}
            color="#ff80ff"
            icon="◆"
          />
          <StatChip label="REG" value={`+${regenPerSec().toFixed(1)}/s`} color="#80e0ff" icon="✦" />
          <StatChip label="KB" value={`×${knockbackMul().toFixed(2)}`} color="#d0a0a0" icon="✺" />
          <StatChip label="ORO" value={`×${goldMul().toFixed(2)}`} color="#ffd54a" icon="🪙" />
        </div>
      </div>

      {/* ---- Wave banner (legacy 256-273) ---- */}
      <Show when={waveBanner()}>
        {(b) => (
          <div
            style={{
              position: 'absolute',
              top: '38%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              'font-family': "'Black Ops One', 'Impact', sans-serif",
              'font-size': 'clamp(28px, 9vw, 44px)',
              'letter-spacing': 'clamp(3px, 1.5vw, 6px)',
              'background-image': 'linear-gradient(180deg, #ffd54a 0%, #ffffff 50%, #ff2a2a 100%)',
              '-webkit-background-clip': 'text',
              'background-clip': 'text',
              color: 'transparent',
              'pointer-events': 'none',
              'text-shadow': 'none',
              filter: 'drop-shadow(2px 2px 0 #000) drop-shadow(0 0 12px rgba(255,42,42,0.6))',
              animation: 'bannerIn 1.8s ease-out forwards',
            }}
            data-key={b().key}
          >
            ¡OLEADA {b().wave}!
          </div>
        )}
      </Show>

      {/* ---- Combo counter — top-right (legacy combo box 114-143) ---- */}
      <Show when={combo() >= 2}>
        <div
          style={{
            position: 'absolute',
            top: 'clamp(72px, 14%, 22%)',
            right: 'calc(14px + var(--safe-right, 0px))',
            'text-align': 'right',
            'pointer-events': 'none',
          }}
        >
          <div
            style={{
              'font-family': "'Black Ops One', 'Impact', sans-serif",
              'font-size': `${36 + Math.min(28, combo() * 2)}px`,
              'line-height': 1,
              color: combo() >= 10 ? '#ff2a2a' : '#ff5050',
              'letter-spacing': '-1px',
              'text-shadow': '3px 3px 0 #000, 0 0 12px rgba(255, 42, 42, 0.7), 0 0 4px #000',
              transition: 'font-size 0.1s ease-out',
            }}
          >
            {combo()}
          </div>
          <div
            style={{
              'font-family': "'Russo One', sans-serif",
              'font-size': 'clamp(11px, 3vw, 14px)',
              color: '#ffd54a',
              'letter-spacing': '4px',
              'text-shadow': '2px 2px 0 #000',
              'margin-top': '2px',
            }}
          >
            HITS
          </div>
        </div>
      </Show>

      {/* Max combo chip — only shown when 5+ achieved */}
      <Show when={maxCombo() >= 5}>
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: 'calc(14px + var(--safe-left, 0px))',
            'font-family': "'Russo One', sans-serif",
            'font-size': '11px',
            color: '#ffd54a',
            'letter-spacing': '2px',
            'text-shadow': '1px 1px 0 #000, 0 0 4px #000',
            'pointer-events': 'none',
            opacity: 0.9,
          }}
        >
          MAX {maxCombo()}×
        </div>
      </Show>

      {/* ---- Skill slots — bottom right ---- */}
      <div
        style={{
          position: 'absolute',
          bottom: 'calc(14px + var(--safe-bottom, 0px))',
          right: 'calc(14px + var(--safe-right, 0px))',
          display: 'flex',
          gap: '8px',
        }}
      >
        <For each={slots()}>{(slot, i) => <SkillSlot slot={slot} index={i() as 0 | 1} />}</For>
      </div>
    </div>
  )
}

const StatChip: Component<{ label: string; value: string; color: string; icon: string }> = (
  props,
) => (
  <div
    style={{
      display: 'flex',
      'align-items': 'center',
      gap: '6px',
      padding: '5px 11px',
      background: 'linear-gradient(180deg, rgba(255,42,42,0.10), rgba(0,0,0,0.65))',
      border: `2px solid ${props.color}`,
      'border-radius': '999px',
      'font-family': "'Russo One', sans-serif",
      color: '#fff',
      'letter-spacing': '0.5px',
      'text-shadow': '1px 1px 0 #000',
      'pointer-events': 'none',
      'white-space': 'nowrap',
      'box-shadow': `0 0 8px ${props.color}40, 0 2px 4px rgba(0,0,0,0.5)`,
    }}
  >
    <span style={{ color: props.color, 'font-size': '13px' }}>{props.icon}</span>
    <span
      style={{
        color: props.color,
        'font-weight': 700,
        'font-size': '12px',
        'letter-spacing': '1px',
      }}
    >
      {props.label}
    </span>
    <span style={{ 'font-size': '13px', 'font-weight': 700 }}>{props.value}</span>
  </div>
)

const SkillSlot: Component<{ slot: SkillSlotState; index: 0 | 1 }> = (props) => {
  const skill = () => (props.slot.skillId ? getSkill(props.slot.skillId) : undefined)
  const cdPct = () => {
    const t = props.slot.cooldownTotal
    if (t <= 0) return 0
    return Math.max(0, Math.min(1, props.slot.cooldownRemaining / t))
  }
  const ready = () => props.slot.cooldownRemaining <= 0

  return (
    <div
      style={{
        position: 'relative',
        width: '56px',
        height: '56px',
        background: ready()
          ? 'radial-gradient(circle at 50% 35%, #555 0%, #222 100%)'
          : 'radial-gradient(circle at 50% 35%, #2a2a2a 0%, #111 100%)',
        border: `3px solid ${ready() ? '#ffd54a' : '#888'}`,
        'border-radius': '50%',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'box-shadow': ready()
          ? '0 0 16px rgba(255, 213, 74, 0.8), inset 0 1px 0 rgba(255,255,255,0.15)'
          : '0 2px 6px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
        overflow: 'hidden',
        transition: 'box-shadow 0.15s ease-out',
      }}
    >
      <Show
        when={skill()}
        fallback={
          <span
            style={{
              'font-family': "'Russo One', sans-serif",
              color: '#888',
              'font-size': '18px',
              'letter-spacing': '1px',
            }}
          >
            {props.index === 0 ? 'Q' : 'E'}
          </span>
        }
      >
        <span style={{ 'font-size': '28px' }}>{skill()!.icon ?? '?'}</span>
      </Show>
      {/* Cooldown wipe (top-down) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: `${cdPct() * 100}%`,
          background: 'rgba(0, 0, 0, 0.7)',
          'pointer-events': 'none',
        }}
      />
      <Show when={!ready()}>
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'font-family': "'Russo One', sans-serif",
            color: '#fff',
            'font-size': '14px',
            'text-shadow': '1px 1px 0 #000',
            'pointer-events': 'none',
          }}
        >
          {props.slot.cooldownRemaining.toFixed(1)}
        </span>
      </Show>
      {/* Slot key label */}
      <span
        style={{
          position: 'absolute',
          bottom: '2px',
          right: '6px',
          'font-family': "'Russo One', sans-serif",
          color: '#ffd54a',
          'font-size': '9px',
          'letter-spacing': '1px',
          'text-shadow': '1px 1px 0 #000',
          opacity: 0.85,
          'pointer-events': 'none',
        }}
      >
        {props.index === 0 ? 'Q' : 'E'}
      </span>
    </div>
  )
}
