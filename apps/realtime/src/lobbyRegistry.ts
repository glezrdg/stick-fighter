/**
 * In-memory lobby code → roomId registry.
 *
 * Colyseus 0.16's `matchMaker.query({})` returns 0 rooms in our setup
 * (LocalDriver in-process), so we keep our own. StickFightRoom registers
 * itself in `onCreate` and removes itself in `onDispose`. The Express
 * `/lobby/:code` endpoint reads this directly.
 */

const codeToRoomId = new Map<string, string>()

export function registerLobby(code: string, roomId: string): void {
  codeToRoomId.set(code.toUpperCase(), roomId)
  console.info(`[lobby] register ${code} → ${roomId} (now tracking ${codeToRoomId.size})`)
}

export function unregisterLobby(code: string): void {
  codeToRoomId.delete(code.toUpperCase())
  console.info(`[lobby] unregister ${code} (${codeToRoomId.size} remaining)`)
}

export function lookupLobby(code: string): string | undefined {
  return codeToRoomId.get(code.toUpperCase())
}

export function listLobbies(): { code: string; roomId: string }[] {
  return [...codeToRoomId.entries()].map(([code, roomId]) => ({ code, roomId }))
}
