import { type HealthResponse } from '@stick/shared'
import type { FastifyPluginAsync } from 'fastify'

const SERVER_BOOT_TIME = Date.now()
const SERVER_VERSION = process.env.API_VERSION ?? '0.1.0'

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/health',
    async (): Promise<HealthResponse> => ({
      status: 'ok',
      version: SERVER_VERSION,
      uptimeSec: (Date.now() - SERVER_BOOT_TIME) / 1000,
    }),
  )
}
