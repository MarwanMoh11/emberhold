import type { ResourceType, ResourceBag } from '../core/types'

export type BuildingKey =
  | 'townHall' | 'depot' | 'lumberCamp' | 'farm' | 'quarry' | 'mine'
  | 'barracks' | 'archeryRange' | 'stable' | 'house' | 'warehouse'
  | 'blacksmith' | 'workshop' | 'healingTent'
  | 'watchtower' | 'cannonTower' | 'wall' | 'gate'

export type BuildingCategory = 'core' | 'production' | 'military' | 'support' | 'defense'

export interface BuildingLevel {
  cost: ResourceBag
  hp: number
  /** free-form stats consumed by the relevant system */
  stats?: Record<string, number>
  label?: string
}

export interface BuildingDef {
  key: BuildingKey
  name: string
  short: string
  category: BuildingCategory
  /** collision / footprint half-extents in px */
  w: number
  h: number
  levels: BuildingLevel[]
  /** worker jobs this building supports */
  workerSlots?: number
  gathers?: ResourceType
  /** unlock gate */
  requiresTownHall?: number
  blocking?: boolean
  /** shows up as a tower in the targeting system */
  tower?: boolean
  desc: string
}

const B = (
  key: BuildingKey, name: string, short: string, category: BuildingCategory,
  w: number, h: number, levels: BuildingLevel[], desc: string,
  extra: Partial<BuildingDef> = {},
): BuildingDef => ({ key, name, short, category, w, h, levels, desc, ...extra })

