// @stick/sim — deterministic simulation core (no Phaser, no DOM).
// Imported by apps/game (single-player) and apps/realtime (server-authoritative
// multiplayer). `Math.random()` is forbidden here — see eslint.config.mjs.

// ---- Core ----
export { createRng, timeSeed, type Rng } from './rng'
export { createRunState, emptyRunBuffs, type RunBuffs, type RunState } from './runState'
export { createEventBus, type EventBus, type GameEvents } from './eventBus'

// ---- Entities ----
export * from './entities/Player'
export * from './entities/Enemy'
export * from './entities/Projectile'
export * from './entities/Obstacle'

// ---- Enemies (behaviors + registry) ----
export * from './enemies/Behavior'
export {
  _resetForTest as _resetBehaviorsForTest,
  get as getBehavior,
  register as registerBehavior,
  tryGet as tryGetBehavior,
} from './enemies/registry'
// Side-effect: registers every behavior on import.
import './enemies'

// ---- Arena geometry (constants used by both client + server) ----
export * from './arena'

// ---- Skills ----
export * from './skills/Skill'
export {
  _resetForTest as _resetSkillsForTest,
  all as allSkills,
  get as getSkill,
  passivesOwned,
  register as registerSkill,
  tryGet as tryGetSkill,
} from './skills/registry'
export {
  SWORD_TORNADO_DURATION_SEC,
  SWORD_TORNADO_TICK_SEC,
  SWORD_TORNADO_RADIUS,
  SWORD_TORNADO_DMG_MUL,
} from './skills/SwordTornado'
export { VAMPIRE_HEAL_PER_KILL } from './skills/Vampire'
// Side-effect import: triggers every skill's `register()` call.
import './skills'

// ---- Systems ----
export * from './systems/MovementSystem'
export * from './systems/CombatSystem'
export * from './systems/EnemySystem'
export * from './systems/ProjectileSystem'
export * from './systems/WaveSystem'
export * from './systems/WaveBuffSystem'
export * from './systems/BuffSystem'
export * from './systems/ObstacleSystem'
export * from './systems/SkillSystem'
export * from './systems/hitStop'
