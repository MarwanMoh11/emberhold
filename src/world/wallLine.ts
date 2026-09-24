/**
 * Wall lines laid piece by piece (S09b).
 *
 * A blueprint wall line is a polyline with gates on it. It used to be stamped
 * with one horizontal sprite every `step` px round its bounding box, which
 * left gaps beside the gates, ladders on the vertical sides and corners that
 * never met. Here the line is split at its vertices and at each gate's jambs;
 * every stop gets a post, and each run between two stops gets
 * `ceil(length / step)` pieces spaced evenly, so no two neighbours are ever
 * more than `step` apart and the pieces meet the posts exactly.
 *
 * Each wall piece also carries its NavGrid capsule: discs every
 * WALL_CAP_STEP px, radius WALL_CAP_R, along its share of the line. A cell
 * the line crosses has its centre within ~23 px of the line, so ~24 px of a
 * disc: the band has no holes. The capsules stop GATE_CLEAR px short of a
 * gate's jambs, so the cell under the gate stays open and the horde still
 * funnels into the gate and breaks it.
 *
 * Pure TypeScript, no Phaser: tests load it with loadTs.
 */
import type { WallLineBP } from '../config/world/blueprint'

export type WallPart = 'run' | 'post'
export type WallDir = 'h' | 'v'

export interface WallPiece {
  /** `${line.id}.${k}` for walls; gates keep their blueprint ids */
  id: string
  key: 'wall' | 'gate'
  part: WallPart
  /** `h` when the line here runs more across than up the screen */
  dir: WallDir
  x: number
  y: number
  /** ground length along the line: a run's share, a post's side, a gate's width */
  len: number
  /** unit vector along the line */
  ux: number
  uy: number
  /** NavGrid capsule a → b (walls only; absent when a gate's clearance swallows it) */
  cap?: [number, number, number, number]
}

/** A gate's width along its line (BUILDINGS.gate.w). */
export const GATE_W = 64
/** A post's side: the stake cluster or stone pier at a vertex or a jamb. */
export const POST_LEN = 20
export const WALL_CAP_R = 28
export const WALL_CAP_STEP = 16
/** Capsules stop this far outside a gate's jambs: a cell centre within ~20 px of the gate stays open, and every cell past the jambs is still under a disc. */
export const GATE_CLEAR = 16

interface At { x: number; y: number; ux: number; uy: number }

