import type { BuildingKey } from './buildings'
import type { GateId } from './waves'
import { WORLD } from './balance'
import type { ResourceBag } from '../core/types'

const CX = WORLD.centerX
const CY = WORLD.centerY

export interface PadSpec {
  id: string
  key: BuildingKey
  x: number
  y: number
  /** pre-built at this level when the game starts (0 = empty pad) */
  startLevel?: number
  zone: ZoneId
  /** hidden until this many town hall levels */
  requiresTownHall?: number
}

export type ZoneId = 'hold' | 'whisperwood' | 'greyfall' | 'hollow' | 'deepvein' | 'ashgate'

export interface ZoneSpec {
  id: ZoneId
  name: string
  blurb: string
  x: number
  y: number
  w: number
  h: number
  tint: number
  /** cost to unlock (paid by standing on the banner) */
  cost: ResourceBag
  requiresTownHall: number
  /** where the unlock banner stands */
  bannerX: number
  bannerY: number
  startsUnlocked?: boolean
}

export const ZONES: ZoneSpec[] = [
  {
    id: 'hold', name: 'Emberhold', blurb: 'What is left of your outpost.',
    x: CX - 620, y: CY - 560, w: 1240, h: 1120, tint: 0x000000,
    cost: {}, requiresTownHall: 1, bannerX: CX, bannerY: CY, startsUnlocked: true,
  },
  {
    id: 'whisperwood', name: 'Whisperwood', blurb: 'Deep timber. Something moves in it.',
    x: CX - 760, y: CY - 1230, w: 1520, h: 690, tint: 0x14331d,
    cost: { coins: 120 }, requiresTownHall: 1, bannerX: CX, bannerY: CY - 580,
  },
  {
    id: 'greyfall', name: 'Greyfall Scarp', blurb: 'Good stone, bad neighbours.',
    x: CX + 640, y: CY - 520, w: 880, h: 1000, tint: 0x2b2f38,
    cost: { coins: 400, wood: 250 }, requiresTownHall: 2, bannerX: CX + 610, bannerY: CY - 120,
  },
  {
    id: 'hollow', name: 'Hollow Village', blurb: 'Survivors hiding in the ruins.',
    x: CX - 1540, y: CY - 520, w: 900, h: 1000, tint: 0x3a3227,
    cost: { coins: 350, wood: 200 }, requiresTownHall: 2, bannerX: CX - 610, bannerY: CY - 60,
  },
  {
    id: 'deepvein', name: 'Deepvein Seam', blurb: 'Iron enough to armour an army.',
    x: CX + 300, y: CY + 560, w: 1160, h: 800, tint: 0x2a2233,
    cost: { coins: 900, stone: 350 }, requiresTownHall: 3, bannerX: CX + 420, bannerY: CY + 540,
  },
  {
    id: 'ashgate', name: 'Ashgate', blurb: 'Where the horde is coming from.',
    x: CX - 900, y: CY + 600, w: 1100, h: 780, tint: 0x3a1a1a,
    cost: { coins: 1800, stone: 600, metal: 150 }, requiresTownHall: 3, bannerX: CX - 340, bannerY: CY + 590,
  },
]

export const ZONE_BY_ID = new Map(ZONES.map(z => [z.id, z]))

