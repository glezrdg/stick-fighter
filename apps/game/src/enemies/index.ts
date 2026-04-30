// Side-effect imports: every behavior file registers itself.
// **Adding a new behavior = create a file + add an import here.**
import './behaviors/meleeChase'
import './behaviors/rangedKite'
import './behaviors/chargeRush'
import './behaviors/bossPhase'

export { _resetForTest, get, register, tryGet } from './registry'
export type { Behavior, BehaviorContext } from './Behavior'