export const BUILDINGS: Record<BuildingKey, BuildingDef> = {
  townHall: B('townHall', 'Command Hall', 'HALL', 'core', 92, 78, [
    { cost: {}, hp: 1400, stats: { pop: 4, unlockTier: 1, prod: 0 }, label: 'Ember Tent' },
    { cost: { coins: 320, wood: 200 }, hp: 2200, stats: { pop: 8, unlockTier: 2, prod: 0.1 }, label: 'Timber Hall' },
    { cost: { coins: 800, wood: 500, stone: 260 }, hp: 3400, stats: { pop: 12, unlockTier: 3, prod: 0.25 }, label: 'Stone Hall' },
    { cost: { coins: 1800, wood: 900, stone: 700, metal: 180 }, hp: 5200, stats: { pop: 18, unlockTier: 4, prod: 0.45 }, label: 'Bastion Hall' },
    { cost: { coins: 4200, stone: 1600, metal: 600, crystal: 40 }, hp: 8000, stats: { pop: 26, unlockTier: 5, prod: 0.7 }, label: 'Citadel' },
  ], 'Heart of the hold. Upgrading unlocks new structures, territory and population.', { blocking: true }),

  // Single level on purpose: the depot is a drop-off, so it must never
  // compete with the player's pack for the resources they just picked up.
  depot: B('depot', 'Supply Depot', 'DEPOT', 'core', 64, 54, [
    { cost: { wood: 20 }, hp: 900, stats: { range: 160 } },
  ], 'Drop carried goods here. Workers deliver their hauls to it.', { blocking: true }),

  lumberCamp: B('lumberCamp', 'Lumber Camp', 'LUMBER', 'production', 62, 52, [
    { cost: { coins: 50 }, hp: 420, stats: { workers: 2, rate: 1 } },
    { cost: { coins: 160, wood: 90 }, hp: 640, stats: { workers: 3, rate: 1.35 } },
    { cost: { coins: 420, wood: 260, stone: 80 }, hp: 900, stats: { workers: 5, rate: 1.8 } },
    { cost: { coins: 1000, wood: 600, stone: 260, metal: 60 }, hp: 1300, stats: { workers: 7, rate: 2.4 } },
  ], 'Lumberjacks fell nearby trees and stack the timber here.',
    { workerSlots: 2, gathers: 'wood', blocking: true }),

  farm: B('farm', 'Homestead Farm', 'FARM', 'production', 70, 58, [
    { cost: { wood: 100, coins: 75 }, hp: 420, stats: { workers: 2, rate: 1 } },
    { cost: { coins: 240, wood: 200 }, hp: 640, stats: { workers: 3, rate: 1.4 } },
    { cost: { coins: 560, wood: 420, stone: 140 }, hp: 900, stats: { workers: 5, rate: 1.9 } },
    { cost: { coins: 1200, wood: 800, stone: 320, metal: 80 }, hp: 1300, stats: { workers: 7, rate: 2.5 } },
  ], 'Farmers grow grain. Food recruits soldiers and sustains the hold.',
    { workerSlots: 2, gathers: 'food', requiresTownHall: 1, blocking: true }),

  quarry: B('quarry', 'Stone Quarry', 'QUARRY', 'production', 68, 56, [
    { cost: { coins: 300, wood: 220 }, hp: 520, stats: { workers: 2, rate: 1 } },
    { cost: { coins: 650, wood: 400, stone: 150 }, hp: 780, stats: { workers: 4, rate: 1.45 } },
    { cost: { coins: 1400, wood: 700, stone: 450, metal: 90 }, hp: 1150, stats: { workers: 6, rate: 2 } },
  ], 'Cutters split stone from the valley face for heavy fortifications.',
    { workerSlots: 2, gathers: 'stone', requiresTownHall: 2, blocking: true }),

  mine: B('mine', 'Iron Mine', 'MINE', 'production', 68, 56, [
    { cost: { coins: 700, wood: 400, stone: 300 }, hp: 620, stats: { workers: 2, rate: 1 } },
    { cost: { coins: 1500, stone: 600, metal: 120 }, hp: 900, stats: { workers: 4, rate: 1.5 } },
    { cost: { coins: 3000, stone: 1100, metal: 400 }, hp: 1300, stats: { workers: 6, rate: 2.1 } },
  ], 'Miners draw iron from the deep seams. Metal buys the finest gear.',
    { workerSlots: 2, gathers: 'metal', requiresTownHall: 3, blocking: true }),

  barracks: B('barracks', 'Barracks', 'BARRACKS', 'military', 76, 62, [
    { cost: { coins: 100, wood: 50 }, hp: 700, stats: { unit: 0, rally: 4, trainMult: 1 } },
    { cost: { coins: 300, wood: 200, stone: 80 }, hp: 1000, stats: { unit: 0, rally: 7, trainMult: 1.25 } },
    { cost: { coins: 800, wood: 450, stone: 260, metal: 60 }, hp: 1500, stats: { unit: 0, rally: 11, trainMult: 1.6 } },
  ], 'Trains swordsmen. Walk in with food and coin to muster troops.', { blocking: true }),

  archeryRange: B('archeryRange', 'Archery Range', 'ARCHERY', 'military', 78, 60, [
    { cost: { coins: 260, wood: 220 }, hp: 620, stats: { rally: 4, trainMult: 1 } },
    { cost: { coins: 620, wood: 420, stone: 160 }, hp: 900, stats: { rally: 7, trainMult: 1.3 } },
    { cost: { coins: 1400, wood: 800, stone: 400, metal: 100 }, hp: 1300, stats: { rally: 10, trainMult: 1.7 } },
  ], 'Trains archers who shoot over your shield line.',
    { requiresTownHall: 2, blocking: true }),

  stable: B('stable', 'Outrider Camp', 'OUTRIDER', 'military', 80, 64, [
    { cost: { coins: 900, wood: 500, food: 200 }, hp: 800, stats: { rally: 3, trainMult: 1 } },
    { cost: { coins: 2000, stone: 500, metal: 180 }, hp: 1200, stats: { rally: 5, trainMult: 1.4 } },
  ], 'Trains fast outriders that punch through the horde flanks.',
    { requiresTownHall: 3, blocking: true }),

  house: B('house', 'Longhouse', 'HOUSE', 'support', 58, 50, [
    { cost: { wood: 100, food: 50 }, hp: 400, stats: { pop: 6 } },
    { cost: { coins: 300, wood: 260, stone: 100 }, hp: 620, stats: { pop: 11 } },
    { cost: { coins: 700, wood: 500, stone: 300 }, hp: 900, stats: { pop: 17 } },
  ], 'Shelters survivors. Raises the population cap for workers and troops.',
    { requiresTownHall: 1, blocking: true }),

  warehouse: B('warehouse', 'Warehouse', 'STORE', 'support', 74, 58, [
    { cost: { coins: 140, wood: 120 }, hp: 560, stats: { prod: 0.15, carry: 260 } },
    { cost: { coins: 500, wood: 380, stone: 160 }, hp: 820, stats: { prod: 0.35, carry: 520 } },
    { cost: { coins: 1200, wood: 700, stone: 420, metal: 90 }, hp: 1200, stats: { prod: 0.6, carry: 1100 } },
    { cost: { coins: 2800, stone: 900, metal: 320 }, hp: 1700, stats: { prod: 0.95, carry: 2400 } },
    { cost: { coins: 6000, stone: 1800, metal: 800, crystal: 30 }, hp: 2400, stats: { prod: 1.5, carry: 6000 } },
  ], 'Carts, cranes and a bigger pack. Every crew works faster and you haul far more.',
    { requiresTownHall: 1, blocking: true }),

  blacksmith: B('blacksmith', 'Blacksmith', 'FORGE', 'support', 70, 58, [
    { cost: { coins: 200, stone: 150 }, hp: 700, stats: { heroDmg: 0.15, troopDmg: 0.15 } },
    { cost: { coins: 600, stone: 380, metal: 80 }, hp: 1000, stats: { heroDmg: 0.32, troopDmg: 0.32 } },
    { cost: { coins: 1500, stone: 800, metal: 280 }, hp: 1450, stats: { heroDmg: 0.55, troopDmg: 0.55 } },
    { cost: { coins: 3600, metal: 700, crystal: 20 }, hp: 2000, stats: { heroDmg: 0.85, troopDmg: 0.85 } },
  ], 'Sharpens every blade in the hold. Raises hero and soldier damage.',
    { requiresTownHall: 2, blocking: true }),

  workshop: B('workshop', 'Siege Workshop', 'WORKSHOP', 'support', 74, 60, [
    { cost: { coins: 400, wood: 350, stone: 180 }, hp: 760, stats: { towerDmg: 0.2, towerRate: 0.1, repair: 1 } },
    { cost: { coins: 1000, wood: 600, stone: 420, metal: 120 }, hp: 1100, stats: { towerDmg: 0.45, towerRate: 0.22, repair: 2 } },
    { cost: { coins: 2400, stone: 900, metal: 400 }, hp: 1600, stats: { towerDmg: 0.8, towerRate: 0.36, repair: 3 } },
  ], 'Engineers tune the towers and send crews to patch the walls.',
    { requiresTownHall: 2, blocking: true }),

  healingTent: B('healingTent', 'Field Infirmary', 'INFIRM', 'support', 62, 52, [
    { cost: { coins: 180, wood: 140, food: 80 }, hp: 480, stats: { heal: 9, radius: 210 } },
    { cost: { coins: 500, wood: 300, food: 200 }, hp: 720, stats: { heal: 18, radius: 260 } },
    { cost: { coins: 1200, stone: 400, food: 400 }, hp: 1050, stats: { heal: 32, radius: 320 } },
  ], 'Mends you and any troops standing in its light.',
    { requiresTownHall: 1, blocking: true }),

  watchtower: B('watchtower', 'Watchtower', 'TOWER', 'defense', 46, 46, [
    { cost: { wood: 150, coins: 100 }, hp: 600, stats: { dmg: 12, rate: 1, range: 250, splash: 0 } },
    { cost: { coins: 260, wood: 240, stone: 90 }, hp: 900, stats: { dmg: 22, rate: 1.1, range: 275, splash: 0 } },
    { cost: { coins: 600, wood: 420, stone: 240 }, hp: 1250, stats: { dmg: 34, rate: 1.5, range: 300, splash: 0 } },
    { cost: { coins: 1400, stone: 600, metal: 160 }, hp: 1700, stats: { dmg: 52, rate: 1.7, range: 330, splash: 62 } },
    { cost: { coins: 3200, stone: 1200, metal: 480, crystal: 15 }, hp: 2400, stats: { dmg: 86, rate: 2.1, range: 370, splash: 84 } },
  ], 'Looses arrows at anything that comes close.', { tower: true, blocking: true }),

  cannonTower: B('cannonTower', 'Bombard', 'BOMBARD', 'defense', 52, 52, [
    { cost: { coins: 600, stone: 400, wood: 200 }, hp: 900, stats: { dmg: 70, rate: 0.5, range: 290, splash: 110 } },
    { cost: { coins: 1400, stone: 700, metal: 180 }, hp: 1350, stats: { dmg: 120, rate: 0.6, range: 320, splash: 130 } },
    { cost: { coins: 3200, stone: 1400, metal: 520, crystal: 20 }, hp: 2000, stats: { dmg: 210, rate: 0.75, range: 355, splash: 160 } },
  ], 'Slow, heavy shells that tear holes in packed hordes.',
    { tower: true, requiresTownHall: 2, blocking: true }),

  wall: B('wall', 'Rampart', 'WALL', 'defense', 60, 28, [
    { cost: { wood: 60 }, hp: 700, stats: {} },
    { cost: { stone: 100, wood: 50 }, hp: 1800, stats: {} },
    { cost: { stone: 300, metal: 70 }, hp: 3800, stats: {} },
  ], 'Holds the line so your soldiers can work.', { blocking: true }),

  gate: B('gate', 'Gatehouse', 'GATE', 'defense', 64, 34, [
    { cost: { wood: 140, coins: 80 }, hp: 1100, stats: {} },
    { cost: { stone: 260, wood: 120 }, hp: 2600, stats: {} },
    { cost: { stone: 620, metal: 140 }, hp: 5000, stats: {} },
  ], 'A reinforced way through your own wall.', { blocking: true }),
}

export const costToString = (c: ResourceBag) =>
  (Object.keys(c) as ResourceType[]).map(k => `${c[k]} ${k}`).join('  ')
