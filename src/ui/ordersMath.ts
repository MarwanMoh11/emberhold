/**
 * R6b: the orders panel's pure parts (tests load this without Phaser): which
 * companies get a row, and what the army button shows.
 */
import { COMPANIES, type Company, type Order } from '../systems/companies'

/** What the army button shows: the order every company shares, or `mixed`. */
export type ArmyLook = Order | 'mixed'

/** The button's glyph for each look: a shield defends, the file follows, the standard holds. */
export const ARMY_ICON: Record<ArmyLook, string> = {
  defend: 'ico_hold',
  follow: 'ico_follow',
  hold: 'ico_banner',
  mixed: 'ico_orders',
}

/**
 * A company gets a row once it has soldiers or its muster building stands,
 * so a new barracks offers its orders before the first recruit walks out.
 */
export function ordersRows(counts: Record<Company, number>, built: Record<Company, boolean>): Company[] {
  return COMPANIES.filter(c => (counts[c] ?? 0) > 0 || !!built[c])
}

/**
 * The shared order of the companies that are there (all of them when none
 * is), or `mixed`. An empty archery range at defend does not make a
 * following army read as mixed.
 */
export function armyLook(orders: Record<Company, Order>, present: readonly Company[] = COMPANIES): ArmyLook {
  const of = present.length ? present : COMPANIES
  const first = orders[of[0]]
  return of.every(c => orders[c] === first) ? first : 'mixed'
}
