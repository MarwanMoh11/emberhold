/**
 * The world seam: everything the game reads about the map, derived from the
 * blueprint. The blueprint is the layout's single source of truth; this module
 * only reshapes it into the forms the systems already speak (pads, camps,
 * node clusters, the rampart ring) and memoises the raster.
 *
 * Replaces src/config/map.ts (S04). Nothing here should hold a coordinate of
 * its own except the temporary night gates, which S09's approaches replace.
 */
import type { BuildingKey } from '../buildings'
import type { GateId } from '../waves'
import type { ResourceBag } from '../../core/types'
import { rasterise, type WorldRaster } from '../../world/raster'
import * as BP from './blueprint'
import type { RegionBP, RegionId, WallLineBP } from './blueprint'

export type { RegionId, Biome } from './blueprint'

/** World size in px. `centerX/centerY` are the map's middle, not the hold: use HALL for home. */
export const WORLD = {
  width: BP.WORLD2.width,
  height: BP.WORLD2.height,
  centerX: BP.WORLD2.width / 2,
  centerY: BP.WORLD2.height / 2,
  tile: 64,
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export type RegionDef = RegionBP & { index: number }

export const REGIONS: RegionDef[] = BP.REGIONS.map((r, index) => ({ ...r, index }))
export const REGION_BY_ID = new Map(REGIONS.map(r => [r.id, r]))

const hallPad = BP.PADS.find(p => p.id === 'hall')
if (!hallPad) throw new Error('blueprint has no hall pad')
/** The Command Hall: where the hero starts and every night aims. */
export const HALL = { x: hallPad.x, y: hallPad.y }

let memo: WorldRaster | null = null
/** The blueprint painted into 32 px cells. Built on first call, then shared. */
export function raster(): WorldRaster {
  memo ??= rasterise({ WORLD2: BP.WORLD2, REGIONS: BP.REGIONS, FEATURES: BP.FEATURES, ROADS: BP.ROADS })
  return memo
}

// ---------------------------------------------------------------------------
// Build pads
// ---------------------------------------------------------------------------

export interface PadSpec {
  id: string
  key: BuildingKey
  x: number
  y: number
  /** pre-built at this level when the game starts (0 = empty pad) */
  startLevel?: number
  region: RegionId
  /** hidden until this many town hall levels */
  requiresTownHall?: number
}

/** Pads whose buildings arrive later: outposts (S11), fisheries and trading posts (S13). */
const FUTURE_KEYS = new Set<BP.PadKey>(['outpost', 'fishery', 'tradingPost'])

const toPad = (p: BP.PadBP): PadSpec => ({
  id: p.id, key: p.key as BuildingKey, x: p.x, y: p.y, region: p.region,
  ...(p.startLevel ? { startLevel: p.startLevel } : {}),
  ...(p.hall ? { requiresTownHall: p.hall } : {}),
})

/** Every construction site the game builds today. Empty pads show a blueprint. */
export const PADS: PadSpec[] = BP.PADS.filter(p => !FUTURE_KEYS.has(p.key)).map(toPad)

/** Blueprint pads held back until their building type exists. */
export const FUTURE_PADS: BP.PadBP[] = BP.PADS.filter(p => FUTURE_KEYS.has(p.key))

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

export type WallLineSpec = WallLineBP & { active: boolean }

/** Every wall line in the blueprint. Only the palisade is built until S10. */
export const WALL_LINES: WallLineSpec[] = BP.WALLS.map(w => ({ ...w, active: w.id === 'palisade' }))

const palisade = BP.WALLS.find(w => w.id === 'palisade')
if (!palisade) throw new Error('blueprint has no palisade')
const xs = palisade.pts.map(p => p[0]), ys = palisade.pts.map(p => p[1])

/** The rampart ring, as BuildingManager lays it out. Gates are gaps the horde funnels toward. */
export const WALL_RING = {
  left: Math.min(...xs),
  right: Math.max(...xs),
  top: Math.min(...ys),
  bottom: Math.max(...ys),
  step: palisade.step,
  gates: palisade.gates.map(g => ({ ...g })),
}

// ---------------------------------------------------------------------------
// Night gates
// ---------------------------------------------------------------------------

export interface SpawnGate {
  id: GateId
  x: number
  y: number
  name: string
}

// TEMP until S09: six fixed gates on claimed-side ground at the hold's edge,
// along each approach, so nights stay short. S09 replaces them with approaches.
export const SPAWN_GATES: SpawnGate[] = [
  { id: 'south', x: 5120, y: 4450, name: 'the Old Bridge' },
  { id: 'west', x: 3150, y: 4880, name: 'the Millford road' },
  { id: 'east', x: 7500, y: 2850, name: 'the Gorge Bridge' },
  { id: 'north', x: 5000, y: 1900, name: 'the north road' },
  { id: 'northeast', x: 6100, y: 1700, name: 'the scarp' },
  { id: 'southwest', x: 2400, y: 3400, name: 'the Saltmere shore' },
]

export const GATE_BY_ID = new Map(SPAWN_GATES.map(g => [g.id, g]))

// ---------------------------------------------------------------------------
// Camps
// ---------------------------------------------------------------------------

export interface CampSpec {
  id: string
  name: string
  x: number
  y: number
  hp: number
  region: RegionId
  /** spawns this enemy every interval while alive */
  spawns: { key: string; every: number; count: number }
  reward: ResourceBag
}

/** `'bogWretch[shield]'` → `'shield'`: the stand-in until S16 adds the walker. */
export const resolveSpawnKey = (key: string): string => /\[(\w+)\]$/.exec(key)?.[1] ?? key

export const CAMPS: CampSpec[] = BP.CAMPS.map(c => ({
  id: c.id, name: c.name, x: c.x, y: c.y, hp: c.hp, region: c.region,
  spawns: { ...c.spawns, key: resolveSpawnKey(c.spawns.key) },
  reward: { ...c.reward },
}))

// ---------------------------------------------------------------------------
// Resource nodes
// ---------------------------------------------------------------------------

/** Harvestable clusters. Positions are generated from these descriptors. */
export interface NodeCluster {
  type: 'tree' | 'rock' | 'ore' | 'crystal'
  x: number
  y: number
  radius: number
  count: number
  region: RegionId
}

/** Every field in the blueprint except fish, which S13 places on water. */
export const NODE_CLUSTERS: NodeCluster[] = BP.NODES
  .filter((n): n is BP.NodeFieldBP & { type: NodeCluster['type'] } => n.type !== 'fish')
  .map(n => ({ type: n.type, x: n.x, y: n.y, radius: n.r, count: n.n, region: n.region }))

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

// ---------------------------------------------------------------------------
// Passed through for the sessions that use them
// ---------------------------------------------------------------------------

export const CROSSINGS = BP.FEATURES.crossings
export const { APPROACHES, MAWS, ROADS, POIS, THRONE, FEATURES } = BP
