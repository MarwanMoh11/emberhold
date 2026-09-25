import { RESOURCE_ORDER, type ResourceBag, type ResourceType } from '../core/types'
import { STORAGE, PLAYER } from '../config/balance'
import type { Bus } from '../core/Events'
import type { Modifiers } from './Modifiers'

const PLAYER_CARRY_MIN = PLAYER.carryCapacity

const zero = (): Record<ResourceType, number> =>
  ({ coins: 0, wood: 0, food: 0, stone: 0, metal: 0, crystal: 0 })

/**
 * Two pools on purpose:
 *  - `carried` is physically on the hero's back, capped, and is what buildings
 *    eat first. This is what makes hauling feel like a real decision.
 *  - `stored` is the settlement's bank, filled by workers and by dumping at the
 *    Depot. Recruitment and any shortfall on construction draws from it.
 */
export class ResourceManager {
  carried = zero()
  stored = zero()
  totalGathered = zero()

  /**
   * Carry comes from two places that now compose instead of fighting.
   *
   * Both used to feed one setter that took a Math.max, so the hero's own
   * number and the warehouse's flat value were rivals: Pack Mule's +60% on a
   * 120 base lost to a level-1 warehouse's 260 and silently did nothing, and
   * after a second upgrade the first three picks were all dead. The carts give
   * flat space; the hero multiplies the whole load, which is what the pick has
   * always claimed to do.
   */
  buildingCarry = 0
  heroCarryMult = 1
  storageCapacity = STORAGE.base

  /** relics that widen the pack (`pack.size`, S15); set by GameScene */
  mods?: Modifiers

  get carryCapacity(): number {
    const base = (PLAYER_CARRY_MIN + this.buildingCarry) * this.heroCarryMult
    return Math.round(this.mods ? this.mods.value('pack.size', base) : base)
  }

  /** resources the player has seen at least once — drives progressive HUD reveal */
  discovered = new Set<ResourceType>(['coins'])

  constructor(private bus: Bus) {}

  get carriedTotal(): number {
    let t = 0
    for (const k of RESOURCE_ORDER) t += this.carried[k]
    return t
  }

  get storedTotal(): number {
    let t = 0
    for (const k of RESOURCE_ORDER) t += this.stored[k]
    return t
  }

  get carryFree(): number { return Math.max(0, this.carryCapacity - this.carriedTotal) }
  get carryFull(): boolean { return this.carryFree <= 0 }
  /** Stores are uncapped; kept as a method so call sites stay unchanged. */
  get storeFree(): number { return Number.MAX_SAFE_INTEGER }

  /** Total of a resource available across both pools. */
  available(t: ResourceType): number { return this.carried[t] + this.stored[t] }

  /** Pick up from the world. Returns how much actually fit. */
  pickUp(type: ResourceType, amount: number): number {
    // Coins are currency, not cargo. They have no node, no worker and no
    // hauling verb, they rain from every kill, and the pack is one pool shared
    // across all six resources — so incidental loot crowded out the stone you
    // walked across the map for. They bank on contact instead.
    if (type === 'coins') return this.addStored(type, amount)
    const fit = Math.min(amount, this.carryFree)
    if (fit <= 0) {
      this.bus.emit('carry:full', undefined)
      return 0
    }
    this.carried[type] += fit
    this.totalGathered[type] += fit
    this.discovered.add(type)
    this.rateAccum[type] += fit
    this.bus.emit('res:gained', { type, amount: fit })
    this.bus.emit('res:changed', undefined)
    return fit
  }

  /** Worker deliveries and quest rewards go straight to the bank. */
  addStored(type: ResourceType, amount: number, countAsGathered = true): number {
    if (amount <= 0) return 0
    this.stored[type] += amount
    if (countAsGathered) this.totalGathered[type] += amount
    this.discovered.add(type)
    this.rateAccum[type] += amount
    this.bus.emit('res:changed', undefined)
    return amount
  }

  /** Smoothed income per second, per resource — the number that makes a
   *  tycoon loop feel alive. Fed by pickups and worker deliveries alike. */
  private rateAccum: Record<ResourceType, number> = zero()
  private rateWindow = 0
  rate: Record<ResourceType, number> = zero()

