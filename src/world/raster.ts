/**
 * World v2 raster: the blueprint painted into navCell (32 px) cells.
 *
 * One module, read by the lint tool (docs/world/tools/render.mjs), the
 * NavGrid, the region map, road speed and the atlas, so the game and the lint
 * can never disagree about what is passable. Pure TypeScript: no Phaser, and
 * only type imports from the blueprint, so node can load it on its own.
 *
 * Paint order, later overwriting earlier: regions, sea, rivers, lakes (isles
 * cut back to land), cliffs, lava rivers, the caldera ring, pools, then the
 * crossings carved last. Each crossing keeps its `under` code so fords slow.
 * Roads are a separate layer and never change terrain.
 */
import type { Pt, RegionId } from '../config/world/blueprint'

type BlueprintModule = typeof import('../config/world/blueprint')

/** The parts of the blueprint the raster reads. */
export type WorldBlueprint = Pick<BlueprintModule, 'WORLD2' | 'REGIONS' | 'FEATURES' | 'ROADS'>

export const T = { LAND: 0, SEA: 1, WATER: 2, CLIFF: 3, LAVA: 4 } as const
export type TerrainCode = (typeof T)[keyof typeof T]
export const TNAME = ['land', 'sea', 'water', 'cliff', 'lava'] as const

export interface WorldRaster<B extends WorldBlueprint = WorldBlueprint> {
  /** world size in px */
  W: number
  H: number
  /** cell size in px */
  C: number
  /** grid size in cells; N = GW * GH */
  GW: number
  GH: number
  N: number
  /** terrain code per cell (T) */
  terrain: Uint8Array
  /** terrain code before crossings were carved */
  under: Uint8Array
  /** index into FEATURES.crossings, or -1 */
  crossing: Int16Array
  /** index into REGIONS, or -1 */
  region: Int8Array
  /** 1 on cells within width / 2 of a road polyline */
  road: Uint8Array
  bp: B
  /** cell index at a world point, or -1 off the map */
  cell(x: number, y: number): number
  /** the cell's centre in world px */
  xy(i: number): Pt
  /** sealed: treat sealedUntil crossings as still closed */
  passable(i: number, sealed?: boolean): boolean
  /** cost multiplier: fords slow you while you are in the water */
  slowCost(i: number): number
  regionAt(x: number, y: number): RegionId | null
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export const hyp = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by)

/** Project p onto segment ab: raw t, clamped tc, and distance to the clamped point. */
export function segProj(px: number, py: number, ax: number, ay: number, bx: number, by: number): { t: number; tc: number; d: number } {
  const dx = bx - ax, dy = by - ay
  const L2 = dx * dx + dy * dy
  const t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0
  const tc = Math.max(0, Math.min(1, t))
  return { t, tc, d: Math.hypot(px - (ax + tc * dx), py - (ay + tc * dy)) }
}

export function inPoly(x: number, y: number, poly: readonly Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function distToPolyline(x: number, y: number, pts: readonly Pt[], closed = false): number {
  let best = Infinity
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
    best = Math.min(best, segProj(x, y, ax, ay, bx, by).d)
  }
  return best
}

export function polyArea(poly: readonly Pt[]): number {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1])
  return Math.abs(a / 2)
}

export function polyCentroid(poly: readonly Pt[]): Pt {
  let x = 0, y = 0, a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]
    x += (poly[j][0] + poly[i][0]) * f
    y += (poly[j][1] + poly[i][1]) * f
    a += f
  }
  return [x / (3 * a), y / (3 * a)]
}

/** Points every `step` px along a polyline. */
export function samplePolyline(pts: readonly Pt[], step: number, closed = false): Pt[] {
  const out: Pt[] = []
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
    const L = hyp(ax, ay, bx, by)
    const k = Math.max(1, Math.round(L / step))
    for (let s = 0; s < k; s++) out.push([ax + ((bx - ax) * s) / k, ay + ((by - ay) * s) / k])
  }
  if (!closed) out.push(pts[pts.length - 1])
  return out
}

// ---------------------------------------------------------------------------
// Raster
// ---------------------------------------------------------------------------

type CellFn = (i: number, x: number, y: number) => void

