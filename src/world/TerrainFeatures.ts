import { FEATURES, CROSSINGS, ROADS, PADS, HALL } from '../config/world'
import type { CrossingBP } from '../config/world/blueprint'
import { T, samplePolyline, segProj } from './raster'
import { css, mix } from '../art/ink'
import { fbm, hash32, Mulberry, vnoise } from './noise'
import { cellValue, downhill, sample, terrainFields, type Contour } from './terrainField'

/**
 * The frontier's drawn features (S07), in world px, laid out once and drawn
 * wherever a painted rect meets them:
 *
 * - `paintFeatureLines`: river flow streaks, lake ripples, lava cracks, cliff
 *   hatching and fallen rubble, then the ink of every shore, cliff crest and
 *   foot, and lava edge (the contours of terrainField), then the sea's foam.
 * - `paintRoads`: trodden earth at each road's width, its edges broken by
 *   noise, cart ruts on the King's Road; footpaths in the hold.
 * - `paintCrossings`: each crossing drawn as what it is: stone bridge, obsidian
 *   bridge (over lava), ford, pass, stair, causeway (over water or lava).
 */

/** World rect in px. */
export interface Rect { x0: number; y0: number; x1: number; y1: number }
type Box = [number, number, number, number]

const meets = (r: Rect, b: Box, pad = 0) => b[2] + pad >= r.x0 && b[0] - pad <= r.x1 && b[3] + pad >= r.y0 && b[1] - pad <= r.y1

const INK_LINE = 0x1e1812

/** Paths grouped by style, so a thousand marks cost a handful of fills and strokes. */
export class Batch {
  private m = new Map<string, { p: Path2D; f: boolean; c: number; a: number; w: number; op?: GlobalCompositeOperation }>()
  private get(f: boolean, c: number, a: number, w: number, op?: GlobalCompositeOperation) {
    const key = `${f ? 'f' : 's'}${c}:${a}:${w}:${op ?? ''}`
    let e = this.m.get(key)
    if (!e) this.m.set(key, (e = { p: new Path2D(), f, c, a, w, op }))
    return e.p
  }
  fill(c: number, a: number) { return this.get(true, c, a, 0) }
  stroke(c: number, a: number, w: number, op?: GlobalCompositeOperation) { return this.get(false, c, a, w, op) }
  flush(x: CanvasRenderingContext2D) {
    x.save()
    x.lineCap = 'round'; x.lineJoin = 'round'
    for (const e of this.m.values()) {
      x.globalCompositeOperation = e.op ?? 'source-over'
      if (e.f) { x.fillStyle = css(e.c, e.a); x.fill(e.p) } else { x.strokeStyle = css(e.c, e.a); x.lineWidth = e.w; x.stroke(e.p) }
    }
    x.restore()
    this.m.clear()
  }
}

// ---- layout ---------------------------------------------------------------------------

interface Mark { b: Box; d: (bt: Batch) => void }
let marks: Mark[] | null = null
let foam: Mark[] | null = null

function nearCrossing(x: number, y: number, m: number) {
  for (const c of CROSSINGS) {
    const p = segProj(x, y, c.a[0], c.a[1], c.b[0], c.b[1])
    if (p.d < c.width / 2 + m && p.t > -0.15 && p.t < 1.15) return true
  }
  return false
}

const boxAt = (x: number, y: number, r: number): Box => [x - r, y - r, x + r, y + r]

/** A crack of `n` legs heading along (ux, uy), as flat points. */
function crack(rng: Mulberry, x: number, y: number, ux: number, uy: number, n: number, step: number) {
  const pts = [x, y]
  for (let k = 0; k < n; k++) {
    const j = rng.range(-0.8, 0.8)
    x += (ux - uy * j) * step * rng.range(0.6, 1.1); y += (uy + ux * j) * step * rng.range(0.6, 1.1)
    pts.push(x, y)
  }
  return pts
}

