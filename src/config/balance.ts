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
