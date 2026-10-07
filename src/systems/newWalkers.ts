import type { EnemyKey } from '../config/enemies'

/**
 * The pure rules of the hexcaller and the ashen shade, kept out of the managers
 * so they can be tested without Phaser: where a blink lands, where a summoner's
 * ring stands and how many of its walkers may live, and the night each walker
 * first joins the deck.
 */

export interface Pt { x: number; y: number }

/** A blink stops this far short of its target, never on top of it (a melee reach). */
export const BLINK_STANDOFF = 30
/** A summoner's walkers appear on a ring this far from it. */
export const SUMMON_RADIUS = 46

/**
 * Where a blink lands: `range` px from `from` toward `to`, cut short so it stops
 * `BLINK_STANDOFF` before the target. Null when the target is not more than
 * `minDist` away, or when the landing spot is not open ground.
 */
export function blinkTarget(
  from: Pt, to: Pt, rule: { range: number; minDist: number }, open: (x: number, y: number) => boolean,
): Pt | null {
  const dx = to.x - from.x, dy = to.y - from.y
  const d = Math.hypot(dx, dy)
  if (d <= rule.minDist) return null
  const step = Math.min(rule.range, d - BLINK_STANDOFF)
  if (step <= 0) return null
  const x = from.x + (dx * step) / d, y = from.y + (dy * step) / d
  return open(x, y) ? { x, y } : null
}

/** `n` points evenly spaced on a ring of radius `r` round (cx, cy), the first at angle `phase`. */
export function summonRing(cx: number, cy: number, n: number, r: number, phase = 0): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * Math.PI * 2
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
  })
}

/** How many more walkers a summoner may raise now: its `count`, cut to the room its `cap` leaves. */
export const summonRoom = (living: number, count: number, cap: number): number =>
  Math.max(0, Math.min(count, cap - living))

/** The night each walker first joins the deck. Anything not listed is in from night 1. */
export const DECK_FROM: Partial<Record<EnemyKey, number>> = { shade: 6, hexcaller: 8 }

export const inDeck = (key: EnemyKey, night: number): boolean => night >= (DECK_FROM[key] ?? 1)
