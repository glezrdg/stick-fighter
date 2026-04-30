// Side-effect imports: every behavior file registers itself.
// **Adding a new behavior = create a file + add an import here.**
import './behaviors/meleeChase'

export { _resetForTest, get, register, tryGet } from './registry'
export type { Behavior, BehaviorContext } from './Behavior'