const poly = (p: Pick<Path2D, 'moveTo' | 'lineTo'>, pts: number[]) => { p.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) p.lineTo(pts[k], pts[k + 1]) }

function layMarks(): Mark[] {
  if (marks) return marks
  const F = terrainFields()
  const out: Mark[] = []
  const inWet = (x: number, y: number, m: number) => cellValue(F, F.wet, x, y) < 0 && sample(F, F.wet, x, y) < -m
  const inLava = (x: number, y: number, m: number) => cellValue(F, F.lava, x, y) < 0 && sample(F, F.lava, x, y) < -m

  // along a banded feature: each step's point, tangent, normal and width
  const along = (pts: readonly (readonly number[])[], step: number, visit: (x: number, y: number, ux: number, uy: number, w: number, rng: Mulberry) => void, seed: number) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, ay, aw = 0] = pts[s], [bx, by, bw = aw] = pts[s + 1]
      const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L
      for (let d = 0; d < L; d += step) {
        const t = d / L
        visit(ax + ux * d, ay + uy * d, ux, uy, aw + (bw - aw) * t, new Mulberry(hash32(s * 4096 + (d | 0), seed, 919)))
      }
    }
  }

  // rivers: streaks running with the water, light on top, dark between
  for (const rv of FEATURES.rivers) {
    along(rv.pts, 40, (x, y, ux, uy, w, rng) => {
      for (let k = 0; k < 2; k++) {
        const o = rng.range(-0.36, 0.36) * w, len = rng.range(22, 54), fw = rng.range(0, 36)
        const cx = x + ux * fw - uy * o, cy = y + uy * fw + ux * o
        const bend = rng.range(-3, 3), light = rng.next() < 0.62
        if (!inWet(cx, cy, 14) || nearCrossing(cx, cy, 30)) continue
        out.push({ b: boxAt(cx, cy, len), d: bt => {
          const p = bt.stroke(light ? 0xd6ecee : 0x1e4658, light ? 0.34 : 0.24, light ? 1.8 : 2.6)
          p.moveTo(cx - ux * len / 2, cy - uy * len / 2)
          p.quadraticCurveTo(cx - uy * bend, cy + ux * bend, cx + ux * len / 2, cy + uy * len / 2)
        } })
      }
    }, 1)
  }

  // lakes: wind ripples, short arcs across the open water
  for (const lk of FEATURES.lakes) {
    const rng = new Mulberry(hash32(lk.cx, lk.cy, 31))
    for (let k = 0; k < 110; k++) {
      const a = rng.range(0, Math.PI * 2), q = Math.sqrt(rng.next()) * 0.92
      const cx = lk.cx + Math.cos(a) * lk.rx * q, cy = lk.cy + Math.sin(a) * lk.ry * q
      if (!inWet(cx, cy, 24) || nearCrossing(cx, cy, 20)) continue
      const len = rng.range(14, 30)
      out.push({ b: boxAt(cx, cy, len), d: bt => {
        const p = bt.stroke(0xe2f0f2, 0.4, 1.8)
        p.moveTo(cx - len / 2, cy); p.quadraticCurveTo(cx, cy - 4, cx + len / 2, cy)
      } })
    }
  }

  // lava: glowing cracks through the crust
  const lavaCrack = (x: number, y: number, ux: number, uy: number, rng: Mulberry) => {
    if (!inLava(x, y, 16)) return
    const pts = crack(rng, x, y, ux, uy, 3 + ((rng.next() * 2) | 0), rng.range(10, 18))
    out.push({ b: boxAt(x, y, 80), d: bt => { poly(bt.stroke(0xff8a2a, 0.24, 7, 'lighter'), pts); poly(bt.stroke(0xffe08a, 0.85, 1.8), pts) } })
  }
  for (const lv of FEATURES.lava.rivers) {
    along(lv.pts, 36, (x, y, ux, uy, w, rng) => {
      const o = rng.range(-0.3, 0.3) * w
      lavaCrack(x - uy * o, y + ux * o, ux, uy, rng)
    }, 2)
  }
  {
    const c = FEATURES.lava.caldera, mid = (c.outer + c.inner) / 2, half = (c.outer - c.inner) / 2
    const n = Math.round((Math.PI * 2 * mid) / 30)
    for (let k = 0; k < n; k++) {
      const rng = new Mulberry(hash32(k, 0, 77))
      const a = (k / n) * Math.PI * 2, rr = mid + rng.range(-0.7, 0.7) * half
      lavaCrack(c.cx + Math.cos(a) * rr, c.cy + Math.sin(a) * rr, -Math.sin(a), Math.cos(a), rng)
    }
  }
  for (const pl of FEATURES.lava.pools) {
    const rng = new Mulberry(hash32(pl.cx, pl.cy, 78))
    for (let k = 0; k < Math.round((pl.rx * pl.ry) / 3000); k++) {
      const a = rng.range(0, Math.PI * 2), q = Math.sqrt(rng.next()) * 0.8
      const t = rng.range(0, Math.PI * 2)
      lavaCrack(pl.cx + Math.cos(a) * pl.rx * q, pl.cy + Math.sin(a) * pl.ry * q, Math.cos(t), Math.sin(t), rng)
    }
  }

  // cliffs: hatching down the face, a lit crest, rubble fallen at the foot
  FEATURES.cliffs.forEach((cl, ci) => {
    const half = cl.thickness / 2
    for (let s = 0; s < cl.pts.length - 1; s++) {
      const [ax, ay] = cl.pts[s], [bx, by] = cl.pts[s + 1]
      const [nx, ny] = downhill(ax, ay, bx, by)
      const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L
      for (let d = 0; d < L; d += 13) {
        const rng = new Mulberry(hash32(ci * 64 + s, d | 0, 515))
        const x = ax + ux * d + ux * rng.range(-4, 4), y = ay + uy * d + uy * rng.range(-4, 4)
        if (nearCrossing(x, y, 18)) continue
        const top = -half * rng.range(0.55, 0.8), bot = half * rng.range(0.2, 0.85), lean = rng.range(-5, 5)
        const hi = rng.next() < 0.35
        out.push({ b: boxAt(x, y, half + 50), d: bt => {
          const p = bt.stroke(0x2a2218, 0.3, 2)
          p.moveTo(x + nx * top, y + ny * top); p.lineTo(x + nx * bot + ux * lean, y + ny * bot + uy * lean)
          if (hi) {
            const q = bt.stroke(0xf0e8d0, 0.35, 2.4)
            q.moveTo(x - nx * half * 0.86, y - ny * half * 0.86); q.lineTo(x - nx * half * 0.5, y - ny * half * 0.5)
          }
        } })
        if (rng.next() < 0.4) {
          const o = half + rng.range(6, 34), rx = rng.range(3, 8), ry = rx * rng.range(0.55, 0.75)
          const px = x + nx * o + ux * rng.range(-6, 6), py = y + ny * o + uy * rng.range(-6, 6)
          if (cellValue(F, F.wet, px, py) < 16 || cellValue(F, F.lava, px, py) < 16) continue
          out.push({ b: boxAt(px, py, 12), d: bt => {
            for (const [p, dx, dy, k] of [[bt.fill(0x8a8272, 1), 0, 0, 1], [bt.fill(0xc8c0ac, 0.8), -rx * 0.3, -ry * 0.35, 0.5]] as const) {
              p.moveTo(px + dx + rx * k, py + dy); p.ellipse(px + dx, py + dy, rx * k, ry * k, 0, 0, Math.PI * 2)
            }
            const q = bt.stroke(INK_LINE, 0.6, 1.2)
            q.moveTo(px + rx, py); q.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2)
          } })
        }
      }
    }
  })
  return (marks = out)
}

