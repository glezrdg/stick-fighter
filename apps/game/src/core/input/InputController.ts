import type { EventBus } from '@stick/sim'

/**
 * Unified input controller. Replaces the scattered keydown/keyup/touch*
 * listeners of the legacy single-file game.
 *
 * Responsibilities:
 *   - Track keyboard state (WASD/arrows for movement; Space/J/K for attack;
 *     F/L for shoot; Q/1 and E/2 for skills).
 *   - Manage virtual joystick on the left half of the canvas (touch only,
 *     multitouch-safe via touch identifier).
 *   - Treat right-half taps as a single attack (legacy behaviour).
 *   - Emit one-shot raw events on the bus (`input:attack`, `input:shoot`,
 *     `input:skill`, `input:joystick:*`). Game systems decide whether to
 *     act on them (cooldowns, scene state).
 *   - Expose polling APIs for movement vector and held buttons.
 *
 * Improvements over the legacy:
 *   - Deadzone (the legacy had none, causing facing-jitter on touch drift).
 *   - Constants instead of magic numbers (40px, 220px, etc.).
 *   - Symmetric DOM listener cleanup via `destroy()`.
 *   - Polling API does NOT compute auto-aim — that's gameplay logic.
 */

const KEY_BINDINGS = {
  moveUp: ['ArrowUp', 'KeyW'],
  moveDown: ['ArrowDown', 'KeyS'],
  moveLeft: ['ArrowLeft', 'KeyA'],
  moveRight: ['ArrowRight', 'KeyD'],
  attack: ['Space', 'KeyJ', 'KeyK'],
  shoot: ['KeyF', 'KeyL'],
  skill1: ['KeyQ', 'Digit1'],
  skill2: ['KeyE', 'Digit2'],
} as const

const PREVENT_DEFAULT_KEYS: ReadonlySet<string> = new Set<string>([
  ...KEY_BINDINGS.attack,
  ...KEY_BINDINGS.shoot,
  ...KEY_BINDINGS.moveUp, // arrow keys also scroll the page
  ...KEY_BINDINGS.moveDown,
  ...KEY_BINDINGS.moveLeft,
  ...KEY_BINDINGS.moveRight,
])

/** Joystick visual max radius (pixels). Exported so the Solid overlay matches. */
export const JOYSTICK_MAX_RADIUS = 40
const JOYSTICK_DEADZONE = 0.12 // normalized magnitude below which we report 0

export type ButtonName = 'attack' | 'shoot' | 'skill1' | 'skill2'

export interface InputControllerOptions {
  canvas: HTMLCanvasElement
  bus: EventBus
}

export class InputController {
  private readonly canvas: HTMLCanvasElement
  private readonly bus: EventBus

  private readonly keysDown = new Set<string>()

  // Joystick state
  private joyActive = false
  private joyTouchId: number | null = null
  private joyStartX = 0
  private joyStartY = 0
  /** Normalized joystick vector, [-1, 1]. (0,0) when inactive. */
  private joyVX = 0
  private joyVY = 0

  // Bound listener references (so we can remove them on destroy).
  private readonly onKeyDown: (e: KeyboardEvent) => void
  private readonly onKeyUp: (e: KeyboardEvent) => void
  private readonly onTouchStart: (e: TouchEvent) => void
  private readonly onTouchMove: (e: TouchEvent) => void
  private readonly onTouchEnd: (e: TouchEvent) => void
  private readonly onMouseDown: (e: MouseEvent) => void
  private readonly onBlur: () => void

