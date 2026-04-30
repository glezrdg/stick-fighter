import { describe, expect, it } from 'vitest'

import { MAX_DT_SECONDS, createFixedStepAccumulator, dtFromPhaser } from './time'

describe('dtFromPhaser', () => {
  it('converts ms to seconds', () => {
    expect(dtFromPhaser(16.667)).toBeCloseTo(0.01667, 4)
  })

  it('clamps long frames to MAX_DT_SECONDS', () => {
    // Simulate a 2-second tab freeze.
    expect(dtFromPhaser(2000)).toBe(MAX_DT_SECONDS)
  })
})

describe('createFixedStepAccumulator', () => {
  it('yields zero steps when dt is below the step', () => {
    const stepper = createFixedStepAccumulator(1 / 60)
    const steps = [...stepper.advance(0.005)]
    expect(steps).toEqual([])
  })

  it('yields exactly one step at the boundary', () => {
    const stepper = createFixedStepAccumulator(0.01)
    const steps = [...stepper.advance(0.01)]
    expect(steps).toEqual([0.01])
  })

  it('yields multiple steps when dt covers several intervals', () => {
    const stepper = createFixedStepAccumulator(0.01)
    const steps = [...stepper.advance(0.035)]
    expect(steps.length).toBe(3) // 0.01, 0.01, 0.01 — leaves 0.005 in accumulator
  })

  it('accumulates leftover dt across calls', () => {
    const stepper = createFixedStepAccumulator(0.01)
    void [...stepper.advance(0.007)] // 0 steps, acc=0.007
    const steps = [...stepper.advance(0.005)] // acc=0.012 → 1 step, acc=0.002
    expect(steps).toEqual([0.01])
  })

  it('caps steps per frame to prevent spiral of death', () => {
    const stepper = createFixedStepAccumulator(0.01)
    // 1-second frame = 100 steps if uncapped.
    const steps = [...stepper.advance(1)]
    expect(steps.length).toBeLessThanOrEqual(5)
  })
})
