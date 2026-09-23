#!/usr/bin/env node
/**
 * Emberhold world v2: rasterise, lint, route and draw the blueprint.
 *
 *   node docs/world/tools/render.mjs                  lint + night routes, writes docs/world/map.svg
 *   node docs/world/tools/render.mjs --region kettle  one region's contents, compact
 *   node docs/world/tools/render.mjs --at 5120,4230   what is at (and near) a world point
 *   node docs/world/tools/render.mjs --borders        which regions touch, and through what
 *   node docs/world/tools/render.mjs --quiet          errors only; exit code 1 if any
 *   --no-svg · --svg <path> · --labels (label every pad) · --blueprint <path>
 *
 * Output is deliberately terse. Implementing sessions run this instead of
 * reading the ~60KB blueprint into their context. The raster here is the
 * reference for what src/world/NavGrid must produce (docs/world/sessions).
 */
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadTs } from '../../../tests/load-ts.mjs'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

// ---------------------------------------------------------------------------
// Rules. Numbers the lint enforces; DESIGN docs quote them.
// ---------------------------------------------------------------------------

export const RULES = {
  workerRadius: 760,
  campClear: { production: 600, crystalDelve: 450, defence: 400, other: 450 },
  padSpacingError: 100,
  padSpacingWarn: 130,
  padWallClear: 45,
  padFootprint: 44,
  claimToBorder: 450,
  campToClaim: 800,
  campToCamp: 900,
  spawnClamp: 2400,
}

const PRODUCTION = new Set(['lumberCamp', 'farm', 'quarry', 'mine', 'fishery', 'tradingPost'])
const DEFENCE = new Set(['watchtower', 'cannonTower'])
const NEEDS = { lumberCamp: 'tree', quarry: 'rock', mine: 'ore', crystalDelve: 'crystal', fishery: 'fish' }

const T = { LAND: 0, SEA: 1, WATER: 2, CLIFF: 3, LAVA: 4 }
const TNAME = ['land', 'sea', 'water', 'cliff', 'lava']

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const hyp = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by)

function segProj(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const L2 = dx * dx + dy * dy
  const t = L2 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0
  const tc = Math.max(0, Math.min(1, t))
  return { t, tc, d: Math.hypot(px - (ax + tc * dx), py - (ay + tc * dy)) }
}

export function inPoly(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function distToPolyline(x, y, pts, closed = false) {
  let best = Infinity
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length]
    best = Math.min(best, segProj(x, y, ax, ay, bx, by).d)
  }
  return best
}

function polyArea(poly) {
  let a = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1])
  return Math.abs(a / 2)
}

function polyCentroid(poly) {
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
function samplePolyline(pts, step, closed = false) {
  const out = []
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
// Loading
// ---------------------------------------------------------------------------

export async function loadBlueprint(path) {
  const candidates = path ? [path] : ['src/config/world/blueprint.ts', 'docs/world/blueprint.ts']
  for (const c of candidates) {
    const abs = resolve(ROOT, c)
    if (existsSync(abs)) return { bp: await loadTs(abs), path: c }
  }
  throw new Error(`blueprint not found (tried ${candidates.join(', ')})`)
}

// ---------------------------------------------------------------------------
// Raster: terrain, crossings and regions at navCell resolution
// ---------------------------------------------------------------------------

export function rasterise(bp) {
  const { width: W, height: H, navCell: C } = bp.WORLD2
  const GW = Math.ceil(W / C), GH = Math.ceil(H / C), N = GW * GH
  const terrain = new Uint8Array(N)
  const crossing = new Int16Array(N).fill(-1)
  const region = new Int8Array(N).fill(-1)
  const F = bp.FEATURES
  const crossings = F.crossings

  const paint = (x0, y0, x1, y1, fn) => {
    const gx0 = Math.max(0, Math.floor(x0 / C)), gy0 = Math.max(0, Math.floor(y0 / C))
    const gx1 = Math.min(GW - 1, Math.floor(x1 / C)), gy1 = Math.min(GH - 1, Math.floor(y1 / C))
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) fn(gy * GW + gx, gx * C + C / 2, gy * C + C / 2)
  }
  const bbox = pts => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    return [x0, y0, x1, y1]
  }
  const polygon = (poly, fn) => { const [x0, y0, x1, y1] = bbox(poly); paint(x0, y0, x1, y1, (i, x, y) => { if (inPoly(x, y, poly)) fn(i) }) }
  const band = (pts, code) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, ay, aw] = pts[s], [bx, by, bw] = pts[s + 1]
      const m = Math.max(aw, bw) / 2 + C
      paint(Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m, (i, x, y) => {
        const p = segProj(x, y, ax, ay, bx, by)
        if (p.d < (aw + (bw - aw) * p.tc) / 2) terrain[i] = code
      })
    }
  }
  const ellipse = (cx, cy, rx, ry, fn) => paint(cx - rx, cy - ry, cx + rx, cy + ry, (i, x, y) => {
    const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
    fn(i, q)
  })

  bp.REGIONS.forEach((r, k) => polygon(r.poly, i => { region[i] = k }))
  polygon(F.sea, i => { terrain[i] = T.SEA })
  for (const r of F.rivers) band(r.pts, T.WATER)
  for (const l of F.lakes) {
    ellipse(l.cx, l.cy, l.rx, l.ry, (i, q) => { if (q < 1) terrain[i] = T.WATER })
    if (l.isle) ellipse(l.isle.cx, l.isle.cy, l.isle.r, l.isle.r, (i, q) => { if (q < 1) terrain[i] = T.LAND })
  }
  for (const c of F.cliffs) band(c.pts.map(([x, y]) => [x, y, c.thickness]), T.CLIFF)
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

  const r = {
    W, H, C, GW, GH, N, terrain, under, crossing, region, bp,
    cell: (x, y) => {
      const gx = Math.floor(x / C), gy = Math.floor(y / C)
      return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? -1 : gy * GW + gx
    },
    xy: i => [(i % GW) * C + C / 2, Math.floor(i / GW) * C + C / 2],
    /** sealed: treat sealedUntil crossings as still closed */
    passable(i, sealed = false) {
      if (i < 0 || terrain[i] !== T.LAND) return false
      if (sealed && crossing[i] >= 0 && crossings[crossing[i]].sealedUntil && under[i] !== T.LAND) return false
      return true
    },
    /** cost multiplier: fords slow you while you are in the water */
    slowCost(i) {
      const k = crossing[i]
      if (k < 0 || under[i] === T.LAND) return 1
      const s = crossings[k].slow
      return s ? 1 / s : 1
    },
  }
  r.regionAt = (x, y) => { for (const g of bp.REGIONS) if (inPoly(x, y, g.poly)) return g.id; return null }
  return r
}

