import { createEventBus, type EventBus } from '@stick/sim'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InputController, JOYSTICK_MAX_RADIUS } from './InputController'

// ---- Tiny DOM mock ---------------------------------------------------
//
// We don't pull in jsdom for this — we only need a canvas with
// add/removeEventListener and getBoundingClientRect. Keeping it manual
// keeps the test environment "node" (faster) and avoids hidden surprises.

class MockCanvas {
  private listeners = new Map<string, Set<EventListener>>()
  rect = { left: 0, top: 0, width: 540, height: 960 }

  addEventListener(type: string, fn: EventListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }
  removeEventListener(type: string, fn: EventListener) {
    this.listeners.get(type)?.delete(fn)
  }
  getBoundingClientRect() {
    return this.rect
  }
  hasListener(type: string): boolean {
    return (this.listeners.get(type)?.size ?? 0) > 0
  }
  fire(type: string, event: object) {
    for (const fn of this.listeners.get(type) ?? []) fn(event as Event)
  }
}

class MockWindowEvents {
  private listeners = new Map<string, Set<EventListener>>()
  addEventListener(type: string, fn: EventListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }
  removeEventListener(type: string, fn: EventListener) {
    this.listeners.get(type)?.delete(fn)
  }
  fire(type: string, event: object) {
    for (const fn of this.listeners.get(type) ?? []) fn(event as Event)
  }
}

