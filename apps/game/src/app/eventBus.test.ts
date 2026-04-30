import { describe, expect, it, vi } from 'vitest'

import { createEventBus } from './eventBus'

describe('eventBus', () => {
  it('delivers a payload to a subscriber', () => {
    const bus = createEventBus()
    const handler = vi.fn()
    bus.on('gold:changed', handler)
    bus.emit('gold:changed', { gold: 50, delta: 10 })
    expect(handler).toHaveBeenCalledWith({ gold: 50, delta: 10 })
  })

  it('supports multiple subscribers for the same event', () => {
    const bus = createEventBus()
    const a = vi.fn()
    const b = vi.fn()
    bus.on('player:hurt', a)
    bus.on('player:hurt', b)
    bus.emit('player:hurt', { dmg: 5, remainingHp: 95, src: 'melee' })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('returns an unsubscribe function', () => {
    const bus = createEventBus()
    const handler = vi.fn()
    const off = bus.on('combo:reset', handler)
    bus.emit('combo:reset', {})
    off()
    bus.emit('combo:reset', {})
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('off() removes the specific handler', () => {
    const bus = createEventBus()
    const a = vi.fn()
    const b = vi.fn()
    bus.on('combo:advance', a)
    bus.on('combo:advance', b)
    bus.off('combo:advance', a)
    bus.emit('combo:advance', { count: 3 })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('does nothing when emitting to an event with no subscribers', () => {
    const bus = createEventBus()
    expect(() => bus.emit('wave:start', { wave: 1, totalEnemies: 5 })).not.toThrow()
  })

  it('catches handler errors so one bad handler does not break the rest', () => {
    const bus = createEventBus()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    bus.on('enemy:death', bad)
    bus.on('enemy:death', good)
    bus.emit('enemy:death', { enemyId: 'e1', byPlayer: true })
    expect(bad).toHaveBeenCalled()
    expect(good).toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('lets a handler unsubscribe itself during emit without breaking iteration', () => {
    const bus = createEventBus()
    const a = vi.fn(() => {
      off()
    })
    const b = vi.fn()
    const off = bus.on('combo:reset', a)
    bus.on('combo:reset', b)
    bus.emit('combo:reset', {})
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    bus.emit('combo:reset', {})
    expect(a).toHaveBeenCalledTimes(1) // unsubscribed itself
    expect(b).toHaveBeenCalledTimes(2)
  })

  it('clear() removes every subscriber', () => {
    const bus = createEventBus()
    const a = vi.fn()
    bus.on('gold:changed', a)
    bus.clear()
    bus.emit('gold:changed', { gold: 0, delta: 0 })
    expect(a).not.toHaveBeenCalled()
  })
})