/** Foam dashes off the sea's shore: two broken rows, parallel to the beach. */
function layFoam(): Mark[] {
  if (foam) return foam
  const F = terrainFields()
  const out: Mark[] = []
  for (const run of F.contours.wet) {
    const p = run.pts
    for (let k = 0; k < p.length - 2; k += 2) {
      const x = p[k], y = p[k + 1]
      const rng = new Mulberry(hash32(x | 0, y | 0, 123))
      if (rng.next() < 0.3 || sample(F, F.sea, x, y) < 0.3) continue
      const tx = p[k + 2] - x, ty = p[k + 3] - y, tl = Math.hypot(tx, ty) || 1
      const gx = sample(F, F.wet, x + 4, y) - sample(F, F.wet, x - 4, y), gy = sample(F, F.wet, x, y + 4) - sample(F, F.wet, x, y - 4)
      const gl = Math.hypot(gx, gy) || 1
      const wx = -gx / gl, wy = -gy / gl   // toward the water
      for (const [o, len, a] of [[rng.range(7, 12), rng.range(12, 24), 0.75], [rng.range(20, 30), rng.range(8, 16), 0.45]]) {
        const cx = x + wx * o, cy = y + wy * o
        if (sample(F, F.wet, cx, cy) > -4) continue
        const ux = tx / tl, uy = ty / tl
        out.push({ b: boxAt(cx, cy, len), d: bt => {
          const q = bt.stroke(0xeef4ee, a, 2)
          q.moveTo(cx - ux * len / 2, cy - uy * len / 2)
          q.quadraticCurveTo(cx - wx * 3, cy - wy * 3, cx + ux * len / 2, cy + uy * len / 2)
        } })
      }
    }
  }
  return (foam = out)
}

