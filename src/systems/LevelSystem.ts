import { UPGRADES, UPGRADE_BY_ID, type UpgradeDef, type UpgradeId } from '../config/upgrades'
import { rnd } from '../core/math'
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
