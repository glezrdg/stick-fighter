import { type Weapon, weapons } from '@stick/content'
import type { SaveCurrent } from '@stick/shared'
import { type Component, For, Show, createSignal, onCleanup } from 'solid-js'

import { type EventBus } from '../app/eventBus'
import type { SaveStore } from '../core/meta/saveStore'
import { all as allSkills } from '../skills/registry'
import { BuffSystem } from '../systems/BuffSystem'

interface ShopOverlayProps {
  bus: EventBus
  saveStore: SaveStore
  getSave: () => SaveCurrent
  setSave: (next: SaveCurrent) => void
}

type Tab = 'weapons' | 'skills' | 'cosmetics'

/**
 * Shop overlay — paleta del legacy (LEGACY_SPEC §5.2):
 *   - Cards con border `#5a3030`, gradient red 0.05 → black 0.5
 *   - Equipped: border var(--gold), glow dorado
 *   - Owned: border #4caf50, glow verde
 *   - Tabs activas con bg red gradient + glow rojo
 */
export const ShopOverlay: Component<ShopOverlayProps> = (props) => {
  const [open, setOpen] = createSignal(false)
  const [tab, setTab] = createSignal<Tab>('weapons')
  const [, setRev] = createSignal(0)

  const persist = () => {
    setRev((r) => r + 1)
    void props.saveStore.save(props.getSave())
  }

  const offOpen = props.bus.on('ui:shop:open', () => setOpen(true))
  const offClose = props.bus.on('ui:shop:close', () => setOpen(false))
  onCleanup(() => {
    offOpen()
    offClose()
  })

  const close = () => props.bus.emit('ui:shop:close', {})

  const buyOrUpgradeWeapon = (w: Weapon) => {
    const save = props.getSave()
    const owned = save.cosmetics.sword.owned.includes(w.id)
    if (!owned) {
      if (save.gold < w.cost) return
      save.gold -= w.cost
      save.cosmetics.sword.owned.push(w.id)
      save.weaponLevels[w.id] = 1
      persist()
      return
    }
    const level = save.weaponLevels[w.id] ?? 1
    if (level >= 20) return
    const cost = BuffSystem.weaponUpgradeCost(level)
    if (save.gold < cost) return
    save.gold -= cost
    save.weaponLevels[w.id] = level + 1
    persist()
  }

  const equipWeapon = (w: Weapon) => {
    const save = props.getSave()
    if (!save.cosmetics.sword.owned.includes(w.id)) return
    save.cosmetics.sword.equipped = w.id
    persist()
  }

  const buySkill = (id: string, cost: number) => {
    const save = props.getSave()
    if (save.gold < cost) return
    if (save.skills.owned.includes(id)) return
    save.gold -= cost
    save.skills.owned.push(id)
    persist()
  }

  const toggleEquip = (id: string) => {
    const save = props.getSave()
    if (!save.skills.owned.includes(id)) return
    const eq = save.skills.equipped
    const idx = eq.indexOf(id)
    if (idx !== -1) {
      eq.splice(idx, 1)
    } else {
      const skill = allSkills().find((s) => s.id === id)
      if (!skill || skill.kind !== 'active') return
      if (eq.length >= 2) eq.shift()
      eq.push(id)
    }
    props.bus.emit('skills:equipped', {
      slot0: eq[0] ?? null,
      slot1: eq[1] ?? null,
    })
    persist()
  }

  return (
    <Show when={open()}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(255, 42, 42, 0.18) 0%, transparent 60%), linear-gradient(180deg, #1a0f0f 0%, #000 100%)',
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          padding: '20px 12px',
          'pointer-events': 'auto',
          'z-index': 20,
          'font-family': "'Russo One', sans-serif",
          color: '#fff',
        }}
      >
        {/* Header — title + gold + close */}
        <div
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
            width: '100%',
            'max-width': '480px',
            'margin-bottom': '14px',
          }}
        >
          <div
            style={{
              'font-family': "'Black Ops One', 'Impact', sans-serif",
              'font-size': '24px',
              color: '#ffd54a',
              'letter-spacing': '3px',
              'text-shadow': '2px 2px 0 #000, 0 0 12px rgba(255,213,74,0.4)',
            }}
          >
            🛒 TIENDA
          </div>
          <div
            style={{
              'font-family': "'Russo One', sans-serif",
              'font-size': '16px',
              color: '#ffd54a',
              'letter-spacing': '1px',
              'text-shadow': '1px 1px 0 #000',
            }}
          >
            🪙 {props.getSave().gold}
          </div>
          <button
            type="button"
            onClick={close}
            style={{
              background: 'rgba(255, 42, 42, 0.15)',
              border: '2px solid #ff2a2a',
              color: '#ff2a2a',
              width: '32px',
              height: '32px',
              'font-size': '16px',
              'font-weight': 900,
              'border-radius': '50%',
              cursor: 'pointer',
              'box-shadow': '0 0 8px rgba(255, 42, 42, 0.4)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '14px' }}>
          <For each={['weapons', 'skills', 'cosmetics'] as const}>
            {(t) => (
              <button
                type="button"
                onClick={() => setTab(t)}
                style={{
                  background:
                    tab() === t
                      ? 'linear-gradient(180deg, rgba(255, 42, 42, 0.3), rgba(139, 0, 0, 0.4))'
                      : 'linear-gradient(180deg, #2a2a2a, #0a0a0a)',
                  color: tab() === t ? '#fff' : '#aaa',
                  border: tab() === t ? '2px solid #ff2a2a' : '2px solid #444',
                  'border-radius': '8px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  'font-family': "'Russo One', sans-serif",
                  'font-size': '12px',
                  'letter-spacing': '2px',
                  'text-transform': 'uppercase',
                  'box-shadow': tab() === t ? '0 0 14px rgba(255, 42, 42, 0.4)' : 'none',
                  'text-shadow': '1px 1px 0 #000',
                }}
              >
                {t === 'weapons' ? 'ESPADAS' : t === 'skills' ? 'HABILIDADES' : 'AURAS'}
              </button>
            )}
          </For>
        </div>

        {/* Content */}
        <div
          style={{
            width: '100%',
            'max-width': '480px',
            flex: 1,
            'overflow-y': 'auto',
            display: 'flex',
            'flex-direction': 'column',
            gap: '8px',
            'padding-right': '4px',
          }}
        >
          <Show when={tab() === 'weapons'}>
            <For each={weapons}>
              {(w) => {
                const save = () => props.getSave()
                const owned = () => save().cosmetics.sword.owned.includes(w.id)
                const equipped = () => save().cosmetics.sword.equipped === w.id
                const level = () => save().weaponLevels[w.id] ?? 1
                const upgradeCost = () => BuffSystem.weaponUpgradeCost(level())
                const cost = () => (owned() ? upgradeCost() : w.cost)
                const canAfford = () => save().gold >= cost()
                return (
                  <ShopRow
                    icon="⚔️"
                    title={`${w.name}${owned() ? ` Lv.${level()}` : ''}`}
                    desc={`Daño ${w.dmg.toFixed(1)} · Atk ${(w.atkSpeed * 100).toFixed(0)}%`}
                    state={equipped() ? 'equipped' : owned() ? 'owned' : 'locked'}
                  >
                    <button
                      type="button"
                      onClick={() => buyOrUpgradeWeapon(w)}
                      disabled={!canAfford() || (owned() && level() >= 20)}
                      style={shopBtn(canAfford() && !(owned() && level() >= 20))}
                    >
                      {owned() ? `MEJORAR 🪙${cost()}` : `COMPRAR 🪙${cost()}`}
                    </button>
                    <Show when={owned() && !equipped()}>
                      <button
                        type="button"
                        onClick={() => equipWeapon(w)}
                        style={shopBtn(true, true)}
                      >
                        EQUIPAR
                      </button>
                    </Show>
                  </ShopRow>
                )
              }}
            </For>
          </Show>

          <Show when={tab() === 'skills'}>
            <For each={allSkills()}>
              {(s) => {
                const save = () => props.getSave()
                const owned = () => save().skills.owned.includes(s.id)
                const equipped = () => save().skills.equipped.includes(s.id)
                const canAfford = () => save().gold >= s.cost
                return (
                  <ShopRow
                    icon={s.icon ?? '✦'}
                    title={`${s.name}${s.kind === 'passive' ? ' · pasiva' : ''}`}
                    desc={s.desc}
                    state={equipped() ? 'equipped' : owned() ? 'owned' : 'locked'}
                  >
                    <Show
                      when={!owned()}
                      fallback={
                        <Show when={s.kind === 'active'}>
                          <button
                            type="button"
                            onClick={() => toggleEquip(s.id)}
                            style={shopBtn(true, equipped())}
                          >
                            {equipped() ? 'DESEQUIPAR' : 'EQUIPAR'}
                          </button>
                        </Show>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => buySkill(s.id, s.cost)}
                        disabled={!canAfford()}
                        style={shopBtn(canAfford())}
                      >
                        COMPRAR 🪙{s.cost}
                      </button>
                    </Show>
                  </ShopRow>
                )
              }}
            </For>
          </Show>

          <Show when={tab() === 'cosmetics'}>
            <div
              style={{
                'text-align': 'center',
                padding: '40px 20px',
                color: '#aaa',
                'font-size': '13px',
                'font-family': "'Russo One', sans-serif",
                'letter-spacing': '2px',
              }}
            >
              AURAS Y SKINS — PRÓXIMAMENTE
            </div>
          </Show>
        </div>
      </div>
    </Show>
  )
}

