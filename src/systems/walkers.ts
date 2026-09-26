import type { EnemyKey } from '../config/enemies'
import type { RegionId } from '../config/world'

/**
 * S16: the pure parts of the new walkers, kept out of the managers so the
 * rules can be tested without Phaser. The slow the bog wretch lays on the hero
 * and soldiers, how auras combine when two sources overlap, and how the night's
 * deck is dealt out by muster (the camp's own walker, then the regional rules,
 * then packs opened up).
 */

// ---- the slow ---------------------------------------------------------------

/** A movement slow on an ally: `mult` on move speed while `t` > 0. */
export interface Slow { t: number; mult: number }

export const noSlow = (): Slow => ({ t: 0, mult: 1 })

/**
 * A new slowing hit. Slows never stack: the strongest one standing holds, and
 * a hit refreshes the clock to its own duration (it never adds up). A weaker
 * hit can extend the time, but never weakens a stronger slow.
 */
export function applySlow(s: Slow, mult: number, seconds: number): Slow {
  const live = s.t > 0
  s.mult = live ? Math.min(s.mult, mult) : mult
  s.t = Math.max(live ? s.t : 0, seconds)
  return s
}

/** Run the clock down; the slow lifts when it runs out. */
export function tickSlow(s: Slow, dt: number): Slow {
  if (s.t <= 0) return s
  s.t -= dt
  if (s.t <= 0) { s.t = 0; s.mult = 1 }
  return s
}

export const slowMult = (s: Slow): number => (s.t > 0 ? s.mult : 1)

// ---- auras ------------------------------------------------------------------

/** What auras give one walker this frame. */
export interface AuraFx { damage: number; speed: number; heal: number }

export interface AuraSource { damageMult: number; speedMult: number; heal?: number }

export const noAura = (): AuraFx => ({ damage: 1, speed: 1, heal: 0 })

/**
 * Overlapping auras don't multiply: each effect takes the strongest source in
 * reach (a caller's +35% and a priest's +25% give +35%, not +69%), so a knot of
 * priests is no worse than one. `self` drops the heal: a priest heals the
 * others, not itself.
 */
export function mergeAura(fx: AuraFx, a: AuraSource, self = false): AuraFx {
  fx.damage = Math.max(fx.damage, a.damageMult)
  fx.speed = Math.max(fx.speed, a.speedMult)
  if (!self) fx.heal = Math.max(fx.heal, a.heal ?? 0)
  return fx
}

/** hp after `dt` s of an aura's heal, never past max. */
export const auraHealed = (hp: number, maxHp: number, heal: number, dt: number): number =>
  hp >= maxHp || heal <= 0 ? hp : Math.min(maxHp, hp + heal * dt)

// ---- the wave mix -----------------------------------------------------------

/** Where an approach musters, as far as the mix cares. */
export interface MusterMix {
  /** the muster camp's own walker (resolved), or null at a maw */
  own: EnemyKey | null
  region: RegionId | null
  tier: number
}

export interface MixRule {
  key: EnemyKey
  /** its share of a hand, at least; `per` 12 is one card in twelve */
  per: number
  regions?: readonly RegionId[]
  minTier?: number
  /** also the most it may make up of a hand, the camp's own share included */
  cap?: boolean
}

/**
 * The new walkers in the night's deck (S16; S20 tunes the numbers):
 *  - bog wretches from the Saltmere and Barrowmoor musters, one card in four
 *    (the Drowned Bell's own 30% already covers Saltmere);
 *  - cinder hounds from tier 5 musters, one in five;
 *  - ash priests from tier 4 and above, one in twelve and never more, so the
 *    Stairwarden's muster sends casters, not a choir.
 * Thornlings come only as the Thornmother's own walker, a pack per card.
 */
export const WALKER_MIX: readonly MixRule[] = [
  { key: 'ashPriest', per: 12, minTier: 4, cap: true },
  { key: 'cinderHound', per: 5, minTier: 5 },
  { key: 'bogWretch', per: 4, regions: ['saltmere', 'barrowmoor'] },
]

/** The camp's own walker makes up this share of its approach (was Approaches.CAMP_MIX's job alone). */
const ownCount = (n: number, share: number) => Math.round(n * share)

const applies = (r: MixRule, m: MusterMix) =>
  (r.minTier === undefined || m.tier >= r.minTier) && (!r.regions || (m.region !== null && r.regions.includes(m.region)))

/**
 * One approach's hand of cards, mixed for its muster:
 *  1. the first `campMix` share becomes the camp's own walker (capped by its rule);
 *  2. each rule that applies tops its walker up to one card in `per`, on cards
 *     spread evenly through the rest of the hand (the hand's order is its
 *     arrival order, so they don't all come at the end);
 *  3. every pack walker's card opens into `packs[key]` walkers side by side.
 * The input is not changed.
 */
export function mixHand(
  hand: readonly EnemyKey[], m: MusterMix, campMix: number, packs: Partial<Record<EnemyKey, number>> = {},
): EnemyKey[] {
  const out = hand.slice()
  const n = out.length
  if (!n) return out
  const rules = WALKER_MIX.filter(r => applies(r, m))
  const capOf = (key: EnemyKey) => {
    const r = rules.find(q => q.key === key && q.cap)
    return r ? Math.max(1, Math.floor(n / r.per)) : Infinity
  }

  let fixed = 0
  if (m.own) {
    fixed = Math.min(ownCount(n, campMix), capOf(m.own))
    for (let i = 0; i < fixed; i++) out[i] = m.own
  }

  const adds: EnemyKey[] = []
  for (const r of rules) {
    const want = Math.floor(n / r.per)
    const have = out.filter(k => k === r.key).length
    for (let i = have; i < want; i++) adds.push(r.key)
  }
  const room = n - fixed
  // interleave the kinds so a hand with priests and hounds mixes them
  const byKind = rules.map(r => adds.filter(k => k === r.key))
  const dealt: EnemyKey[] = []
  for (let i = 0; dealt.length < Math.min(adds.length, room); i++) {
    for (const q of byKind) if (i < q.length && dealt.length < room) dealt.push(q[i])
  }
  for (let j = 0; j < dealt.length; j++) out[fixed + Math.floor(((j + 0.5) * room) / dealt.length)] = dealt[j]

  if (!Object.keys(packs).length) return out
  const opened: EnemyKey[] = []
  for (const k of out) {
    const p = Math.max(1, packs[k] ?? 1)
    for (let i = 0; i < p; i++) opened.push(k)
  }
  return opened
}
