import { UPGRADES, UPGRADE_BY_ID, respecCost, type UpgradeDef, type UpgradeId } from '../config/upgrades'
import { freshStats } from '../entities/Player'
import { rnd } from '../core/math'
import type { ResourceBag } from '../core/types'
import type { GameScene } from '../scenes/GameScene'

/**
 * Roguelite picks on level-up. Weighted, stack-capped, and never offers three
 * of the same flavour so the choice always feels like a real decision.
 */
export class LevelSystem {
  taken = new Map<UpgradeId, number>()
  pending = 0

  constructor(private scene: GameScene) {}

  stacks(id: UpgradeId) { return this.taken.get(id) ?? 0 }

  private pool(): UpgradeDef[] {
    return UPGRADES.filter(u => this.stacks(u.id) < u.maxStacks)
  }

  roll(count = 3): UpgradeDef[] {
    const pool = this.pool()
    const out: UpgradeDef[] = []
    const weights = pool.map(u => u.weight * (1 - this.stacks(u.id) / (u.maxStacks + 1)))
    let total = weights.reduce((a, b) => a + b, 0)
    const used = new Set<number>()
    for (let n = 0; n < count && used.size < pool.length; n++) {
      let r = rnd() * total
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue
        r -= weights[i]
        if (r <= 0) {
          used.add(i)
          out.push(pool[i])
          total -= weights[i]
          break
        }
      }
      if (out.length <= n) {
        // numeric drift fallback
        for (let i = 0; i < pool.length; i++) {
          if (!used.has(i)) { used.add(i); out.push(pool[i]); total -= weights[i]; break }
        }
      }
    }
    return out
  }

  apply(id: UpgradeId) {
    const def = UPGRADE_BY_ID.get(id)
    if (!def) return
    def.apply(this.scene.player.stats)
    this.taken.set(id, this.stacks(id) + 1)
    this.scene.player.syncStats()
    this.scene.abilities.refreshUnlocks()
    this.scene.audio.play('levelup')
  }

  /** Every stack of every pick — what a respec unmakes, and what it bills for. */
  get pickCount() {
    let n = 0
    for (const v of this.taken.values()) n += v
    return n
  }

  respecCost(): ResourceBag { return respecCost(this.pickCount) }

  canRespec() { return this.pickCount > 0 && this.scene.res.canAfford(this.respecCost()) }

  /**
   * Unmake every pick and hand the choices straight back.
   *
   * A save spans weeks, the picks stack up to eight deep and they are permanent,
   * so an early run of bad calls used to be a wall you could never climb back
   * over. This wipes the stat block back to the hero's base numbers and queues
   * one level-up card per pick refunded, so nothing is lost but the bill —
   * levels, abilities and the settlement are untouched.
   */
  respec(): number {
    const picks = this.pickCount
    if (picks <= 0) return 0
    if (!this.scene.res.spend(this.respecCost())) return 0

    this.taken.clear()
    const p = this.scene.player
    // Mutated in place rather than replaced: other systems hold this object.
    Object.assign(p.stats, freshStats())
    p.syncStats()
    // syncStats only ever heals upward, and max health just fell.
    p.hp = Math.min(p.hp, p.maxHp)
    this.scene.abilities.refreshUnlocks()
    this.scene.audio.play('levelup')
    for (let i = 0; i < picks; i++) this.scene.events.emit('offerUpgrades')
    return picks
  }

  toJSON() { return [...this.taken.entries()] }

  load(d: [UpgradeId, number][]) {
    this.taken = new Map(d)
    // replay picks onto the fresh stat block
    for (const [id, n] of d) {
      const def = UPGRADE_BY_ID.get(id)
      if (!def) continue
      for (let i = 0; i < n; i++) def.apply(this.scene.player.stats)
    }
    this.scene.player.syncStats()
  }
}
