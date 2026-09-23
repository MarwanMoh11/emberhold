/**
 * The painter's view of the raster: per-cell fields, built once from the
 * same 32 px raster the NavGrid reads, so the art lies exactly where the
 * ground stops you.
 *
 * - Signed distances (px, negative inside) to wet ground (sea, river, lake),
 *   cliff and lava, from `under`, so rivers run on beneath their bridges and
 *   cliffs behind their passes. The zero line sits halfway between a wet cell
 *   and a dry one; a light blur takes the cell stairs out of it, so a drawn
 *   shore can stray up to ~16 px from where the NavGrid stops you.
 * - `cliffS`: where a point sits across the nearest cliff band, -1 at the
 *   crest (uphill), +1 at the foot (downhill), past ±1 outside it.
 * - `sea`: 1 over the sea, 0 inland, blurred, so the river mouth blends.
 * - Contours: the zero lines traced as smoothed polylines, cut into short
 *   runs with a bounding box, for ink lines, foam and glow.
 *
 * Pure: no Phaser, no DOM. Node tests read it.
 */
import { raster } from '../config/world'
import { T, segProj, type WorldRaster } from './raster'

export interface Contour {
  /** flat x, y pairs in world px */
  pts: number[]
  box: [number, number, number, number]
  /** cliff runs: -1 on the crest (uphill) edge, 1 on the foot */
  side: number
}

export interface TerrainFields {
  r: WorldRaster
  wet: Float32Array
  cliff: Float32Array
  lava: Float32Array
  cliffS: Float32Array
  sea: Float32Array
  contours: { wet: Contour[]; cliff: Contour[]; lava: Contour[] }
}

/** Distance in px from outside a feature when it is too far to matter. */
export const FAR = 4096

let memo: TerrainFields | null = null

export function terrainFields(): TerrainFields {
  if (memo) return memo
  const r = raster()
  const { GW, GH, N, C, under } = r
  const mask = (pred: (t: number) => boolean) => {
    const m = new Uint8Array(N)
    for (let i = 0; i < N; i++) m[i] = pred(under[i]) ? 1 : 0
    return m
  }
  const wetM = mask(t => t === T.SEA || t === T.WATER)
  const cliffM = mask(t => t === T.CLIFF)
  const lavaM = mask(t => t === T.LAVA)
  // blurred, so the zero line runs smooth instead of down the 32 px cell stairs
  const smoothSd = (m: Uint8Array) => {
    const d = signedDistance(m, GW, GH, C)
    boxBlur(d, GW, GH, 1, 1); boxBlur(d, GW, GH, 1, 1)
    return d
  }
  const wet = smoothSd(wetM)
  const cliff = smoothSd(cliffM)
  const lava = smoothSd(lavaM)
  const sea = new Float32Array(N)
  for (let i = 0; i < N; i++) sea[i] = under[i] === T.SEA ? 1 : 0
  boxBlur(sea, GW, GH, 1, 2); boxBlur(sea, GW, GH, 1, 2)
  const cliffS = cliffCross(r)
  const f: TerrainFields = {
    r, wet, cliff, lava, cliffS, sea,
    contours: { wet: contours(wet, GW, GH, C), cliff: [], lava: contours(lava, GW, GH, C) },
  }
  // cut the cliff outline into its crest and its foot
  for (const run of contours(cliff, GW, GH, C)) {
    let cur: number[] = []
    let side = 0
    const flush = () => { if (cur.length >= 4) f.contours.cliff.push(boxed(cur, side)); cur = [] }
    for (let k = 0; k < run.pts.length; k += 2) {
      const s = sample(f, cliffS, run.pts[k], run.pts[k + 1]) < 0 ? -1 : 1
      if (s !== side && cur.length) {
        cur.push(run.pts[k], run.pts[k + 1])
        flush()
      }
      side = s
      cur.push(run.pts[k], run.pts[k + 1])
    }
    flush()
  }
  return (memo = f)
}

/** Bilinear sample of a per-cell grid at world (x, y), clamped to the map. */
export function sample(f: TerrainFields, g: Float32Array, x: number, y: number): number {
  const { GW, GH, C } = f.r
  let u = x / C - 0.5, v = y / C - 0.5
  u = u < 0 ? 0 : u > GW - 1.001 ? GW - 1.001 : u
  v = v < 0 ? 0 : v > GH - 1.001 ? GH - 1.001 : v
  const i = u | 0, j = v | 0, fu = u - i, fv = v - j
  const k = j * GW + i
  const a = g[k], b = g[k + 1], c = g[k + GW], d = g[k + GW + 1]
  return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv
}

/** The value of the cell under (x, y), no interpolation: the cheap test before `sample`. */
export function cellValue(f: TerrainFields, g: Float32Array, x: number, y: number): number {
  const { GW, GH, C } = f.r
  const i = Math.min(GW - 1, Math.max(0, (x / C) | 0)), j = Math.min(GH - 1, Math.max(0, (y / C) | 0))
  return g[j * GW + i]
}

