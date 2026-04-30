import { type Component, For, Show, createSignal, onCleanup } from 'solid-js'

import { type EventBus } from '../app/eventBus'
import { tryGet as getSkill } from '../skills/registry'

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
 * HUD overlay rendered on top of the Phaser canvas. Subscribes to the typed
 * event bus — never reads from game systems directly.
 */
export const HudRoot: Component<HudRootProps> = (props) => {
  const [hp, setHp] = createSignal(props.initialHp)
  const [maxHp, setMaxHp] = createSignal(props.initialMaxHp)
  const [gold, setGold] = createSignal(0)
  const [wave, setWave] = createSignal(0)
  const [waveTotal, setWaveTotal] = createSignal(0)
  const [waveAlive, setWaveAlive] = createSignal(0)
  const [slots, setSlots] = createSignal<[SkillSlotState, SkillSlotState]>([
    emptySlot(),
    emptySlot(),
  ])

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

  onCleanup(() => {
    offHp()
    offGold()
    offWave()
    offWaveEnemies()
    offEquipped()
    offCd()
  })

  const hpPct = () => Math.max(0, Math.min(1, hp() / Math.max(1, maxHp())))

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          right: '12px',
          display: 'flex',
          'flex-direction': 'column',
          gap: '6px',
          'font-family': 'Inter, system-ui, sans-serif',
          'font-size': '12px',
          color: '#fff',
          'text-shadow': '1px 1px 0 #000',
        }}
      >
        <div
          style={{
            position: 'relative',
            height: '14px',
            background: 'rgba(0,0,0,0.7)',
            border: '1.5px solid #ff2a2a',
            'border-radius': '4px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${hpPct() * 100}%`,
              height: '100%',
              background: 'linear-gradient(180deg, #ff5050 0%, #c41a1a 100%)',
              transition: 'width 0.18s ease-out',
            }}
          />
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'font-size': '10px',
              'font-weight': 700,
              'letter-spacing': '0.5px',
            }}
          >
            {hp()} / {maxHp()}
          </span>
        </div>
        <div style={{ display: 'flex', 'justify-content': 'space-between' }}>
          <span style={{ color: '#ff2a2a', 'font-weight': 700 }}>
            WAVE {wave()}
            <Show when={waveTotal() > 0}>
              <span style={{ color: '#9aa0a6', 'font-weight': 600 }}>
                {' '}
                · {waveAlive()}/{waveTotal()}
              </span>
            </Show>
          </span>
          <span style={{ color: '#ffd54a', 'font-weight': 700 }}>GOLD {gold()}</span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '14px',
          right: '14px',
          display: 'flex',
          gap: '8px',
        }}
      >
        <For each={slots()}>{(slot, i) => <SkillSlot slot={slot} index={i() as 0 | 1} />}</For>
      </div>
    </>
  )
}

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
        width: '54px',
        height: '54px',
        background: 'rgba(0,0,0,0.7)',
        border: `2px solid ${ready() ? '#ffd54a' : '#404850'}`,
        'border-radius': '8px',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'font-family': 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      <Show
        when={skill()}
        fallback={
          <span style={{ color: '#404850', 'font-size': '20px', 'font-weight': 700 }}>
            {props.index === 0 ? 'Q' : 'E'}
          </span>
        }
      >
        <span style={{ 'font-size': '26px' }}>{skill()!.icon ?? '?'}</span>
      </Show>
      {/* Cooldown wipe (top-down). */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: `${cdPct() * 100}%`,
          background: 'rgba(0, 0, 0, 0.65)',
          'pointer-events': 'none',
        }}
      />
      <span
        style={{
          position: 'absolute',
          bottom: '2px',
          right: '4px',
          color: '#fff',
          'font-size': '9px',
          'text-shadow': '1px 1px 0 #000',
          opacity: 0.7,
        }}
      >
        {props.index === 0 ? 'Q' : 'E'}
      </span>
    </div>
  )
}