const ShopRow: Component<{
  icon: string
  title: string
  desc: string
  state: 'equipped' | 'owned' | 'locked'
  children?: unknown
}> = (props) => {
  const borderColor = () =>
    props.state === 'equipped' ? '#ffd54a' : props.state === 'owned' ? '#4caf50' : '#5a3030'
  const glow = () =>
    props.state === 'equipped'
      ? '0 0 14px rgba(255, 213, 74, 0.5)'
      : props.state === 'owned'
        ? '0 0 8px rgba(76, 175, 80, 0.3)'
        : 'none'

  return (
    <div
      style={{
        display: 'flex',
        'align-items': 'center',
        gap: '12px',
        padding: '12px',
        background: 'linear-gradient(180deg, rgba(255, 42, 42, 0.05), rgba(0, 0, 0, 0.5))',
        border: `2px solid ${borderColor()}`,
        'border-radius': '12px',
        'box-shadow': glow(),
      }}
    >
      <div style={{ 'font-size': '32px' }}>{props.icon}</div>
      <div style={{ flex: 1, 'min-width': 0 }}>
        <div
          style={{
            'font-family': "'Russo One', sans-serif",
            'font-size': '15px',
            color: '#ffd54a',
            'letter-spacing': '1px',
            'text-shadow': '1px 1px 0 #000',
          }}
        >
          {props.title}
        </div>
        <div
          style={{
            'font-family': "'Inter', sans-serif",
            'font-weight': 600,
            'font-size': '12px',
            color: '#d0c0c0',
            'margin-top': '2px',
          }}
        >
          {props.desc}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '6px', 'flex-direction': 'column' }}>
        {props.children as never}
      </div>
    </div>
  )
}

function shopBtn(enabled: boolean, equipped = false): Record<string, string> {
  return {
    background: !enabled
      ? 'linear-gradient(180deg, #2a2a2a, #1a1a1a)'
      : equipped
        ? 'linear-gradient(180deg, #4caf50, #2e7d32)'
        : 'linear-gradient(180deg, #ff3030, #8b0000)',
    color: enabled ? '#fff' : '#666',
    border: equipped ? '2px solid #ffd54a' : enabled ? '2px solid #ffd54a' : '2px solid #555',
    'border-radius': '8px',
    padding: '8px 12px',
    cursor: enabled ? 'pointer' : 'default',
    'font-family': "'Russo One', sans-serif",
    'font-size': '11px',
    'letter-spacing': '2px',
    'white-space': 'nowrap',
    'text-shadow': '1px 1px 0 #000',
    'box-shadow': enabled ? '0 3px 0 rgba(0, 0, 0, 0.6), 0 0 10px rgba(255, 42, 42, 0.3)' : 'none',
  }
}
