// @stick/shared — types and Zod schemas reused across game, api, realtime.

export const STICK_SHARED_VERSION = '0.0.0'

export {
  CURRENT_SAVE_VERSION,
  CosmeticSlotV1,
  SaveCurrent,
  SaveSettingsV1,
  SaveV1,
  defaultSave,
} from './types/save'

export { HealthResponseSchema, type HealthResponse } from './api/health'

export {
  RunReportSchema,
  RunSubmitResponseSchema,
  type RunReport,
  type RunSubmitResponse,
} from './api/runs'

export {
  LeaderboardEntrySchema,
  LeaderboardQuerySchema,
  LeaderboardResponseSchema,
  type LeaderboardEntry,
  type LeaderboardQuery,
  type LeaderboardResponse,
} from './api/leaderboard'