// ---- distance ------------------------------------------------------------------

/** Euclidean distance in cells from every cell to the nearest cell with `m` set (nearest-seed sweeps). */
function distanceTo(m: Uint8Array, GW: number, GH: number): Float32Array {
  const N = GW * GH
  const near = new Int32Array(N).fill(-1)
  const d2 = new Float64Array(N).fill(Infinity)
  for (let i = 0; i < N; i++) if (m[i]) { near[i] = i; d2[i] = 0 }
  const tryFrom = (i: number, gx: number, gy: number, nx: number, ny: number) => {
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return
    const s = near[ny * GW + nx]
    if (s < 0) return
    const dx = (s % GW) - gx, dy = ((s / GW) | 0) - gy
    const d = dx * dx + dy * dy
    if (d < d2[i]) { d2[i] = d; near[i] = s }
  }
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const i = gy * GW + gx
      tryFrom(i, gx, gy, gx - 1, gy); tryFrom(i, gx, gy, gx - 1, gy - 1); tryFrom(i, gx, gy, gx, gy - 1); tryFrom(i, gx, gy, gx + 1, gy - 1)
    }
    for (let gx = GW - 1; gx >= 0; gx--) tryFrom(gy * GW + gx, gx, gy, gx + 1, gy)
  }
  for (let gy = GH - 1; gy >= 0; gy--) {
    for (let gx = GW - 1; gx >= 0; gx--) {
      const i = gy * GW + gx
      tryFrom(i, gx, gy, gx + 1, gy); tryFrom(i, gx, gy, gx + 1, gy + 1); tryFrom(i, gx, gy, gx, gy + 1); tryFrom(i, gx, gy, gx - 1, gy + 1)
    }
    for (let gx = 0; gx < GW; gx++) tryFrom(gy * GW + gx, gx, gy, gx - 1, gy)
  }
  const out = new Float32Array(N)
  for (let i = 0; i < N; i++) out[i] = Math.sqrt(d2[i])
  return out
}

/** Signed distance in px to the edge of `m`: negative inside, zero halfway between cells. */
export function signedDistance(m: Uint8Array, GW: number, GH: number, C: number): Float32Array {
  const inv = new Uint8Array(m.length)
  for (let i = 0; i < m.length; i++) inv[i] = m[i] ? 0 : 1
  const out = distanceTo(m, GW, GH), inside = distanceTo(inv, GW, GH)
  for (let i = 0; i < m.length; i++) {
    const d = m[i] ? -(inside[i] - 0.5) * C : (out[i] - 0.5) * C
    out[i] = Number.isFinite(d) ? d : m[i] ? -FAR : FAR
  }
  return out
}

/** In-place separable box blur of an interleaved grid (`stride` channels per cell). */
export function boxBlur(g: Float32Array, GW: number, GH: number, stride: number, rad: number) {
  const tmp = new Float32Array(Math.max(GW, GH) * stride)
  const pass = (len: number, lines: number, at: (line: number, k: number) => number) => {
    for (let l = 0; l < lines; l++) {
      for (let k = 0; k < len; k++) {
        for (let c = 0; c < stride; c++) {
          let s = 0
          for (let d = -rad; d <= rad; d++) s += g[at(l, Math.min(len - 1, Math.max(0, k + d))) * stride + c]
          tmp[k * stride + c] = s / (2 * rad + 1)
        }
      }
      for (let k = 0; k < len; k++) for (let c = 0; c < stride; c++) g[at(l, k) * stride + c] = tmp[k * stride + c]
    }
  }
  pass(GW, GH, (row, k) => row * GW + k)
  pass(GH, GW, (col, k) => k * GW + col)
}

// ---- cliffs ----------------------------------------------------------------------

/**
 * Downhill normal of a cliff segment: toward the south, or toward the east for
 * a wall that runs north-south (the Slagwall faces down into Deepvein).
 */
export function downhill(ax: number, ay: number, bx: number, by: number): [number, number] {
  const L = Math.hypot(bx - ax, by - ay) || 1
  let nx = -(by - ay) / L, ny = (bx - ax) / L
  if (nx * 0.3 + ny < 0) { nx = -nx; ny = -ny }
  return [nx, ny]
}

