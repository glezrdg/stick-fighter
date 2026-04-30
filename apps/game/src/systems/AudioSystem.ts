import type { SaveCurrent } from '@stick/shared'

import type { EventBus } from '../app/eventBus'

/**
 * Audio system. For F2.5 we synthesize SFX directly via the Web Audio API so
 * the game ships sound even before real .ogg assets exist. Each game-event →
 * SFX mapping lives in `playForEvent`. When real assets land in a future
 * pass we'll swap the procedural generator for Howler-driven sample playback
 * without changing the bus contract.
 *
 * iOS / mobile: AudioContext starts suspended until the first user gesture.
 * The `unlock()` method resumes it on any pointerdown / keydown — call it
 * once from main.tsx after Phaser boots.
 */
export class AudioSystem {
  private readonly bus: EventBus
  private readonly getSettings: () => SaveCurrent['settings']
  private ctx: AudioContext | null = null
  private masterGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private musicGain: GainNode | null = null
  private noiseBuffer: AudioBuffer | null = null
  private busUnsubs: Array<() => void> = []
  private unlocked = false

  constructor(opts: { bus: EventBus; getSettings: () => SaveCurrent['settings'] }) {
    this.bus = opts.bus
    this.getSettings = opts.getSettings
  }

  init(): void {
    if (typeof window === 'undefined') return
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.masterGain = this.ctx.createGain()
    this.sfxGain = this.ctx.createGain()
    this.musicGain = this.ctx.createGain()
    this.sfxGain.connect(this.masterGain)
    this.musicGain.connect(this.masterGain)
    this.masterGain.connect(this.ctx.destination)
    this.applySettings()
    this.noiseBuffer = this.makeNoiseBuffer()
    this.subscribe()
  }

  /** Browsers require a user gesture before AudioContext can resume. */
  unlock(): void {
    if (this.unlocked || !this.ctx) return
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    this.unlocked = true
  }

  /** Re-read save.settings (called when sliders change). */
  applySettings(): void {
    if (!this.masterGain || !this.sfxGain || !this.musicGain) return
    const s = this.getSettings()
    this.masterGain.gain.value = clamp01(s.masterVol)
    this.sfxGain.gain.value = clamp01(s.sfxVol)
    this.musicGain.gain.value = clamp01(s.musicVol)
  }

  shutdown(): void {
    for (const off of this.busUnsubs) off()
    this.busUnsubs = []
    void this.ctx?.close()
    this.ctx = null
  }

  // ----- SFX synthesis ------------------------------------------------

  private subscribe(): void {
    this.busUnsubs.push(
      this.bus.on('combat:hit', ({ crit }) => this.sfxHit(crit)),
      this.bus.on('enemy:death', () => this.sfxKill()),
      this.bus.on('player:hurt', () => this.sfxHurt()),
      this.bus.on('player:death', () => this.sfxDeath()),
      this.bus.on('wave:start', () => this.sfxWaveStart()),
      this.bus.on('wave:complete', () => this.sfxWaveComplete()),
      this.bus.on('skill:cast', () => this.sfxSkill()),
      this.bus.on('obstacle:explode', () => this.sfxExplode()),
      this.bus.on('combo:advance', ({ count }) => {
        if (count >= 3) this.sfxCombo(count)
      }),
    )
  }

  private sfxHit(crit: boolean): void {
    this.tone({
      freq: crit ? 520 : 280,
      duration: 0.08,
      type: 'square',
      gain: 0.18,
      sweepTo: crit ? 920 : 180,
    })
    this.noiseBurst(0.05, 0.08)
  }

  private sfxKill(): void {
    this.tone({ freq: 440, duration: 0.18, type: 'sawtooth', gain: 0.15, sweepTo: 110 })
    this.noiseBurst(0.1, 0.12)
  }

  private sfxHurt(): void {
    this.tone({ freq: 220, duration: 0.18, type: 'square', gain: 0.22, sweepTo: 80 })
  }

  private sfxDeath(): void {
    this.tone({ freq: 180, duration: 0.6, type: 'sawtooth', gain: 0.3, sweepTo: 60 })
  }

  private sfxWaveStart(): void {
    this.tone({ freq: 330, duration: 0.16, type: 'triangle', gain: 0.18 })
    setTimeout(() => this.tone({ freq: 660, duration: 0.16, type: 'triangle', gain: 0.18 }), 120)
  }

  private sfxWaveComplete(): void {
    this.tone({ freq: 523, duration: 0.18, type: 'sine', gain: 0.22 })
    setTimeout(() => this.tone({ freq: 659, duration: 0.18, type: 'sine', gain: 0.22 }), 140)
    setTimeout(() => this.tone({ freq: 784, duration: 0.32, type: 'sine', gain: 0.22 }), 280)
  }

  private sfxSkill(): void {
    this.tone({ freq: 880, duration: 0.18, type: 'triangle', gain: 0.22, sweepTo: 1320 })
  }

  private sfxExplode(): void {
    this.noiseBurst(0.4, 0.42)
    this.tone({ freq: 100, duration: 0.5, type: 'sawtooth', gain: 0.32, sweepTo: 30 })
  }

  private sfxCombo(count: number): void {
    const base = 440 + count * 60
    this.tone({ freq: base, duration: 0.07, type: 'sine', gain: 0.18 })
  }

  // ----- WebAudio helpers ---------------------------------------------

  private tone(opts: {
    freq: number
    duration: number
    type: OscillatorType
    gain: number
    sweepTo?: number
  }): void {
    const ctx = this.ctx
    const sfxGain = this.sfxGain
    if (!ctx || !sfxGain) return
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = opts.type
    osc.frequency.value = opts.freq
    if (opts.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, opts.sweepTo),
        ctx.currentTime + opts.duration,
      )
    }
    env.gain.value = 0
    env.gain.linearRampToValueAtTime(opts.gain, ctx.currentTime + 0.005)
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + opts.duration)
    osc.connect(env)
    env.connect(sfxGain)
    osc.start()
    osc.stop(ctx.currentTime + opts.duration + 0.02)
  }

  private noiseBurst(duration: number, gain: number): void {
    const ctx = this.ctx
    const sfxGain = this.sfxGain
    const buf = this.noiseBuffer
    if (!ctx || !sfxGain || !buf) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    const env = ctx.createGain()
    env.gain.value = gain
    env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration)
    src.connect(env)
    env.connect(sfxGain)
    src.start()
    src.stop(ctx.currentTime + duration + 0.02)
  }

  private makeNoiseBuffer(): AudioBuffer | null {
    if (!this.ctx) return null
    const sampleRate = this.ctx.sampleRate
    const buffer = this.ctx.createBuffer(1, sampleRate, sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1
    }
    return buffer
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
