/**
 * The pure arithmetic of the village buildings (S13b, design 05 §New building
 * types). BuildingManager feeds it standing buildings; tests feed it numbers.
 * Nothing here touches Phaser or the scene.
 */
import { VILLAGE } from '../config/balance'

/** A building that lends a bonus to what stands within `reach` of it. */
export interface BonusSource { x: number; y: number; bonus: number; reach: number }

/**
 * 1 + the best bonus among the sources whose reach covers (x, y). Sources
 * never stack: two mills by one farm are worth the better of them.
 */
export function bestBonus(sources: Iterable<BonusSource>, x: number, y: number): number {
  let best = 0
  for (const s of sources) {
    if (s.bonus > best && Math.hypot(s.x - x, s.y - y) <= s.reach) best = s.bonus
  }
  return 1 + best
}

/** Coins a second a market with level rate `sell` earns, given the homes within its reach. */
export function marketRate(sell: number, homes: number): number {
  const m = VILLAGE.market
  return sell * (1 + Math.min(m.homeMax, m.perHome * Math.max(0, homes)))
}

/**
 * The good a market sells its next coin's worth from: the one with more
 * surplus above the floor, or null once neither has a coin's worth left.
 */
export function marketGood(food: number, wood: number): 'food' | 'wood' | null {
  const m = VILLAGE.market
  const f = food - m.floor, w = wood - m.floor
  if (Math.max(f, w) < m.goodsPerCoin) return null
  return f >= w ? 'food' : 'wood'
}

/** The night's reward multiplier from every standing chapel's blessing, capped. */
export function blessingMultiplier(blessings: Iterable<number>): number {
  let sum = 0
  for (const b of blessings) sum += Math.max(0, b)
  return 1 + Math.min(VILLAGE.chapel.blessingMax, sum)
}

/** Whether any point of the polyline `route` comes within `r` of (x, y). */
export function routeNear(route: readonly (readonly [number, number])[], x: number, y: number, r: number): boolean {
  const r2 = r * r
  for (let i = 0; i < route.length; i++) {
    const [ax, ay] = route[i]
    if (i === route.length - 1) return (ax - x) ** 2 + (ay - y) ** 2 <= r2
    const [bx, by] = route[i + 1]
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0
    if ((ax + dx * t - x) ** 2 + (ay + dy * t - y) ** 2 <= r2) return true
  }
  return false
}