/** Every construction site on the map. Empty pads show a blueprint. */
export const PADS: PadSpec[] = [
  // --- core ring -------------------------------------------------------
  { id: 'hall', key: 'townHall', x: CX, y: CY, startLevel: 1, zone: 'hold' },
  { id: 'depot', key: 'depot', x: CX, y: CY + 172, startLevel: 1, zone: 'hold' },
  { id: 'lumber1', key: 'lumberCamp', x: CX - 210, y: CY - 250, zone: 'hold' },
  { id: 'barracks1', key: 'barracks', x: CX + 226, y: CY - 138, zone: 'hold' },
  { id: 'farm1', key: 'farm', x: CX - 330, y: CY + 96, zone: 'hold' },
  { id: 'warehouse1', key: 'warehouse', x: CX + 214, y: CY + 168, zone: 'hold' },
  { id: 'house1', key: 'house', x: CX - 196, y: CY + 208, zone: 'hold' },
  { id: 'infirm1', key: 'healingTent', x: CX + 40, y: CY - 232, zone: 'hold' },
  { id: 'archery1', key: 'archeryRange', x: CX + 372, y: CY + 24, zone: 'hold', requiresTownHall: 2 },
  { id: 'forge1', key: 'blacksmith', x: CX - 392, y: CY - 78, zone: 'hold', requiresTownHall: 2 },
  { id: 'workshop1', key: 'workshop', x: CX + 356, y: CY + 300, zone: 'hold', requiresTownHall: 2 },
  { id: 'house2', key: 'house', x: CX - 388, y: CY + 268, zone: 'hold', requiresTownHall: 2 },
  { id: 'stable1', key: 'stable', x: CX + 400, y: CY - 268, zone: 'hold', requiresTownHall: 3 },
  { id: 'house3', key: 'house', x: CX + 120, y: CY + 330, zone: 'hold', requiresTownHall: 3 },

  // --- production, out at the resource faces ---------------------------
  { id: 'lumber2', key: 'lumberCamp', x: CX - 160, y: CY - 690, zone: 'whisperwood' },
  { id: 'quarry1', key: 'quarry', x: CX + 780, y: CY - 130, zone: 'greyfall', requiresTownHall: 2 },
  { id: 'farm2', key: 'farm', x: CX - 820, y: CY + 60, zone: 'hollow', requiresTownHall: 2 },
  { id: 'mine1', key: 'mine', x: CX + 620, y: CY + 760, zone: 'deepvein', requiresTownHall: 3 },
  // Set against the Deepvein crystal pocket, one hall level above the seam
  // itself: you claim the ground at Lv.3 and the delve stands there greyed
  // out, telling you exactly what the next rung of the hall is for.
  //
  // Placed well back from the Seam Overseers, not beside them. Anything inside
  // 300px of that warcamp is besieged forever — the crew never stops taking
  // cover, and a delve built there banks nothing at all until the camp burns.
  { id: 'delve1', key: 'crystalDelve', x: CX + 640, y: CY + 1140, zone: 'deepvein', requiresTownHall: 4 },

  // --- defence: towers on the approaches -------------------------------
  { id: 'towerN', key: 'watchtower', x: CX - 90, y: CY - 452, zone: 'hold' },
  { id: 'towerNE', key: 'watchtower', x: CX + 300, y: CY - 400, zone: 'hold' },
  { id: 'towerE', key: 'watchtower', x: CX + 470, y: CY + 140, zone: 'hold' },
  { id: 'towerS', key: 'watchtower', x: CX + 60, y: CY + 452, zone: 'hold' },
  { id: 'towerW', key: 'watchtower', x: CX - 480, y: CY + 70, zone: 'hold' },
  { id: 'towerNW', key: 'watchtower', x: CX - 400, y: CY - 360, zone: 'hold', requiresTownHall: 2 },
  { id: 'bombardN', key: 'cannonTower', x: CX + 120, y: CY - 470, zone: 'hold', requiresTownHall: 2 },
  { id: 'bombardS', key: 'cannonTower', x: CX - 150, y: CY + 466, zone: 'hold', requiresTownHall: 2 },
]

/** The rampart ring. Gates are gaps the horde funnels toward. */
export const WALL_RING = {
  left: CX - 560,
  right: CX + 560,
  top: CY - 520,
  bottom: CY + 520,
  step: 62,
  /** gaps, as fractions along each side */
  gates: [
    { id: 'wallGateN', x: CX, y: CY - 520 },
    { id: 'wallGateS', x: CX, y: CY + 520 },
    { id: 'wallGateE', x: CX + 560, y: CY },
    { id: 'wallGateW', x: CX - 560, y: CY },
  ],
}

export interface SpawnGate {
  id: GateId
  x: number
  y: number
  name: string
}

export const SPAWN_GATES: SpawnGate[] = [
  { id: 'north', x: CX, y: 130, name: 'the north forest' },
  { id: 'east', x: WORLD.width - 130, y: CY - 60, name: 'the east scarp' },
  { id: 'south', x: CX - 260, y: WORLD.height - 130, name: 'the south ruins' },
  { id: 'west', x: 130, y: CY + 90, name: 'the west road' },
  { id: 'northeast', x: WORLD.width - 220, y: 260, name: 'the high pass' },
  { id: 'southwest', x: 220, y: WORLD.height - 250, name: 'the marsh track' },
]

export const GATE_BY_ID = new Map(SPAWN_GATES.map(g => [g.id, g]))

export interface CampSpec {
  id: string
  name: string
  x: number
  y: number
  hp: number
  zone: ZoneId
  /** spawns this enemy every interval while alive */
  spawns: { key: string; every: number; count: number }
  reward: { coins: number; wood?: number; stone?: number; metal?: number; crystal?: number }
}