  tickRates(dt: number) {
    this.rateWindow += dt
    if (this.rateWindow < 1) return
    for (const k of RESOURCE_ORDER) {
      const perSec = this.rateAccum[k] / this.rateWindow
      // exponential smoothing so the readout does not flicker
      this.rate[k] = this.rate[k] * 0.55 + perSec * 0.45
      this.rateAccum[k] = 0
    }
    this.rateWindow = 0
  }

  /** Debug / reward grant that ignores the storage cap. */
  forceStored(type: ResourceType, amount: number) {
    this.stored[type] += amount
    this.discovered.add(type)
    this.storageCapacity = Math.max(this.storageCapacity, this.storedTotal)
    this.bus.emit('res:changed', undefined)
  }

  grantBag(bag: ResourceBag, toStore = true) {
    for (const k of RESOURCE_ORDER) {
      const v = bag[k]
      if (!v) continue
      if (toStore) this.addStored(k, v)
      else this.pickUp(k, v)
    }
  }

  /** Move everything on the hero's back into the bank. Returns what moved. */
  depositAll(): ResourceBag {
    const moved: ResourceBag = {}
    for (const k of RESOURCE_ORDER) {
      const amt = Math.min(this.carried[k], this.storeFree)
      if (amt <= 0) continue
      this.carried[k] -= amt
      this.stored[k] += amt
      moved[k] = amt
    }
    if (Object.keys(moved).length) this.bus.emit('res:changed', undefined)
    return moved
  }

  canAfford(cost: ResourceBag): boolean {
    for (const k of RESOURCE_ORDER) {
      const need = cost[k] ?? 0
      if (need > 0 && this.available(k) < need) return false
    }
    return true
  }

  /**
   * Spend, taking from the pack first so the player sees their haul drain.
   * Returns per-resource splits so the caller can animate each source.
   */
  spend(cost: ResourceBag): { fromCarried: ResourceBag; fromStored: ResourceBag } | null {
    if (!this.canAfford(cost)) return null
    const fromCarried: ResourceBag = {}
    const fromStored: ResourceBag = {}
    for (const k of RESOURCE_ORDER) {
      let need = cost[k] ?? 0
      if (need <= 0) continue
      const c = Math.min(this.carried[k], need)
      if (c > 0) { this.carried[k] -= c; fromCarried[k] = c; need -= c }
      if (need > 0) { this.stored[k] -= need; fromStored[k] = need }
    }
    this.bus.emit('res:changed', undefined)
    return { fromCarried, fromStored }
  }

  /** Partial payment used by drip-feed construction pads. */
  take(type: ResourceType, amount: number): { carried: number; stored: number } {
    const c = Math.min(this.carried[type], amount)
    this.carried[type] -= c
    const s = Math.min(this.stored[type], amount - c)
    this.stored[type] -= s
    if (c + s > 0) this.bus.emit('res:changed', undefined)
    return { carried: c, stored: s }
  }

  /** Force a HUD refresh after a direct pool edit. */
  bumpChanged() { this.bus.emit('res:changed', undefined) }

  /** Flat space from the settlement's carts. */
  setBuildingCarry(v: number) { this.buildingCarry = Math.max(0, v) }
  /** The hero's own multiplier on the whole load, from Pack Mule picks. */
  setHeroCarryMult(v: number) { this.heroCarryMult = Math.max(1, v) }
  setStorageCapacity(_v: number) { /* stores are uncapped */ }

  toJSON() {
    return {
      carried: this.carried, stored: this.stored, totalGathered: this.totalGathered,
      carryCapacity: this.carryCapacity, storageCapacity: this.storageCapacity,
      discovered: [...this.discovered],
    }
  }

  load(d: ReturnType<ResourceManager['toJSON']>) {
    this.carried = { ...zero(), ...d.carried }
    this.stored = { ...zero(), ...d.stored }
    this.totalGathered = { ...zero(), ...d.totalGathered }
    // Both carry sources are derived, and the loader re-applies the upgrade
    // picks and rebuilds the building bonuses right after this — so they are
    // reset here rather than trusted from the blob.
    this.buildingCarry = 0
    this.heroCarryMult = 1
    this.storageCapacity = STORAGE.base
    this.discovered = new Set(d.discovered as ResourceType[])
    // coins banked straight to stores now; fold any legacy carried ones over
    if (this.carried.coins > 0) {
      this.stored.coins += this.carried.coins
      this.carried.coins = 0
    }
  }
}