/** 3. Everything drawn along the features. */
export function paintFeatureLines(x: CanvasRenderingContext2D, rect: Rect) {
  const F = terrainFields()
  const bt = new Batch()
  for (const m of layMarks()) if (meets(rect, m.b)) m.d(bt)
  bt.flush(x)
  const run = (list: Contour[], pad: number, d: (p: (c: number, a: number, w: number, op?: GlobalCompositeOperation) => void, r: Contour) => void) => {
    for (const r of list) {
      if (!meets(rect, r.box, pad)) continue
      d((c, a, w, op) => poly(bt.stroke(c, a, w, op), r.pts), r)
    }
  }
  run(F.contours.lava, 24, s => { s(0xff6a1a, 0.22, 16, 'lighter'); s(0x140a08, 0.85, 3) })
  bt.flush(x)
  run(F.contours.wet, 4, s => s(0x223036, 0.55, 2.4))
  run(F.contours.cliff, 4, (s, r) => {
    if (r.side < 0) { s(0xf2ead4, 0.5, 4.5); s(INK_LINE, 0.55, 1.6) } else s(INK_LINE, 0.8, 3)
  })
  bt.flush(x)
  for (const m of layFoam()) if (meets(rect, m.b)) m.d(bt)
  bt.flush(x)
}

// ---- roads ------------------------------------------------------------------------------

interface RoadArt { boxes: Box[]; fill: Path2D; edges: Path2D; wear: Path2D; ruts: Path2D | null; width: number; foot: boolean }
let roadArt: RoadArt[] | null = null

function chaikin(p: [number, number][], it: number): [number, number][] {
  for (let n = 0; n < it; n++) {
    const out: [number, number][] = [p[0]]
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1]
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75])
    }
    out.push(p[p.length - 1])
    p = out
  }
  return p
}

