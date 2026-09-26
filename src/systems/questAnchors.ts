/**
 * Where a quest goal can send the arrow, from the blueprint alone (S18).
 *
 * `QuestManager.targetFor` picks one of these by live state (the nearest
 * unbuilt pad, the nearest unrestored shrine…); this module only lists the
 * candidates, so a unit test can check every one of them stands on passable
 * ground without a Phaser scene.
 */
import { CAMPS, HALL, PADS, POIS, REGIONS, REGION_BY_ID, THRONE, WALL_LINES, type RegionId } from '../config/world'
import type { QuestGoal } from '../config/quests'
import { layWallLine } from '../world/wallLine'
import { BARROW_RELICS } from './Relics'

export interface Anchor { id: string; x: number; y: number; region?: RegionId }

/** Keys that are fortification, not settlement: `settle` never counts them. */
export const NOT_SETTLED = new Set<string>(['wall', 'gate'])

const pads = (keep: (p: typeof PADS[number]) => boolean): Anchor[] =>
  PADS.filter(keep).map(p => ({ id: p.id, x: p.x, y: p.y, region: p.region }))

/** A region's border stone, where the hero stands to claim it. */
export function claimAnchor(id: RegionId): Anchor | null {
  const r = REGION_BY_ID.get(id)
  return r ? { id: `claim:${id}`, x: r.claim.x, y: r.claim.y, region: id } : null
}

/** The camp a stronghold boss stands at, by the boss's key. */
export const bossCamp = (key: string) => CAMPS.find(c => c.boss === key) ?? null

/** Every piece and gate of a wall line, in order along it. */
export function lineAnchors(lineId: string): Anchor[] {
  const line = WALL_LINES.find(w => w.id === lineId)
  return line ? layWallLine(line).map(p => ({ id: p.id, x: p.x, y: p.y, region: line.region })) : []
}

/** Waystones: each outpost pad's stone, and the lone stones (the Hall Stone, the Isle Stone). */
export function waystoneAnchors(): Anchor[] {
  return [
    ...pads(p => p.key === 'outpost'),
    ...POIS.filter(p => p.kind === 'waystone').map(p => ({ id: p.id, x: p.x, y: p.y, region: p.region })),
  ]
}

/** Where a relic can still be won: a barrow that holds one, or a stronghold's boss. */
export function relicAnchors(): Anchor[] {
  return [
    ...POIS.filter(p => p.id in BARROW_RELICS).map(p => ({ id: p.id, x: p.x, y: p.y, region: p.region })),
    ...CAMPS.filter(c => c.boss).map(c => ({ id: c.id, x: c.x, y: c.y, region: c.region })),
  ]
}

/**
 * The static points a goal can aim at. Empty for goals whose target is live
 * only (a coin-dropping enemy, a built camp with a free slot, the night).
 */
export function goalAnchors(g: QuestGoal): Anchor[] {
  switch (g.type) {
    case 'build': return pads(p => p.key === g.building && (!g.region || p.region === g.region))
    case 'upgrade': return pads(p => p.key === g.building)
    case 'claim': { const a = claimAnchor(g.region); return a ? [a] : [] }
    case 'zone': return REGIONS.filter(r => r.id !== 'hold').map(r => claimAnchor(r.id)!)
    case 'burn': return CAMPS.filter(c => c.id === g.camp).map(c => ({ id: c.id, x: c.x, y: c.y, region: c.region }))
    case 'camp': return CAMPS.map(c => ({ id: c.id, x: c.x, y: c.y, region: c.region }))
    case 'boss': {
      if (g.key === THRONE.boss) return [{ id: 'throne', x: THRONE.x, y: THRONE.y }]
      const c = bossCamp(g.key)
      return c ? [{ id: c.id, x: c.x, y: c.y, region: c.region }] : []
    }
    case 'restore': return POIS.filter(p => p.kind === 'shrine').map(p => ({ id: p.id, x: p.x, y: p.y, region: p.region }))
    case 'relic': return relicAnchors()
    case 'reach': return POIS.filter(p => p.id === g.poi).map(p => ({ id: p.id, x: p.x, y: p.y, region: p.region }))
    case 'travel': return waystoneAnchors()
    case 'line': return lineAnchors(g.line)
    case 'settle': return pads(p => p.region === g.region && !NOT_SETTLED.has(p.key))
    case 'recruit': return pads(p => p.key === 'barracks' || p.key === 'archeryRange')
    case 'workers': case 'collect': case 'kill': case 'survive': case 'level':
      return []
  }
}

/** The hall: where a goal gated on its level points first. */
export const HALL_ANCHOR: Anchor = { id: 'hall', x: HALL.x, y: HALL.y, region: 'hold' }
