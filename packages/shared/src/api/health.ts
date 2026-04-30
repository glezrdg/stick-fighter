import { z } from 'zod'

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptimeSec: z.number().nonnegative(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>