function layRoad(pts: [number, number][], width: number, seed: number, ruts: boolean, foot: boolean): RoadArt {
  const c = samplePolyline(chaikin(samplePolyline(pts, 40) as [number, number][], 2), 12)
  const hw = width / 2
  const left: number[] = [], right: number[] = [], mid: number[] = [], rutA: number[] = [], rutB: number[] = []
  const boxes: Box[] = []
  let s = 0
  for (let i = 0; i < c.length; i++) {
    const [x, y] = c[i]
    const [px, py] = c[Math.max(0, i - 1)], [qx, qy] = c[Math.min(c.length - 1, i + 1)]
    const tl = Math.hypot(qx - px, qy - py) || 1
    const nx = -(qy - py) / tl, ny = (qx - px) / tl
    if (i) s += Math.hypot(x - c[i - 1][0], y - c[i - 1][1])
    const wl = hw * (1 + (fbm(s * 0.012, 0.5, seed, 2) - 0.5) * 0.5) + (vnoise(s * 0.09, 3.5, seed) - 0.5) * hw * 0.3
    const wr = hw * (1 + (fbm(s * 0.012, 7.5, seed, 2) - 0.5) * 0.5) + (vnoise(s * 0.09, 9.5, seed) - 0.5) * hw * 0.3
    left.push(x + nx * wl, y + ny * wl); right.push(x - nx * wr, y - ny * wr); mid.push(x, y)
    const j = (vnoise(s * 0.05, 1.5, seed + 1) - 0.5) * 3
    rutA.push(x + nx * (hw * 0.33 + j), y + ny * (hw * 0.33 + j)); rutB.push(x - nx * (hw * 0.33 - j), y - ny * (hw * 0.33 - j))
    if (i % 16 === 0) boxes.push([x - width, y - width, x + width, y + width])
  }
  // boxes every 16 samples (192 px) grown to reach the next one
  for (const b of boxes) { b[0] -= 200; b[1] -= 200; b[2] += 200; b[3] += 200 }
  const fill = new Path2D()
  fill.moveTo(left[0], left[1])
  for (let k = 2; k < left.length; k += 2) fill.lineTo(left[k], left[k + 1])
  for (let k = right.length - 2; k >= 0; k -= 2) fill.lineTo(right[k], right[k + 1])
  fill.closePath()
  const edges = new Path2D(); poly(edges, left); poly(edges, right)
  const wear = new Path2D(); poly(wear, mid)
  let rp: Path2D | null = null
  if (ruts) { rp = new Path2D(); poly(rp, rutA); poly(rp, rutB) }
  return { boxes, fill, edges, wear, ruts: rp, width, foot }
}

function layRoads(): RoadArt[] {
  if (roadArt) return roadArt
  const out = ROADS.map((rd, k) => layRoad(rd.pts as [number, number][], rd.width, 700 + k, rd.id === 'kingsRoad', false))
  // footpaths out to the nearer sites of the hold; the rampart's towers are reached across the grass
  for (const pad of PADS) {
    if (pad.region !== 'hold' || pad.key === 'wall' || pad.key === 'gate' || pad.key === 'watchtower' || pad.key === 'cannonTower') continue
    const dx = pad.x - HALL.x, dy = pad.y - HALL.y, d = Math.hypot(dx, dy) || 1
    if (d > 420) continue
    const ax = HALL.x + (dx / d) * 170, ay = HALL.y + (dy / d) * 150
    const mx = (ax + pad.x) / 2 + (-dy / d) * 18, my = (ay + pad.y) / 2 + (dx / d) * 18
    out.push(layRoad([[ax, ay], [mx, my], [pad.x, pad.y + 10]], 20, 900 + out.length, false, true))
  }
  return (roadArt = out)
}

/** 4. Roads: trodden earth over the ground, the biome still showing at the broken edges. */
export function paintRoads(x: CanvasRenderingContext2D, rect: Rect) {
  for (const rd of layRoads()) {
    if (!rd.boxes.some(b => meets(rect, b))) continue
    x.save()
    x.lineCap = 'round'; x.lineJoin = 'round'
    x.fillStyle = css(0x9c8058, rd.foot ? 0.5 : 0.72); x.fill(rd.fill)
    x.strokeStyle = css(0x4a3a26, rd.foot ? 0.16 : 0.3); x.lineWidth = 3; x.stroke(rd.edges)
    x.strokeStyle = css(0xc8aa7a, 0.3); x.lineWidth = rd.width * 0.42; x.stroke(rd.wear)
    if (rd.ruts) { x.strokeStyle = css(0x5e4830, 0.42); x.lineWidth = 3.2; x.stroke(rd.ruts) }
    x.restore()
  }
}