// ---------------------------------------------------------------------------
// Pathing: an 8-way Dijkstra flow field toward the hall, like the game's
// planned NavGrid. No corner cutting.
// ---------------------------------------------------------------------------

const NB8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]]

class Heap {
  constructor() { this.k = []; this.v = [] }
  get size() { return this.k.length }
  push(key, val) {
    const { k, v } = this
    let i = k.length
    k.push(key); v.push(val)
    while (i > 0) {
      const p = (i - 1) >> 1
      if (v[p] <= val) break
      k[i] = k[p]; v[i] = v[p]; i = p
    }
    k[i] = key; v[i] = val
  }
  pop() {
    const { k, v } = this
    const topK = k[0], topV = v[0]
    const lk = k.pop(), lv = v.pop()
    if (k.length) {
      let i = 0
      for (;;) {
        const l = 2 * i + 1, rr = l + 1
        let m = i, mv = lv
        if (l < k.length && v[l] < mv) { m = l; mv = v[l] }
        if (rr < k.length && v[rr] < mv) { m = rr; mv = v[rr] }
        if (m === i) break
        k[i] = k[m]; v[i] = v[m]; i = m
      }
      k[i] = lk; v[i] = lv
    }
    return [topK, topV]
  }
}

function step(r, i, dx, dy, sealed) {
  const gx = i % r.GW, gy = Math.floor(i / r.GW)
  const nx = gx + dx, ny = gy + dy
  if (nx < 0 || ny < 0 || nx >= r.GW || ny >= r.GH) return -1
  const j = ny * r.GW + nx
  if (!r.passable(j, sealed)) return -1
  if (dx && dy && (!r.passable(gy * r.GW + nx, sealed) || !r.passable(ny * r.GW + gx, sealed))) return -1
  return j
}

export function flowField(r, sources, sealed = false) {
  const d = new Float64Array(r.N).fill(Infinity)
  const h = new Heap()
  for (const s of sources) if (s >= 0) { d[s] = 0; h.push(s, 0) }
  while (h.size) {
    const [i, di] = h.pop()
    if (di > d[i]) continue
    for (const [dx, dy, c] of NB8) {
      const j = step(r, i, dx, dy, sealed)
      if (j < 0) continue
      const nd = di + c * r.C * r.slowCost(j)
      if (nd < d[j]) { d[j] = nd; h.push(j, nd) }
    }
  }
  return d
}

function nearestPassable(r, x, y, sealed = false) {
  const c = r.cell(x, y)
  if (r.passable(c, sealed)) return c
  for (let rad = 1; rad <= 8; rad++) {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
      const j = r.cell(x + dx * r.C, y + dy * r.C)
      if (r.passable(j, sealed)) return j
    }
  }
  return -1
}

