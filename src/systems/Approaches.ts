/**
 * Night approaches (S09): the named routes the horde marches along, from a
 * muster, through the crossings in its `via` list, to the hall.
 *
 * Pure: it reads the NavGrid's flow fields, the claim mask and the camps'
 * states through `ApproachWorld`, and holds no Phaser object, so the rules
 * (muster resolution along chains, the 2400 px clamp, which approaches are
 * live, fronts per night) are tested on the real raster.
 */
import { APPROACHES, CAMPS, CROSSINGS, MAWS, REGION_BY_ID, type RegionId } from '../config/world'
import type { Pt } from '../config/world/blueprint'
import type { FieldTarget, NavGrid } from '../world/NavGrid'

export type ApproachId = string
export type MusterState = 'asleep' | 'awake' | 'burned'

/** Spawns sit this far of path in front of claimed ground at most. */
export const SPAWN_CLAMP = 2400
/** Marchers move this much faster until they stand on claimed ground. */
export const MARCH_SPEED = 2.4
/** Spawns scatter this far around the spawn point, on passable cells in sight of it. */
export const SPAWN_SCATTER = 120
/** A marcher takes its next leg within this distance of the via crossing's midpoint. */
export const VIA_REACH = 96
/** Share of a night's budget a raid takes. */
export const RAID_SHARE = 0.3
/** Share of an approach's units that are its muster camp's own walker. */
export const CAMP_MIX = 0.3

/** When a main approach first comes: from a wave, or as soon as any listed region is claimed. */
export const OPENS: Record<ApproachId, { wave: number; claimed?: RegionId[] }> = {
  south: { wave: 1 },
  west: { wave: 8, claimed: ['hollow'] },
  east: { wave: 12, claimed: ['greyfall'] },
  southeast: { wave: 17, claimed: ['kettle', 'ferrow'] },
}

/** Budget weight: the south road carries the most. */
export const weightOf = (id: ApproachId): number => (id === 'south' ? 1 : 0.8)

/** How many main approaches a night may use. */
export function frontsFor(wave: number): number {
  if (wave >= 30) return Infinity
  if (wave >= 15) return 3
  if (wave >= 8) return 2
  return 1
}

export interface Muster {
  id: string
  x: number
  y: number
  kind: 'camp' | 'maw'
  region: RegionId
}

/** What the approaches read from the game. */
export interface ApproachWorld {
  nav: NavGrid
  /** one byte per raster cell, 1 where claimed */
  claimMask(): Uint8Array
  claimed(id: RegionId): boolean
  /** null for an unknown camp id */
  campState(id: string): MusterState | null
  /** S17: the Regent has fallen: every maw is closed and the main approaches end; raids still come */
  ended?(): boolean
}

/** One night's plan: the main fronts and at most one raid. */
export interface NightPlan {
  wave: number
  fronts: ApproachId[]
  raid: ApproachId | null
}

const campById = new Map(CAMPS.map(c => [c.id, c]))
const mawById = new Map(MAWS.map(m => [m.id, m]))
const crossingById = new Map(CROSSINGS.map(c => [c.id, c]))

/** A crossing's midpoint, where a via leg aims. */
export function viaMid(crossingId: string): Pt {
  const c = crossingById.get(crossingId)
  if (!c) throw new Error(`Approaches: no crossing ${crossingId}`)
  return [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2]
}

export const APPROACH_IDS: ApproachId[] = APPROACHES.map(a => a.id)
const byId = new Map(APPROACHES.map(a => [a.id, a]))

export class Approaches {
  constructor(private readonly w: ApproachWorld) {}

  /** Name for banners: "the south road". */
  name(id: ApproachId): string { return byId.get(id)?.name ?? id }
  isRaid(id: ApproachId): boolean { return !!byId.get(id)?.raid }

  /** The first standing camp in the chain, else its maw, else null (closed for good). */
  muster(id: ApproachId): Muster | null {
    const a = byId.get(id)
    if (!a || (!a.raid && this.w.ended?.())) return null
    for (const m of a.chain) {
      const camp = campById.get(m)
      if (camp) {
        const s = this.w.campState(m)
        if (s !== null && s !== 'burned') return { id: m, x: camp.x, y: camp.y, kind: 'camp', region: camp.region }
        continue
      }
      const maw = mawById.get(m)
      if (maw) return { id: m, x: maw.x, y: maw.y, kind: 'maw', region: maw.region }
    }
    return null
  }

  /** The fields a walker from this approach follows, in order: each via crossing, then the hall. */
  legs(id: ApproachId): FieldTarget[] {
    return [...(byId.get(id)?.via ?? []).map(v => `via:${v}` as FieldTarget), 'hall']
  }

  /** Route cells from the muster through each via to the hall (the NavGrid's fields, walls and seals included). */
  routeCells(id: ApproachId): number[] {
    const m = this.muster(id)
    if (!m) return []
    const nav = this.w.nav
    let i = nav.nearestPassable(m.x, m.y)
    if (i < 0) return []
    const cells = [i]
    for (const leg of this.legs(id)) {
      const f = nav.field(leg)
      if (!Number.isFinite(f.d[i])) continue
      for (let guard = 0; guard < nav.r.N; guard++) {
        const j = f.nextCell(i)
        if (j < 0) break
        cells.push(j)
        i = j
      }
    }
    return cells
  }

  /** The route as world points (cell centres), muster first. */
  route(id: ApproachId): Pt[] {
    const r = this.w.nav.r
    return this.routeCells(id).map(i => r.xy(i))
  }

