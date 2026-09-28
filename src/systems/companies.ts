/**
 * R5: the army in companies, each under an order. Pure data and functions
 * (ArmyManager drives them; tests load this without Phaser).
 *
 * A soldier's company is where it was mustered: the barracks' infantry, the
 * archery range's archers, the outrider camp's riders. Each company defends
 * (a post in the hold by day, tonight's fronts from the warning to dawn),
 * follows the hero, or holds at the banner.
 */
import { SOLDIERS, type SoldierKey } from '../config/units'
import type { BuildingKey } from '../config/buildings'

export type Company = 'infantry' | 'archers' | 'riders'
export type Order = 'defend' | 'follow' | 'hold'

export const COMPANIES: readonly Company[] = ['infantry', 'archers', 'riders']
/** The order `H` steps through, in turn. */
export const ORDERS: readonly Order[] = ['defend', 'follow', 'hold']

/** What the hero calls out when every company takes an order. */
export const ORDER_CALL: Record<Order, string> = {
  defend: 'ARMY DEFENDS THE HOLD',
  follow: 'ARMY FOLLOWS YOU',
  hold: 'ARMY HOLDS HERE',
}

const MUSTER: Partial<Record<BuildingKey, Company>> = { barracks: 'infantry', archeryRange: 'archers', stable: 'riders' }

/** The company a soldier kind belongs to, by the building that musters it. */
export function companyOf(key: SoldierKey): Company {
  return MUSTER[SOLDIERS[key]?.from] ?? 'infantry'
}

/** The order after this one: defend → follow → hold → defend. */
export function nextOrder(o: Order): Order {
  return ORDERS[(ORDERS.indexOf(o) + 1) % ORDERS.length]
}

/** What a soldier forms up on; `follow` moves with the hero every frame, the rest stand between replans. */
export type AnchorKind = 'follow' | 'hold' | 'post' | 'front' | 'respond'
export interface Anchor {
  kind: AnchorKind
  x: number
  y: number
  /** the way the formation faces; its rows stand behind the anchor */
  heading: number
  /** how far a soldier looks for a fight from where it stands */
  engage: number
  /** how far from the anchor it chases one */
  leash: number
}

export function noCompanies(): Record<Company, number> {
  return { infantry: 0, archers: 0, riders: 0 }
}

/** Largest remainder: `total` split by `weights` (which sum to 1), whole numbers that add up. */
function apportion(total: number, weights: number[]): number[] {
  const out = weights.map(w => Math.floor(total * w))
  let given = out.reduce((s, n) => s + n, 0)
  const order = weights.map((w, i) => [i, total * w - out[i]] as const).sort((a, b) => b[1] - a[1] || a[0] - b[0])
  for (let k = 0; given < total && order.length; k = (k + 1) % order.length, given++) out[order[k][0]]++
  return out
}

/**
 * Split each defending company over tonight's fronts by each front's share of
 * the night (a raid is a small front). Every front with a share gets someone
 * when there are soldiers enough; each company spreads over the fronts in
 * proportion; the counts add up; the same input always gives the same split.
 * Keyed by front id, then company.
 */
export function assignFronts(
  counts: Record<Company, number>,
  fronts: readonly { id: string; share: number }[],
): Record<string, Record<Company, number>> {
  const out: Record<string, Record<Company, number>> = {}
  for (const f of fronts) out[f.id] = noCompanies()
  const live = fronts.filter(f => f.share > 0)
  const total = COMPANIES.reduce((s, c) => s + Math.max(0, Math.floor(counts[c] ?? 0)), 0)
  if (!live.length || total <= 0) return out
  const sum = live.reduce((s, f) => s + f.share, 0)
  // each front's head count, then someone on every front if the army stretches that far
  const cap = apportion(total, live.map(f => f.share / sum))
  if (total >= live.length) {
    for (let i = 0; i < cap.length; i++) {
      if (cap[i] > 0) continue
      let most = 0
      for (let j = 1; j < cap.length; j++) if (cap[j] > cap[most]) most = j
      cap[most]--
      cap[i]++
    }
  }
  const heads = cap.slice()
  // each company in proportion to the head counts: every soldier goes where the
  // company is furthest below its fair share, among fronts with room left
  for (const c of COMPANIES) {
    const n = Math.max(0, Math.floor(counts[c] ?? 0))
    for (let k = 0; k < n; k++) {
      let best = -1, gap = -Infinity
      for (let i = 0; i < live.length; i++) {
        if (cap[i] <= 0) continue
        const g = (n * heads[i]) / total - out[live[i].id][c]
        if (g > gap + 1e-9) { best = i; gap = g }
      }
      if (best < 0) break
      out[live[best].id][c]++
      cap[best]--
    }
  }
  return out
}
