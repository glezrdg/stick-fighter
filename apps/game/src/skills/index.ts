// Skills are wired into the registry via side-effect imports.
// **Adding a new skill = create a file + add an import here.** Nothing else.
import './Dash'

export type { PassiveModifiers, Skill, SkillContext } from './Skill'
export { _resetForTest, all, get, passivesOwned, register, tryGet } from './registry'
