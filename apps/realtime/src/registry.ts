/** In-memory registry of active rooms keyed by lobby code. */
import { StickFightRoom } from './rooms/StickFightRoom'

const rooms = new Map<string, StickFightRoom>()
let totalRoomsCreated = 0

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1

export function generateUniqueCode(): string {
  // Try a few times — 32^4 ≈ 1M codes, collisions are vanishingly rare unless
  // the server holds thousands of concurrent rooms.
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = ''
    for (let i = 0; i < 4; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    }
    if (!rooms.has(code)) return code
  }
  // Pathological: bail with a timestamp-based fallback.
  return Date.now().toString(36).toUpperCase().slice(-4)
}

export function createRoom(): StickFightRoom {
  const code = generateUniqueCode()
  const room = new StickFightRoom(code, (c) => {
    rooms.delete(c)
    console.info(`[registry] room ${c} disposed (active: ${rooms.size})`)
  })
  rooms.set(code, room)
  totalRoomsCreated++
  console.info(
    `[registry] room ${code} created (active: ${rooms.size}, total: ${totalRoomsCreated})`,
  )
  return room
}

export function findRoom(code: string): StickFightRoom | undefined {
  return rooms.get(code.toUpperCase())
}

export function listRooms(): { code: string; clients: number; phase: string }[] {
  return Array.from(rooms.values()).map((r) => ({
    code: r.code,
    clients: (r as unknown as { clients: Map<string, unknown> }).clients.size,
    phase: (r as unknown as { phase: string }).phase,
  }))
}

export function registryStats(): { active: number; totalRoomsCreated: number } {
  return { active: rooms.size, totalRoomsCreated }
}

export function shutdownAll(): void {
  for (const room of rooms.values()) room.closeAll()
  rooms.clear()
}
