import { AFFIXES, CHAMPION, type AffixDef, type AffixKey } from '../config/champions'

/** What an affix adds to a walker: multiples, and 1 / 0 / null where it adds nothing. */
export interface AffixMods {
  speed: number
  attackRate: number
  leech: number
  taken: number
  tint: number
  patch: NonNullable<AffixDef['patch']> | null
  split: NonNullable<AffixDef['split']> | null
}

const PLAIN: AffixMods = { speed: 1, attackRate: 1, leech: 0, taken: 1, tint: 0xffffff, patch: null, split: null }

/** The stat multiples an affix gives a walker; a plain walker's when `affix` is null. */
export function affixMods(affix: AffixKey | null): AffixMods {
  if (!affix) return PLAIN
  const a = AFFIXES[affix]
  return {
    speed: a.speed ?? 1,
    attackRate: a.attackRate ?? 1,
    leech: a.leech ?? 0,
    taken: a.taken ?? 1,
    tint: a.tint,
    patch: a.patch ?? null,
    split: a.split ?? null,
  }
}

/** The chance that one horde walker comes as a champion on this night; 0 before `firstWave`. */
export function championChance(wave: number): number {
  if (wave < CHAMPION.firstWave) return 0
  return Math.min(CHAMPION.chance.base + CHAMPION.chance.perWave * wave, CHAMPION.chance.max)
}

/** The most champions one night can hold. */
export function championCap(wave: number): number {
  return CHAMPION.cap.base + Math.floor(wave / CHAMPION.cap.every)
}

const AFFIX_KEYS = Object.keys(AFFIXES) as AffixKey[]

/** One affix, picked evenly by `rand` (a value in [0, 1)). */
export function rollAffix(rand: () => number): AffixKey {
  return AFFIX_KEYS[Math.min(AFFIX_KEYS.length - 1, Math.floor(rand() * AFFIX_KEYS.length))]
}
