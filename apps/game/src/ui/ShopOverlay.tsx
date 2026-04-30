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
 * Shop overlay. Opens via `ui:shop:open`, closes via `ui:shop:close` or its
 * own close button. Persists changes through the SaveStore on every action.
 */
export const ShopOverlay: Component<ShopOverlayProps> = (props) => {
  const [open, setOpen] = createSignal(false)
  const [tab, setTab] = createSignal<Tab>('weapons')
  const [, setRev] = createSignal(0) // bump to re-render after a mutation

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

  const close = () => {
    props.bus.emit('ui:shop:close', {})
  }

  const buyOrUpgradeWeapon = (w: Weapon) => {
    const save = props.getSave()
    const owned = save.cosmetics.sword.owned.includes(w.id)
    if (!owned) {
      // First buy → unlock at level 1.
      if (save.gold < w.cost) return
      save.gold -= w.cost
      save.cosmetics.sword.owned.push(w.id)
      save.weaponLevels[w.id] = 1
      persist()
      return
    }
    // Already owned → level up.
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
      // Only active skills get an equipped slot. Cap at 2.
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
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          padding: '20px 12px',
          'pointer-events': 'auto',
          'z-index': 20,
          'font-family': 'Inter, system-ui, sans-serif',
          color: '#fff',
        }}
      >
        <div
          style={{
            display: 'flex',
            'justify-content': 'space-between',
            'align-items': 'center',
            width: '100%',
            'max-width': '480px',
            'margin-bottom': '12px',
          }}
        >
          <div style={{ 'font-size': '24px', 'font-weight': 800, color: '#ffd54a' }}>🛒 TIENDA</div>
          <div style={{ 'font-size': '14px', color: '#ffd54a' }}>🪙 {props.getSave().gold}</div>
          <button
            type="button"
            onClick={close}
            style={{
              background: 'transparent',
              color: '#fff',
              border: '1px solid #404850',
              'border-radius': '4px',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px', 'margin-bottom': '12px' }}>
          <For each={['weapons', 'skills', 'cosmetics'] as const}>
            {(t) => (
              <button
                type="button"
                onClick={() => setTab(t)}
                style={{
                  background: tab() === t ? '#ffd54a' : 'rgba(0,0,0,0.5)',
                  color: tab() === t ? '#000' : '#fff',
                  border: '1px solid #404850',
                  'border-radius': '4px',
                  padding: '6px 14px',
                  cursor: 'pointer',
                  'font-size': '12px',
                  'font-weight': 700,
                  'letter-spacing': '1px',
                  'text-transform': 'uppercase',
                }}
              >
                {t}
              </button>
            )}
          </For>
        </div>

        <div
          style={{
            width: '100%',
            'max-width': '480px',
            flex: 1,
            'overflow-y': 'auto',
            display: 'flex',
            'flex-direction': 'column',
            gap: '8px',
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
                    desc={`Daño base ${w.dmg.toFixed(1)} · Atk ${(w.atkSpeed * 100).toFixed(0)}%`}
                    primary={
                      <button
                        type="button"
                        onClick={() => buyOrUpgradeWeapon(w)}
                        disabled={!canAfford() || (owned() && level() >= 20)}
                        style={shopBtn(canAfford() && !(owned() && level() >= 20))}
                      >
                        {owned() ? `Mejorar 🪙${cost()}` : `Comprar 🪙${cost()}`}
                      </button>
                    }
                    secondary={
                      <Show when={owned()}>
                        <button
                          type="button"
                          onClick={() => equipWeapon(w)}
                          disabled={equipped()}
                          style={shopBtn(!equipped(), true)}
                        >
                          {equipped() ? 'Equipada' : 'Equipar'}
                        </button>
                      </Show>
                    }
                  />
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
                    title={`${s.name} ${s.kind === 'passive' ? '· pasiva' : ''}`}
                    desc={s.desc}
                    primary={
                      <Show
                        when={!owned()}
                        fallback={
                          <Show when={s.kind === 'active'}>
                            <button
                              type="button"
                              onClick={() => toggleEquip(s.id)}
                              style={shopBtn(true, equipped())}
                            >
                              {equipped() ? 'Desequipar' : 'Equipar'}
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
                          Comprar 🪙{s.cost}
                        </button>
                      </Show>
                    }
                  />
                )
              }}
            </For>
          </Show>

          <Show when={tab() === 'cosmetics'}>
            <div style={{ opacity: 0.6, 'text-align': 'center', padding: '20px' }}>
              Skins / auras próximamente — F2.5.
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
  primary: unknown
  secondary?: unknown
}> = (props) => (
  <div
    style={{
      display: 'flex',
      'align-items': 'center',
      gap: '10px',
      padding: '10px',
      background: 'rgba(20, 24, 30, 0.95)',
      border: '1px solid #404850',
      'border-radius': '6px',
    }}
  >
    <div style={{ 'font-size': '28px' }}>{props.icon}</div>
    <div style={{ flex: 1, 'min-width': 0 }}>
      <div style={{ 'font-weight': 700, 'font-size': '13px' }}>{props.title}</div>
      <div style={{ 'font-size': '11px', opacity: 0.75 }}>{props.desc}</div>
    </div>
    <div style={{ display: 'flex', gap: '6px', 'flex-direction': 'column' }}>
      {props.primary as never}
      {props.secondary as never}
    </div>
  </div>
)

function shopBtn(enabled: boolean, equipped = false): Record<string, string | number> {
  return {
    background: !enabled ? '#2a2f35' : equipped ? '#7be0c4' : '#ffd54a',
    color: enabled ? '#000' : '#666',
    border: 'none',
    'border-radius': '4px',
    padding: '6px 12px',
    cursor: enabled ? 'pointer' : 'default',
    'font-size': '11px',
    'font-weight': '700',
    'white-space': 'nowrap',
  }
}
