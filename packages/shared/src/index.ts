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

export {
  AuthResponseSchema,
  LoginRequestSchema,
  ProfileResponseSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  type AuthResponse,
  type LoginRequest,
  type ProfileResponse,
  type RefreshRequest,
  type RegisterRequest,
} from './api/auth'

export {
  HostReqSchema,
  JoinReqSchema,
  NetCosmeticsSchema,
  NetLoadoutSchema,
  RejoinReqSchema,
  type RestartReq,
  type RestartVotesMsg,
  encodeMsg,
  parseMsg,
  type ClientMsg,
  type ErrorMsg,
  type HostReq,
  type InputReq,
  type JoinReq,
  type LeaveReq,
  type LobbyMsg,
  type NetCosmetics,
  type NetEnemy,
  type NetLoadout,
  type NetObstacle,
  type NetPlayer,
  type NetPlayerStats,
  type NetProjectile,
  type NetSkillCooldown,
  type PeerLeftMsg,
  type PhaseMsg,
  type PingMsg,
  type ReadyReq,
  type RejoinReq,
  type ServerMsg,
  type SkillCastMsg,
  type StateMsg,
  type WaveBuffEndMsg,
  type WaveBuffOfferMsg,
  type WaveBuffResolvedMsg,
  type WaveBuffVoteReq,
  type WaveBuffVotesMsg,
} from './realtime/protocol'
