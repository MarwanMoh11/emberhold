import type { BuildingKey } from '../config/buildings'
import type { Biome } from '../config/world'
import { hash32 } from '../world/noise'

/**
 * A settled country's look (S13b C4): what a building is made of in its
 * region, and the small seeded differences that stop a row of cottages looking
 * stamped. Pure: no Phaser, no canvas. The painters read the result through
 * `ensureBuildingTexture`, and `BuildingLooks` lays the yards.
 */

export type Style = 'timber' | 'woodland' | 'fen' | 'stone' | 'ash'

/** Materials and roofs by biome ([05 §Regional styles](../../docs/world/design/05-content.md#regional-styles)). */
export const STYLE_BY_BIOME: Record<Biome, Style> = {
  rise: 'timber', meadow: 'timber', village: 'timber', farmland: 'timber',
  forest: 'woodland', oldgrowth: 'woodland',
  marsh: 'fen', moor: 'fen',
  scarp: 'stone', highland: 'stone', rust: 'stone',
  sulphur: 'ash', badlands: 'ash', deeprock: 'ash', ash: 'ash', obsidian: 'ash', slag: 'ash',
}

/**
 * The buildings that wear their region's style. The hold's core, military and
 * defence buildings, walls, gates and outposts keep one look everywhere, so
 * they always read at a glance; so do the pits and delves, whose look is the rock.
 */
export const STYLED: ReadonlySet<BuildingKey> = new Set<BuildingKey>([
  'cottage', 'house', 'granary', 'market', 'chapel', 'mill', 'docks',
  'farm', 'lumberCamp', 'fishery', 'tradingPost',
])

/** Dwellings and civic buildings: a roof tone, one of the style's three, per pad. */
export const TONED: ReadonlySet<BuildingKey> = new Set<BuildingKey>(['cottage', 'house', 'granary', 'market', 'chapel'])

/** How far a mill looks for river water to turn a wheel instead of sails, px. */
export const MILL_WHEEL_REACH = 200

/** One texture's worth of look: the style, the roof tone, and the two special cases. */
export interface Look {
  style: Style
  tone: number
  /** a mill by the river turns a waterwheel */
  wheel: boolean
  /** highland roofs carry snow */
  snow: boolean
}

export const BASE_LOOK: Look = Object.freeze({ style: 'timber', tone: 0, wheel: false, snow: false }) as Look

export const isBaseLook = (l: Look): boolean => l.style === 'timber' && l.tone === 0 && !l.wheel && !l.snow

/** A stable integer from a pad id, then `hash32` for each question asked of it. */
export function padSeed(id: string, salt = 0): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return hash32(h, salt, 5113)
}

/** The look a pad's building wears: its region's style, and a seeded roof tone for dwellings and civic buildings. */
export function lookFor(key: BuildingKey, padId: string, biome: Biome, nearWater = false): Look {
  if (!STYLED.has(key)) return BASE_LOOK
  return {
    style: STYLE_BY_BIOME[biome],
    tone: TONED.has(key) ? padSeed(padId, 1) % 3 : 0,
    wheel: key === 'mill' && nearWater,
    snow: biome === 'highland',
  }
}

/** `timber1`, `fen0w`, `stone2s`: the look's part of a texture key. */
export const lookId = (l: Look): string => `${l.style}${l.tone}${l.wheel ? 'w' : ''}${l.snow ? 's' : ''}`

/** A building's texture for a level and look; the base look is the boot texture `bld_${key}_${lvl}`. */
export function variantTextureKey(key: BuildingKey, lvl: number, look: Look): string {
  return isBaseLook(look) ? `bld_${key}_${lvl}` : `bld_${key}_${lvl}_${lookId(look)}`
}

/** A regional variant's texture key (not the boot set, whose wall pieces also run to four parts). */
export const isVariantKey = (tex: string): boolean => /^bld_\w+?_\d+_(timber|woodland|fen|stone|ash)\d+w?s?$/.test(tex)

/**
 * Most `bld_` textures a game holds at once (05 §Per-instance variation). The
 * boot set is about 96; variants are baked lazily, released when no pad shows
 * them, and past the cap a pad falls back to its style's first tone, then to
 * the base.
 */
export const BLD_TEXTURE_CAP = 160

// ---- yards ---------------------------------------------------------------------------

export type YardProp = 'woodpile' | 'cart' | 'barrels' | 'laundry' | 'beehives' | 'herbs' | 'well' | 'hayrick'
export const YARD_PROPS: readonly YardProp[] = ['woodpile', 'cart', 'barrels', 'laundry', 'beehives', 'herbs', 'well', 'hayrick']
/** Workyards keep to the working props. */
const WORK_PROPS: readonly YardProp[] = ['woodpile', 'cart', 'barrels', 'hayrick']

/** Everything that is not the hold's core, military, defence or a wall gets a yard. */
const NO_YARD: ReadonlySet<BuildingKey> = new Set<BuildingKey>([
  'townHall', 'depot', 'barracks', 'archeryRange', 'stable',
  'watchtower', 'cannonTower', 'wall', 'gate', 'watchPost',
])
const WORKYARDS: ReadonlySet<BuildingKey> = new Set<BuildingKey>([
  'farm', 'lumberCamp', 'quarry', 'mine', 'crystalDelve', 'fishery', 'mill', 'docks', 'tradingPost', 'warehouse', 'workshop', 'blacksmith',
])

export interface Yard {
  /** 1–2 props, the first by the front corner, the second further back */
  props: YardProp[]
  /** the yard lies on the building's left (true) or right; the road can overrule it */
  mirror: boolean
}

/** A pad's yard: 1–2 props from about eight, and which side they stand, seeded by the pad id. */
export function yardFor(key: BuildingKey, padId: string): Yard | null {
  if (NO_YARD.has(key)) return null
  const pool = WORKYARDS.has(key) ? WORK_PROPS : YARD_PROPS
  const h = padSeed(padId, 2)
  const a = h % pool.length
  const props: YardProp[] = [pool[a]]
  if ((h >>> 8) & 1) props.push(pool[(a + 1 + ((h >>> 10) % (pool.length - 1))) % pool.length])
  return { props, mirror: ((h >>> 16) & 1) === 1 }
}

/** A yard's shape for counting layouts: which props, and which side. */
export const yardLayout = (y: Yard): string => `${y.props.join('+')}:${y.mirror ? 'L' : 'R'}`