export function rasterise<B extends WorldBlueprint>(bp: B): WorldRaster<B> {
  const { width: W, height: H, navCell: C } = bp.WORLD2
  const GW = Math.ceil(W / C), GH = Math.ceil(H / C), N = GW * GH
  const terrain = new Uint8Array(N)
  const crossing = new Int16Array(N).fill(-1)
  const region = new Int8Array(N).fill(-1)
  const road = new Uint8Array(N)
  const F = bp.FEATURES
  const crossings = F.crossings

  const paint = (x0: number, y0: number, x1: number, y1: number, fn: CellFn) => {
    const gx0 = Math.max(0, Math.floor(x0 / C)), gy0 = Math.max(0, Math.floor(y0 / C))
    const gx1 = Math.min(GW - 1, Math.floor(x1 / C)), gy1 = Math.min(GH - 1, Math.floor(y1 / C))
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) fn(gy * GW + gx, gx * C + C / 2, gy * C + C / 2)
  }
  const bbox = (pts: readonly Pt[]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    return [x0, y0, x1, y1] as const
  }
  const polygon = (poly: readonly Pt[], fn: (i: number) => void) => {
    const [x0, y0, x1, y1] = bbox(poly)
    paint(x0, y0, x1, y1, (i, x, y) => { if (inPoly(x, y, poly)) fn(i) })
  }
  const band = (pts: readonly (readonly [number, number, number])[], code: TerrainCode) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, ay, aw] = pts[s], [bx, by, bw] = pts[s + 1]
      const m = Math.max(aw, bw) / 2 + C
      paint(Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m, (i, x, y) => {
        const p = segProj(x, y, ax, ay, bx, by)
        if (p.d < (aw + (bw - aw) * p.tc) / 2) terrain[i] = code
      })
    }
  }
  const ellipse = (cx: number, cy: number, rx: number, ry: number, fn: (i: number, q: number) => void) =>
    paint(cx - rx, cy - ry, cx + rx, cy + ry, (i, x, y) => {
      const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
      fn(i, q)
    })

  bp.REGIONS.forEach((r, k) => polygon(r.poly, i => { region[i] = k }))
  polygon(F.sea, i => { terrain[i] = T.SEA })
  for (const r of F.rivers) band(r.pts, T.WATER)
  for (const l of F.lakes) {
    ellipse(l.cx, l.cy, l.rx, l.ry, (i, q) => { if (q < 1) terrain[i] = T.WATER })
    const isle = l.isle
    if (isle) ellipse(isle.cx, isle.cy, isle.r, isle.r, (i, q) => { if (q < 1) terrain[i] = T.LAND })
  }
  for (const c of F.cliffs) band(c.pts.map(([x, y]) => [x, y, c.thickness] as const), T.CLIFF)
  for (const r of F.lava.rivers) band(r.pts, T.LAVA)
  const cal = F.lava.caldera
  paint(cal.cx - cal.outer, cal.cy - cal.outer, cal.cx + cal.outer, cal.cy + cal.outer, (i, x, y) => {
    const d = hyp(x, y, cal.cx, cal.cy)
    if (d < cal.outer && d >= cal.inner) terrain[i] = T.LAVA
  })
  for (const p of F.lava.pools) ellipse(p.cx, p.cy, p.rx, p.ry, (i, q) => { if (q < 1) terrain[i] = T.LAVA })

  const under = terrain.slice()
  crossings.forEach((c, k) => {
    const [ax, ay] = c.a, [bx, by] = c.b
    const m = c.width / 2 + C
    paint(Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m, (i, x, y) => {
      const p = segProj(x, y, ax, ay, bx, by)
      if (p.d < c.width / 2 && p.t >= -0.02 && p.t <= 1.02) { crossing[i] = k; terrain[i] = T.LAND }
    })
  })

  // Roads: a flag layer on top of whatever terrain is there (bridges included).
  for (const rd of bp.ROADS) {
    const half = rd.width / 2
    for (let s = 0; s < rd.pts.length - 1; s++) {
      const [ax, ay] = rd.pts[s], [bx, by] = rd.pts[s + 1]
      const m = half + C
      paint(Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m, (i, x, y) => {
        if (segProj(x, y, ax, ay, bx, by).d <= half) road[i] = 1
      })
    }
  }

  const passable = (i: number, sealed = false): boolean => {
    if (i < 0 || terrain[i] !== T.LAND) return false
    if (sealed && crossing[i] >= 0 && crossings[crossing[i]].sealedUntil && under[i] !== T.LAND) return false
    return true
  }
  const slowCost = (i: number): number => {
    const k = crossing[i]
    if (k < 0 || under[i] === T.LAND) return 1
    const s = crossings[k].slow
    return s ? 1 / s : 1
  }

  return {
    W, H, C, GW, GH, N, terrain, under, crossing, region, road, bp,
    cell: (x, y) => {
      const gx = Math.floor(x / C), gy = Math.floor(y / C)
      return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? -1 : gy * GW + gx
    },
    xy: i => [(i % GW) * C + C / 2, Math.floor(i / GW) * C + C / 2],
    passable,
    slowCost,
    regionAt: (x, y) => { for (const g of bp.REGIONS) if (inPoly(x, y, g.poly)) return g.id; return null },
  }
}

/** Distance from (x, y) to the nearest impassable (non-land) cell centre, searching `max` px. */
export function blockedWithin(r: WorldRaster, x: number, y: number, max: number): number {
  let best = Infinity
  const k = Math.ceil(max / r.C)
  for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) {
    const i = r.cell(x + dx * r.C, y + dy * r.C)
    if (i < 0 || r.terrain[i] === T.LAND) continue
    const [cx, cy] = r.xy(i)
    best = Math.min(best, Math.max(0, hyp(x, y, cx, cy) - r.C / 2))
  }
  return best
}