  constructor(opts: InputControllerOptions) {
    this.canvas = opts.canvas
    this.bus = opts.bus

    this.onKeyDown = (e) => this.handleKeyDown(e)
    this.onKeyUp = (e) => this.handleKeyUp(e)
    this.onTouchStart = (e) => this.handleTouchStart(e)
    this.onTouchMove = (e) => this.handleTouchMove(e)
    this.onTouchEnd = (e) => this.handleTouchEnd(e)
    this.onMouseDown = (e) => this.handleMouseDown(e)
    this.onBlur = () => this.resetTransientState()

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false })
    this.canvas.addEventListener('touchmove', this.onTouchMove, { passive: false })
    this.canvas.addEventListener('touchend', this.onTouchEnd, { passive: false })
    this.canvas.addEventListener('touchcancel', this.onTouchEnd, { passive: false })
    this.canvas.addEventListener('mousedown', this.onMouseDown)
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.canvas.removeEventListener('touchstart', this.onTouchStart)
    this.canvas.removeEventListener('touchmove', this.onTouchMove)
    this.canvas.removeEventListener('touchend', this.onTouchEnd)
    this.canvas.removeEventListener('touchcancel', this.onTouchEnd)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    this.resetTransientState()
  }

  // ---- Polling API --------------------------------------------------

  /**
   * Normalized [-1, 1] move vector, deadzone applied. Joystick takes
   * precedence over keyboard (matches legacy: if user holds joystick and
   * presses WASD, joystick wins).
   */
  getMoveVector(): { x: number; y: number } {
    if (this.joyActive) {
      const m = Math.hypot(this.joyVX, this.joyVY)
      if (m < JOYSTICK_DEADZONE) return { x: 0, y: 0 }
      return { x: this.joyVX, y: this.joyVY }
    }

    let x = 0
    let y = 0
    if (this.isAnyKeyDown(KEY_BINDINGS.moveUp)) y -= 1
    if (this.isAnyKeyDown(KEY_BINDINGS.moveDown)) y += 1
    if (this.isAnyKeyDown(KEY_BINDINGS.moveLeft)) x -= 1
    if (this.isAnyKeyDown(KEY_BINDINGS.moveRight)) x += 1

    const m = Math.hypot(x, y)
    if (m === 0) return { x: 0, y: 0 }
    return { x: x / m, y: y / m }
  }

  /** True while any key bound to this button is held. */
  isDown(button: ButtonName): boolean {
    return this.isAnyKeyDown(KEY_BINDINGS[button])
  }

  // ---- Internal: keyboard ------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return
    if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault()
    this.keysDown.add(e.code)

    if (matches(KEY_BINDINGS.attack, e.code)) {
      this.bus.emit('input:attack', {})
    } else if (matches(KEY_BINDINGS.shoot, e.code)) {
      this.bus.emit('input:shoot', {})
    } else if (matches(KEY_BINDINGS.skill1, e.code)) {
      this.bus.emit('input:skill', { slot: 0 })
    } else if (matches(KEY_BINDINGS.skill2, e.code)) {
      this.bus.emit('input:skill', { slot: 1 })
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keysDown.delete(e.code)
  }

  private isAnyKeyDown(codes: readonly string[]): boolean {
    for (const c of codes) if (this.keysDown.has(c)) return true
    return false
  }

  // ---- Internal: touch ---------------------------------------------

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const halfWidth = rect.width / 2
    for (const t of e.changedTouches) {
      const x = t.clientX - rect.left
      const y = t.clientY - rect.top
      if (x < halfWidth && !this.joyActive) {
        this.joyStart(x, y, t.identifier)
      } else if (x >= halfWidth) {
        this.bus.emit('input:attack', {})
      }
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.joyActive) return
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyTouchId) {
        this.joyMove(t.clientX - rect.left, t.clientY - rect.top)
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joyTouchId) {
        this.joyEnd()
        break
      }
    }
  }

  private joyStart(x: number, y: number, touchId: number): void {
    this.joyActive = true
    this.joyTouchId = touchId
    this.joyStartX = x
    this.joyStartY = y
    this.joyVX = 0
    this.joyVY = 0
    this.bus.emit('input:joystick:start', { screenX: x, screenY: y })
  }

  private joyMove(x: number, y: number): void {
    const dx = x - this.joyStartX
    const dy = y - this.joyStartY
    const d = Math.hypot(dx, dy)
    const clamped = d > JOYSTICK_MAX_RADIUS ? JOYSTICK_MAX_RADIUS : d
    if (d > 0) {
      const nx = dx / d
      const ny = dy / d
      this.joyVX = nx * (clamped / JOYSTICK_MAX_RADIUS)
      this.joyVY = ny * (clamped / JOYSTICK_MAX_RADIUS)
    } else {
      this.joyVX = 0
      this.joyVY = 0
    }
    this.bus.emit('input:joystick:move', { vx: this.joyVX, vy: this.joyVY })
  }

  private joyEnd(): void {
    this.joyActive = false
    this.joyTouchId = null
    this.joyVX = 0
    this.joyVY = 0
    this.bus.emit('input:joystick:end', {})
  }

  // ---- Internal: mouse ---------------------------------------------

  private handleMouseDown(_e: MouseEvent): void {
    this.bus.emit('input:attack', {})
  }

  // ---- Internal: state cleanup -------------------------------------

  // intentionally last so the `matches` helper below stays out of the public API surface above

  /** Called on window blur and on destroy. Prevents "stuck keys" after alt-tab. */
  private resetTransientState(): void {
    this.keysDown.clear()
    if (this.joyActive) this.joyEnd()
  }
}

function matches(binding: readonly string[], code: string): boolean {
  for (const c of binding) if (c === code) return true
  return false
}