// ---- crossings ------------------------------------------------------------------------

type C2 = CanvasRenderingContext2D

function shape(x: C2, fillC: number, fa: number, lineC: number, la: number, lw: number, trace: (x: C2) => void) {
  x.beginPath(); trace(x)
  if (fa > 0) { x.fillStyle = css(fillC, fa); x.fill() }
  if (la > 0) { x.strokeStyle = css(lineC, la); x.lineWidth = lw; x.stroke() }
}
const rect = (x0: number, y0: number, w: number, h: number) => (x: C2) => x.rect(x0, y0, w, h)
const oval = (cx: number, cy: number, rx: number, ry: number) => (x: C2) => x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)

/** A stone bridge: piers in the water, a paved deck, parapets with posts. Obsidian over lava. */
function bridge(x: C2, L: number, hw: number, glass: boolean) {
  const e = 26, dw = hw * 0.86
  const deck = glass ? 0x241c22 : 0xa89a7c, rail = glass ? 0x3a2e3c : 0xc9ba98, post = glass ? 0x4e3e56 : 0xe0d4b4
  shape(x, 0x0a1014, 0.35, 0, 0, 0, rect(-e + 6, -dw + 8, L + 2 * e, dw * 2))
  for (let p = 34; p < L - 20; p += 62) {
    if (glass) {
      const g = x.createRadialGradient(p, 0, 4, p, 0, dw + 30)
      g.addColorStop(0, css(0xffa040, 0.5)); g.addColorStop(1, css(0xffa040, 0))
      x.fillStyle = g; x.fillRect(p - dw - 30, -dw - 30, dw * 2 + 60, dw * 2 + 60)
    } else {
      shape(x, 0xe6f0f0, 0.5, 0, 0, 0, oval(p - 16, 0, 6, dw + 16))
    }
    shape(x, glass ? 0x160f14 : 0x6e665a, 1, INK_LINE, 0.8, 2, x2 => {
      x2.moveTo(p - 11, -dw - 14); x2.lineTo(p + 11, -dw - 14); x2.lineTo(p + 11, dw + 14); x2.lineTo(p - 11, dw + 14); x2.lineTo(p - 18, 0); x2.closePath()
    })
  }
  shape(x, deck, 1, 0, 0, 0, rect(-e, -dw, L + 2 * e, dw * 2))
  x.beginPath()
  for (let s = -e + 14; s < L + e; s += 16) { x.moveTo(s, -dw + 9); x.lineTo(s, dw - 9) }
  x.moveTo(-e, 0); x.lineTo(L + e, 0)
  x.strokeStyle = css(glass ? 0x7a68a0 : 0x5a4e3e, glass ? 0.4 : 0.28); x.lineWidth = 1.2; x.stroke()
  if (glass) {
    x.beginPath()
    for (let s = -e + 10; s < L + e - 20; s += 34) { x.moveTo(s, dw - 12); x.lineTo(s + 18, -dw + 12) }
    x.strokeStyle = css(0xc8b8f0, 0.45); x.lineWidth = 2.2; x.stroke()
  }
  for (const side of [-1, 1]) {
    const y0 = side < 0 ? -dw : dw - 9
    shape(x, rail, 1, INK_LINE, 0.8, 1.6, rect(-e, y0, L + 2 * e, 9))
    for (let s = -e + 2; s < L + e - 4; s += 30) shape(x, post, 1, INK_LINE, 0.8, 1.2, rect(s, y0 - 1, 9, 11))
  }
  shape(x, 0, 0, INK_LINE, 0.85, 2.4, rect(-e, -dw, L + 2 * e, dw * 2))
}