  /**
   * Path length from the muster to the first claimed cell on its route, and
   * the route itself. `d` is the whole route when it never meets claimed ground.
   */
  toClaimed(id: ApproachId): { d: number; cells: number[]; at: number } {
    const cells = this.routeCells(id)
    const mask = this.w.claimMask()
    const r = this.w.nav.r
    let d = 0
    for (let s = 0; s < cells.length; s++) {
      if (s) {
        const [x0, y0] = r.xy(cells[s - 1]), [x1, y1] = r.xy(cells[s])
        d += Math.hypot(x1 - x0, y1 - y0)
      }
      if (mask[cells[s]]) return { d, cells, at: s }
    }
    return { d, cells, at: cells.length - 1 }
  }

  /** Where tonight's marchers appear: the muster, or the route point SPAWN_CLAMP px of path before claimed ground. */
  spawnPoint(id: ApproachId): Pt {
    const m = this.muster(id)
    if (!m) return [NaN, NaN]
    const { d, cells } = this.toClaimed(id)
    const r = this.w.nav.r
    if (!cells.length) return [m.x, m.y]
    if (d <= SPAWN_CLAMP) {
      return this.w.nav.passableAt(m.x, m.y) ? [m.x, m.y] : r.xy(cells[0])
    }
    const skip = d - SPAWN_CLAMP
    let run = 0
    for (let s = 1; s < cells.length; s++) {
      const [x0, y0] = r.xy(cells[s - 1]), [x1, y1] = r.xy(cells[s])
      run += Math.hypot(x1 - x0, y1 - y0)
      if (run >= skip) return [x1, y1]
    }
    return r.xy(cells[cells.length - 1])
  }

  /** The route from the spawn point on, for drawing. */
  marchRoute(id: ApproachId): Pt[] {
    const [sx, sy] = this.spawnPoint(id)
    const pts = this.route(id)
    let k = 0, best = Infinity
    for (let s = 0; s < pts.length; s++) {
      const d = Math.hypot(pts[s][0] - sx, pts[s][1] - sy)
      if (d < best) { best = d; k = s }
    }
    return pts.slice(k)
  }

  /** The muster region's tier: marchers scale with it. */
  tier(id: ApproachId): number {
    const m = this.muster(id)
    return m ? REGION_BY_ID.get(m.region)?.tier ?? 0 : 0
  }

  /** The muster camp's own walker (resolved), which makes up CAMP_MIX of the approach; null at a maw. */
  campKey(id: ApproachId): string | null {
    const m = this.muster(id)
    if (!m || m.kind !== 'camp') return null
    const camp = campById.get(m.id)
    return camp ? camp.spawns.key : null
  }

  /**
   * Approaches that can come on this wave: open main approaches with a muster,
   * then raids whose muster camp is awake. Blueprint order.
   */
  live(wave: number): ApproachId[] {
    const out: ApproachId[] = []
    for (const a of APPROACHES) {
      const m = this.muster(a.id)
      if (!m) continue
      if (a.raid) {
        if (m.kind === 'camp' && this.w.campState(m.id) === 'awake') out.push(a.id)
        continue
      }
      const o = OPENS[a.id] ?? { wave: 1 }
      if (wave >= o.wave || (o.claimed ?? []).some(r => this.w.claimed(r))) out.push(a.id)
    }
    return out
  }

  /**
   * Tonight's fronts: up to `frontsFor(wave)` live main approaches (the south
   * road first when it is live, the rest rotating with the wave), plus at most
   * one live raid, rotating the same way. `prefer` (a wave's own list) goes
   * first where those approaches are live.
   */
  tonight(wave: number, prefer: readonly ApproachId[] = []): NightPlan {
    const live = this.live(wave)
    const mains = live.filter(id => !this.isRaid(id))
    const raids = live.filter(id => this.isRaid(id))
    const n = frontsFor(wave)
    const first = [...prefer.filter(id => mains.includes(id)), ...(mains.includes('south') ? ['south'] : [])]
    const rest = mains.filter(id => !first.includes(id))
    const off = rest.length ? wave % rest.length : 0
    const fronts = [...new Set([...first, ...rest.slice(off), ...rest.slice(0, off)])].slice(0, n)
    return { wave, fronts, raid: raids.length ? raids[wave % raids.length] : null }
  }
}

/**
 * Split `total` units over a plan by budget: a raid takes RAID_SHARE, the
 * fronts share the rest by weight. Largest remainder, so the counts add up.
 */
export function splitBudget(plan: Pick<NightPlan, 'fronts' | 'raid'>, total: number): Map<ApproachId, number> {
  const shares: [ApproachId, number][] = []
  const mainShare = plan.raid && plan.fronts.length ? 1 - RAID_SHARE : 1
  const wsum = plan.fronts.reduce((s, id) => s + weightOf(id), 0)
  for (const id of plan.fronts) shares.push([id, (mainShare * weightOf(id)) / wsum])
  if (plan.raid) shares.push([plan.raid, plan.fronts.length ? RAID_SHARE : 1])
  const out = new Map<ApproachId, number>()
  let given = 0
  const rem: [ApproachId, number][] = []
  for (const [id, s] of shares) {
    const exact = total * s
    const n = Math.floor(exact)
    out.set(id, n)
    given += n
    rem.push([id, exact - n])
  }
  rem.sort((a, b) => b[1] - a[1])
  for (let k = 0; given < total && rem.length; k = (k + 1) % rem.length, given++) {
    out.set(rem[k][0], (out.get(rem[k][0]) ?? 0) + 1)
  }
  return out
}
