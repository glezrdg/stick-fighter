import type { RunReport } from '@stick/shared'

/**
 * Plausibility checks before a run is accepted into the leaderboard. Returns
 * `null` if accepted; an error string otherwise. NOT cryptographically
 * authoritative — once F5 server-authoritative multiplayer lands, the server
 * will replay `seed` and verify mechanically. For F4 these heuristics are
 * enough to filter trivial tampering from the browser dev tools.
 *
 * Tunable constants are intentionally generous; tighten them after observing
 * a few hundred legit runs.
 */

const MIN_SEC_PER_WAVE = 6 // 1-shotting all enemies still takes ~this long
const MAX_KILLS_PER_WAVE = 30 // formula caps wave totals well under this
const MAX_WAVE = 200 // sanity ceiling
const MAX_GOLD_PER_KILL = 200 // mage golden = 18*1.5*2 (crit) + buffs ≈ 60. 200 is generous.

export function validateRun(report: RunReport): string | null {
  if (report.wave < 1 || report.wave > MAX_WAVE) {
    return `wave out of range: ${report.wave}`
  }
  if (report.kills > report.wave * MAX_KILLS_PER_WAVE) {
    return `kills too high for wave reached`
  }
  if (report.durationSec < report.wave * MIN_SEC_PER_WAVE) {
    return `duration too short for wave reached`
  }
  if (report.kills > 0 && report.gold > report.kills * MAX_GOLD_PER_KILL) {
    return `gold/kill ratio implausible`
  }
  if (report.gold < 0 || report.kills < 0) {
    return `negative metrics`
  }
  return null
}