/** A ford: lighter shallows over a sand bar, and two staggered rows of stepping stones. */
function ford(x: C2, L: number, hw: number, rng: Mulberry, wet: (s: number, t: number) => boolean) {
  x.save()
  x.translate(L / 2, 0); x.scale(L / 2 / hw, 1)
  const g = x.createRadialGradient(0, 0, 0, 0, 0, hw)
  g.addColorStop(0, css(0x9ccad0, 0.55)); g.addColorStop(0.6, css(0x9ccad0, 0.4)); g.addColorStop(1, css(0x9ccad0, 0))
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, hw, 0, Math.PI * 2); x.fill()
  x.restore()
  shape(x, 0xd8c89a, 0.35, 0, 0, 0, oval(L / 2, 0, L / 2, hw * 0.3))
  for (const row of [-1, 1]) {
    for (let s = row < 0 ? 14 : 27; s < L - 8; s += 26) {
      const cx = s + rng.range(-3, 3), cy = row * hw * 0.2 + rng.range(-4, 4)
      const rx = rng.range(8, 11), ry = rng.range(5.5, 7.5)
      if (!wet(cx, cy)) continue
      shape(x, 0, 0, 0xeaf4f4, 0.6, 1.6, x2 => x2.ellipse(cx, cy - ry - 3, rx * 1.2, 3, 0, Math.PI, Math.PI * 2))
      shape(x, 0x9a948a, 1, INK_LINE, 0.7, 1.4, oval(cx, cy, rx, ry))
      shape(x, 0xd8d4c8, 0.8, 0, 0, 0, oval(cx - rx * 0.25, cy - ry * 0.3, rx * 0.5, ry * 0.4))
    }
  }
}

/** A cut through the cliff: a rubble floor between two broken rock walls. */
function cut(x: C2, L: number, hw: number, rng: Mulberry, floor: number) {
  shape(x, floor, 1, 0, 0, 0, x2 => x2.roundRect(-22, -hw, L + 44, hw * 2, 18))
  shape(x, 0x1a1410, 0.3, 0, 0, 0, rect(-22, -hw, L + 44, 20))
  for (const side of [-1, 1]) {
    const wall: number[] = []
    for (let s = -22; s <= L + 22; s += 10) wall.push(s, side * (hw - rng.range(0, 7)))
    x.beginPath(); poly(x, wall)
    x.strokeStyle = css(0xe6dcc4, 0.5); x.lineWidth = 4.5; x.stroke()
    x.strokeStyle = css(INK_LINE, 0.85); x.lineWidth = 2.6; x.stroke()
  }
  for (let k = 0; k < Math.round(L * hw / 520); k++) {
    const side = rng.next() < 0.5 ? -1 : 1
    const cx = rng.range(-16, L + 16), cy = rng.next() < 0.75 ? side * (hw - rng.range(6, 32)) : rng.range(-hw, hw) * 0.6
    const rx = rng.range(3, 8), ry = rx * 0.7
    shape(x, 0x8e8676, 1, INK_LINE, 0.6, 1.2, oval(cx, cy, rx, ry))
    shape(x, 0xc8c0ac, 0.7, 0, 0, 0, oval(cx - rx * 0.3, cy - ry * 0.35, rx * 0.45, ry * 0.4))
  }
}

/** Switchback steps climbing the cut: three flights across it, joined by landings. */
function stair(x: C2, L: number, hw: number, rng: Mulberry) {
  cut(x, L, hw, rng, 0x8a8272)
  const n = 3, leg = (L / n) * 0.72, span = hw * 0.62
  for (let k = 0; k < n; k++) {
    const cx = (L * (k + 0.5)) / n
    shape(x, 0xb4a88e, 1, INK_LINE, 0.75, 1.8, rect(cx - leg / 2, -span, leg, span * 2))
    x.beginPath()
    for (let y = -span + 7; y < span; y += 7) { x.moveTo(cx - leg / 2 + 2, y); x.lineTo(cx + leg / 2 - 2, y) }
    x.strokeStyle = css(0x4a4034, 0.5); x.lineWidth = 1.4; x.stroke()
    if (k < n - 1) {
      const y0 = k % 2 ? -span - 10 : span - 16
      shape(x, 0xc2b69a, 1, INK_LINE, 0.75, 1.6, rect(cx - leg / 2, y0, L / n + leg, 26))
    }
  }
}

