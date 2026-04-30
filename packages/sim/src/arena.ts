/** Arena dimensions in world coordinates. Matches the legacy's ARENA_W/H. */
export const ARENA = {
  width: 1200,
  height: 800,
  /** Inset for clamping the player position (avoid clipping into walls). */
  playerInsetLeft: 40,
  playerInsetRight: 40,
  playerInsetTop: 60,
  playerInsetBottom: 40,
} as const

/** Camera zoom. The legacy used 1.6, but our viewport is taller (540×960
 *  vs the legacy ~640×640) so the perceived size of actors is smaller.
 *  Bumped to 2.0 so stickmen read at roughly the legacy size on screen. */
export const CAM_ZOOM = 2.0
