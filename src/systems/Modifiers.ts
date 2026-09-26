/**
 * Permanent bonuses from shrines (S14) and relics (S15), by stat.
 *
 * A source (a shrine's or relic's id) registers its modifiers once; systems
 * that read a stat ask `value(stat, base)`, which applies every `add`, then
 * every `mult` (a factor: +15% is `mult: 1.15`). Registering the same source
 * again replaces its entries, so loading a save twice never stacks a bonus.
 */

export const MOD_STATS = [
  'food.yield', 'wood.yield', 'trade.income', 'wall.hp', 'hero.xp', 'hero.regen', 'hero.pierce',
  'soldier.hp', 'soldier.damage', 'army.speed', 'rally.cooldown', 'worker.speed', 'worker.gather',
  'infirmary.heal', 'outpost.heal', 'pack.size', 'tower.range',
] as const
export type ModStat = (typeof MOD_STATS)[number]

export interface Mod { stat: ModStat; mult?: number; add?: number }

export class Modifiers {
  private bySource = new Map<string, Mod[]>()
  /** Bumped on every change, so a reader can cache a value until it moves. */
  version = 0

  add(sourceId: string, ...mods: Mod[]) {
    this.bySource.set(sourceId, mods.map(m => ({ ...m })))
    this.version++
  }

  remove(sourceId: string) {
    if (this.bySource.delete(sourceId)) this.version++
  }

  has(sourceId: string) { return this.bySource.has(sourceId) }

  /** `base` plus every `add` on `stat`, times every `mult`. */
  value(stat: ModStat, base: number): number {
    let add = 0, mult = 1
    for (const mods of this.bySource.values()) {
      for (const m of mods) {
        if (m.stat !== stat) continue
        add += m.add ?? 0
        mult *= m.mult ?? 1
      }
    }
    return (base + add) * mult
  }

  /** Every registered modifier, for the harness and the pause page. */
  list(): (Mod & { source: string })[] {
    const out: (Mod & { source: string })[] = []
    for (const [source, mods] of this.bySource) for (const m of mods) out.push({ source, ...m })
    return out
  }
}
