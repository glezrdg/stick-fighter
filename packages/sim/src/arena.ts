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

/** Camera zoom (matches legacy CAM_ZOOM). */
export const CAM_ZOOM = 1.6
