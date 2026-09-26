/**
 * S17: the four stronghold bosses' kits (05-content §Bosses). Numbers and the
 * pure rules live here, so the phase logic can be tested without a scene;
 * `BossKits` is the scene side that telegraphs, strikes and summons.
 */

export type StrongholdBoss = 'gallowsKnight' | 'thornmother' | 'seamOverseer' | 'stairwarden'
export const STRONGHOLD_BOSSES: readonly StrongholdBoss[] = ['gallowsKnight', 'thornmother', 'seamOverseer', 'stairwarden']
export const isStrongholdBoss = (key: string): key is StrongholdBoss => (STRONGHOLD_BOSSES as readonly string[]).includes(key)

/** Where a stronghold's boss stands (below its camp) and how far it follows the hero. */
export const BOSS_POST = { dy: 90, leash: 420 }
/** A stronghold boss's HUD bar shows only this close to the hero (a night boss's always shows). */
export const BOSS_BAR_RANGE = 1100

/** Tuning for S20. `every` is the gap between telegraphed moves, [min, max] s. */
export const KITS = {
  gallowsKnight: {
    every: [4, 6] as const,
    /** every swing cuts everything in its arc, and the telegraphed one hits harder */
    cleave: { reach: 150, half: 1.15, mult: 1.6, telegraph: 0.75 },
    /** at half health: the hanged rise, once */
    hanged: { at: 0.5, count: 4, key: 'grunt' as const, ring: 130 },
  },
  thornmother: {
    every: [4.5, 6.5] as const,
    /** a thornling pack every `every` s, while fewer than `cap` of hers live */
    pack: { every: 6, count: 5, key: 'thornling' as const, cap: 15, ring: 90 },
    /** a root line at the target: damage and a snare */
    lash: { length: 460, width: 64, mult: 1.5, telegraph: 0.9, slow: 0.4, slowFor: 1.4 },
  },
  seamOverseer: {
    every: [5, 7] as const,
    /** its reach is its def's range (180 px); a crack of the whip all round it */
    crack: { radius: 180, mult: 1.3, telegraph: 0.8, knockback: 240 },
  },
  stairwarden: {
    every: [5, 7.5] as const,
    /** immune while any bound priest lives; the pair rises once more `rebind` s after the last falls */
    bound: { count: 2, key: 'ashPriest' as const, ring: 150, rebind: 12, respawns: 1 },
    /** from range, a charge (the warlord's telegraph); up close, a bash with the stair-shield that throws the hero back */
    charge: { chance: 0.75, minRange: 180 },
    bash: { radius: 120, mult: 1.2, telegraph: 0.6, knockback: 340 },
  },
}

/** An hp fraction crossing a threshold downward this frame (so a boss restored below it does not fire it again). */
export const crossed = (prev: number, now: number, at: number) => prev >= at && now < at

/** A repeating timer: true when it fires (at most once per call). */
export interface Every { t: number }
export function due(s: Every, dt: number, every: number): boolean {
  s.t -= dt
  if (s.t > 0) return false
  s.t += every
  if (s.t <= 0) s.t = every
  return true
}

/**
 * The Stairwarden's binding. `respawns` left and the clock running once the
 * last bound priest falls. `tickBinding` answers true when the pair should
 * rise again; the warden is immune while any bound priest lives.
 */
export interface Binding { respawns: number; t: number }
export const newBinding = (respawns = KITS.stairwarden.bound.respawns): Binding => ({ respawns, t: 0 })
export const wardenImmune = (boundAlive: number) => boundAlive > 0
export function tickBinding(b: Binding, boundAlive: number, dt: number, rebind = KITS.stairwarden.bound.rebind): boolean {
  if (boundAlive > 0 || b.respawns <= 0) { b.t = 0; return false }
  b.t += dt
  if (b.t < rebind) return false
  b.t = 0
  b.respawns--
  return true
}

/** Is (px, py) within `half` of the segment a–b? (the root lash's line) */
export function nearSegment(ax: number, ay: number, bx: number, by: number, half: number, px: number, py: number): boolean {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2))
  const qx = ax + dx * t - px, qy = ay + dy * t - py
  return qx * qx + qy * qy <= half * half
}

/** Is (px, py) inside the arc of `reach` px and ±`half` rad about `facing`? (the knight's cleave) */
export function inArc(cx: number, cy: number, facing: number, reach: number, half: number, px: number, py: number): boolean {
  const dx = px - cx, dy = py - cy
  if (dx * dx + dy * dy > reach * reach) return false
  let a = Math.atan2(dy, dx) - facing
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return Math.abs(a) <= half
}

/** A kit's running state on its boss (`Enemy.kit`). */
export interface KitState {
  /** hp fraction last frame, for `crossed` */
  prev: number
  risen: boolean
  pack: Every
  binding: Binding
  /** what it has called up and still lives: thornlings, the hanged, bound priests */
  summons: { active: boolean; alive: boolean }[]
  bound: { active: boolean; alive: boolean }[]
}
export const newKit = (hpFrac: number): KitState => ({
  prev: hpFrac, risen: false, pack: { t: KITS.thornmother.pack.every * 0.5 }, binding: newBinding(), summons: [], bound: [],
})