function cliffCross(r: WorldRaster): Float32Array {
  const { GW, GH, C } = r
  const s = new Float32Array(GW * GH).fill(99)
  const best = new Float32Array(GW * GH).fill(Infinity)
  for (const cl of r.bp.FEATURES.cliffs) {
    const half = cl.thickness / 2, m = half + 160
    for (let k = 0; k < cl.pts.length - 1; k++) {
      const [ax, ay] = cl.pts[k], [bx, by] = cl.pts[k + 1]
      const [nx, ny] = downhill(ax, ay, bx, by)
      const gx0 = Math.max(0, Math.floor((Math.min(ax, bx) - m) / C)), gx1 = Math.min(GW - 1, Math.floor((Math.max(ax, bx) + m) / C))
      const gy0 = Math.max(0, Math.floor((Math.min(ay, by) - m) / C)), gy1 = Math.min(GH - 1, Math.floor((Math.max(ay, by) + m) / C))
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        const x = gx * C + C / 2, y = gy * C + C / 2
        const p = segProj(x, y, ax, ay, bx, by)
        const i = gy * GW + gx
        if (p.d >= best[i]) continue
        best[i] = p.d
        const side = (x - ax) * nx + (y - ay) * ny
        s[i] = Math.max(-9, Math.min(9, (Math.sign(side) * p.d) / half))
      }
    }
  }
  return s
}

// ---- contours --------------------------------------------------------------------

function boxed(pts: number[], side: number): Contour {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let k = 0; k < pts.length; k += 2) {
    x0 = Math.min(x0, pts[k]); x1 = Math.max(x1, pts[k])
    y0 = Math.min(y0, pts[k + 1]); y1 = Math.max(y1, pts[k + 1])
  }
  return { pts, box: [x0, y0, x1, y1], side }
}

/** The zero line of a signed field through the cell centres, smoothed and cut into runs of ≤ 40 points. */
export function contours(sd: Float32Array, GW: number, GH: number, C: number): Contour[] {
  // edge ids: 2k is the edge from centre k to its right neighbour, 2k+1 to the one below
  const px = new Map<number, [number, number]>()
  const edgePt = (id: number) => {
    let p = px.get(id)
    if (p) return p
    const k = id >> 1, gx = k % GW, gy = (k / GW) | 0
    const k2 = id & 1 ? k + GW : k + 1
    const a = sd[k], b = sd[k2]
    const t = a / (a - b)
    p = id & 1 ? [gx * C + C / 2, (gy + t) * C + C / 2] : [(gx + t) * C + C / 2, gy * C + C / 2]
    px.set(id, p)
    return p
  }
  const adj = new Map<number, number[]>()
  const link = (e1: number, e2: number) => {
    const a = adj.get(e1); if (a) a.push(e2); else adj.set(e1, [e2])
    const b = adj.get(e2); if (b) b.push(e1); else adj.set(e2, [e1])
  }
  for (let gy = 0; gy < GH - 1; gy++) {
    for (let gx = 0; gx < GW - 1; gx++) {
      const k = gy * GW + gx
      const c0 = sd[k] < 0, c1 = sd[k + 1] < 0, c2 = sd[k + GW + 1] < 0, c3 = sd[k + GW] < 0
      const code = (c0 ? 1 : 0) | (c1 ? 2 : 0) | (c2 ? 4 : 0) | (c3 ? 8 : 0)
      if (code === 0 || code === 15) continue
      const top = 2 * k, left = 2 * k + 1, right = 2 * (k + 1) + 1, bottom = 2 * (k + GW)
      const centreIn = sd[k] + sd[k + 1] + sd[k + GW] + sd[k + GW + 1] < 0
      switch (code) {
        case 1: case 14: link(top, left); break
        case 2: case 13: link(top, right); break
        case 4: case 11: link(right, bottom); break
        case 8: case 7: link(bottom, left); break
        case 3: case 12: link(left, right); break
        case 6: case 9: link(top, bottom); break
        case 5: if (centreIn) { link(top, right); link(bottom, left) } else { link(top, left); link(right, bottom) } break
        case 10: if (centreIn) { link(top, left); link(right, bottom) } else { link(top, right); link(bottom, left) } break
      }
    }
  }
  const seen = new Set<number>()
  const out: Contour[] = []
  const walk = (start: number) => {
    const chain = [start]
    seen.add(start)
    let cur = start
    for (;;) {
      const next = (adj.get(cur) ?? []).find(e => !seen.has(e))
      if (next === undefined) break
      seen.add(next); chain.push(next); cur = next
    }
    const closed = chain.length > 2 && (adj.get(cur) ?? []).includes(start)
    let pts = chain.map(edgePt)
    for (let it = 0; it < 2; it++) pts = chaikin(pts, closed)
    if (closed) pts.push(pts[0])
    for (let s = 0; s < pts.length - 1; s += 39) {
      const run = pts.slice(s, s + 40)
      out.push(boxed(run.flat(), 0))
    }
  }
  // open chains first (from their ends), then the loops
  for (const [e, n] of adj) if (n.length === 1 && !seen.has(e)) walk(e)
  for (const e of adj.keys()) if (!seen.has(e)) walk(e)
  return out
}

function chaikin(p: [number, number][], closed: boolean): [number, number][] {
  if (p.length < 3) return p
  const out: [number, number][] = closed ? [] : [p[0]]
  const n = closed ? p.length : p.length - 1
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % p.length]
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
  }
  if (!closed) out.push(p[p.length - 1])
  return out
}