export const CAMPS: CampSpec[] = [
  {
    id: 'campNorth', name: 'Thornstake Camp', x: CX + 250, y: CY - 900, hp: 1400, zone: 'whisperwood',
    spawns: { key: 'grunt', every: 9, count: 2 },
    reward: { coins: 260, wood: 180 },
  },
  {
    id: 'campWest', name: 'Rotwood Camp', x: CX - 1160, y: CY - 300, hp: 2200, zone: 'hollow',
    spawns: { key: 'runner', every: 8, count: 3 },
    reward: { coins: 420, wood: 200, stone: 120 },
  },
  {
    id: 'campEast', name: 'Scarp Warcamp', x: CX + 1200, y: CY + 200, hp: 3200, zone: 'greyfall',
    spawns: { key: 'archer', every: 10, count: 2 },
    reward: { coins: 700, stone: 300, metal: 80 },
  },
  {
    id: 'campDeep', name: 'Seam Overseers', x: CX + 1020, y: CY + 900, hp: 5200, zone: 'deepvein',
    spawns: { key: 'shield', every: 11, count: 2 },
    reward: { coins: 1300, metal: 260, crystal: 12 },
  },
  {
    id: 'campAshgate', name: 'Ashgate Fortress', x: CX - 420, y: CY + 1080, hp: 9000, zone: 'ashgate',
    spawns: { key: 'brute', every: 12, count: 2 },
    reward: { coins: 3000, metal: 500, crystal: 40 },
  },
]

/** Harvestable clusters. Positions are generated from these descriptors. */
export interface NodeCluster {
  type: 'tree' | 'rock' | 'ore' | 'crystal'
  x: number
  y: number
  radius: number
  count: number
  zone: ZoneId
}

export const NODE_CLUSTERS: NodeCluster[] = [
  // starter timber inside the hold so the first minute has no travel
  { type: 'tree', x: CX - 250, y: CY - 330, radius: 140, count: 13, zone: 'hold' },
  { type: 'tree', x: CX - 430, y: CY - 180, radius: 120, count: 9, zone: 'hold' },
  { type: 'tree', x: CX + 250, y: CY - 300, radius: 120, count: 8, zone: 'hold' },
  // whisperwood proper
  { type: 'tree', x: CX - 180, y: CY - 780, radius: 250, count: 26, zone: 'whisperwood' },
  { type: 'tree', x: CX + 330, y: CY - 700, radius: 220, count: 20, zone: 'whisperwood' },
  { type: 'tree', x: CX - 560, y: CY - 900, radius: 200, count: 16, zone: 'whisperwood' },
  // greyfall stone
  { type: 'rock', x: CX + 840, y: CY - 220, radius: 210, count: 20, zone: 'greyfall' },
  { type: 'rock', x: CX + 1020, y: CY + 200, radius: 190, count: 16, zone: 'greyfall' },
  { type: 'rock', x: CX + 430, y: CY - 430, radius: 120, count: 5, zone: 'hold' },
  // hollow village scrap + timber
  { type: 'tree', x: CX - 900, y: CY + 200, radius: 190, count: 14, zone: 'hollow' },
  { type: 'rock', x: CX - 1180, y: CY + 60, radius: 160, count: 10, zone: 'hollow' },
  // deepvein iron
  { type: 'ore', x: CX + 700, y: CY + 840, radius: 200, count: 18, zone: 'deepvein' },
  { type: 'ore', x: CX + 1060, y: CY + 660, radius: 170, count: 12, zone: 'deepvein' },
  { type: 'crystal', x: CX + 900, y: CY + 1050, radius: 120, count: 5, zone: 'deepvein' },
  // ashgate
  { type: 'ore', x: CX - 700, y: CY + 900, radius: 170, count: 10, zone: 'ashgate' },
  { type: 'crystal', x: CX - 200, y: CY + 1150, radius: 120, count: 6, zone: 'ashgate' },
]

/**
 * Short respawns on purpose: a felled tree is a visual beat, not a lost
 * resource. The forest always grows back before a crew can run it dry.
 */
export const NODE_DEFS = {
  tree: { resource: 'wood' as const, hp: 60, yield: 7, respawn: 7, radius: 20 },
  rock: { resource: 'stone' as const, hp: 90, yield: 6, respawn: 9, radius: 20 },
  ore: { resource: 'metal' as const, hp: 120, yield: 5, respawn: 12, radius: 20 },
  crystal: { resource: 'crystal' as const, hp: 160, yield: 3, respawn: 20, radius: 18 },
}
