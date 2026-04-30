/**
 * Polyfill `Symbol.metadata` BEFORE any other module loads. `@colyseus/schema`
 * 3.x's encoder reads `class[Symbol.metadata]` and crashes if undefined.
 *
 * Must be imported as the FIRST import in `server.ts` and `WorldState.ts`
 * — the symbol slot needs to be set on `globalThis` before any class
 * inherits from `Schema` (which reads its own metadata at definition time).
 */
// Cast through `unknown` since the `metadata` slot isn't typed in older
// TypeScript lib defs but is what @colyseus/schema looks for at runtime.
const SymbolAny = Symbol as unknown as { metadata: symbol }
SymbolAny.metadata ??= Symbol.for('Symbol.metadata')

export {}