describe('InputController', () => {
  let canvas: MockCanvas
  let bus: EventBus
  let controller: InputController
  let mockWindow: MockWindowEvents
  let originalAdd: typeof window.addEventListener
  let originalRemove: typeof window.removeEventListener

  beforeEach(() => {
    canvas = new MockCanvas()
    bus = createEventBus()
    mockWindow = new MockWindowEvents()

    // Hijack window listeners onto our mock so blur/keydown/keyup fire predictably.
    originalAdd = window.addEventListener
    originalRemove = window.removeEventListener
    window.addEventListener = mockWindow.addEventListener.bind(mockWindow) as never
    window.removeEventListener = mockWindow.removeEventListener.bind(mockWindow) as never

    controller = new InputController({
      canvas: canvas as unknown as HTMLCanvasElement,
      bus,
    })
  })

  afterEach(() => {
    controller.destroy()
    window.addEventListener = originalAdd
    window.removeEventListener = originalRemove
  })

  // ---- Keyboard ----------------------------------------------------

  it('reports W/A/S/D as a normalized move vector', () => {
    mockWindow.fire('keydown', { code: 'KeyD', repeat: false, preventDefault: () => {} })
    expect(controller.getMoveVector()).toEqual({ x: 1, y: 0 })

    mockWindow.fire('keydown', { code: 'KeyW', repeat: false, preventDefault: () => {} })
    const v = controller.getMoveVector()
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 5) // 1/√2
    expect(v.y).toBeCloseTo(-Math.SQRT1_2, 5)
  })

  it('arrow keys mirror WASD', () => {
    mockWindow.fire('keydown', { code: 'ArrowLeft', repeat: false, preventDefault: () => {} })
    expect(controller.getMoveVector()).toEqual({ x: -1, y: 0 })
  })

  it('emits input:attack on Space (one shot per press, ignores repeat)', () => {
    const attackHandler = vi.fn()
    bus.on('input:attack', attackHandler)
    mockWindow.fire('keydown', { code: 'Space', repeat: false, preventDefault: () => {} })
    mockWindow.fire('keydown', { code: 'Space', repeat: true, preventDefault: () => {} })
    expect(attackHandler).toHaveBeenCalledTimes(1)
  })

  it('emits input:skill with correct slot for Q/E and 1/2', () => {
    const skillHandler = vi.fn()
    bus.on('input:skill', skillHandler)
    mockWindow.fire('keydown', { code: 'KeyQ', repeat: false, preventDefault: () => {} })
    mockWindow.fire('keydown', { code: 'KeyE', repeat: false, preventDefault: () => {} })
    mockWindow.fire('keydown', { code: 'Digit1', repeat: false, preventDefault: () => {} })
    mockWindow.fire('keydown', { code: 'Digit2', repeat: false, preventDefault: () => {} })
    expect(skillHandler).toHaveBeenNthCalledWith(1, { slot: 0 })
    expect(skillHandler).toHaveBeenNthCalledWith(2, { slot: 1 })
    expect(skillHandler).toHaveBeenNthCalledWith(3, { slot: 0 })
    expect(skillHandler).toHaveBeenNthCalledWith(4, { slot: 1 })
  })

  it('isDown reflects held state', () => {
    expect(controller.isDown('attack')).toBe(false)
    mockWindow.fire('keydown', { code: 'Space', repeat: false, preventDefault: () => {} })
    expect(controller.isDown('attack')).toBe(true)
    mockWindow.fire('keyup', { code: 'Space' })
    expect(controller.isDown('attack')).toBe(false)
  })

  it('clears held keys on window blur to avoid stuck input after alt-tab', () => {
    mockWindow.fire('keydown', { code: 'KeyW', repeat: false, preventDefault: () => {} })
    expect(controller.getMoveVector().y).toBe(-1)
    mockWindow.fire('blur', {})
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 })
  })

  // ---- Touch joystick ----------------------------------------------

  it('starts the joystick on a left-half touch and emits input:joystick:start', () => {
    const startHandler = vi.fn()
    bus.on('input:joystick:start', startHandler)
    canvas.fire('touchstart', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 7, clientX: 100, clientY: 500 }],
    })
    expect(startHandler).toHaveBeenCalledWith({ screenX: 100, screenY: 500 })
  })

  it('right-half tap fires input:attack instead of starting the joystick', () => {
    const startHandler = vi.fn()
    const attackHandler = vi.fn()
    bus.on('input:joystick:start', startHandler)
    bus.on('input:attack', attackHandler)
    canvas.fire('touchstart', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 7, clientX: 400, clientY: 500 }], // x=400 > 540/2
    })
    expect(startHandler).not.toHaveBeenCalled()
    expect(attackHandler).toHaveBeenCalledTimes(1)
  })

  it('joystick saturates at MAX_RADIUS (vector magnitude 1)', () => {
    canvas.fire('touchstart', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 1, clientX: 100, clientY: 500 }],
    })
    canvas.fire('touchmove', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 1, clientX: 100 + JOYSTICK_MAX_RADIUS * 3, clientY: 500 }],
    })
    const v = controller.getMoveVector()
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 5)
  })

  it('joystick deadzone returns (0,0) for tiny offsets', () => {
    canvas.fire('touchstart', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 1, clientX: 100, clientY: 500 }],
    })
    // 2 px right = 2/40 = 0.05, well below deadzone 0.12.
    canvas.fire('touchmove', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 1, clientX: 102, clientY: 500 }],
    })
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 })
  })

  it('a second left-half touch with a different id does NOT replace the active joystick', () => {
    canvas.fire('touchstart', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 1, clientX: 100, clientY: 500 }],
    })
    canvas.fire('touchmove', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 1, clientX: 130, clientY: 500 }],
    })
    const beforeSecondTouch = controller.getMoveVector()
    canvas.fire('touchstart', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 2, clientX: 50, clientY: 500 }],
    })
    expect(controller.getMoveVector()).toEqual(beforeSecondTouch)
  })

  it('touchend resets the joystick to (0,0)', () => {
    const endHandler = vi.fn()
    bus.on('input:joystick:end', endHandler)
    canvas.fire('touchstart', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 1, clientX: 100, clientY: 500 }],
    })
    canvas.fire('touchmove', {
      preventDefault: () => {},
      changedTouches: [{ identifier: 1, clientX: 140, clientY: 500 }],
    })
    canvas.fire('touchend', { changedTouches: [{ identifier: 1, clientX: 140, clientY: 500 }] })
    expect(controller.getMoveVector()).toEqual({ x: 0, y: 0 })
    expect(endHandler).toHaveBeenCalled()
  })

  // ---- Cleanup -----------------------------------------------------

  it('destroy() removes every listener', () => {
    expect(canvas.hasListener('touchstart')).toBe(true)
    controller.destroy()
    expect(canvas.hasListener('touchstart')).toBe(false)
    expect(canvas.hasListener('touchmove')).toBe(false)
    expect(canvas.hasListener('touchend')).toBe(false)
    expect(canvas.hasListener('mousedown')).toBe(false)
  })
})
