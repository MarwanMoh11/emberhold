import type { ResourceBag } from '../core/types'

/** Roguelite level-up picks. Applied to the player's live stat block. */
export type UpgradeId =
  | 'rapidFire' | 'heavyShots' | 'magnet' | 'swiftBoots' | 'vitality'
  | 'keenEdge' | 'deepCuts' | 'multishot' | 'pierce' | 'lifesteal'
  | 'longbow' | 'packMule' | 'regen' | 'armor' | 'knockback'
  | 'warlordAura' | 'scavenger' | 'splashShots' | 'quickHands' | 'bulwark'

export interface UpgradeDef {
  id: UpgradeId
  name: string
  desc: string
  colour: number
  /** how many times this pick can be taken */
  maxStacks: number
  /** higher = shows up more often */
  weight: number
  apply: (s: PlayerStats) => void
}

/** Live, mutable copy of the hero's numbers. */
export interface PlayerStats {
  maxHp: number
  damage: number
  attackRate: number
  range: number
  moveSpeed: number
  critChance: number
  critMult: number
  armor: number
  pickupRadius: number
  carryCapacity: number
  lifesteal: number
  knockback: number
  multishot: number
  pierce: number
  regen: number
  splash: number
  /** multiplies resources gained from drops */
  greed: number
  /** multiplies allied damage */
  troopDamage: number
  projectileSpeed: number
}

const U = (
  id: UpgradeId, name: string, desc: string, colour: number,
  maxStacks: number, weight: number, apply: (s: PlayerStats) => void,
): UpgradeDef => ({ id, name, desc, colour, maxStacks, weight, apply })

export const UPGRADES: UpgradeDef[] = [
  U('rapidFire', 'Rapid Fire', '+18% attack speed', 0x8fd0ff, 6, 10, s => { s.attackRate *= 1.18 }),
  U('heavyShots', 'Heavy Shots', '+22% attack damage', 0xff8a5a, 8, 10, s => { s.damage *= 1.22 }),
  U('magnet', 'Lodestone', '+40% pickup radius', 0xffd24a, 4, 8, s => { s.pickupRadius *= 1.4 }),
  U('swiftBoots', 'Swift Boots', '+12% move speed', 0x9ff07a, 4, 8, s => { s.moveSpeed *= 1.12 }),
  U('vitality', 'Vitality', '+50 max health, heal for it', 0x5ce08a, 8, 9, s => { s.maxHp += 50 }),
  U('keenEdge', 'Keen Edge', '+8% critical chance', 0xffc93c, 6, 8, s => { s.critChance += 0.08 }),
  U('deepCuts', 'Deep Cuts', '+45% critical damage', 0xff5a4a, 5, 7, s => { s.critMult += 0.45 }),
  U('multishot', 'Split Shot', '+1 projectile per attack', 0x8fd0ff, 4, 5, s => { s.multishot += 1 }),
  U('pierce', 'Piercing', 'Shots pass through +1 enemy', 0x6ee8ff, 4, 6, s => { s.pierce += 1 }),
  U('lifesteal', 'Bloodbound', 'Heal for 6% of damage dealt', 0xd0453c, 4, 6, s => { s.lifesteal += 0.06 }),
  U('longbow', 'Longbow', '+18% attack range', 0x9ff07a, 4, 6, s => { s.range *= 1.18 }),
  U('packMule', 'Pack Mule', '+60% carry capacity', 0xa4703c, 4, 7, s => { s.carryCapacity = Math.round(s.carryCapacity * 1.6) }),
  U('regen', 'Ironblood', 'Regenerate 3 health per second', 0x5ce08a, 5, 6, s => { s.regen += 3 }),
  U('armor', 'Plating', '+4 armour (flat damage cut)', 0x9aa4ad, 5, 6, s => { s.armor += 4 }),
  U('knockback', 'Concussive', '+70% knockback on hits', 0xd4dbe6, 3, 5, s => { s.knockback *= 1.7 }),
  U('warlordAura', "Warlord's Banner", '+25% damage for all your troops', 0x3f6fd0, 5, 7, s => { s.troopDamage *= 1.25 }),
  U('scavenger', 'Scavenger', '+30% resources from drops', 0xffd24a, 4, 7, s => { s.greed *= 1.3 }),
  U('splashShots', 'Shattering', 'Shots explode for area damage', 0xff9840, 3, 5, s => { s.splash += 46 }),
  U('quickHands', 'Quick Hands', '+15% projectile speed, +8% attack speed', 0x8fd0ff, 3, 5, s => { s.projectileSpeed *= 1.15; s.attackRate *= 1.08 }),
  U('bulwark', 'Bulwark', '+80 max health and +15% troop health', 0x5f6f8c, 3, 5, s => { s.maxHp += 80 }),
]

export const UPGRADE_BY_ID = new Map(UPGRADES.map(u => [u.id, u]))

/**
 * What it costs to unmake every pick you have taken and choose again.
 *
 * Priced per pick undone, not per respec, and it reaches for a rarer material
 * the deeper the rebuild goes — which lines up with where you would be when you
 * needed it. A handful of early picks is paid for in coins and food, both of
 * which the hold already makes. Stone joins once you are past a few. Iron only
 * appears once the rebuild is big enough that Deepvein is already yours, and
 * crystal only for throwing away a whole campaign's worth of choices. The coin
 * term is quadratic so a second thought is cheap and a tenth one is a project.
 */
export const RESPEC_COST: Record<string, (picks: number) => number> = {
  coins: p => 150 * p + 25 * p * p,
  food: p => 50 * p,
  stone: p => (p > 3 ? 40 * (p - 3) : 0),
  metal: p => (p > 8 ? 12 * (p - 8) : 0),
  crystal: p => (p > 16 ? Math.floor((p - 16) / 4) : 0),
}

/** The bill for undoing `picks` picks, with the zero entries left out. */
export function respecCost(picks: number): ResourceBag {
  const n = Math.max(0, Math.floor(picks))
  const out: ResourceBag = {}
  if (n <= 0) return out
  for (const k of Object.keys(RESPEC_COST)) {
    const v = Math.round(RESPEC_COST[k](n))
    if (v > 0) out[k as keyof ResourceBag] = v
  }
  return out
}
