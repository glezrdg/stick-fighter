// @stick/sim — deterministic simulation core (no Phaser, no DOM).
// Imported by apps/game (single-player) and apps/realtime (server-authoritative multiplayer).
// Math.random() is forbidden here — see eslint.config.mjs.

export { createRng, timeSeed, type Rng } from './rng'
