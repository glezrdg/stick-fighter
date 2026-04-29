// @stick/sim — deterministic simulation core (no Phaser, no DOM).
// Imported by apps/game (single-player) and apps/realtime (server-authoritative multiplayer).
// Math.random() is forbidden here — see eslint.config.mjs.
// Populated in F1 (RNG, world, damage) and F5 (lockstep tick for multiplayer).

export const STICK_SIM_VERSION = '0.0.0'
