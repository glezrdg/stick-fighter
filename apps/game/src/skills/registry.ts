import type { Skill } from './Skill'

/**
 * Skill registry. Each skill file registers itself as a side-effect of
 * importing it (see `skills/Dash.ts`). This eliminates the legacy 47-line
 * if/else chain in `useSkill()` — adding a new skill is "create a file,
 * import it once".
 */
const skills = new Map<string, Skill>()

export function register(skill: Skill): void {
  if (skills.has(skill.id)) {
    throw new Error(`[skills] duplicate id "${skill.id}"`)
  }
  skills.set(skill.id, skill)
}

/** Returns the skill or throws. Use when you know the id is valid. */
export function get(id: string): Skill {
  const s = skills.get(id)
  if (!s) throw new Error(`[skills] unknown id "${id}"`)
  return s
}

/** Returns the skill or undefined. Use when validating user/save data. */
export function tryGet(id: string): Skill | undefined {
  return skills.get(id)
}

/** All registered skills, in registration order. */
export function all(): readonly Skill[] {
  return [...skills.values()]
}

/** All passive skills currently owned by the player. Used by BuffSystem. */
export function passivesOwned(ownedIds: readonly string[]): Skill[] {
  const out: Skill[] = []
  for (const id of ownedIds) {
    const s = skills.get(id)
    if (s && s.kind === 'passive') out.push(s)
  }
  return out
}

/** Test helper. Don't call from production code. */
export function _resetForTest(): void {
  skills.clear()
}
