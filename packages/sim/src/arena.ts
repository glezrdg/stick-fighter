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

/** Camera zoom. The legacy used 1.6 with a ~640×640 viewport; ours is taller
 *  (540×960) so we need a touch more zoom to keep actors readable. 1.8 is
 *  the sweet spot — closer than legacy without choking the play area. */
export const CAM_ZOOM = 1.8
