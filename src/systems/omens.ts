import { BLOOD_MOON, OMEN_ROLL, OMENS, type OmenDef } from '../config/omens'

/**
 * A small integer hash of a wave (and a salt, for a second roll), in [0, 1).
 * The same night always rolls the same, so no omen is ever saved.
 */
export function rollOf(wave: number, salt = 0): number {
  let x = (Math.imul(wave, 0x9e3779b1) + Math.imul(salt, 0x85ebca77)) | 0
  x ^= x >>> 16
  x = Math.imul(x, 0x7feb352d)
  x ^= x >>> 15
  x = Math.imul(x, 0x846ca68b)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

/**
 * The omen of a night, from its wave alone. Blood Moon keeps its cadence; any
 * other night rolls, and a night after a random omen gets none. That check is
 * `omenFor(wave - 1)`, so the no-repeat rule needs no state.
 */
export function omenFor(wave: number): OmenDef | null {
  if (wave >= BLOOD_MOON.from && wave % BLOOD_MOON.every === 0) return OMENS.bloodMoon
  if (wave < OMEN_ROLL.from || rollOf(wave) >= OMEN_ROLL.chance) return null
  const before = omenFor(wave - 1)
  if (before && before.key !== 'bloodMoon') return null
  return rollOf(wave, 1) < 0.5 ? OMENS.swarm : OMENS.quiet
}

/** A night's count of one walker kind, under an omen. */
export const hordeSize = (n: number, omen: OmenDef | null) => Math.round(n * (omen?.hordeMult ?? 1))

/** The extra Chitters a night's walkers bring under an omen. */
export const swarmExtra = (walkers: number, omen: OmenDef | null) => Math.round(walkers * (omen?.swarmShare ?? 0))