/** The line as a list of pieces, in order along it. */
export function layWallLine(line: WallLineBP): WallPiece[] {
  const pts = line.pts.map(p => [p[0], p[1]] as [number, number])
  if (line.ring) pts.push([pts[0][0], pts[0][1]])
  const S = [0]
  for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const total = S[S.length - 1]

  const at = (s: number): At => {
    s = Math.max(0, Math.min(total, s))
    let i = 0
    while (i < pts.length - 2 && S[i + 1] < s) i++
    const L = S[i + 1] - S[i] || 1
    const ux = (pts[i + 1][0] - pts[i][0]) / L, uy = (pts[i + 1][1] - pts[i][1]) / L
    const t = s - S[i]
    return { x: pts[i][0] + ux * t, y: pts[i][1] + uy * t, ux, uy }
  }

  const atRing = (s: number) => at(line.ring && s > total ? s - total : s)

  // each gate projected onto the line: its arc length
  const gates = line.gates.map(g => {
    let best = Infinity, bs = 0
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
      const L = S[i + 1] - S[i]
      if (L <= 0) continue
      const t = Math.max(0, Math.min(L, ((g.x - ax) * (bx - ax) + (g.y - ay) * (by - ay)) / L))
      const px = ax + ((bx - ax) * t) / L, py = ay + ((by - ay) * t) / L
      const d = Math.hypot(g.x - px, g.y - py)
      if (d < best) { best = d; bs = S[i] + t }
    }
    return { id: g.id, s: bs, a: bs - GATE_W / 2, b: bs + GATE_W / 2 }
  }).sort((p, q) => p.s - q.s)
  const inGate = (s: number) => gates.find(g => s > g.a + 0.5 && s < g.b - 0.5)
  // A capsule keeps GATE_W / 2 + GATE_CLEAR px (straight-line, so a gate on a bend is measured the same) from every gate.
  const centres = gates.map(g => at(g.s))
  const keep = GATE_W / 2 + GATE_CLEAR - 0.5
  const clearAt = (s: number) => { const p = atRing(s); return centres.every(c => Math.hypot(p.x - c.x, p.y - c.y) >= keep) }

  // stops: the vertices (not those a gate swallows) and every jamb
  const stops: { s: number; jamb: -1 | 0 | 1 }[] = []
  const nV = line.ring ? pts.length - 1 : pts.length
  for (let i = 0; i < nV; i++) if (!inGate(S[i])) stops.push({ s: S[i], jamb: 0 })
  for (const g of gates) stops.push({ s: Math.max(0, g.a), jamb: -1 }, { s: Math.min(total, g.b), jamb: 1 })
  stops.sort((p, q) => p.s - q.s)
  for (let k = stops.length - 1; k > 0; k--) {
    if (stops[k].s - stops[k - 1].s < 0.5) {
      if (stops[k - 1].jamb === 0) stops[k - 1].jamb = stops[k].jamb
      stops.splice(k, 1)
    }
  }
  // a ring's runs close back onto its first stop
  const ends = line.ring ? [...stops, { s: stops[0].s + total, jamb: stops[0].jamb }] : stops
  const out: WallPiece[] = []
  let k = 0
  const r1 = (v: number) => Math.round(v * 10) / 10
  const dirOf = (ux: number, uy: number): WallDir => (Math.abs(ux) >= Math.abs(uy) ? 'h' : 'v')
  const wall = (part: WallPart, p: At, len: number, cap?: [number, number, number, number]) => {
    out.push({ id: `${line.id}.${k++}`, key: 'wall', part, dir: dirOf(p.ux, p.uy), x: r1(p.x), y: r1(p.y), len: r1(len),
      ux: +p.ux.toFixed(4), uy: +p.uy.toFixed(4), ...(cap ? { cap: cap.map(r1) as typeof cap } : {}) })
  }

  for (let j = 0; j < stops.length; j++) {
    const st = stops[j]
    // the post: a vertex's sits on it; a jamb's capsule is one disc just outside the gate's clearance
    const p = at(st.s)
    if (st.jamb === 0) {
      wall('post', p, POST_LEN, clearAt(st.s) ? [p.x, p.y, p.x, p.y] : undefined)
    } else {
      let s = st.s
      for (let i = 0; i < 64 && !clearAt(s); i++) s += st.jamb
      const c = atRing(s)
      wall('post', { ...p, ux: c.ux, uy: c.uy }, POST_LEN, [c.x, c.y, c.x, c.y])
    }
    if (j + 1 >= ends.length) break
    const s0 = st.s, s1 = ends[j + 1].s
    const mid = (s0 + s1) / 2
    const g = inGate(line.ring && mid > total ? mid - total : mid)
    if (g) {
      const a = at(g.a), b = at(g.b), c = at(g.s)
      const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L
      out.push({ id: g.id, key: 'gate', part: 'run', dir: dirOf(ux, uy), x: r1(c.x), y: r1(c.y), len: GATE_W,
        ux: +ux.toFixed(4), uy: +uy.toFixed(4) })
      continue
    }
    const L = s1 - s0
    if (L < 1) continue
    const n = Math.ceil(L / line.step - 1e-9)
    const share = L / n
    for (let i = 0; i < n; i++) {
      const s = s0 + (i + 0.5) * share
      let a = s - share / 2, b = s + share / 2
      while (a < b && !clearAt(a)) a += 1
      while (b > a && !clearAt(b)) b -= 1
      const pa = atRing(a), pb = atRing(b)
      wall('run', atRing(s), share, b - a > 0.5 ? [pa.x, pa.y, pb.x, pb.y] : undefined)
    }
  }
  return out
}

/** Disc centres (flat x, y pairs) along a piece's capsule, at most WALL_CAP_STEP apart, both ends included. */
export function capDiscs(cap: [number, number, number, number]): number[] {
  const [ax, ay, bx, by] = cap
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / WALL_CAP_STEP))
  const out: number[] = []
  for (let i = 0; i <= n; i++) out.push(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)
  return out
}

/**
 * The pre-S09b palisade: `wall${i}` every `step` px round the ring's bounding
 * box, none within 96 px of a gate. Old saves name these ids; the loader maps
 * each new piece to the nearest one.
 */
export function legacyRingPads(line: WallLineBP): { id: string; x: number; y: number }[] {
  const xs = line.pts.map(p => p[0]), ys = line.pts.map(p => p[1])
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys)
  const gapNear = (x: number, y: number) => line.gates.some(g => Math.hypot(g.x - x, g.y - y) < 96)
  const out: { id: string; x: number; y: number }[] = []
  let i = 0
  for (let x = left; x <= right; x += line.step) {
    for (const y of [top, bottom]) if (!gapNear(x, y)) out.push({ id: `wall${i++}`, x, y })
  }
  for (let y = top + line.step; y < bottom; y += line.step) {
    for (const x of [left, right]) if (!gapNear(x, y)) out.push({ id: `wall${i++}`, x, y })
  }
  return out
}
