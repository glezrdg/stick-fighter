import { type Aura, auras, type Skin, skins, type Weapon, weapons } from '@stick/content'
import type { SaveCurrent } from '@stick/shared'
import { type EventBus, allSkills, BuffSystem } from '@stick/sim'
import { type Component, For, Show, createSignal, onCleanup } from 'solid-js'

import type { SaveStore } from '../core/meta/saveStore'

interface ShopOverlayProps {
  bus: EventBus
  saveStore: SaveStore
  getSave: () => SaveCurrent
  setSave: (next: SaveCurrent) => void
}

type Tab = 'weapons' | 'skills' | 'auras' | 'skins'

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
  const [rev, setRev] = createSignal(0)

  /** Reactive accessor — touches `rev` so Solid re-runs anything that reads
   *  this whenever `persist()` bumps the version. The legacy bug: rev was
   *  set but never read, so save mutations didn't refresh the UI. */
  const save = () => {
    rev()
    return props.getSave()
  }

  const persist = () => {
    void props.saveStore.save(props.getSave())
    setRev((r) => r + 1)
    // Also broadcast on the bus so the menu / HUD reflects the new gold.
    props.bus.emit('gold:changed', { gold: props.getSave().gold, delta: 0 })
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

  const buySkin = (s: Skin) => {
    const save = props.getSave()
    if (save.cosmetics.char.owned.includes(s.id)) return
    if (s.premium) {
      if (save.gems < s.cost) return
      save.gems -= s.cost
    } else {
      if (save.gold < s.cost) return
      save.gold -= s.cost
    }
    save.cosmetics.char.owned.push(s.id)
    persist()
  }

  const equipSkin = (s: Skin) => {
    const save = props.getSave()
    if (!save.cosmetics.char.owned.includes(s.id)) return
    save.cosmetics.char.equipped = s.id
    persist()
  }

  const buyAura = (a: Aura) => {
    const save = props.getSave()
    if (save.cosmetics.aura.owned.includes(a.id)) return
    if (a.premium) {
      if (save.gems < a.cost) return
      save.gems -= a.cost
    } else {
      if (save.gold < a.cost) return
      save.gold -= a.cost
    }
    save.cosmetics.aura.owned.push(a.id)
    persist()
  }

  const equipAura = (a: Aura) => {
    const save = props.getSave()
    if (!save.cosmetics.aura.owned.includes(a.id)) return
    save.cosmetics.aura.equipped = a.id
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
          'z-index': 35,
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
              display: 'flex',
              gap: '14px',
              'font-family': "'Russo One', sans-serif",
              'font-size': '16px',
              'letter-spacing': '1px',
              'text-shadow': '1px 1px 0 #000',
            }}
          >
            <span style={{ color: '#ffd54a' }}>🪙 {save().gold}</span>
            <span style={{ color: '#9c80ff' }}>💎 {save().gems}</span>
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
          <For each={['weapons', 'skins', 'skills', 'auras'] as const}>
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
                {t === 'weapons'
                  ? 'ESPADAS'
                  : t === 'skins'
                    ? 'CUERPO'
                    : t === 'skills'
                      ? 'HABILIDADES'
                      : 'AURAS'}
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
                const save = () => {
                  rev()
                  return props.getSave()
                }
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
                      title={
                        owned() && level() >= 20
                          ? 'Nivel máximo'
                          : !canAfford()
                            ? `Te faltan 🪙${cost() - save().gold}`
                            : ''
                      }
                    >
                      {owned() && level() >= 20
                        ? 'MAX'
                        : !canAfford()
                          ? `🪙-${cost() - save().gold}`
                          : owned()
                            ? `MEJORAR 🪙${cost()}`
                            : `COMPRAR 🪙${cost()}`}
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

          <Show when={tab() === 'skins'}>
            <For each={skins}>
              {(s) => {
                const save = () => {
                  rev()
                  return props.getSave()
                }
                const owned = () => save().cosmetics.char.owned.includes(s.id)
                const equipped = () => save().cosmetics.char.equipped === s.id
                const canAfford = () => (s.premium ? save().gems >= s.cost : save().gold >= s.cost)
                return (
                  <ShopRow
                    icon="🥷"
                    iconBg={s.color}
                    title={s.name + (s.premium ? ' 💎' : '')}
                    desc={`Ropa ${s.clothing} · ${s.accessory}`}
                    state={equipped() ? 'equipped' : owned() ? 'owned' : 'locked'}
                  >
                    <Show
                      when={!owned()}
                      fallback={
                        <Show when={!equipped()}>
                          <button
                            type="button"
                            onClick={() => equipSkin(s)}
                            style={shopBtn(true, true)}
                          >
                            EQUIPAR
                          </button>
                        </Show>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => buySkin(s)}
                        disabled={!canAfford()}
                        style={shopBtn(canAfford())}
                        title={
                          !canAfford()
                            ? `Te faltan ${s.premium ? '💎' : '🪙'}${
                                s.cost - (s.premium ? save().gems : save().gold)
                              }`
                            : ''
                        }
                      >
                        {canAfford()
                          ? `COMPRAR ${s.premium ? '💎' : '🪙'}${s.cost}`
                          : `${s.premium ? '💎' : '🪙'}-${
                              s.cost - (s.premium ? save().gems : save().gold)
                            }`}
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
                const save = () => {
                  rev()
                  return props.getSave()
                }
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
                        title={!canAfford() ? `Te faltan 🪙${s.cost - save().gold}` : ''}
                      >
                        {canAfford() ? `COMPRAR 🪙${s.cost}` : `🪙-${s.cost - save().gold}`}
                      </button>
                    </Show>
                  </ShopRow>
                )
              }}
            </For>
          </Show>

          <Show when={tab() === 'auras'}>
            <For each={auras}>
              {(a) => {
                const save = () => {
                  rev()
                  return props.getSave()
                }
                const owned = () => save().cosmetics.aura.owned.includes(a.id)
                const equipped = () => save().cosmetics.aura.equipped === a.id
                const canAfford = () => (a.premium ? save().gems >= a.cost : save().gold >= a.cost)
                const swatch = a.color === 'rainbow' ? '#ff80ff' : a.color
                return (
                  <ShopRow
                    icon="✦"
                    iconBg={swatch}
                    title={a.name + (a.premium ? ' 💎' : '')}
                    desc={
                      a.color === 'rainbow' ? 'Color cambiante en tiempo real' : `Color ${a.color}`
                    }
                    state={equipped() ? 'equipped' : owned() ? 'owned' : 'locked'}
                  >
                    <Show
                      when={!owned()}
                      fallback={
                        <Show when={!equipped()}>
                          <button
                            type="button"
                            onClick={() => equipAura(a)}
                            style={shopBtn(true, true)}
                          >
                            EQUIPAR
                          </button>
                        </Show>
                      }
                    >
                      <button
                        type="button"
                        onClick={() => buyAura(a)}
                        disabled={!canAfford()}
                        style={shopBtn(canAfford())}
                        title={
                          !canAfford()
                            ? `Te faltan ${a.premium ? '💎' : '🪙'}${
                                a.cost - (a.premium ? save().gems : save().gold)
                              }`
                            : ''
                        }
                      >
                        {canAfford()
                          ? `COMPRAR ${a.premium ? '💎' : '🪙'}${a.cost}`
                          : `${a.premium ? '💎' : '🪙'}-${
                              a.cost - (a.premium ? save().gems : save().gold)
                            }`}
                      </button>
                    </Show>
                  </ShopRow>
                )
              }}
            </For>
          </Show>
        </div>
      </div>
    </Show>
  )
}

const ShopRow: Component<{
  icon: string
  /** Optional CSS color for a glowing disc behind the icon (used for auras). */
  iconBg?: string
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
      <div
        style={{
          width: '40px',
          height: '40px',
          'border-radius': '50%',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          background: props.iconBg
            ? `radial-gradient(circle at 50% 35%, ${props.iconBg} 0%, rgba(0,0,0,0.6) 80%)`
            : 'transparent',
          'box-shadow': props.iconBg
            ? `0 0 14px ${props.iconBg}, inset 0 1px 0 rgba(255,255,255,0.2)`
            : 'none',
          'font-size': '24px',
          'flex-shrink': 0,
        }}
      >
        {props.icon}
      </div>
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
