import type { EnemyDef, EnemyKey } from './enemies'

/**
 * Champion walkers: from wave 3, a few of each night's horde walkers come with
 * one affix (systems/champions.ts applies them). Tuning lives here only.
 */
export const CHAMPION = {
  /** no champions before this night */
  firstWave: 3,
  /** each horde walker's roll: base + perWave × wave, never above max */
  chance: { base: 0.02, perWave: 0.006, max: 0.08 },
  /** most champions in one night: base + floor(wave / every) */
  cap: { base: 4, every: 4 },
  /** every champion's hp multiple and visual scale (its hit radius stays a walker's) */
  hp: 2.2,
  scale: 1.15,
}

/** what a champion's death pays on top of a walker's coins and drops */
export interface ChampionBounty { coins: number; drops: NonNullable<EnemyDef['drops']> }

export const CHAMPION_BOUNTY: ChampionBounty = {
  coins: 3,
  drops: [{ type: 'crystal', chance: 1, amount: 4 }],
}

export type AffixKey = 'swift' | 'vampiric' | 'molten' | 'warded' | 'splitting'

export interface AffixDef {
  /** the sprite's tint, also the colour of its spawn text */
  tint: number
  /** multiples on the walker's move speed and attack rate */
  speed?: number
  attackRate?: number
  /** the share of the damage it deals that it heals back */
  leech?: number
  /** multiple on every point of damage it takes */
  taken?: number
  /** a burning patch where it dies (the cinder hound's mechanism) */
  patch?: NonNullable<EnemyDef['deathPatch']>
  /** on death, `count` of `key` where it fell */
  split?: { count: number; key: EnemyKey }
}

export const AFFIXES: Record<AffixKey, AffixDef> = {
  swift: { tint: 0x9ff6ff, speed: 1.45, attackRate: 1.25 },
  vampiric: { tint: 0xff9fb0, leech: 0.4 },
  molten: { tint: 0xffc070, patch: { radius: 44, dps: 10, seconds: 4 } },
  warded: { tint: 0xd8ccff, taken: 0.65 },
  splitting: { tint: 0xc8ff9a, split: { count: 2, key: 'grunt' } },
}
