/** Global tuning. Nothing gameplay-critical should be hardcoded outside config/. */

export const PLAYER = {
  maxHp: 200,
  damage: 20,
  attackRate: 1.5,        // attacks / second
  range: 190,
  moveSpeed: 210,
  critChance: 0.08,
  critMult: 2.0,
  armor: 0,
  pickupRadius: 92,
  carryCapacity: 120,
  projectileSpeed: 620,
  respawnSeconds: 3,
  respawnShieldSeconds: 2.2,
  lifesteal: 0,
  knockback: 90,
  multishot: 1,
  pierce: 0,
  regen: 0,               // hp / second
  dodgeSpeed: 660,
  dodgeSeconds: 0.2,
  dodgeCooldown: 3.5,
}

/** Hero visual tiers unlock at these levels. */
export const HERO_TIERS = [1, 5, 11, 18]

export const XP = {
  /** XP needed to go from level n to n+1. */
  toNext: (level: number) => Math.round(14 * Math.pow(level, 1.42) + 10),
  orbValue: 1,
  magnetSpeed: 620,
}

export const CARRY = {
  /** Upgrade ladder for carry capacity, bought at the Warehouse. */
  tiers: [120, 260, 520, 1100, 2400, 6000],
}

export const PICKUP = {
  magnetAccel: 2200,
  maxMagnetSpeed: 1000,
  bounceTime: 0.34,
  lifetime: 60,
  maxActive: 900,
}

export const COMBAT = {
  floatingTextMax: 90,
  hitFlashMs: 110,
  knockbackDecay: 7.5,
  corpseFadeMs: 420,
}

export const CAMERA = {
  lerp: 0.09,
  lookAhead: 0.22,
  baseZoom: 1,
  minZoom: 0.62,
  /** zoom pulls out as this many enemies are alive */
  zoomOutAt: 90,
}

export const DAYNIGHT = {
  /**
   * Day length is `dayBase + dayPerRegion × claimed regions` (the hold not
   * counted), capped at `dayMax`: see `dayLength`. Open decision, tuned in S20.
   */
  dayBase: 60,
  dayPerRegion: 10,
  dayMax: 180,
  /** the fight window: it starts on the first arrival on claimed ground, or `marchMax` after dusk */
  nightSeconds: 34,
  marchMax: 25,
  warningSeconds: 8,
}

/** Seconds of day, given how many regions beyond the hold are claimed. */
export function dayLength(claimedRegions: number): number {
  return Math.min(DAYNIGHT.dayMax, DAYNIGHT.dayBase + DAYNIGHT.dayPerRegion * Math.max(0, claimedRegions))
}

/**
 * Outposts and waystones (S11, design 04). `heal` is the Lv.2 aura's base
 * (hp per second to allies within `healRadius`, only while no enemy is within
 * `calmRadius`); S14's Kettle Springs shrine makes it modifiable.
 */
export const OUTPOST = {
  heal: 5,
  healRadius: 220,
  calmRadius: 420,
  /** fog cleared round a built outpost */
  light: 600,
  /** respawn: no enemy this near, and not burning (hit in the last few seconds) */
  safeRadius: 600,
  /** where the stone stands, from the outpost's pad point (the painted stone) */
  stoneDx: 44,
  stoneDy: 8,
}

export const WAYSTONE = {
  /** stand this near a stone to activate it or open the travel list */
  touch: 56,
  /** seconds of channel; damage interrupts it */
  channel: 1.2,
  /** soldiers this near come along */
  escort: 500,
  /** the stone that works at night too */
  hallStone: 'wsHall',
}

/**
 * Points of interest (S14, design 05 §Points of interest). Loot and effects
 * are first-pass; S20 tunes them.
 */
export const POI = {
  /** a POI is seen once fog is cleared within this of it (the brush is ~480 px) */
  seeR: 420,
  /** landmarks stand tall: seen from this far off, fog or not */
  landmarkSeeR: 1300,
  /** stand this near a POI to interact */
  touch: 50,
  /** landmarks count as visited from their foot */
  landmarkTouch: 220,
  /** seconds on a lore stone before its line shows */
  loreDwell: 1,
  /** seconds the lore page stays up */
  loreShow: 5.5,
  /** show a shrine's or survivors' card within this */
  cardRange: 280,
  /** a cache's loot: `base` × (1 + `perTier` × region tier); metal from tier 2, crystal from tier 4 */
  cache: { perTier: 0.75, coins: 140, wood: 70, stone: 45, metal: 20, crystal: 4 },
  /** how the coast is lit when the Saltmere Light is restored: one reveal per `step` px of shore */
  coastStep: 256,
}

/**
 * Village buildings (S13b, design 05 §New building types): what does not
 * change with a building's level. Per-level numbers are the defs' stats in
 * config/buildings.ts. First pass; S20 tunes them.
 */
export const VILLAGE = {
  /**
   * Population from every cottage together, at most. Open question to the
   * human (2026-09-25); the design's default is no cap. A number here caps it.
   */
  cottagePopMax: Infinity,
  market: {
    /**
     * Whether markets sell surplus for coins at all. Open question to the
     * human (2026-09-25); the design's default is yes. `false` idles them.
     */
    sells: true,
    /** food and wood are sold only above this much of each in store */
    floor: 300,
    /** goods sold for each coin earned */
    goodsPerCoin: 3,
    /** +this per cottage or longhouse within `homeRadius`, at most `homeMax` */
    perHome: 0.05,
    homeMax: 0.5,
    homeRadius: 600,
  },
  /** every chapel's `blessing` on the night's reward together, at most */
  chapel: { blessingMax: 0.5 },
  /** seconds earlier tonight's warning comes when a route passes within a post's light */
  watchPost: { warnEarly: 4 },
  /** worker slots docks lend each fishery within `slotRadius` (docks don't stack) */
  docks: { slots: 1, slotRadius: 800 },
}

export const POP = {
  base: 8,
  perHouse: 6,
  perTownHallLevel: 4,
}

/**
 * Stores are uncapped on purpose. A shared cap meant a flood of food could
 * freeze the wood counter while lumberjacks kept chopping, which reads as
 * "my workers do nothing". Numbers must always climb; the Warehouse sells
 * production speed and pack size instead of permission to keep what you earn.
 */
export const STORAGE = {
  base: Number.MAX_SAFE_INTEGER,
}

export const PERF = {
  /**
   * Desktop ceiling. The live cap comes from core/device, which trims it on
   * a phone; this stays as the shape of the budget the design was tuned for.
   */
  maxEnemies: 420,
  maxProjectiles: 400,
  separationNeighbours: 6,
  retargetFrames: 14,
  gridCell: 72,
}
