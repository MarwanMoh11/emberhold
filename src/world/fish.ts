/**
 * Fish (S13): where a fish field's shoals swim, and where a crew stands to
 * work each one. Pure, like the raster it reads, so node tests can load it.
 *
 * A shoal sits on a cell whose `under` is water or sea, never on a crossing's
 * deck (a ford or bridge is land on top). Its gather point is the nearest
 * land cell a walker can reach from the field's fishery pad, so crews always
 * stand on the near bank rather than on water or across the river.
 */
import { T, type WorldRaster } from './raster'

export interface FishField { x: number; y: number; radius: number; count: number }

export interface FishSpot {
  x: number
  y: number
  /** where a worker stands to fish it: the centre of a reachable land cell */
  gx: number
  gy: number
}

/** How far a shoal may sit from the bank its crew stands on, in px. */
export const FISH_BANK = 160
/** Shoals keep at least this far apart. */
const SPACING = 34
/** The bank search reaches this far round the field (flood-fill box half-size). */
const REACH_BOX = 1400

/** A water cell a shoal may sit on: water or sea under, and not a crossing's deck. */
export function fishable(r: WorldRaster, i: number): boolean {
  if (i < 0 || r.terrain[i] === T.LAND) return false
  const u = r.under[i]
  return u === T.WATER || u === T.SEA
}

/**
 * Land cells joined on foot to `from` inside a box round (cx, cy): a 4-way
 * flood over passable cells (sealed crossings count as closed).
 */
function reachable(r: WorldRaster, from: { x: number; y: number }, cx: number, cy: number): Set<number> {
  const seen = new Set<number>()
  const gx0 = Math.max(0, Math.floor((cx - REACH_BOX) / r.C)), gx1 = Math.min(r.GW - 1, Math.floor((cx + REACH_BOX) / r.C))
  const gy0 = Math.max(0, Math.floor((cy - REACH_BOX) / r.C)), gy1 = Math.min(r.GH - 1, Math.floor((cy + REACH_BOX) / r.C))
  // the pad's own cell may be shoreline water; start from the nearest land
  let start = -1, bd = Infinity
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const i = r.cell(from.x + dx * r.C, from.y + dy * r.C)
    if (!r.passable(i, true)) continue
    const [x, y] = r.xy(i)
    const d = (x - from.x) ** 2 + (y - from.y) ** 2
    if (d < bd) { bd = d; start = i }
  }
  if (start < 0) return seen
  const q = [start]
  seen.add(start)
  while (q.length) {
    const i = q.pop()!
    const gx = i % r.GW, gy = (i - gx) / r.GW
    for (const [nx, ny] of [[gx + 1, gy], [gx - 1, gy], [gx, gy + 1], [gx, gy - 1]]) {
      if (nx < gx0 || nx > gx1 || ny < gy0 || ny > gy1) continue
      const j = ny * r.GW + nx
      if (seen.has(j) || !r.passable(j, true)) continue
      seen.add(j)
      q.push(j)
    }
  }
  return seen
}

/** The nearest cell of `ok` to (x, y) within `max` px, as its centre; null if none. */
function nearestCell(r: WorldRaster, x: number, y: number, max: number, ok: (i: number) => boolean): [number, number] | null {
  let best: [number, number] | null = null, bd = max * max
  const k = Math.ceil(max / r.C)
  for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
    const i = r.cell(x + dx * r.C, y + dy * r.C)
    if (i < 0 || !ok(i)) continue
    const [cx, cy] = r.xy(i)
    const d = (cx - x) ** 2 + (cy - y) ** 2
    if (d <= bd) { bd = d; best = [cx, cy] }
  }
  return best
}

/**
 * Up to `field.count` shoals on water inside the field's radius (the same
 * 0.78 squash as every other field), each within FISH_BANK of a bank cell
 * reachable from `anchor` (the fishery pad). With no anchor, any land cell
 * counts as the bank. `rand` is the caller's seeded generator.
 */
export function placeFish(r: WorldRaster, field: FishField, anchor: { x: number; y: number } | null, rand: () => number): FishSpot[] {
  const near = anchor ? reachable(r, anchor, field.x, field.y) : null
  const bank = (i: number) => (near ? near.has(i) : r.passable(i, true))
  const out: FishSpot[] = []
  for (let tries = 0; out.length < field.count && tries < field.count * 60; tries++) {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * field.radius
    const x = field.x + Math.cos(a) * d, y = field.y + Math.sin(a) * d * 0.78
    if (!fishable(r, r.cell(x, y))) continue
    if (out.some(s => Math.hypot(s.x - x, s.y - y) < SPACING)) continue
    const g = nearestCell(r, x, y, FISH_BANK, bank)
    if (!g) continue
    out.push({ x: Math.round(x), y: Math.round(y), gx: g[0], gy: g[1] })
  }
  return out
}