/** distance from (x,y) to the nearest impassable cell centre, searching `max` px */
function blockedWithin(r, x, y, max) {
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

function descend(r, field, from, sealed) {
  const path = [from]
  let i = from
  for (let guard = 0; guard < 20000 && field[i] > 0; guard++) {
    let best = -1, bv = field[i]
    for (const [dx, dy] of NB8) {
      const j = step(r, i, dx, dy, sealed)
      if (j >= 0 && field[j] < bv) { bv = field[j]; best = j }
    }
    if (best < 0) break
    path.push(best)
    i = best
  }
  return path
}

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------

export function lint(bp, r) {
  const out = []
  const E = (what, msg) => out.push({ level: 'E', what, msg })
  const W = (what, msg) => out.push({ level: 'W', what, msg })
  const at = (x, y) => `(${Math.round(x)},${Math.round(y)})`
  const regionById = Object.fromEntries(bp.REGIONS.map(g => [g.id, g]))
  const campById = Object.fromEntries(bp.CAMPS.map(c => [c.id, c]))
  const mawById = Object.fromEntries(bp.MAWS.map(m => [m.id, m]))
  const hall = bp.PADS.find(p => p.id === 'hall')
  if (!hall) { E('pads', "no pad with id 'hall'"); return out }
  const reach = flowField(r, [r.cell(hall.x, hall.y)])
  const reachable = (x, y) => { const c = nearestPassable(r, x, y); return c >= 0 && reach[c] < Infinity }
  const landAt = (x, y) => { const c = r.cell(x, y); return c >= 0 && r.terrain[c] === T.LAND }
  const onCrossing = (x, y) => { const c = r.cell(x, y); return c >= 0 && r.crossing[c] >= 0 && r.under[c] !== T.LAND }

  // ids
  const dupes = (list, kind) => {
    const seen = new Set()
    for (const o of list) { if (seen.has(o.id)) E(kind, `duplicate id ${o.id}`); seen.add(o.id) }
  }
  dupes(bp.REGIONS, 'regions'); dupes(bp.PADS, 'pads'); dupes(bp.CAMPS, 'camps'); dupes(bp.POIS, 'pois')
  dupes(bp.FEATURES.crossings, 'crossings'); dupes(bp.ROADS, 'roads'); dupes(bp.WALLS, 'walls'); dupes(bp.MAWS, 'maws')

  // references
  for (const g of bp.REGIONS) {
    if (!regionById[g.claim.from]) E(`region ${g.id}`, `claim.from '${g.claim.from}' is not a region`)
    for (const c of g.requiresCamps ?? []) if (!campById[c]) E(`region ${g.id}`, `requiresCamps '${c}' is not a camp`)
  }
  for (const c of bp.FEATURES.crossings) if (c.sealedUntil && !campById[c.sealedUntil]) E(`crossing ${c.id}`, `sealedUntil '${c.sealedUntil}' is not a camp`)
  for (const a of bp.APPROACHES) {
    for (const id of a.chain) if (!campById[id] && !mawById[id]) E(`approach ${a.id}`, `chain entry '${id}' is neither camp nor maw`)
    for (const v of a.via ?? []) if (!bp.FEATURES.crossings.some(c => c.id === v)) E(`approach ${a.id}`, `via '${v}' is not a crossing`)
  }
  for (const x of [...bp.PADS, ...bp.CAMPS, ...bp.NODES, ...bp.POIS, ...bp.MAWS, ...bp.WALLS])
    if (!regionById[x.region]) E('refs', `${x.id ?? x.type} names unknown region '${x.region}'`)

  // coverage: every natural land cell belongs to exactly one region
  let orphan = 0, orphanAt = null
  for (let i = 0; i < r.N; i++) if (r.under[i] === T.LAND && r.region[i] < 0) { orphan++; orphanAt ??= r.xy(i) }
  if (orphan) E('regions', `${orphan} land cells belong to no region, e.g. ${at(...orphanAt)}`)

  // reachability: pockets of land the hall cannot walk to (all crossings open)
  const seenU = new Uint8Array(r.N)
  for (let i = 0; i < r.N; i++) {
    if (seenU[i] || r.terrain[i] !== T.LAND || reach[i] < Infinity) continue
    const q = [i]; seenU[i] = 1
    let n = 0, sx = 0, sy = 0
    while (q.length) {
      const k = q.pop(); n++
      const [x, y] = r.xy(k); sx += x; sy += y
      for (const [dx, dy] of NB8.slice(0, 4)) {
        const j = step(r, k, dx, dy, false)
        if (j >= 0 && !seenU[j] && reach[j] === Infinity) { seenU[j] = 1; q.push(j) }
      }
    }
    if (n >= 12) W('reach', `${n} cells of ${r.regionAt(sx / n, sy / n) ?? 'no region'} unreachable near ${at(sx / n, sy / n)}`)
  }

  // crossings actually cross something, and land on land
  for (const c of bp.FEATURES.crossings) {
    for (const [end, [x, y]] of [['a', c.a], ['b', c.b]]) {
      const i = r.cell(x, y)
      if (i >= 0 && r.under[i] !== T.LAND) W(`crossing ${c.id}`, `end ${end} ${at(x, y)} is in ${TNAME[r.under[i]]}; lengthen it`)
    }
    const mid = r.cell((c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2)
    if (mid >= 0 && r.under[mid] === T.LAND) W(`crossing ${c.id}`, 'its middle is dry land: it crosses nothing')
  }

  // regions: claim points
  for (const g of bp.REGIONS) {
    if (g.id === 'hold') continue
    const { x, y, from } = g.claim
    const got = r.regionAt(x, y)
    if (got !== from) E(`claim ${g.id}`, `${at(x, y)} is in ${got ?? 'no region'}, expected ${from} (the claimed side)`)
    if (!landAt(x, y)) E(`claim ${g.id}`, `${at(x, y)} is not on land`)
    else if (!reachable(x, y)) E(`claim ${g.id}`, `${at(x, y)} is unreachable`)
    const d = distToPolyline(x, y, g.poly, true)
    if (d > RULES.claimToBorder) W(`claim ${g.id}`, `${Math.round(d)}px from the ${g.id} border (max ${RULES.claimToBorder})`)
  }

  // pads
  const walls = bp.WALLS
  const threats = [...bp.CAMPS.map(c => ({ ...c, kind: 'camp' })), ...bp.MAWS.map(m => ({ ...m, kind: 'maw' }))]
  for (const p of bp.PADS) {
    const tag = `pad ${p.id}`
    const got = r.regionAt(p.x, p.y)
    if (got !== p.region) E(tag, `${at(p.x, p.y)} is in ${got ?? 'no region'}, not ${p.region}`)
    const foot = [[0, 0], ...[0, 1, 2, 3, 4, 5, 6, 7].map(k => [Math.cos(k * Math.PI / 4) * RULES.padFootprint, Math.sin(k * Math.PI / 4) * RULES.padFootprint])]
    const wet = foot.filter(([dx, dy]) => !landAt(p.x + dx, p.y + dy) || onCrossing(p.x + dx, p.y + dy))
    if (wet.length) E(tag, `footprint at ${at(p.x, p.y)} is not all dry land (${wet.length}/9 samples)`)
    else if (!reachable(p.x, p.y)) E(tag, 'unreachable')
    const reg = regionById[p.region]
    if (reg && p.hall != null && p.hall < reg.hall) W(tag, `hall ${p.hall} is below ${p.region}'s hall ${reg.hall}`)
    for (const w of walls) {
      const d = distToPolyline(p.x, p.y, w.pts, w.ring)
      if (d < RULES.padWallClear) W(tag, `${Math.round(d)}px from wall ${w.id} (min ${RULES.padWallClear})`)
    }
    const need = p.key === 'crystalDelve' ? RULES.campClear.crystalDelve
      : PRODUCTION.has(p.key) ? RULES.campClear.production
      : DEFENCE.has(p.key) ? RULES.campClear.defence : RULES.campClear.other
    for (const t of threats) {
      const d = hyp(p.x, p.y, t.x, t.y)
      if (d < need) (t.kind === 'camp' && p.key !== 'house' && p.key !== 'outpost' ? E : W)(tag, `${Math.round(d)}px from ${t.kind} ${t.id} (min ${need} for ${p.key})`)
    }
    const want = NEEDS[p.key]
    if (want) {
      const fields = bp.NODES.filter(f => f.type === want && hyp(p.x, p.y, f.x, f.y) <= RULES.workerRadius)
      const n = fields.reduce((s, f) => s + f.n, 0)
      if (!fields.length) E(tag, `no ${want} field within ${RULES.workerRadius}px`)
      else if (n < 6) W(tag, `only ${n} ${want} nodes within ${RULES.workerRadius}px`)
    }
    for (const f of bp.NODES) {
      if (f.type === 'fish') continue
      const d = hyp(p.x, p.y, f.x, f.y)
      if (d < f.r + 60) W(tag, `sits in a ${f.type} field ${at(f.x, f.y)} (${Math.round(d)}px, field r${f.r})`)
    }
  }
  for (let a = 0; a < bp.PADS.length; a++) for (let b = a + 1; b < bp.PADS.length; b++) {
    const p = bp.PADS[a], q = bp.PADS[b]
    const d = hyp(p.x, p.y, q.x, q.y)
    if (d < RULES.padSpacingError) E(`pad ${p.id}`, `${Math.round(d)}px from pad ${q.id} (min ${RULES.padSpacingError})`)
    else if (d < RULES.padSpacingWarn) W(`pad ${p.id}`, `${Math.round(d)}px from pad ${q.id} (want ${RULES.padSpacingWarn})`)
  }

  // camps and maws
  for (const c of bp.CAMPS) {
    const tag = `camp ${c.id}`
    const got = r.regionAt(c.x, c.y)
    if (got !== c.region) E(tag, `${at(c.x, c.y)} is in ${got ?? 'no region'}, not ${c.region}`)
    if (!landAt(c.x, c.y)) E(tag, `${at(c.x, c.y)} is not on land`)
    else if (!reachable(c.x, c.y)) E(tag, 'unreachable')
    const claim = regionById[c.region]?.claim
    if (claim) {
      const d = hyp(c.x, c.y, claim.x, claim.y)
      if (d < RULES.campToClaim) W(tag, `${Math.round(d)}px from its region's claim point (want ${RULES.campToClaim})`)
    }
    for (const o of bp.CAMPS) if (o.id > c.id) {
      const d = hyp(c.x, c.y, o.x, o.y)
      if (d < RULES.campToCamp) W(tag, `${Math.round(d)}px from camp ${o.id} (want ${RULES.campToCamp})`)
    }
  }
  for (const m of bp.MAWS) {
    const got = r.regionAt(m.x, m.y)
    if (got !== m.region) E(`maw ${m.id}`, `${at(m.x, m.y)} is in ${got ?? 'no region'}, not ${m.region}`)
    if (!reachable(m.x, m.y)) E(`maw ${m.id}`, 'unreachable')
  }

  // resource fields
  for (const f of bp.NODES) {
    const tag = `field ${f.type}${at(f.x, f.y)}`
    const got = r.regionAt(f.x, f.y)
    const home = regionById[f.region]
    const offshore = f.type === 'fish' && got === null && home && distToPolyline(f.x, f.y, home.poly, true) < f.r + 100
    if (got !== f.region && !offshore) E(tag, `is in ${got ?? 'no region'}, not ${f.region}`)
    let dry = 0, all = 0
    for (let k = 0; k < 24; k++) {
      const rad = f.r * Math.sqrt((k + 0.5) / 24), ang = k * 2.39996
      all++
      if (landAt(f.x + Math.cos(ang) * rad, f.y + Math.sin(ang) * rad)) dry++
    }
    if (f.type !== 'fish' && dry / all < 0.6) W(tag, `only ${Math.round((100 * dry) / all)}% of it is on land`)
    if (f.type === 'fish' && dry / all > 0.85) W(tag, 'a fish field with almost no water in it')
    if (!reachable(f.x, f.y)) E(tag, 'unreachable')
  }

  // points of interest
  for (const p of bp.POIS) {
    if (p.kind === 'relic') continue
    const tag = `poi ${p.id}`
    const got = r.regionAt(p.x, p.y)
    if (got !== p.region) E(tag, `${at(p.x, p.y)} is in ${got ?? 'no region'}, not ${p.region}`)
    if (!landAt(p.x, p.y)) E(tag, `${at(p.x, p.y)} is not on land`)
    else if (!reachable(p.x, p.y)) E(tag, 'unreachable')
    for (const q of bp.PADS) {
      const d = hyp(p.x, p.y, q.x, q.y)
      if (d < 90) W(tag, `${Math.round(d)}px from pad ${q.id}`)
    }
  }

  // roads only cross impassable ground at a crossing
  for (const rd of bp.ROADS) {
    let run = null
    const flush = () => { if (run) E(`road ${rd.id}`, `crosses ${run.t} from ${at(...run.a)} to ${at(...run.b)} with no crossing`); run = null }
    for (const [x, y] of samplePolyline(rd.pts, 16)) {
      const i = r.cell(x, y)
      if (i >= 0 && r.terrain[i] !== T.LAND) { run ??= { t: TNAME[r.terrain[i]], a: [x, y] }; run.b = [x, y] } else flush()
    }
    flush()
  }

  // walls: every stepped wall pad on land; gates on the line
  for (const w of walls) {
    const pts = samplePolyline(w.pts, w.step, w.ring)
    const inner = w.ring ? pts : pts.slice(1, -1)
    const bad = inner.filter(([x, y]) => !landAt(x, y) || onCrossing(x, y))
    if (bad.length) W(`wall ${w.id}`, `${bad.length}/${pts.length} wall pads off dry land, e.g. ${at(...bad[0])}`)
    if (!w.ring) for (const [x, y] of [w.pts[0], w.pts.at(-1)]) {
      const d = blockedWithin(r, x, y, 128)
      if (d > 64) W(`wall ${w.id}`, `end ${at(x, y)} is ${d === Infinity ? '128+' : Math.round(d)}px from anything impassable: the horde walks round it`)
    }
    for (const g of w.gates) {
      const d = distToPolyline(g.x, g.y, w.pts, w.ring)
      if (d > 20) E(`wall ${w.id}`, `gate ${g.id} is ${Math.round(d)}px off the wall line`)
    }
  }

  return out
}

// ---------------------------------------------------------------------------
// Night routes: each approach's musters walked to the hall, sealed crossings shut
// ---------------------------------------------------------------------------

export function approachRoutes(bp, r) {
  const hall = bp.PADS.find(p => p.id === 'hall')
  const field = flowField(r, [r.cell(hall.x, hall.y)], true)
  const viaFields = new Map()
  const viaField = id => {
    if (!viaFields.has(id)) {
      const c = bp.FEATURES.crossings.find(q => q.id === id)
      const mid = nearestPassable(r, (c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2, true)
      viaFields.set(id, { f: flowField(r, [mid], true), mid })
    }
    return viaFields.get(id)
  }
  const campById = Object.fromEntries(bp.CAMPS.map(c => [c.id, c]))
  const mawById = Object.fromEntries(bp.MAWS.map(m => [m.id, m]))
  const routes = []
  for (const a of bp.APPROACHES) {
    a.chain.forEach((id, k) => {
      const src = campById[id] ?? mawById[id]
      const start = nearestPassable(r, src.x, src.y, true)
      if (start < 0 || field[start] === Infinity) { routes.push({ approach: a.id, k, id, error: 'no path to the hall' }); return }
      let cells = [start]
      for (const v of a.via ?? []) {
        const { f } = viaField(v)
        if (f[cells.at(-1)] === Infinity) break
        cells = cells.concat(descend(r, f, cells.at(-1), true).slice(1))
      }
      cells = cells.concat(descend(r, field, cells.at(-1), true).slice(1))
      let len = 0, toHold = null
      const crossings = [], regions = []
      for (let s = 0; s < cells.length; s++) {
        const c = cells[s]
        if (s) { const [x0, y0] = r.xy(cells[s - 1]), [x1, y1] = r.xy(c); len += hyp(x0, y0, x1, y1) }
        const cr = r.crossing[c]
        if (cr >= 0 && r.under[c] !== T.LAND) { const cid = bp.FEATURES.crossings[cr].id; if (crossings.at(-1) !== cid) crossings.push(cid) }
        const rg = r.region[c] >= 0 ? bp.REGIONS[r.region[c]].id : '?'
        if (regions.at(-1) !== rg) regions.push(rg)
        if (toHold === null && rg === 'hold') toHold = len
      }
      routes.push({ approach: a.id, raid: !!a.raid, k, id, len, toHold, crossings, regions, cells })
    })
  }
  return routes
}

// ---------------------------------------------------------------------------
// Region / point summaries: cheap context for implementing sessions
// ---------------------------------------------------------------------------

function bag(b) {
  const short = { coins: 'c', wood: 'w', food: 'f', stone: 's', metal: 'm', crystal: 'x' }
  const s = Object.entries(b ?? {}).map(([k, v]) => `${v}${short[k] ?? k}`).join(' ')
  return s || 'free'
}

export function borders(bp, r) {
  const pairs = new Map()
  for (let i = 0; i < r.N; i++) {
    const a = r.region[i]
    if (a < 0) continue
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const j = step(r, i, dx, dy, false)
      if (j < 0 || !r.passable(i) || r.region[j] < 0 || r.region[j] === a) continue
      const b = r.region[j]
      const key = [bp.REGIONS[Math.min(a, b)].id, bp.REGIONS[Math.max(a, b)].id].join('|')
      const e = pairs.get(key) ?? { cells: 0, via: new Set() }
      e.cells++
      for (const c of [i, j]) if (r.crossing[c] >= 0 && r.under[c] !== T.LAND) e.via.add(bp.FEATURES.crossings[r.crossing[c]].id)
      pairs.set(key, e)
    }
  }
  return [...pairs.entries()].map(([k, e]) => {
    const [a, b] = k.split('|')
    return { a, b, open: e.cells * r.C, via: [...e.via] }
  }).sort((x, y) => x.a.localeCompare(y.a) || x.b.localeCompare(y.b))
}

export function describeRegion(bp, r, id) {
  const g = bp.REGIONS.find(x => x.id === id)
  if (!g) return `no region '${id}'. regions: ${bp.REGIONS.map(x => x.id).join(' ')}`
  const k = bp.REGIONS.indexOf(g)
  let cells = 0, land = 0
  for (let i = 0; i < r.N; i++) if (r.region[i] === k) { cells++; if (r.terrain[i] === T.LAND) land++ }
  const P = p => `(${p.x},${p.y})`
  const lines = []
  lines.push(`${g.id}: ${g.name}  tier ${g.tier} · hall ${g.hall} · cost ${bag(g.cost)} · ${g.biome}${g.optional ? ' · optional' : ''}${g.requiresCamps ? ` · needs ${g.requiresCamps.join(', ')} burned` : ''}`)
  lines.push(`  ${g.identity}`)
  lines.push(`  area ${(polyArea(g.poly) / 1e6).toFixed(1)}M px² (old world 9.5M) · ${Math.round((100 * land) / Math.max(1, cells))}% walkable`)
  if (g.id !== 'hold') lines.push(`  claim ${P(g.claim)} from ${g.claim.from}: ${g.claim.at}`)
  const bs = borders(bp, r).filter(b => b.a === id || b.b === id)
  lines.push(`  borders ${bs.map(b => `${b.a === id ? b.b : b.a}${b.via.length ? `[${b.via.join('+')}]` : ''}(${b.open}px)`).join(' ')}`)
  const pads = bp.PADS.filter(p => p.region === id)
  lines.push(`  pads(${pads.length}) ${pads.map(p => `${p.id}:${p.key}${P(p)}h${p.hall ?? 1}`).join(' ')}`)
  for (const c of bp.CAMPS.filter(c => c.region === id))
    lines.push(`  camp ${c.id} ${c.tier} ${c.hp}hp ${P(c)} ${c.spawns.count}×${c.spawns.key}/${c.spawns.every}s${c.boss ? ` boss ${c.boss}` : ''} reward ${bag(c.reward)}`)
  for (const m of bp.MAWS.filter(m => m.region === id)) lines.push(`  maw ${m.id} ${P(m)}`)
  const fields = bp.NODES.filter(f => f.region === id)
  lines.push(`  fields ${fields.map(f => `${f.type}${P(f)}r${f.r}n${f.n}`).join(' ')}`)
  const pois = bp.POIS.filter(p => p.region === id)
  lines.push(`  pois ${pois.map(p => `${p.id}:${p.kind}${P(p)}`).join(' ')}`)
  const walls = bp.WALLS.filter(w => w.region === id)
  if (walls.length) lines.push(`  walls ${walls.map(w => `${w.id} h${w.hall} gates ${w.gates.map(q => q.id).join('/')}`).join(' · ')}`)
  const roads = bp.ROADS.filter(rd => rd.pts.some(([x, y]) => inPoly(x, y, g.poly)))
  lines.push(`  roads ${roads.map(rd => rd.id).join(' ')}`)
  return lines.join('\n')
}

function describePoint(bp, r, x, y) {
  const i = r.cell(x, y)
  const lines = [`(${x},${y}) region ${r.regionAt(x, y) ?? 'none'} · ${i >= 0 ? TNAME[r.terrain[i]] : 'outside the world'}${i >= 0 && r.crossing[i] >= 0 ? ` · crossing ${bp.FEATURES.crossings[r.crossing[i]].id}` : ''}`]
  const near = [
    ...bp.PADS.map(p => ['pad', p.id, p.x, p.y]), ...bp.CAMPS.map(c => ['camp', c.id, c.x, c.y]),
    ...bp.POIS.map(p => [p.kind, p.id, p.x, p.y]), ...bp.MAWS.map(m => ['maw', m.id, m.x, m.y]),
    ...bp.NODES.map(f => [`field`, f.type, f.x, f.y]),
  ].map(([k, id, px, py]) => [k, id, Math.round(hyp(x, y, px, py))]).filter(e => e[2] <= 500).sort((a, b) => a[2] - b[2])
  lines.push(`  within 500px: ${near.map(([k, id, d]) => `${k} ${id} ${d}px`).join(' · ') || 'nothing'}`)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// SVG atlas
// ---------------------------------------------------------------------------

const BIOME = {
  rise: '#dccb98', meadow: '#cfdd9c', forest: '#a3c488', oldgrowth: '#86ad7a', village: '#d8cca2', marsh: '#b3c7a6',
  scarp: '#cdbf9c', highland: '#d4dfdb', rust: '#d3a986', sulphur: '#e3d58a', farmland: '#e6d98e', moor: '#aeb08e',
  badlands: '#bba48a', deeprock: '#a39a91', ash: '#958a84', obsidian: '#7a6b6e', slag: '#907569',
}
const NODE_COL = { tree: '#2f6b2f', rock: '#6b6b6b', ore: '#8b4a2b', crystal: '#8e44ad', fish: '#1f6f99' }
const ROUTE_COL = { south: '#c0392b', west: '#d35400', east: '#8e44ad', southeast: '#b7950b', north: '#1f618d', northwest: '#117a65', northeast: '#5d6d7e', farwest: '#7b241c' }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function svg(bp, r, routes, issues, { labels = false } = {}) {
  const { W, H } = r
  const PANEL = 2300
  const o = []
  const pts = a => a.map(([x, y]) => `${x},${y}`).join(' ')
  const text = (x, y, s, size, extra = '') => o.push(`<text x="${x}" y="${y}" font-size="${size}" ${extra}>${esc(s)}</text>`)
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + PANEL} ${H}" width="${Math.round((W + PANEL) * 0.2)}" height="${Math.round(H * 0.2)}" font-family="Georgia, serif">`)
  o.push(`<rect width="${W + PANEL}" height="${H}" fill="#f3ede0"/>`)

  // regions
  for (const g of bp.REGIONS) o.push(`<polygon points="${pts(g.poly)}" fill="${BIOME[g.biome] ?? '#ccc'}" stroke="#5b4a36" stroke-width="10" stroke-opacity=".55"/>`)
  // chunk grid
  for (let x = 0; x <= W; x += bp.WORLD2.chunk) o.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#000" stroke-opacity=".06" stroke-width="6"/>`)
  for (let y = 0; y <= H; y += bp.WORLD2.chunk) o.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#000" stroke-opacity=".06" stroke-width="6"/>`)
  // nodes under everything built
  for (const f of bp.NODES) o.push(`<circle cx="${f.x}" cy="${f.y}" r="${f.r}" fill="${NODE_COL[f.type]}" fill-opacity=".32"/>`)

  // blocked terrain, straight from the raster so the picture is what the lint saw
  const col = { [T.SEA]: '#8fb3c9', [T.WATER]: '#78a6c3', [T.CLIFF]: '#4a3b2c', [T.LAVA]: '#e0662e' }
  for (let gy = 0; gy < r.GH; gy++) {
    let gx = 0
    while (gx < r.GW) {
      const t = r.under[gy * r.GW + gx]
      if (t === T.LAND) { gx++; continue }
      let e = gx
      while (e < r.GW && r.under[gy * r.GW + e] === t) e++
      o.push(`<rect x="${gx * r.C}" y="${gy * r.C}" width="${(e - gx) * r.C}" height="${r.C + 0.5}" fill="${col[t]}"/>`)
      gx = e
    }
  }
  // crossings
  const XCOL = { bridge: '#a58a64', ford: '#a9c8d6', pass: '#d9c6a1', stair: '#d9c6a1', causeway: '#b59c7a' }
  for (const c of bp.FEATURES.crossings) {
    o.push(`<line x1="${c.a[0]}" y1="${c.a[1]}" x2="${c.b[0]}" y2="${c.b[1]}" stroke="${XCOL[c.kind]}" stroke-width="${c.width}"/>`)
    if (c.sealedUntil) o.push(`<line x1="${c.a[0]}" y1="${c.a[1]}" x2="${c.b[0]}" y2="${c.b[1]}" stroke="#ff3b00" stroke-width="${c.width / 3}" stroke-dasharray="30 20"/>`)
    text((c.a[0] + c.b[0]) / 2 + c.width / 2 + 30, (c.a[1] + c.b[1]) / 2 + 20, c.name.replace(/^the /, ''), 60, 'fill="#1b2a38" font-style="italic"')
  }
  // roads
  for (const rd of bp.ROADS) o.push(`<polyline points="${pts(rd.pts)}" fill="none" stroke="#7a5a36" stroke-width="${rd.width / 2 + 10}" stroke-dasharray="70 40" stroke-opacity=".85" stroke-linecap="round" stroke-linejoin="round"/>`)
  // walls
  for (const w of bp.WALLS) {
    o.push(`<${w.ring ? 'polygon' : 'polyline'} points="${pts(w.pts)}" fill="none" stroke="#2b2b2b" stroke-width="26" stroke-opacity="${w.hall > 1 ? 0.55 : 0.9}"/>`)
    for (const g of w.gates) o.push(`<circle cx="${g.x}" cy="${g.y}" r="34" fill="#f3ede0" stroke="#2b2b2b" stroke-width="10"/>`)
  }
  // old world footprint, centred on the hall
  const hall = bp.PADS.find(p => p.id === 'hall')
  const L = bp.WORLD2.legacy
  o.push(`<rect x="${hall.x - L.width / 2}" y="${hall.y - L.height / 2}" width="${L.width}" height="${L.height}" fill="none" stroke="#c0392b" stroke-width="16" stroke-dasharray="60 40"/>`)
  text(hall.x - L.width / 2 + 30, hall.y - L.height / 2 - 30, `the old world, ${L.width}×${L.height}, to scale`, 70, 'fill="#c0392b"')

  // night routes
  for (const rt of routes) {
    if (!rt.cells) continue
    const line = rt.cells.filter((_, k) => k % 4 === 0).map(c => r.xy(c))
    o.push(`<polyline points="${pts(line)}" fill="none" stroke="${ROUTE_COL[rt.approach] ?? '#000'}" stroke-width="${rt.k ? 22 : 38}" stroke-opacity="${rt.k ? 0.35 : 0.6}" stroke-dasharray="${rt.raid ? '40 40' : 'none'}" stroke-linejoin="round"/>`)
  }

  // pads
  for (const p of bp.PADS) {
    const s = p.key === 'townHall' ? 90 : 56
    if (p.key === 'outpost') {
      o.push(`<path d="M${p.x} ${p.y - 80} L${p.x + 70} ${p.y} L${p.x} ${p.y + 80} L${p.x - 70} ${p.y} Z" fill="#e0a526" stroke="#3b2a12" stroke-width="10"/>`)
      text(p.x + 80, p.y + 20, p.id, 54, 'fill="#3b2a12" font-weight="bold"')
      continue
    }
    const fill = DEFENCE.has(p.key) ? '#34495e' : PRODUCTION.has(p.key) || p.key === 'crystalDelve' ? '#5e8c31' : '#fbf6ea'
    o.push(`<rect x="${p.x - s / 2}" y="${p.y - s / 2}" width="${s}" height="${s}" fill="${fill}" stroke="#222" stroke-width="8"${(p.hall ?? 1) > 1 ? ' stroke-dasharray="14 8"' : ''}/>`)
    if (labels) text(p.x + s / 2 + 8, p.y + 14, p.id, 36, 'fill="#222"')
  }
  // camps, maws, throne
  const CR = { warcamp: 110, stronghold: 150, fortress: 200 }
  for (const c of bp.CAMPS) {
    o.push(`<circle cx="${c.x}" cy="${c.y}" r="${CR[c.tier]}" fill="#b3261e" stroke="#1a0a08" stroke-width="14"/>`)
    text(c.x + CR[c.tier] + 20, c.y + 25, c.name.replace(/^the /, ''), 70, 'fill="#5a0f0a" font-weight="bold"')
  }
  for (const m of bp.MAWS) {
    o.push(`<circle cx="${m.x}" cy="${m.y}" r="140" fill="#4b1e5a" stroke="#12051a" stroke-width="14"/>`)
    text(m.x + 160, m.y + 25, m.name.replace(/^the /, ''), 70, 'fill="#2d0f38" font-weight="bold"')
  }
  const th = bp.THRONE
  o.push(`<polygon points="${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => { const rr = k % 2 ? 80 : 200, a = (k * Math.PI) / 5 - Math.PI / 2; return `${th.x + Math.cos(a) * rr},${th.y + Math.sin(a) * rr}` }).join(' ')}" fill="#ffb300" stroke="#3b1c00" stroke-width="12"/>`)
  // points of interest
  for (const p of bp.POIS) {
    const { x, y } = p
    if (p.kind === 'waystone') o.push(`<path d="M${x} ${y - 60} L${x + 40} ${y} L${x} ${y + 60} L${x - 40} ${y} Z" fill="#2c7fb8" stroke="#0b2233" stroke-width="8"/>`)
    else if (p.kind === 'shrine') o.push(`<circle cx="${x}" cy="${y}" r="55" fill="#f1c40f" stroke="#5a4500" stroke-width="10"/>`)
    else if (p.kind === 'cache') o.push(`<rect x="${x - 28}" y="${y - 28}" width="56" height="56" fill="#d35400" stroke="#3b1700" stroke-width="8"/>`)
    else if (p.kind === 'lore') o.push(`<circle cx="${x}" cy="${y}" r="26" fill="#555" stroke="#111" stroke-width="6"/>`)
    else if (p.kind === 'barrow') o.push(`<path d="M${x - 55} ${y + 40} L${x} ${y - 50} L${x + 55} ${y + 40} Z" fill="#6d4c41" stroke="#20130f" stroke-width="8"/>`)
    else if (p.kind === 'survivors') o.push(`<circle cx="${x}" cy="${y}" r="50" fill="#27ae60" stroke="#0b3a1f" stroke-width="10"/>`)
    else if (p.kind === 'landmark') { o.push(`<circle cx="${x}" cy="${y}" r="46" fill="none" stroke="#111" stroke-width="16"/>`); text(x + 60, y - 50, p.name.replace(/^the /, ''), 56, 'fill="#111" font-style="italic"') }
  }
  // claim points
  for (const g of bp.REGIONS) if (g.id !== 'hold') {
    const { x, y } = g.claim
    o.push(`<path d="M${x} ${y + 60} L${x} ${y - 90} L${x + 80} ${y - 60} L${x} ${y - 30}" fill="#e67e22" stroke="#4a2300" stroke-width="10"/>`)
  }
  // region labels last, so nothing sits on them
  for (const g of bp.REGIONS) {
    const [cx, cy] = polyCentroid(g.poly)
    text(cx, cy, g.name, 150, `text-anchor="middle" fill="#1d1408" fill-opacity=".8" font-weight="bold" stroke="#f3ede0" stroke-width="10" paint-order="stroke"`)
    text(cx, cy + 120, `tier ${g.tier} · hall ${g.hall}${g.optional ? ' · optional' : ''} · ${bag(g.cost)}`, 72, 'text-anchor="middle" fill="#1d1408" fill-opacity=".75" stroke="#f3ede0" stroke-width="8" paint-order="stroke"')
  }

  // side panel
  const X = W + 120
  let y = 260
  text(X, y, 'Emberhold — World v2', 150, 'font-weight="bold" fill="#1d1408"'); y += 130
  text(X, y, `${W} × ${H} px · ${(W * H / (L.width * L.height)).toFixed(1)}× the old world`, 70, 'fill="#444"'); y += 90
  text(X, y, `${bp.REGIONS.length} regions · ${bp.PADS.length} pads · ${bp.CAMPS.length} camps · ${bp.NODES.length} fields · ${bp.POIS.length} POIs`, 62, 'fill="#444"'); y += 80
  const errs = issues.filter(i => i.level === 'E').length, warns = issues.length - errs
  text(X, y, `lint: ${errs} errors · ${warns} warnings`, 62, `fill="${errs ? '#b3261e' : '#1e7a3a'}"`); y += 150
  const key = [
    ['rect', '#fbf6ea', 'civic pad (dashed = later hall level)'], ['rect', '#5e8c31', 'production pad'], ['rect', '#34495e', 'tower pad'],
    ['diamond', '#e0a526', 'outpost (drop-off, respawn, waystone)'], ['circle', '#b3261e', 'warcamp / stronghold / fortress'], ['circle', '#4b1e5a', 'maw (permanent muster)'],
    ['flag', '#e67e22', 'claim point (border stone)'], ['diamond', '#2c7fb8', 'waystone'], ['circle', '#f1c40f', 'shrine'], ['rect', '#d35400', 'supply cache'],
    ['tri', '#6d4c41', 'barrow'], ['circle', '#27ae60', 'survivors'], ['circle', '#555', 'lore stone'],
  ]
  for (const [shape, fill, label] of key) {
    if (shape === 'rect') o.push(`<rect x="${X}" y="${y - 50}" width="60" height="60" fill="${fill}" stroke="#222" stroke-width="8"/>`)
    else if (shape === 'circle') o.push(`<circle cx="${X + 30}" cy="${y - 20}" r="34" fill="${fill}" stroke="#222" stroke-width="8"/>`)
    else if (shape === 'diamond') o.push(`<path d="M${X + 30} ${y - 70} L${X + 70} ${y - 20} L${X + 30} ${y + 30} L${X - 10} ${y - 20} Z" fill="${fill}" stroke="#222" stroke-width="8"/>`)
    else if (shape === 'tri') o.push(`<path d="M${X} ${y + 10} L${X + 30} ${y - 60} L${X + 60} ${y + 10} Z" fill="${fill}" stroke="#222" stroke-width="8"/>`)
    else o.push(`<path d="M${X + 20} ${y + 20} L${X + 20} ${y - 70} L${X + 80} ${y - 45} L${X + 20} ${y - 20}" fill="${fill}" stroke="#222" stroke-width="8"/>`)
    text(X + 110, y, label, 60, 'fill="#222"'); y += 95
  }
  y += 40
  text(X, y, 'Night approaches (first muster → hall)', 70, 'font-weight="bold" fill="#1d1408"'); y += 95
  for (const rt of routes.filter(q => q.k === 0)) {
    o.push(`<line x1="${X}" y1="${y - 22}" x2="${X + 80}" y2="${y - 22}" stroke="${ROUTE_COL[rt.approach]}" stroke-width="30" stroke-dasharray="${rt.raid ? '20 14' : 'none'}"/>`)
    text(X + 110, y, `${rt.approach}${rt.raid ? ' (raid)' : ''}: ${rt.id} · ${Math.round((rt.len ?? 0) / 100) / 10}k px${rt.crossings?.length ? ` · ${rt.crossings.join(', ')}` : ''}`, 54, 'fill="#222"')
    y += 80
  }
  y += 40
  const terrainKey = [['#8fb3c9', 'sea'], ['#78a6c3', 'river / lake'], ['#4a3b2c', 'cliff'], ['#e0662e', 'lava'], ['#a58a64', 'bridge / crossing'], ['#7a5a36', 'road (+20% ally speed)']]
  for (const [fill, label] of terrainKey) {
    o.push(`<rect x="${X}" y="${y - 50}" width="80" height="50" fill="${fill}"/>`)
    text(X + 110, y, label, 60, 'fill="#222"'); y += 80
  }
  o.push('</svg>')
  return o.join('\n')
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const flag = n => args.includes(n)
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
  const { bp, path } = await loadBlueprint(opt('--blueprint'))
  const r = rasterise(bp)

  if (opt('--region')) { console.log(describeRegion(bp, r, opt('--region'))); return }
  if (opt('--at')) { const [x, y] = opt('--at').split(',').map(Number); console.log(describePoint(bp, r, x, y)); return }
  if (flag('--borders')) {
    for (const b of borders(bp, r)) console.log(`${b.a} | ${b.b}: ${b.via.length ? `via ${b.via.join(', ')}` : 'open land'} (${b.open}px of walkable border)`)
    return
  }

  const issues = lint(bp, r)
  const routes = approachRoutes(bp, r)
  const errs = issues.filter(i => i.level === 'E')
  const quiet = flag('--quiet')
  console.log(`world lint (${path}): ${bp.REGIONS.length} regions, ${bp.PADS.length} pads, ${bp.CAMPS.length} camps, ${bp.NODES.length} fields, ${bp.POIS.length} pois — ${errs.length} errors, ${issues.length - errs.length} warnings`)
  for (const i of quiet ? errs : issues) console.log(`${i.level} ${i.what}: ${i.msg}`)
  if (!quiet) {
    console.log('night routes (sealed crossings shut; km = 1000px):')
    for (const rt of routes) {
      if (rt.error) { console.log(`  ${rt.approach}#${rt.k} ${rt.id}: ${rt.error}`); continue }
      const clamp = rt.k === 0 && rt.toHold > RULES.spawnClamp ? ` · spawns clamped ${Math.round(rt.toHold - RULES.spawnClamp)}px forward` : ''
      console.log(`  ${rt.approach}#${rt.k} ${rt.id}: ${(rt.len / 1000).toFixed(1)}k · ${rt.crossings.join(', ') || 'no crossing'} · ${rt.regions.join('›')}${clamp}`)
    }
  }
  if (!flag('--no-svg')) {
    const out = resolve(ROOT, opt('--svg') ?? 'docs/world/map.svg')
    writeFileSync(out, svg(bp, r, routes, issues, { labels: flag('--labels') }))
    if (!quiet) console.log(`wrote ${out.replace(ROOT, '')}`)
  }
  if (errs.length) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