/** A causeway of flagstones over water (some drowned) or over lava (seams glowing). */
function causeway(x: C2, L: number, hw: number, rng: Mulberry, lava: boolean) {
  const w = hw * 0.8
  shape(x, lava ? 0x2a2220 : 0x7a6e5c, 1, 0, 0, 0, rect(-16, -w, L + 32, w * 2))
  if (lava) {
    x.beginPath(); x.moveTo(-16, -w); x.lineTo(L + 16, -w); x.moveTo(-16, w); x.lineTo(L + 16, w)
    x.save(); x.globalCompositeOperation = 'lighter'
    x.strokeStyle = css(0xff7a2a, 0.45); x.lineWidth = 8; x.stroke(); x.restore()
  }
  for (const row of [-1, 1]) {
    for (let s = -14; s < L + 14;) {
      const len = rng.range(18, 28)
      const drowned = !lava && rng.next() < 0.18
      const y0 = row < 0 ? -w + 2 : 1
      const c = lava ? mix(0x3e3430, 0x1e1614, rng.next()) : mix(0xa89a80, 0x8a7e6a, rng.next())
      if (!drowned) shape(x, c, 1, INK_LINE, lava ? 0.9 : 0.55, 1.2, rect(s + 1, y0 + rng.range(-1, 1), len - 2, w - 3))
      else shape(x, 0x5e98aa, 0.6, 0, 0, 0, rect(s + 1, y0, len - 2, w - 3))
      s += len
    }
  }
  if (lava) {
    x.save(); x.globalCompositeOperation = 'lighter'
    x.beginPath()
    for (let s = -14; s < L + 14; s += rng.range(18, 28)) { x.moveTo(s, -w + 2); x.lineTo(s + rng.range(-3, 3), w - 2) }
    x.strokeStyle = css(0xff8a3a, 0.6); x.lineWidth = 1.6; x.stroke(); x.restore()
  } else {
    x.beginPath(); x.moveTo(-16, -w - 3); x.lineTo(L + 16, -w - 3); x.moveTo(-16, w + 3); x.lineTo(L + 16, w + 3)
    x.setLineDash([10, 8]); x.strokeStyle = css(0xeaf4f4, 0.5); x.lineWidth = 2; x.stroke(); x.setLineDash([])
  }
}

/** 5. Every crossing drawn as what it is. */
export function paintCrossings(x: C2, rectW: Rect) {
  const F = terrainFields()
  const r = F.r
  CROSSINGS.forEach((c: CrossingBP, k) => {
    const [ax, ay] = c.a, [bx, by] = c.b
    const pad = c.width + 60
    if (!meets(rectW, [Math.min(ax, bx) - pad, Math.min(ay, by) - pad, Math.max(ax, bx) + pad, Math.max(ay, by) + pad])) return
    const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L
    const hw = c.width / 2
    const under = r.under[r.cell((ax + bx) / 2, (ay + by) / 2)]
    const rng = new Mulberry(hash32(k, 1, 4040))
    x.save()
    x.translate(ax, ay)
    x.rotate(Math.atan2(uy, ux))
    x.lineCap = 'round'; x.lineJoin = 'round'
    switch (c.kind) {
      case 'bridge': bridge(x, L, hw, under === T.LAVA); break
      case 'ford': ford(x, L, hw, rng, (s, t) => sample(F, F.wet, ax + ux * s - uy * t, ay + uy * s + ux * t) < -6); break
      case 'pass': cut(x, L, hw, rng, 0x8f8068); break
      case 'stair': stair(x, L, hw, rng); break
      case 'causeway': causeway(x, L, hw, rng, under === T.LAVA); break
    }
    x.restore()
  })
}

/** Lay out every feature now rather than in the first bake. */
export function warmFeatures() {
  layMarks()
  layFoam()
  layRoads()
}
