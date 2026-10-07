import { HERO_PERK } from '../config/upgrades'

/**
 * The math behind the six fight-changing level-up picks. Pure on purpose: no
 * Phaser, so it can be tested from node. Each rule takes the pick's rank, which
 * is 0 (or missing) when the pick is not taken, and then does nothing.
 */

/** Chain Spark: how far an arc reaches from the foe that was hit, in px. */
export const CHAIN_RANGE = HERO_PERK.chainRange

/** Thornmail: what a melee foe takes back for a blow that landed on the hero. */
export const thornsDamage = (dealt: number, rank: number) =>
  rank > 0 && dealt > 0 ? dealt * HERO_PERK.thornsShare * rank : 0

/** Executioner: the hero's damage multiplier against a foe at this hp fraction. */
export const executeMult = (hpFrac: number, rank: number) =>
  rank > 0 && hpFrac < HERO_PERK.executeBelow ? 1 + HERO_PERK.executePerRank * rank : 1

/** Chain Spark: the chance that one hit arcs. */
export const chainChance = (rank: number) =>
  rank > 0 ? Math.min(1, HERO_PERK.chancePerRank * rank) : 0

/** Chain Spark: the damage an arc carries, from the hit that threw it. */
export const chainDamage = (hit: number) => hit * HERO_PERK.chainShare

/** Bounty Hunter: the coin multiplier for a kill. Only foes with a health bar count. */
export const bountyMult = (hasHealthBar: boolean, rank: number) =>
  hasHealthBar && rank > 0 ? 1 + HERO_PERK.bountyPerRank * rank : 1

/** Adrenaline: attack-speed and move-speed multipliers at this hp fraction. */
export function adrenalineMults(hpFrac: number, rank: number): { attack: number; move: number } {
  if (!(rank > 0) || !(hpFrac < HERO_PERK.adrenalineBelow)) return { attack: 1, move: 1 }
  return {
    attack: 1 + HERO_PERK.adrenalineAttackPerRank * rank,
    move: 1 + HERO_PERK.adrenalineMovePerRank * rank,
  }
}

/** Last Stand: the hp a fatal blow leaves the hero with. */
export const lastStandHp = (maxHp: number) => Math.max(1, Math.round(maxHp * HERO_PERK.lastStandHp))
