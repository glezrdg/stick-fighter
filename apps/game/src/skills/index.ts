// Skills are wired into the registry via side-effect imports.
// **Adding a new skill = create a file + add an import here.** Nothing else.

// Actives
import './Dash'
import './KiBlast'
import './GroundPound'
import './SwordTornado'
import './Heal'
import './FinalFlash'
// Passives
import './Shield'
import './Vampire'
import './Golden'
import './CdReduce'
import './Combo3'

export type { PassiveModifiers, Skill, SkillContext } from './Skill'
export { _resetForTest, all, get, passivesOwned, register, tryGet } from './registry'
