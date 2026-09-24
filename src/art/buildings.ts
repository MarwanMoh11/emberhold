import type Phaser from 'phaser'
import { PAL } from '../config/palette'
import { BUILDINGS, type BuildingKey } from '../config/buildings'
import { bake, css, fill, form, glow, line, lightOf, mix, P, paint, register, Rng, shade, shadowOf, INK, type Ctx, type PathFn } from './ink'

/**
 * The settlement.
 *
 * Every building is a little storybook elevation: a front wall facing you, a
 * side wall receding up and to the right in shadow, and a roof plane with its
 * shingles or thatch laid in rows. It is cabinet projection — cheap to draw,
 * and just enough depth that the hold reads as a place rather than a row of
 * cut-outs. Light comes from the upper left like everything else.
 *
 * Levels are the reward, so each one has to be visible from across the map:
 * a stone footing, a second storey, a tower, banners, and gilt at the top.
 */

const WOOD = 0x9a6a3e
const WOOD_D = 0x6a4428
const BEAM = 0x563620
const PLASTER = 0xe8d8b2
const STONE = 0xc4bcaa
const THATCH = 0xd6b25e
const TERRACOTTA = PAL.roofA
const SLATE = 0x5a6a80
const LAPIS_ROOF = 0x3c62a0
const IRON = 0x5d6066

/** Screen offset per unit of depth: the side wall recedes up and right. */
const DX = 0.55
const DY = -0.42

type Mat = 'plaster' | 'plank' | 'log' | 'stone' | 'canvas'
type RoofMat = 'shingle' | 'thatch' | 'slate' | 'plank'

type Pt = [number, number]
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k]
const len = (a: Pt) => Math.hypot(a[0], a[1])

let rng = new Rng(1)

// ---- walls -----------------------------------------------------------------

/** Paint a wall material into local space [0,w] x [0,h], y down. Clip is set by the caller. */
function wallMat(x: Ctx, w: number, h: number, mat: Mat, c: number, side: boolean) {
  const inkA = side ? 0.35 : 0.5
  switch (mat) {
    case 'plaster': {
      // timber framing over plaster: sill, head, posts and braces
      const beam = side ? shade(BEAM, -0.2) : BEAM
      const t = Math.max(2, Math.min(3, w * 0.05))
      fill(x, P.rect(0, 0, w, t), beam)
      fill(x, P.rect(0, h - t, w, t), beam)
      if (h > 22) fill(x, P.rect(0, h * 0.48, w, t * 0.8), beam)
      const bays = Math.max(1, Math.round(w / 18))
      for (let i = 0; i <= bays; i++) fill(x, P.rect(Math.min(w - t, (i * w) / bays - (i ? t / 2 : 0)), 0, t, h), beam)
      for (let i = 0; i < bays; i++) {
        const x0 = (i * w) / bays, x1 = ((i + 1) * w) / bays
        const yb = h > 22 ? h * 0.48 : h
        line(x, x2 => { x2.moveTo(x0 + t, yb - 1); x2.lineTo(x1 - t, t + 1) }, t * 0.8, beam, 1)
      }
      break
    }
    case 'plank': {
      const step = 5.5
      for (let px = step; px < w; px += step) {
        line(x, x2 => { x2.moveTo(px, 0); x2.lineTo(px, h) }, 0.8, INK, inkA)
        if (rng.next() < 0.3) fill(x, P.ellipse(px - step / 2, rng.range(3, h - 3), 0.9, 1.3), INK, 0.35)
      }
      break
    }
    case 'log': {
      const step = 5
      for (let py = 0; py < h; py += step) {
        fill(x, P.rect(0, py + step - 1.6, w, 1.6), shade(c, -0.3), side ? 0.5 : 0.6)
        line(x, x2 => { x2.moveTo(0, py + step); x2.lineTo(w, py + step) }, 0.7, INK, inkA)
      }
      break
    }
    case 'stone': {
      const ch = 6
      let row = 0
      for (let py = 0; py < h; py += ch, row++) {
        let px = row % 2 ? -rng.range(3, 6) : 0
        while (px < w) {
          const bw = rng.range(8, 13)
          const tone = mix(c, rng.next() < 0.5 ? 0xfff0d0 : 0x3a2a30, rng.range(0.02, 0.14))
          fill(x, P.round(px + 0.6, py + 0.6, bw - 1.2, ch - 1.2, 1.2), side ? shadowOf(tone, 0.26) : tone)
          px += bw
        }
        line(x, x2 => { x2.moveTo(0, py); x2.lineTo(w, py) }, 0.7, INK, inkA * 0.8)
      }
      break
    }
    case 'canvas': {
      for (let px = 8; px < w; px += 9) line(x, x2 => { x2.moveTo(px, 0); x2.lineTo(px + 1, h) }, 0.7, INK, inkA * 0.6)
      break
    }
  }
}

interface BoxSpec {
  /** front-bottom-left corner */
  L: number
  B: number
  w: number
  h: number
  d: number
  mat: Mat
  c: number
  /** stone footing height, drawn under the wall */
  footing?: number
  /** extend the front wall up into a gable of this height */
  gable?: number
  /** the side wall rises into a gable end of this height */
  sideGable?: number
}

function frontPath(s: BoxSpec): PathFn {
  const top = s.B - s.h
  if (s.gable) return P.poly([[s.L, s.B], [s.L, top], [s.L + s.w / 2, top - s.gable], [s.L + s.w, top], [s.L + s.w, s.B]])
  return P.rect(s.L, top, s.w, s.h)
}

function sidePath(s: BoxSpec): PathFn {
  const px = s.d * DX, py = s.d * DY
  const R = s.L + s.w, top = s.B - s.h
  if (s.sideGable) {
    return P.poly([[R, s.B], [R, top], [R + px / 2, top + py / 2 - s.sideGable], [R + px, top + py], [R + px, s.B + py]])
  }
  return P.poly([[R, s.B], [R, top], [R + px, top + py], [R + px, s.B + py]])
}

/** A walled box: shaded side face, lit front face, footing, eave shadow, ink edges. */
function box(x: Ctx, s: BoxSpec) {
  const px = s.d * DX
  const top = s.B - s.h - (s.gable ?? 0) - (s.sideGable ?? 0)
  const R = s.L + s.w

  // side face
  const side = sidePath(s)
  const sideC = shadowOf(s.c, 0.3)
  form(x, side, sideC, { rim: 0, core: 3, dark: shadowOf(s.c, 0.45) })
  x.save(); x.beginPath(); side(x); x.clip()
  x.translate(R, top); x.transform(1, DY / DX, 0, 1, 0, 0)
  wallMat(x, px, s.B - top, s.mat, sideC, true)
  x.restore()

  // front face
  const front = frontPath(s)
  form(x, front, s.c, { rim: 1.4, core: 2.4, lightA: 0.6 })
  x.save(); x.beginPath(); front(x); x.clip()
  x.translate(s.L, top)
  wallMat(x, s.w, s.B - top, s.mat, s.c, false)
  x.restore()

  // footing
  if (s.footing) {
    const fh = s.footing
    x.save()
    x.beginPath(); P.rect(s.L - 1, s.B - fh, s.w + 2, fh + 1)(x); x.clip()
    fill(x, P.rect(s.L - 1, s.B - fh, s.w + 2, fh + 1), STONE)
    x.translate(s.L - 1, s.B - fh)
    wallMat(x, s.w + 2, fh, 'stone', STONE, false)
    x.restore()
    x.save()
    const fside = P.poly([[R, s.B], [R, s.B - fh], [R + px, s.B - fh + s.d * DY], [R + px, s.B + s.d * DY]])
    x.beginPath(); fside(x); x.clip()
    fill(x, fside, shadowOf(STONE, 0.3))
    x.translate(R, s.B - fh); x.transform(1, DY / DX, 0, 1, 0, 0)
    wallMat(x, px, fh, 'stone', STONE, true)
    x.restore()
  }

  // soft contact shadow at the base of the wall
  x.save(); x.beginPath(); front(x); x.clip()
  const g = x.createLinearGradient(0, s.B - 8, 0, s.B)
  g.addColorStop(0, css(0x2a1a12, 0)); g.addColorStop(1, css(0x2a1a12, 0.28))
  x.fillStyle = g; x.fillRect(s.L, s.B - 8, s.w, 8)
  x.restore()

  line(x, side, 1.1, INK, 0.75)
  line(x, front, 1.1, INK, 0.75)
}

// ---- roofs -----------------------------------------------------------------

/** Lay roofing in rows over the plane O + sU + tV, s,t in [0,1]. V runs eave to ridge. */
function roofPlane(x: Ctx, O: Pt, U: Pt, V: Pt, c: number, mat: RoofMat, lit: boolean) {
  const path = P.poly([O, add(O, U), add(add(O, U), V), add(O, V)])
  const base = lit ? c : shadowOf(c, 0.26)
  form(x, path, base, { rim: lit ? 1.6 : 0, core: lit ? 2 : 0, hatch: lit ? 0 : 0.14 })
  const vl = len(V), ul = len(U)
  const vn: Pt = [V[0] / vl, V[1] / vl]
  x.save(); x.beginPath(); path(x); x.clip()

  if (mat === 'thatch') {
    const rows = Math.max(2, Math.round(vl / 5))
    for (let i = 0; i < rows; i++) {
      const t = i / rows
      const n = Math.round(ul / 2.2)
      for (let j = 0; j < n; j++) {
        const s = (j + rng.range(-0.3, 0.3)) / n
        const p0 = add(add(O, mul(U, s)), mul(V, t + 1 / rows))
        const p1 = add(p0, mul(vn, -rng.range(4, 7)))
        line(x, x2 => { x2.moveTo(p0[0], p0[1]); x2.lineTo(p1[0], p1[1]) }, 0.8, rng.next() < 0.7 ? shade(base, -0.35) : lightOf(base, 0.3), 0.7)
      }
      const a = add(O, mul(V, t)), b = add(a, U)
      line(x, x2 => { x2.moveTo(a[0], a[1]); x2.lineTo(b[0], b[1]) }, 1, shade(base, -0.4), 0.5)
    }
  } else {
    const rowH = mat === 'plank' ? 999 : 4.2
    const rows = Math.max(1, Math.round(vl / rowH))
    for (let i = 0; i <= rows; i++) {
      const t = i / rows
      const start = add(O, mul(V, t))
      if (mat === 'shingle') {
        const n = Math.max(2, Math.round(ul / 5))
        x.beginPath()
        const off = i % 2 ? 0.5 : 0
        for (let j = -1; j <= n; j++) {
          const a = add(start, mul(U, (j + off) / n))
          const b = add(start, mul(U, (j + 1 + off) / n))
          const m = mul(add(a, b), 0.5)
          const ctrl = add(m, mul(vn, -3))
          x.moveTo(a[0], a[1]); x.quadraticCurveTo(ctrl[0], ctrl[1], b[0], b[1])
        }
        x.strokeStyle = css(INK, 0.45); x.lineWidth = 0.8; x.stroke()
      } else if (mat === 'slate') {
        const b = add(start, U)
        line(x, x2 => { x2.moveTo(start[0], start[1]); x2.lineTo(b[0], b[1]) }, 0.8, INK, 0.45)
        const n = Math.max(2, Math.round(ul / 6))
        for (let j = 0; j < n; j++) {
          const a = add(start, mul(U, (j + (i % 2 ? 0.5 : 0)) / n))
          const e = add(a, mul(V, 1 / rows))
          line(x, x2 => { x2.moveTo(a[0], a[1]); x2.lineTo(e[0], e[1]) }, 0.6, INK, 0.3)
        }
      }
    }
    if (mat === 'plank') {
      const n = Math.max(2, Math.round(ul / 5))
      for (let j = 1; j < n; j++) {
        const a = add(O, mul(U, j / n)), b = add(a, V)
        line(x, x2 => { x2.moveTo(a[0], a[1]); x2.lineTo(b[0], b[1]) }, 0.8, INK, 0.45)
      }
    }
  }
  x.restore()
  line(x, path, 1.1, INK, 0.8)
}

/** Ridge running left-right: you see the long front slope and a gable end on the right. */
function roofSide(x: Ctx, s: BoxSpec, rh: number, over: number, c: number, mat: RoofMat) {
  const px = s.d * DX, py = s.d * DY
  const top = s.B - s.h
  const eaveL: Pt = [s.L - over, top + 3]
  const U: Pt = [s.w + over * 2, 0]
  const ridgeL: Pt = [s.L - over + px * 0.5, top + py * 0.5 - rh]
  const V: Pt = [ridgeL[0] - eaveL[0], ridgeL[1] - eaveL[1]]
  // the far slope's right edge, a sliver behind the ridge
  const ridgeR = add(ridgeL, U)
  const backR: Pt = [s.L + s.w + over + px, top + py + 3]
  const R: Pt = add(eaveL, U)
  form(x, P.poly([ridgeR, backR, [backR[0] - 3, backR[1] + 1.5], [ridgeR[0] - 2, ridgeR[1] + 2]]), shadowOf(c, 0.35), { rim: 0, core: 0 })
  roofPlane(x, eaveL, U, V, c, mat, true)
  // barge board on the gable end
  line(x, x2 => { x2.moveTo(R[0], R[1]); x2.lineTo(ridgeR[0], ridgeR[1]); x2.lineTo(backR[0], backR[1]) }, 2.4, WOOD_D, 1)
  line(x, x2 => { x2.moveTo(R[0], R[1]); x2.lineTo(ridgeR[0], ridgeR[1]); x2.lineTo(backR[0], backR[1]) }, 0.9, INK, 0.8)
  if (mat === 'thatch') {
    // thick rolled eave
    line(x, x2 => { x2.moveTo(eaveL[0], eaveL[1]); x2.lineTo(R[0], R[1]) }, 3.2, shade(c, -0.25), 1)
    line(x, x2 => { x2.moveTo(ridgeL[0], ridgeL[1]); x2.lineTo(ridgeR[0], ridgeR[1]) }, 3, shade(c, -0.1), 1)
  } else {
    line(x, x2 => { x2.moveTo(ridgeL[0], ridgeL[1]); x2.lineTo(ridgeR[0], ridgeR[1]) }, 2.2, shade(c, -0.35), 1)
  }
  // eave shadow on the wall below
  x.save(); x.beginPath(); P.rect(s.L, top, s.w, 6)(x); x.clip()
  const g = x.createLinearGradient(0, top, 0, top + 6)
  g.addColorStop(0, css(0x1e1210, 0.45)); g.addColorStop(1, css(0x1e1210, 0))
  x.fillStyle = g; x.fillRect(s.L, top, s.w, 6)
  x.restore()
}

/** Ridge running away from you: a gable faces front and the right slope recedes in shade. */
function roofFront(x: Ctx, s: BoxSpec, over: number, c: number, mat: RoofMat) {
  const px = s.d * DX, py = s.d * DY
  const top = s.B - s.h
  const rh = s.gable ?? 12
  const apex: Pt = [s.L + s.w / 2, top - rh - 2]
  const eaveR: Pt = [s.L + s.w + over, top + 3]
  const eaveL: Pt = [s.L - over, top + 3]
  roofPlane(x, eaveR, [px, py], [apex[0] - eaveR[0], apex[1] - eaveR[1]], c, mat, false)
  // bargeboards along the front gable
  for (const [w, col, a] of [[3, WOOD_D, 1], [1, INK, 0.85]] as [number, number, number][]) {
    line(x, x2 => { x2.moveTo(eaveL[0], eaveL[1]); x2.lineTo(apex[0], apex[1]); x2.lineTo(eaveR[0], eaveR[1]) }, w, col, a)
  }
  line(x, x2 => { x2.moveTo(apex[0], apex[1]); x2.lineTo(apex[0] + px, apex[1] + py) }, 2.2, shade(c, -0.35), 1)
}

/** A cone roof for round towers. */
function cone(x: Ctx, cx: number, baseY: number, r: number, h: number, c: number) {
  const path = P.poly([[cx - r, baseY], [cx, baseY - h], [cx + r, baseY], [cx, baseY + r * 0.28]])
  form(x, path, c, { rim: 2, core: r * 0.8, hatch: 0.18 })
  x.save(); x.beginPath(); path(x); x.clip()
  for (let i = 1; i < 5; i++) {
    const t = i / 5
    line(x, x2 => { x2.ellipse(cx, baseY - h + h * t, r * t, r * t * 0.28, 0, 0, Math.PI) }, 0.7, INK, 0.4)
  }
  x.restore()
  line(x, path, 1.1, INK, 0.8)
}

// ---- details -----------------------------------------------------------------

function windowAt(x: Ctx, cx: number, cy: number, w = 7, h = 8, shutters = true) {
  if (shutters) {
    fill(x, P.rect(cx - w / 2 - 3, cy - h / 2, 3, h), 0x3c5a8a)
    fill(x, P.rect(cx + w / 2, cy - h / 2, 3, h), 0x3c5a8a)
  }
  fill(x, P.round(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, h + 2, 1), BEAM)
  const g = x.createLinearGradient(0, cy - h / 2, 0, cy + h / 2)
  g.addColorStop(0, css(0xffe6a0)); g.addColorStop(1, css(0xf0a040))
  x.fillStyle = g
  x.fillRect(cx - w / 2, cy - h / 2, w, h)
  line(x, x2 => { x2.moveTo(cx, cy - h / 2); x2.lineTo(cx, cy + h / 2); x2.moveTo(cx - w / 2, cy); x2.lineTo(cx + w / 2, cy) }, 0.9, BEAM, 1)
  fill(x, P.rect(cx - w / 2 - 1.5, cy + h / 2, w + 3, 1.6), shade(WOOD, 0.1))
}

function doorAt(x: Ctx, cx: number, B: number, w = 10, h = 14, c = WOOD_D) {
  const path: PathFn = x2 => { x2.moveTo(cx - w / 2, B); x2.lineTo(cx - w / 2, B - h + w / 2); x2.arc(cx, B - h + w / 2, w / 2, Math.PI, 0); x2.lineTo(cx + w / 2, B); x2.closePath() }
  fill(x, x2 => { x2.moveTo(cx - w / 2 - 1.5, B); x2.lineTo(cx - w / 2 - 1.5, B - h + w / 2); x2.arc(cx, B - h + w / 2, w / 2 + 1.5, Math.PI, 0); x2.lineTo(cx + w / 2 + 1.5, B); x2.closePath() }, STONE)
  form(x, path, c, { rim: 0.8, core: 2 })
  x.save(); x.beginPath(); path(x); x.clip()
  for (let i = 1; i < 3; i++) line(x, x2 => { x2.moveTo(cx - w / 2 + (w * i) / 3, B); x2.lineTo(cx - w / 2 + (w * i) / 3, B - h) }, 0.7, INK, 0.5)
  fill(x, P.rect(cx - w / 2, B - h * 0.7, w, 1.4), IRON)
  fill(x, P.rect(cx - w / 2, B - h * 0.3, w, 1.4), IRON)
  x.restore()
  fill(x, P.circle(cx + w * 0.28, B - h * 0.45, 0.9), PAL.gilt)
  line(x, path, 1, INK, 0.8)
}

/** The hold's banner: lapis field, bone band, ember lozenge. */
function banner(x: Ctx, px: number, py: number, h: number, c = PAL.lapis, pole = true) {
  if (pole) {
    form(x, P.round(px - 1, py - h, 2, h, 1), WOOD_D, { rim: 0.4, core: 0.6 })
    fill(x, P.circle(px, py - h - 1, 1.6), PAL.gilt)
  }
  const bw = Math.max(7, h * 0.42), bh = Math.max(10, h * 0.55)
  const top = py - h + 2
  const path = P.poly([[px + 1, top], [px + 1 + bw, top], [px + 1 + bw, top + bh], [px + 1 + bw / 2, top + bh - bw * 0.35], [px + 1, top + bh]])
  form(x, path, c, { rim: 1, core: 2 })
  fill(x, P.rect(px + 1 + bw * 0.38, top, bw * 0.24, bh - bw * 0.2), PAL.bone, 0.95)
  const cy = top + bh * 0.4
  fill(x, P.poly([[px + 1 + bw / 2, cy - 2.4], [px + 1 + bw / 2 + 1.8, cy], [px + 1 + bw / 2, cy + 2.4], [px + 1 + bw / 2 - 1.8, cy]]), PAL.ember)
  line(x, path, 0.9, INK, 0.8)
}

function chimney(x: Ctx, cx: number, top: number, h: number, smoke = true) {
  form(x, P.rect(cx - 3.5, top - h, 7, h), STONE, { rim: 0.8, core: 2 })
  x.save(); x.beginPath(); P.rect(cx - 3.5, top - h, 7, h)(x); x.clip()
  x.translate(cx - 3.5, top - h); wallMat(x, 7, h, 'stone', STONE, false)
  x.restore()
  fill(x, P.rect(cx - 4.5, top - h - 2, 9, 2.5), shade(STONE, -0.2))
  line(x, P.rect(cx - 3.5, top - h, 7, h), 0.9, INK, 0.8)
  return smoke ? [cx, top - h - 3] : null
}

/** Smoke is queued while the body is painted and laid on after the ink line. */
let smokeQueue: Pt[] = []
function smokeAt(_x: Ctx, sx: number, sy: number) { smokeQueue.push([sx, sy]) }
function paintSmoke(x: Ctx) {
  for (const [sx, sy] of smokeQueue) {
    for (let i = 0; i < 3; i++) {
      const r = 3.2 + i * 1.8
      glow(x, sx + i * 2.6, sy - i * 6.5 - r, r * 1.5, 0xf4efe6, 0.5 - i * 0.12)
    }
  }
  smokeQueue = []
}

function barrel(x: Ctx, cx: number, B: number, s = 1) {
  const path = P.round(cx - 4 * s, B - 10 * s, 8 * s, 10 * s, 3 * s)
  form(x, path, WOOD, { rim: 0.8, core: 2 })
  fill(x, P.rect(cx - 4 * s, B - 8 * s, 8 * s, 1.2), IRON)
  fill(x, P.rect(cx - 4 * s, B - 3 * s, 8 * s, 1.2), IRON)
  line(x, path, 0.9, INK, 0.8)
}

function crate(x: Ctx, L: number, B: number, s = 10) {
  const path = P.rect(L, B - s, s, s)
  form(x, path, 0xb58a52, { rim: 0.8, core: 2 })
  line(x, x2 => { x2.moveTo(L, B - s); x2.lineTo(L + s, B); x2.moveTo(L + s, B - s); x2.lineTo(L, B) }, 1, WOOD_D, 0.8)
  line(x, path, 0.9, INK, 0.8)
}

function sack(x: Ctx, cx: number, B: number, c = 0xd8c49a) {
  const path = P.blob([[cx - 4.5, B], [cx - 4, B - 7], [cx - 1, B - 10], [cx + 1, B - 10], [cx + 4, B - 7], [cx + 4.5, B]], 1)
  form(x, path, c, { rim: 0.8, core: 1.6 })
  line(x, path, 0.9, INK, 0.8)
}

function logPile(x: Ctx, L: number, B: number, n: number) {
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 4), col = i % 4
    if (row > 2) break
    const lx = L + col * 8.5 + row * 4.25, ly = B - 4 - row * 7.5
    form(x, P.circle(lx, ly, 4), WOOD, { rim: 0.6, core: 1.2 })
    fill(x, P.circle(lx, ly, 2.6), 0xe0bc84)
    line(x, P.circle(lx, ly, 1.1), 0.6, WOOD_D, 0.9)
    line(x, P.circle(lx, ly, 4), 0.9, INK, 0.8)
  }
}

function fence(x: Ctx, L: number, B: number, w: number, h = 9) {
  const n = Math.max(2, Math.round(w / 7))
  for (let i = 0; i <= n; i++) {
    const px = L + (w * i) / n
    form(x, P.poly([[px - 1.3, B], [px - 1.3, B - h], [px, B - h - 2], [px + 1.3, B - h], [px + 1.3, B]]), WOOD, { rim: 0.4, core: 0.8 })
  }
  fill(x, P.rect(L, B - h * 0.75, w, 1.6), WOOD_D)
  fill(x, P.rect(L, B - h * 0.35, w, 1.6), WOOD_D)
}

/** The worn patch of ground every structure stands on. */
function plinth(x: Ctx, cx: number, by: number, w: number, tone = 0x8a6a48) {
  const g = x.createRadialGradient(cx, by - 2, 2, cx, by - 2, w * 0.62)
  g.addColorStop(0, css(tone, 0.95))
  g.addColorStop(0.7, css(tone, 0.75))
  g.addColorStop(1, css(tone, 0))
  x.save()
  x.translate(cx, by - 2); x.scale(1, 0.34); x.translate(-cx, -(by - 2))
  x.fillStyle = g
  x.beginPath(); x.arc(cx, by - 2, w * 0.62, 0, Math.PI * 2); x.fill()
  x.restore()
  // a few pebbles and scuffs at the edge
  for (let i = 0; i < 7; i++) {
    const a = rng.range(0, Math.PI * 2)
    const px = cx + Math.cos(a) * w * rng.range(0.35, 0.55)
    const py = by - 2 + Math.sin(a) * w * 0.17
    fill(x, P.ellipse(px, py, rng.range(1, 2.2), rng.range(0.8, 1.5)), shade(tone, rng.next() < 0.5 ? 0.25 : -0.3), 0.8)
  }
}

function contactShadow(x: Ctx, cx: number, by: number, w: number) {
  const g = x.createRadialGradient(cx + 6, by - 2, 2, cx + 6, by - 2, w * 0.5)
  g.addColorStop(0, css(0x1a1008, 0.35)); g.addColorStop(1, css(0x1a1008, 0))
  x.save()
  x.translate(cx + 6, by - 2); x.scale(1, 0.3); x.translate(-(cx + 6), -(by - 2))
  x.fillStyle = g; x.beginPath(); x.arc(cx + 6, by - 2, w * 0.5, 0, Math.PI * 2); x.fill()
  x.restore()
}

// ---- the buildings -----------------------------------------------------------------

interface Ctx2 { x: Ctx; lvl: number; cx: number; by: number; w: number; h: number }
type Painter = (c: Ctx2) => void
/** Things drawn after the ink line, un-outlined: fire, forge-light, crystal glow. */
type Glow = (c: Ctx2) => void

const DRAW: Record<BuildingKey, Painter> = {
  townHall: ({ x, lvl, cx, by }) => {
    if (lvl <= 1) {
      // the ember tent: all that survived the burning
      const tent = P.poly([[cx - 40, by - 2], [cx - 10, by - 50], [cx + 10, by - 50], [cx + 40, by - 2]])
      form(x, tent, 0xd8c6a0, { rim: 2, core: 14, hatch: 0.15 })
      line(x, x2 => { x2.moveTo(cx - 10, by - 50); x2.lineTo(cx - 22, by - 2); x2.moveTo(cx + 10, by - 50); x2.lineTo(cx + 20, by - 2) }, 0.8, INK, 0.4)
      fill(x, P.poly([[cx - 11, by - 2], [cx - 2, by - 30], [cx + 2, by - 30], [cx + 11, by - 2]]), 0x2a1a10)
      line(x, tent, 1.2, INK, 0.8)
      line(x, x2 => { x2.moveTo(cx - 40, by - 2); x2.lineTo(cx - 48, by + 2); x2.moveTo(cx + 40, by - 2); x2.lineTo(cx + 48, by + 2) }, 0.8, 0x6a5a40, 0.8)
      banner(x, cx + 2, by - 50, 22)
      // cold stones of the old hearth
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        form(x, P.ellipse(cx - 50 + Math.cos(a) * 7, by - 4 + Math.sin(a) * 3, 2.8, 2), 0x8a8478, { rim: 0.4, core: 0.8 })
      }
      return
    }
    const stone = lvl >= 3
    const w = 58 + lvl * 4
    const s: BoxSpec = { L: cx - w / 2 - 8, B: by, w, h: 24 + lvl * 2, d: 26, mat: stone ? 'stone' : 'plaster', c: stone ? STONE : PLASTER, footing: stone ? 0 : 5 }
    const tower = (tx: number) => {
      const t: BoxSpec = { L: tx, B: by + 3, w: 17, h: s.h + 26, d: 12, mat: 'stone', c: shade(STONE, -0.05) }
      box(x, t)
      cone(x, tx + 8.5 + 3, by + 3 - t.h - 3, 13, 24, lvl >= 5 ? LAPIS_ROOF : SLATE)
      windowAt(x, tx + 8.5, by + 3 - t.h + 13, 4, 7, false)
      banner(x, tx + 11, by + 3 - t.h - 26, 14, lvl >= 5 ? 0x8a2438 : PAL.lapis)
    }
    if (lvl >= 4) tower(s.L - 13)
    box(x, s)
    const roofC = lvl >= 4 ? LAPIS_ROOF : lvl >= 3 ? TERRACOTTA : THATCH
    roofSide(x, s, 20 + lvl * 2, 5, roofC, lvl >= 4 ? 'slate' : lvl >= 3 ? 'shingle' : 'thatch')
    const wins = Math.min(4, lvl)
    for (let i = 0; i < wins; i++) {
      const wx = s.L + ((i + 0.5) * s.w) / wins
      if (Math.abs(wx - (s.L + s.w / 2)) < 9) continue
      windowAt(x, wx, by - s.h * 0.58)
    }
    doorAt(x, s.L + s.w / 2, by, 13, 18)
    if (lvl >= 3) {
      // a lantern either side of the door
      for (const ox of [-11, 11]) fill(x, P.round(s.L + s.w / 2 + ox - 1.6, by - 17, 3.2, 4, 1), 0xffd27a)
    }
    banner(x, s.L + s.w / 2 + 6, by - s.h - 20 - lvl * 2 - 8, 18, lvl >= 5 ? 0x8a2438 : PAL.lapis)
    if (lvl >= 4) tower(s.L + s.w + 4)
    if (lvl >= 5) {
      // the crystal beacon on the ridge
      const bx = s.L + s.w / 2 + 6, bY = by - s.h - 34 - lvl * 2 - 10
      form(x, P.poly([[bx - 4, bY], [bx, bY - 11], [bx + 4, bY], [bx, bY + 4]]), PAL.crystal, { rim: 1, core: 2, light: 0xf2e6ff })
    }
  },

  depot: ({ x, cx, by }) => {
    const s: BoxSpec = { L: cx - 32, B: by, w: 50, h: 20, d: 20, mat: 'plank', c: WOOD }
    box(x, s)
    doorAt(x, cx - 7, by, 14, 16, WOOD_D)
    roofSide(x, s, 14, 4, 0x8a5a36, 'plank')
    // striped awning over the loading front
    const aw = P.poly([[cx - 36, by - 22], [cx + 20, by - 22], [cx + 24, by - 14], [cx - 40, by - 14]])
    form(x, aw, PAL.bone, { rim: 0.8, core: 2 })
    x.save(); x.beginPath(); aw(x); x.clip()
    for (let i = 0; i < 8; i += 2) fill(x, P.poly([[cx - 40 + i * 8, by - 14], [cx - 36 + i * 8, by - 22], [cx - 28 + i * 8, by - 22], [cx - 32 + i * 8, by - 14]]), PAL.lapis)
    x.restore()
    line(x, aw, 1, INK, 0.8)
    crate(x, cx + 14, by + 4, 10)
    crate(x, cx + 22, by + 6, 8)
    sack(x, cx - 30, by + 5)
    barrel(x, cx - 22, by + 6)
  },

  lumberCamp: ({ x, lvl, cx, by }) => {
    if (lvl >= 3) {
      const s: BoxSpec = { L: cx - 34, B: by - 4, w: 32, h: 18, d: 18, mat: 'log', c: WOOD }
      box(x, s)
      roofSide(x, s, 13, 3, THATCH, 'thatch')
      windowAt(x, s.L + 16, by - 15, 6, 6)
      if (lvl >= 4) banner(x, s.L + 4, by - 42, 14)
    }
    // open shed: plank roof on four posts over the stacked timber
    const shL = lvl >= 3 ? cx + 2 : cx - 30
    const shW = lvl >= 3 ? 34 : 54
    for (const px of [shL + 2, shL + shW - 4]) form(x, P.rect(px, by - 24, 3, 24), WOOD_D, { rim: 0.4, core: 1 })
    logPile(x, shL + 4, by, 3 + lvl * 2)
    const roof = P.poly([[shL - 3, by - 22], [shL + shW + 3, by - 22], [shL + shW + 8, by - 30], [shL + 2, by - 30]])
    form(x, roof, 0x8a5a36, { rim: 1, core: 2 })
    x.save(); x.beginPath(); roof(x); x.clip()
    for (let i = 0; i < shW + 10; i += 5) line(x, x2 => { x2.moveTo(shL - 3 + i, by - 22); x2.lineTo(shL + 2 + i, by - 30) }, 0.7, INK, 0.4)
    x.restore()
    line(x, roof, 1, INK, 0.8)
    // chopping stump with an axe bitten into it
    form(x, P.round(cx + 22, by - 8, 10, 8, 2), WOOD_D, { rim: 0.6, core: 1.4 })
    fill(x, P.ellipse(cx + 27, by - 8, 5, 2), 0xd8b47e)
    form(x, P.round(cx + 29, by - 20, 2, 13, 1), WOOD, { rim: 0.3, core: 0.5 })
    form(x, P.poly([[cx + 26, by - 12], [cx + 33, by - 17], [cx + 34, by - 12], [cx + 29, by - 9]]), 0xc9d1da, { rim: 0.6, core: 1 })
  },

  farm: ({ x, lvl, cx, by }) => {
    // the barn
    const s: BoxSpec = { L: cx - 6, B: by, w: 32, h: 20, d: 18, mat: 'plank', c: 0xa8442e, gable: 14 }
    box(x, s)
    roofFront(x, s, 3, 0x6a4a36, 'plank')
    // white-trimmed barn doors
    const dL = s.L + 9, dB = by
    form(x, P.rect(dL, dB - 13, 14, 13), 0x7a2e20, { rim: 0.6, core: 1.4 })
    line(x, x2 => { x2.moveTo(dL, dB - 13); x2.lineTo(dL + 14, dB); x2.moveTo(dL + 14, dB - 13); x2.lineTo(dL, dB); x2.rect(dL, dB - 13, 14, 13) }, 1.3, PAL.bone, 0.95)
    fill(x, P.circle(s.L + 16, by - s.h - 6, 2.6), PAL.bone)
    // hay
    form(x, P.blob([[cx - 36, by], [cx - 34, by - 12], [cx - 24, by - 16], [cx - 14, by - 12], [cx - 12, by]], 1), THATCH, { rim: 1, core: 3, hatch: 0.15 })
    if (lvl >= 2) {
      form(x, P.round(cx - 28, by - 4 - 10, 14, 10, 3), 0xd8b25e, { rim: 0.8, core: 2 })
      line(x, P.round(cx - 28, by - 14, 14, 10, 3), 1, INK, 0.8)
    }
    if (lvl >= 3) {
      // a little post windmill
      const mx = cx - 30, mB = by - 16
      form(x, P.poly([[mx - 5, mB], [mx - 3, mB - 20], [mx + 3, mB - 20], [mx + 5, mB]]), PLASTER, { rim: 0.6, core: 2 })
      line(x, P.poly([[mx - 5, mB], [mx - 3, mB - 20], [mx + 3, mB - 20], [mx + 5, mB]]), 1, INK, 0.8)
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * Math.PI) / 2
        const ex = mx + Math.cos(a) * 14, ey = mB - 18 + Math.sin(a) * 14
        line(x, x2 => { x2.moveTo(mx, mB - 18); x2.lineTo(ex, ey) }, 1.4, WOOD_D, 1)
        form(x, P.poly([[mx + Math.cos(a) * 4, mB - 18 + Math.sin(a) * 4], [ex, ey], [ex + Math.cos(a + 1.6) * 4, ey + Math.sin(a + 1.6) * 4], [mx + Math.cos(a) * 4 + Math.cos(a + 1.6) * 3, mB - 18 + Math.sin(a) * 4 + Math.sin(a + 1.6) * 3]]), PAL.bone, { rim: 0, core: 0 })
      }
      fill(x, P.circle(mx, mB - 18, 1.8), WOOD_D)
    }
    if (lvl >= 4) banner(x, s.L + s.w + 6, by - 30, 16, PAL.lapis)
    fence(x, cx - 38, by + 6, 30, 7)
  },

  quarry: ({ x, lvl, cx, by }) => {
    // stepped cut in the rock
    for (let t = 0; t < 3; t++) {
      const tw = 58 - t * 12, th = 9
      const s: BoxSpec = { L: cx - 34 + t * 5, B: by - t * 8, w: tw, h: th, d: 16 - t * 3, mat: 'stone', c: shade(STONE, -0.08 * t) }
      box(x, s)
    }
    // cut blocks waiting
    for (let i = 0; i < 1 + lvl; i++) {
      const bx = cx + 14 + (i % 3) * 7, bB = by + 6 - Math.floor(i / 3) * 6
      const s: BoxSpec = { L: bx, B: bB, w: 7, h: 6, d: 5, mat: 'stone', c: STONE }
      box(x, s)
    }
    // the crane
    const px = cx + 26
    form(x, P.rect(px, by - 46, 3, 46), WOOD_D, { rim: 0.4, core: 1 })
    line(x, x2 => { x2.moveTo(px, by - 44); x2.lineTo(px - 26, by - 40) }, 2.6, WOOD_D, 1)
    line(x, x2 => { x2.moveTo(px - 24, by - 40); x2.lineTo(px - 24, by - 26) }, 0.8, INK, 0.9)
    const hung: BoxSpec = { L: px - 29, B: by - 18, w: 10, h: 8, d: 6, mat: 'stone', c: STONE }
    box(x, hung)
    if (lvl >= 2) banner(x, px + 2, by - 46, 14)
    if (lvl >= 3) barrel(x, cx - 30, by + 6)
  },

  mine: ({ x, lvl, cx, by }) => {
    // the hillside the shaft is cut into
    const hill = P.blob([[cx - 40, by + 2], [cx - 30, by - 30], [cx - 6, by - 42], [cx + 22, by - 36], [cx + 38, by - 12], [cx + 40, by + 2]], 1)
    form(x, hill, 0x7a6a58, { rim: 2, core: 10, hatch: 0.2 })
    for (let i = 0; i < 6; i++) form(x, P.ellipse(cx - 30 + rng.range(0, 60), by - rng.range(10, 36), rng.range(3, 6), rng.range(2, 3.5)), 0x958a78, { rim: 0.5, core: 1 })
    // tunnel mouth in a timber frame
    fill(x, x2 => { x2.moveTo(cx - 12, by); x2.lineTo(cx - 12, by - 16); x2.arc(cx, by - 16, 12, Math.PI, 0); x2.lineTo(cx + 12, by); x2.closePath() }, 0x0e0a08)
    for (const px of [cx - 15, cx + 12]) form(x, P.rect(px, by - 26, 3.5, 26), WOOD, { rim: 0.4, core: 1 })
    form(x, P.rect(cx - 17, by - 29, 34, 4), WOOD, { rim: 0.6, core: 1.2 })
    // rails and a loaded cart
    line(x, x2 => { x2.moveTo(cx - 6, by - 2); x2.lineTo(cx + 34, by + 6); x2.moveTo(cx + 2, by - 4); x2.lineTo(cx + 40, by + 3) }, 1.1, IRON, 1)
    const cart = P.poly([[cx + 18, by - 8], [cx + 34, by - 8], [cx + 32, by + 1], [cx + 20, by + 1]])
    form(x, cart, 0x5a5048, { rim: 0.8, core: 2 })
    for (const [ox, oy] of [[22, -10], [27, -11], [31, -9]]) form(x, P.circle(cx + ox, by + oy, 2.4), PAL.metal, { rim: 0.6, core: 0.8, light: 0xffffff })
    line(x, cart, 1, INK, 0.8)
    for (const ox of [22, 30]) fill(x, P.circle(cx + ox, by + 2, 2), 0x2a2624)
    if (lvl >= 2) fill(x, P.round(cx - 20, by - 22, 3, 4, 1), 0xffd27a)
    if (lvl >= 3) {
      // headframe
      line(x, x2 => { x2.moveTo(cx - 30, by - 6); x2.lineTo(cx - 22, by - 48); x2.lineTo(cx - 14, by - 6) }, 2.4, WOOD_D, 1)
      form(x, P.circle(cx - 22, by - 46, 4), IRON, { rim: 0.6, core: 1 })
      banner(x, cx - 22, by - 50, 12)
    }
  },

  crystalDelve: ({ x, lvl, cx, by }) => {
    const shelf = P.blob([[cx - 38, by + 2], [cx - 30, by - 24], [cx - 4, by - 32], [cx + 24, by - 26], [cx + 38, by + 2]], 1)
    form(x, shelf, 0x5a4a72, { rim: 2, core: 10, hatch: 0.22 })
    fill(x, P.poly([[cx - 10, by], [cx - 7, by - 22], [cx + 7, by - 22], [cx + 10, by]]), 0x160e20)
    const spike = (sx: number, sb: number, h: number, w: number) => {
      form(x, P.poly([[sx - w, sb], [sx - w * 0.6, sb - h * 0.85], [sx, sb - h], [sx + w * 0.6, sb - h * 0.85], [sx + w, sb]]), PAL.crystal, { rim: 1.4, core: w * 0.8, light: 0xf2e6ff, dark: 0x5a3a9a })
      line(x, P.poly([[sx - w, sb], [sx - w * 0.6, sb - h * 0.85], [sx, sb - h], [sx + w * 0.6, sb - h * 0.85], [sx + w, sb]]), 1, INK, 0.8)
    }
    spike(cx - 18, by - 6, 16 + lvl * 3, 6)
    spike(cx + 16, by - 8, 12 + lvl * 3, 5)
    spike(cx - 1, by - 2, 20 + lvl * 4, 7)
    if (lvl >= 2) spike(cx + 28, by - 2, 11 + lvl * 2, 4.5)
    if (lvl >= 3) spike(cx - 30, by - 2, 13, 4.5)
    // head frame and hoist
    for (const px of [cx - 32, cx + 28]) form(x, P.rect(px, by - 48, 3.5, 44), WOOD_D, { rim: 0.4, core: 1 })
    form(x, P.rect(cx - 36, by - 52, 72, 5), WOOD, { rim: 0.6, core: 1.2 })
    line(x, P.rect(cx - 36, by - 52, 72, 5), 1, INK, 0.8)
    line(x, x2 => { x2.moveTo(cx + 8, by - 47); x2.lineTo(cx + 8, by - 36) }, 0.9, INK, 0.9)
    form(x, P.poly([[cx + 4, by - 32], [cx + 8, by - 39], [cx + 12, by - 32], [cx + 8, by - 28]]), PAL.crystal, { rim: 0.8, core: 1.4 })
    fill(x, P.round(cx - 31, by - 40, 4, 5, 1), 0xffd27a)
    if (lvl >= 3) banner(x, cx - 33, by - 52, 14, 0x5a3a9a)
  },

  barracks: ({ x, lvl, cx, by }) => {
    const s: BoxSpec = { L: cx - 38, B: by, w: 60, h: 26, d: 22, mat: lvl >= 2 ? 'plaster' : 'plank', c: lvl >= 2 ? PLASTER : WOOD, footing: lvl >= 2 ? 6 : 0 }
    box(x, s)
    roofSide(x, s, 18, 4, LAPIS_ROOF, lvl >= 3 ? 'slate' : 'shingle')
    doorAt(x, cx - 8, by, 14, 18)
    windowAt(x, cx - 26, by - 16)
    windowAt(x, cx + 10, by - 16)
    // hold shields hung on the wall
    for (const sx of [cx - 18, cx + 2]) {
      form(x, P.circle(sx, by - 21, 3.6), PAL.lapis, { rim: 0.6, core: 1 })
      fill(x, P.rect(sx - 0.7, by - 24.4, 1.4, 6.8), PAL.bone)
      line(x, P.circle(sx, by - 21, 3.6), 0.9, INK, 0.8)
    }
    // weapon rack
    const rx = cx + 26
    form(x, P.rect(rx, by - 6, 16, 2.4), WOOD_D, { rim: 0.4, core: 0.6 })
    for (let i = 0; i < 4; i++) {
      line(x, x2 => { x2.moveTo(rx + 2 + i * 4, by - 4); x2.lineTo(rx + 2 + i * 4, by - 22) }, 1.2, WOOD, 1)
      form(x, P.poly([[rx + 0.6 + i * 4, by - 22], [rx + 2 + i * 4, by - 27], [rx + 3.4 + i * 4, by - 22]]), 0xc9d1da, { rim: 0.4, core: 0.6 })
    }
    banner(x, s.L - 4, by - s.h - 4, 22)
    if (lvl >= 2) banner(x, s.L + s.w + 16, by - s.h - 12, 22)
    if (lvl >= 3) {
      // a straw training dummy
      form(x, P.rect(cx - 50, by - 16, 2, 16), WOOD_D, { rim: 0.3, core: 0.5 })
      form(x, P.ellipse(cx - 49, by - 17, 5, 6), THATCH, { rim: 0.6, core: 1.4 })
      form(x, P.circle(cx - 49, by - 26, 3.4), THATCH, { rim: 0.6, core: 1 })
      line(x, x2 => { x2.moveTo(cx - 56, by - 19); x2.lineTo(cx - 42, by - 19) }, 1.6, WOOD_D, 1)
    }
  },

  archeryRange: ({ x, lvl, cx, by }) => {
    const s: BoxSpec = { L: cx - 40, B: by, w: 38, h: 22, d: 18, mat: 'log', c: WOOD }
    box(x, s)
    roofSide(x, s, 15, 3, 0x4f7a44, 'shingle')
    doorAt(x, s.L + 12, by, 11, 15)
    windowAt(x, s.L + 29, by - 13, 6, 6)
    // straw butts on stands
    for (let i = 0; i < 1 + lvl; i++) {
      const tx = cx + 12 + i * 12, tB = by + 2 - (i % 2) * 3
      line(x, x2 => { x2.moveTo(tx - 4, tB); x2.lineTo(tx, tB - 18); x2.lineTo(tx + 4, tB) }, 1.4, WOOD_D, 1)
      form(x, P.circle(tx, tB - 18, 6.5), THATCH, { rim: 1, core: 2 })
      fill(x, P.circle(tx, tB - 18, 4.6), PAL.bone)
      fill(x, P.circle(tx, tB - 18, 3), PAL.danger)
      fill(x, P.circle(tx, tB - 18, 1.3), PAL.bone)
      line(x, P.circle(tx, tB - 18, 6.5), 1, INK, 0.8)
      line(x, x2 => { x2.moveTo(tx - 1, tB - 17); x2.lineTo(tx - 8, tB - 20) }, 1, WOOD_D, 1)
    }
    banner(x, s.L - 2, by - s.h - 14, 18, 0x3f6b3a)
  },

  stable: ({ x, lvl, cx, by }) => {
    const s: BoxSpec = { L: cx + 2, B: by, w: 38, h: 24, d: 22, mat: 'plank', c: 0x8a5a36 }
    box(x, s)
    roofSide(x, s, 14, 4, THATCH, 'thatch')
    // open stall doors, a horse looking out of one
    fill(x, P.rect(s.L + 5, by - 16, 12, 16), 0x1c120c)
    fill(x, P.rect(s.L + 21, by - 16, 12, 16), 0x1c120c)
    form(x, P.rect(s.L + 5, by - 7, 12, 7), WOOD_D, { rim: 0.4, core: 1 })
    form(x, P.rect(s.L + 21, by - 7, 12, 7), WOOD_D, { rim: 0.4, core: 1 })
    form(x, P.blob([[s.L + 8, by - 8], [s.L + 9, by - 15], [s.L + 17, by - 13], [s.L + 18, by - 9], [s.L + 13, by - 7]], 0.8), 0x7a4a2a, { rim: 0.8, core: 1.4 })
    fill(x, P.circle(s.L + 15.5, by - 12, 0.8), INK)
    // paddock
    fence(x, cx - 38, by + 2, 36, 10)
    fence(x, cx - 38, by - 12, 36, 8)
    // a saddle on the rail and a hay tuft
    form(x, P.blob([[cx - 26, by - 8], [cx - 20, by - 14], [cx - 14, by - 8]], 0.9), 0x6a3a1e, { rim: 0.6, core: 1 })
    if (lvl >= 2) banner(x, s.L + s.w + 16, by - 34, 18, 0x3c4f96)
  },

  house: ({ x, lvl, cx, by }) => {
    const w = 34 + lvl * 4
    const s: BoxSpec = { L: cx - w / 2 - 6, B: by, w, h: lvl >= 3 ? 30 : 20, d: 18, mat: 'plaster', c: PLASTER, footing: lvl >= 2 ? 4 : 0 }
    const smokeFrom = chimney(x, s.L + s.w - 6, by - s.h - 6, 14 + lvl * 2)
    box(x, s)
    roofSide(x, s, 14 + lvl, 4, lvl >= 3 ? TERRACOTTA : THATCH, lvl >= 3 ? 'shingle' : 'thatch')
    doorAt(x, s.L + 10, by, 9, 13)
    windowAt(x, s.L + s.w - 11, by - (lvl >= 3 ? 20 : 11), 7, 7)
    if (lvl >= 3) windowAt(x, s.L + 10, by - 22, 6, 6)
    // flower box
    fill(x, P.rect(s.L + s.w - 17, by - (lvl >= 3 ? 14 : 5), 12, 3), WOOD_D)
    for (let i = 0; i < 4; i++) fill(x, P.circle(s.L + s.w - 15.5 + i * 3, by - (lvl >= 3 ? 15 : 6), 1.4), [0xe8485a, 0xf2c24e, 0xe8e0f0, 0xe8485a][i])
    if (smokeFrom) smokeAt(x, smokeFrom[0], smokeFrom[1])
    if (lvl >= 3) banner(x, s.L - 3, by - s.h - 10, 14)
  },

  warehouse: ({ x, lvl, cx, by }) => {
    const s: BoxSpec = { L: cx - 38, B: by, w: 58, h: 26 + Math.min(lvl, 3) * 3, d: 24, mat: 'plank', c: WOOD, footing: lvl >= 2 ? 6 : 0 }
    box(x, s)
    roofSide(x, s, 14, 4, lvl >= 4 ? SLATE : 0x8a5a36, lvl >= 4 ? 'slate' : 'plank')
    // big double door
    const dL = s.L + s.w / 2 - 10
    form(x, P.rect(dL, by - 20, 20, 20), WOOD_D, { rim: 0.8, core: 2 })
    line(x, x2 => { x2.moveTo(dL + 10, by - 20); x2.lineTo(dL + 10, by); x2.moveTo(dL, by - 20); x2.lineTo(dL + 10, by); x2.moveTo(dL + 20, by - 20); x2.lineTo(dL + 10, by) }, 1, INK, 0.6)
    line(x, P.rect(dL, by - 20, 20, 20), 1.1, INK, 0.8)
    // hayloft door and hoist beam
    if (lvl >= 3) {
      fill(x, P.rect(s.L + s.w / 2 - 5, by - s.h + 3, 10, 8), 0x1c120c)
      form(x, P.rect(s.L + s.w / 2 - 2, by - s.h - 4, 4, 8), WOOD_D, { rim: 0.4, core: 1 })
      line(x, x2 => { x2.moveTo(s.L + s.w / 2, by - s.h + 3); x2.lineTo(s.L + s.w / 2, by - s.h + 16) }, 0.8, INK, 0.9)
      sack(x, s.L + s.w / 2, by - s.h + 22)
    }
    // goods out front
    crate(x, s.L - 6, by + 6, 10)
    barrel(x, s.L + 8, by + 7)
    if (lvl >= 2) { sack(x, s.L + s.w + 2, by + 6, 0xe8c860); sack(x, s.L + s.w + 10, by + 7) }
    if (lvl >= 4) crate(x, s.L - 2, by - 3, 8)
    banner(x, s.L + s.w + 12, by - s.h - 14, 18, lvl >= 5 ? 0x8a2438 : PAL.lapis)
  },

  blacksmith: ({ x, lvl, cx, by }) => {
    const s: BoxSpec = { L: cx - 36, B: by, w: 40, h: 24, d: 20, mat: 'stone', c: shade(STONE, -0.08) }
    const smokeFrom = chimney(x, s.L + 32, by - s.h - 4, 18 + lvl * 3)
    box(x, s)
    roofSide(x, s, 13, 3, 0x5a4a44, 'slate')
    // the forge mouth
    fill(x, x2 => { x2.moveTo(s.L + 8, by); x2.lineTo(s.L + 8, by - 10); x2.arc(s.L + 15, by - 10, 7, Math.PI, 0); x2.lineTo(s.L + 22, by); x2.closePath() }, 0x2a0e06)
    // open-sided smithy shelter
    const sL = s.L + s.w + 2
    for (const px of [sL + 2, sL + 24]) form(x, P.rect(px, by - 22, 2.6, 22), WOOD_D, { rim: 0.4, core: 1 })
    const aw = P.poly([[sL - 4, by - 20], [sL + 30, by - 20], [sL + 34, by - 28], [sL, by - 28]])
    form(x, aw, 0x6a4a36, { rim: 0.8, core: 2 })
    line(x, aw, 1, INK, 0.8)
    // anvil on a block
    form(x, P.rect(sL + 10, by - 6, 6, 6), WOOD_D, { rim: 0.4, core: 1 })
    form(x, P.poly([[sL + 6, by - 10], [sL + 20, by - 10], [sL + 18, by - 6], [sL + 8, by - 6], [sL + 4, by - 9]]), 0x3e4248, { rim: 0.8, core: 1.4, light: 0x9aa4ad })
    barrel(x, sL + 24, by + 2, 0.9)
    if (lvl >= 3) {
      for (let i = 0; i < 3; i++) line(x, x2 => { x2.moveTo(s.L + 26 + i * 3, by - 20); x2.lineTo(s.L + 26 + i * 3, by - 8) }, 1, 0xc9d1da, 1)
    }
    if (lvl >= 4) banner(x, s.L - 3, by - s.h - 12, 16, 0x8a2438)
    if (smokeFrom) smokeAt(x, smokeFrom[0], smokeFrom[1])
  },

  workshop: ({ x, lvl, cx, by }) => {
    const s: BoxSpec = { L: cx - 38, B: by, w: 44, h: 26, d: 20, mat: 'plaster', c: PLASTER }
    box(x, s)
    roofSide(x, s, 14, 4, 0x8a5a36, 'plank')
    doorAt(x, s.L + 12, by, 12, 16)
    windowAt(x, s.L + 32, by - 16, 7, 7)
    // scaffold and a half-built siege wheel
    const sc = s.L + s.w + 6
    for (const px of [sc, sc + 16]) form(x, P.rect(px, by - 40, 2.6, 40), WOOD_D, { rim: 0.3, core: 0.8 })
    for (const py of [by - 26, by - 12]) form(x, P.rect(sc - 2, py, 21, 2.4), WOOD, { rim: 0.3, core: 0.6 })
    line(x, x2 => { x2.moveTo(sc, by - 40); x2.lineTo(sc + 18, by - 26) }, 1.2, WOOD_D, 1)
    const wx = cx - 2, wy = by - 2
    x.save()
    x.beginPath(); x.arc(wx, wy - 9, 9, 0, Math.PI * 2)
    x.strokeStyle = css(INK); x.lineWidth = 4; x.stroke()
    x.strokeStyle = css(WOOD); x.lineWidth = 2.4; x.stroke()
    x.restore()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      line(x, x2 => { x2.moveTo(wx, wy - 9); x2.lineTo(wx + Math.cos(a) * 8, wy - 9 + Math.sin(a) * 8) }, 1.2, WOOD_D, 1)
    }
    fill(x, P.circle(wx, wy - 9, 2), IRON)
    if (lvl >= 2) crate(x, sc + 4, by + 4, 9)
    if (lvl >= 3) banner(x, s.L - 3, by - s.h - 10, 16, 0xb07a2a)
  },

  healingTent: ({ x, lvl, cx, by }) => {
    const tent = (tx: number, s: number) => {
      const path = P.poly([[tx - 26 * s, by], [tx - 18 * s, by - 30 * s], [tx + 18 * s, by - 30 * s], [tx + 26 * s, by]])
      form(x, path, 0xeee4cc, { rim: 1.4, core: 10 * s, hatch: 0.12 })
      x.save(); x.beginPath(); path(x); x.clip()
      for (let i = 0; i < 4; i++) line(x, x2 => { x2.moveTo(tx - 18 * s + i * 12 * s, by - 30 * s); x2.lineTo(tx - 26 * s + i * 17 * s, by) }, 0.7, INK, 0.3)
      x.restore()
      fill(x, P.poly([[tx - 7 * s, by], [tx - 5 * s, by - 20 * s], [tx + 5 * s, by - 20 * s], [tx + 7 * s, by]]), 0x3a3024)
      line(x, path, 1.1, INK, 0.8)
      // a sage leaf on a bone roundel: the herbalist's mark
      const my = by - 24 * s
      fill(x, P.circle(tx + 13 * s, my + 6, 5 * s), PAL.bone)
      form(x, P.ellipse(tx + 13 * s, my + 6, 1.8 * s, 3.8 * s, 0.5), 0x5a9a4a, { rim: 0.4, core: 0.6 })
      line(x, P.circle(tx + 13 * s, my + 6, 5 * s), 0.8, INK, 0.7)
    }
    if (lvl >= 2) tent(cx + 24, 0.7)
    tent(cx - 6, 1)
    // herb baskets and a water barrel
    for (const bx of [cx - 34, cx - 26]) {
      form(x, P.round(bx - 4, by - 5, 8, 6, 2), 0xb08a52, { rim: 0.4, core: 1 })
      for (let i = 0; i < 3; i++) fill(x, P.circle(bx - 2 + i * 2, by - 6, 1.6), 0x6aa04a)
    }
    barrel(x, cx + 20, by + 6, 0.9)
    banner(x, cx - 26, by - 30, 16, 0x4f8a4a)
  },

  watchtower: ({ x, lvl, cx, by }) => {
    const stone = lvl >= 3
    const h = 38 + lvl * 7
    if (stone) {
      const t: BoxSpec = { L: cx - 13, B: by, w: 22, h, d: 12, mat: 'stone', c: STONE }
      box(x, t)
      fill(x, P.round(cx - 5, by - h + 12, 6, 9, 2), 0x1c120c)
    } else {
      // timber legs with cross-bracing
      for (const s of [-1, 1]) {
        line(x, x2 => { x2.moveTo(cx + s * 13, by); x2.lineTo(cx + s * 8, by - h) }, 3.6, INK, 1)
        line(x, x2 => { x2.moveTo(cx + s * 13, by); x2.lineTo(cx + s * 8, by - h) }, 2.2, WOOD, 1)
      }
      for (const f of [0.3, 0.65]) {
        line(x, x2 => { x2.moveTo(cx - 12, by - h * (f - 0.25)); x2.lineTo(cx + 10, by - h * f); x2.moveTo(cx + 12, by - h * (f - 0.25)); x2.lineTo(cx - 10, by - h * f) }, 1.6, WOOD_D, 1)
      }
    }
    // the platform and its parapet
    const p: BoxSpec = { L: cx - 16, B: by - h, w: 28, h: 9, d: 12, mat: stone ? 'stone' : 'plank', c: stone ? STONE : WOOD }
    box(x, p)
    for (let i = 0; i < 4; i++) {
      const m: BoxSpec = { L: cx - 16 + i * 7.4, B: by - h - 9, w: 4.6, h: 5, d: 3, mat: stone ? 'stone' : 'plank', c: stone ? STONE : WOOD }
      box(x, m)
    }
    if (lvl >= 4) {
      cone(x, cx - 2 + 3, by - h - 22, 17, 22, LAPIS_ROOF)
      line(x, x2 => { x2.moveTo(cx - 14, by - h - 9); x2.lineTo(cx - 14, by - h - 22); x2.moveTo(cx + 10, by - h - 9); x2.lineTo(cx + 10, by - h - 22) }, 1.6, WOOD_D, 1)
      banner(x, cx + 1, by - h - 44, 14)
    } else {
      // brazier on the platform
      form(x, P.poly([[cx - 2, by - h - 12], [cx + 8, by - h - 12], [cx + 6, by - h - 7], [cx, by - h - 7]]), IRON, { rim: 0.4, core: 0.8 })
    }
    // the lookout
    form(x, P.round(cx - 7, by - h - 17, 6, 8, 2), PAL.allyAlt, { rim: 0.4, core: 1 })
    form(x, P.circle(cx - 4, by - h - 19, 3), PAL.heroSkin, { rim: 0.4, core: 0.8 })
    if (lvl >= 5) form(x, P.poly([[cx + 1, by - h - 50], [cx + 4, by - h - 57], [cx + 7, by - h - 50], [cx + 4, by - h - 47]]), PAL.crystal, { rim: 0.8, core: 1 })
  },

  outpost: ({ x, lvl, cx, by }) => {
    // the lantern pole first, behind the blockhouse's west end
    const px = cx - 40, top = by - 76
    form(x, P.round(px - 1.8, top, 3.6, by - top + 2, 1.5), WOOD_D, { rim: 0.6, core: 1.2 })
    form(x, P.round(px - 2, top + 2, 16, 3, 1), BEAM, { rim: 0.4, core: 0.8 })
    line(x, x2 => { x2.moveTo(px + 11, top + 5); x2.lineTo(px + 11, top + 10) }, 0.8, INK, 0.8)
    const lantern = P.poly([[px + 7, top + 12], [px + 15, top + 12], [px + 14, top + 22], [px + 8, top + 22]])
    fill(x, lantern, 0xffd27a)
    line(x, lantern, 1, INK, 0.9)
    fill(x, P.poly([[px + 6, top + 12], [px + 11, top + 8], [px + 16, top + 12]]), IRON)
    // the blockhouse: squared logs, an overhanging upper storey at Lv.2
    const s: BoxSpec = { L: cx - 28, B: by, w: 38, h: lvl >= 2 ? 20 : 22, d: 20, mat: 'log', c: WOOD, footing: lvl >= 2 ? 6 : 0 }
    box(x, s)
    doorAt(x, s.L + 12, by, 10, 15, WOOD_D)
    fill(x, P.rect(s.L + 27, by - 16, 4, 7), 0x2a1a10)
    if (lvl >= 2) {
      const u: BoxSpec = { L: s.L - 3, B: by - s.h, w: s.w + 6, h: 14, d: 22, mat: 'plank', c: shade(WOOD, 0.06) }
      box(x, u)
      for (const wx of [u.L + 10, u.L + 30]) fill(x, P.rect(wx - 1.5, u.B - 10, 3, 6), 0x2a1a10)
      roofSide(x, u, 16, 4, SLATE, 'slate')
      banner(x, u.L + u.w / 2 + 4, u.B - u.h - 18, 16)
    } else {
      roofSide(x, s, 15, 4, 0x8a5a36, 'plank')
      banner(x, s.L + s.w / 2 + 4, by - s.h - 18, 14)
    }
    logPile(x, s.L + s.w + 2, by + 6, 3)
    standingStone(x, cx + 44, by + 4, 1)
  },

  cannonTower: ({ x, lvl, cx, by }) => {
    const h = 30 + lvl * 6
    const t: BoxSpec = { L: cx - 20, B: by, w: 34, h, d: 16, mat: 'stone', c: shade(STONE, -0.04) }
    box(x, t)
    // arrow slit and a stone band
    fill(x, P.round(cx - 5, by - h + 14, 3, 9, 1.4), 0x1c120c)
    fill(x, P.rect(t.L, by - h + 4, t.w, 2), shade(STONE, -0.25))
    for (let i = 0; i < 4; i++) {
      const m: BoxSpec = { L: t.L + i * 9, B: by - h, w: 6, h: 6, d: 4, mat: 'stone', c: STONE }
      box(x, m)
    }
    // the bombard, run out over the parapet
    const bY = by - h - 9
    const barrel = P.poly([[cx - 10, bY - 6], [cx + 22, bY - 9], [cx + 24, bY + 2], [cx - 10, bY + 5]])
    form(x, barrel, 0x3a3e44, { rim: 1.2, core: 3.4, light: 0x8a929c })
    for (const bx of [cx - 2, cx + 9, cx + 19]) fill(x, P.rect(bx, bY - 8, 2.2, 12), lvl >= 3 ? PAL.gilt : 0x2a2e34)
    fill(x, P.ellipse(cx + 23, bY - 3.5, 2.4, 4.6, -0.1), 0x0c0c0e)
    line(x, barrel, 1.1, INK, 0.85)
    form(x, P.circle(cx - 8, bY + 2, 5.5), WOOD_D, { rim: 0.6, core: 1.2 })
    line(x, P.circle(cx - 8, bY + 2, 5.5), 1, INK, 0.8)
    if (lvl >= 2) {
      for (let i = 0; i < 3; i++) form(x, P.circle(cx - 26 + i * 4.5, by + 2 - (i === 1 ? 4 : 0), 2.6), 0x2a2e34, { rim: 0.4, core: 0.6, light: 0x8a929c })
    }
    if (lvl >= 3) banner(x, t.L - 2, by - h - 6, 16, 0x8a2438)
  },

  // A run's art is 72 px wide, 5 px over its 62 px share at each end (S09b), so neighbours and posts overlap it.
  wall: ({ x, lvl, cx, by }) => {
    if (lvl <= 1) {
      // sharpened palisade stakes, lashed together
      for (let i = 0; i < 10; i++) {
        const px = cx - 32.4 + i * 7.2
        const hh = 24 + (i % 3) * 2
        form(x, P.poly([[px - 3.4, by], [px - 3.4, by - hh], [px, by - hh - 6], [px + 3.4, by - hh], [px + 3.4, by]]), i % 2 ? WOOD : shade(WOOD, -0.08), { rim: 0.6, core: 1.6 })
        line(x, P.poly([[px - 3.4, by], [px - 3.4, by - hh], [px, by - hh - 6], [px + 3.4, by - hh], [px + 3.4, by]]), 0.9, INK, 0.7)
      }
      fill(x, P.rect(cx - 36, by - 18, 72, 2), 0x8a7a5a)
      fill(x, P.rect(cx - 36, by - 7, 72, 2), 0x8a7a5a)
      return
    }
    const h = 20 + lvl * 4
    const s: BoxSpec = { L: cx - 36, B: by, w: 72, h, d: 10, mat: 'stone', c: STONE }
    box(x, s)
    for (let i = 0; i < 6; i++) {
      const m: BoxSpec = { L: s.L + 1 + i * 12, B: by - h, w: 8, h: 6, d: 6, mat: 'stone', c: STONE }
      box(x, m)
    }
    if (lvl >= 3) fill(x, P.rect(s.L, by - h - 1, s.w, 1.6), IRON)
  },

  gate: ({ x, lvl, cx, by }) => {
    const stone = lvl >= 2
    const h = 30 + lvl * 5
    for (const tx of [cx - 36, cx + 18]) {
      const t: BoxSpec = { L: tx, B: by, w: 16, h, d: 12, mat: stone ? 'stone' : 'log', c: stone ? STONE : WOOD }
      box(x, t)
      for (let i = 0; i < 2; i++) {
        const m: BoxSpec = { L: tx + i * 9, B: by - h, w: 6, h: 5, d: 5, mat: stone ? 'stone' : 'plank', c: stone ? STONE : WOOD }
        box(x, m)
      }
    }
    // the doors, iron-strapped
    const dL = cx - 20, dW = 38, dH = h - 8
    form(x, P.rect(dL, by - dH, dW, dH), WOOD_D, { rim: 1, core: 3 })
    for (let i = 1; i < 6; i++) line(x, x2 => { x2.moveTo(dL + (dW * i) / 6, by - dH); x2.lineTo(dL + (dW * i) / 6, by) }, 0.8, INK, 0.5)
    for (const f of [0.25, 0.7]) fill(x, P.rect(dL, by - dH * f, dW, 2), IRON)
    line(x, x2 => { x2.moveTo(cx - 1, by - dH); x2.lineTo(cx - 1, by) }, 1.4, INK, 0.8)
    line(x, P.rect(dL, by - dH, dW, dH), 1.1, INK, 0.8)
    if (lvl >= 2) {
      // an arch over the gate
      const arch = P.rect(dL - 2, by - dH - 6, dW + 4, 6)
      form(x, arch, STONE, { rim: 0.8, core: 1.6 })
      line(x, arch, 1, INK, 0.8)
      banner(x, cx - 29, by - h - 5, 14)
      banner(x, cx + 25, by - h - 5, 14)
    }
    if (lvl >= 3) {
      for (let i = 0; i < 6; i++) fill(x, P.poly([[dL + 2 + i * 6.4, by - dH], [dL + 3.6 + i * 6.4, by - dH + 5], [dL + 5.2 + i * 6.4, by - dH]]), IRON)
    }
  },
}

/** Emissive bits, laid over the ink so they read as light. */
const GLOW: Partial<Record<BuildingKey, Glow>> = {
  townHall: ({ x, lvl, cx, by }) => {
    if (lvl <= 1) {
      // the ember that names the hold, still burning outside the tent
      const fx = cx - 50, fy = by - 5
      glow(x, fx, fy - 4, 16, 0xff8a2a, 0.9)
      fill(x, P.blob([[fx - 5, fy], [fx - 3, fy - 9], [fx - 0.5, fy - 5], [fx + 2, fy - 12], [fx + 5, fy]], 0.8), 0xff9a3a)
      fill(x, P.blob([[fx - 2.5, fy], [fx, fy - 6], [fx + 2.5, fy]], 0.8), 0xfff0b0)
    }
    if (lvl >= 5) {
      const w = 58 + lvl * 4
      const bx = cx - w / 2 - 8 + w / 2 + 6, bY = by - (24 + lvl * 2) - 34 - lvl * 2 - 10
      glow(x, bx, bY - 4, 14, PAL.crystal, 0.8)
    }
  },
  blacksmith: ({ x, cx, by }) => {
    const L = cx - 36
    glow(x, L + 15, by - 6, 12, 0xff7a2a, 0.9)
    fill(x, x2 => { x2.moveTo(L + 10, by); x2.lineTo(L + 10, by - 9); x2.arc(L + 15, by - 9, 5, Math.PI, 0); x2.lineTo(L + 20, by); x2.closePath() }, 0xffa040)
    fill(x, P.round(L + 12, by - 7, 6, 7, 2), 0xfff0b0)
  },
  crystalDelve: ({ x, lvl, cx, by }) => {
    glow(x, cx - 1, by - 18, 22 + lvl * 3, PAL.crystal, 0.45)
  },
  watchtower: ({ x, lvl, cx, by }) => {
    if (lvl >= 4) return
    const h = 38 + lvl * 7
    const fx = cx + 3, fy = by - h - 13
    glow(x, fx, fy - 2, 11, 0xff8a2a, 0.9)
    fill(x, P.blob([[fx - 4, fy], [fx - 2, fy - 7], [fx, fy - 4], [fx + 2, fy - 9], [fx + 4, fy]], 0.8), 0xffa040)
    fill(x, P.blob([[fx - 2, fy], [fx, fy - 5], [fx + 2, fy]], 0.8), 0xfff0b0)
  },
  healingTent: ({ x, lvl, cx, by }) => {
    if (lvl >= 3) glow(x, cx - 6, by - 14, 30, PAL.good, 0.28)
  },
  outpost: ({ x, lvl, cx, by }) => {
    glow(x, cx - 29, by - 59, 14, 0xffb050, 0.85)
    if (lvl >= 2) glow(x, cx, by - 14, 30, PAL.good, 0.18)
  },
}

/**
 * A waystone (S11): a weathered monolith with a carved lapis rune. Outposts
 * paint one beside the blockhouse; the lone stones (the Hall Stone, the Isle
 * Stone) use `ws_stone`, and the Waystones system lays a glow over it once lit.
 */
function standingStone(x: Ctx, sx: number, B: number, k: number) {
  const h = 34 * k, w = 8 * k
  const body = P.blob([[sx - w, B], [sx - w - 1, B - h * 0.55], [sx - w * 0.55, B - h], [sx + w * 0.4, B - h - 2 * k], [sx + w, B - h * 0.5], [sx + w + 1, B]], 0.9)
  form(x, body, 0x9a968a, { rim: 1.4 * k, core: 3 * k, hatch: 0.12 })
  const ry = B - h * 0.55
  line(x, x2 => {
    x2.moveTo(sx, ry - 7 * k); x2.lineTo(sx, ry + 7 * k)
    x2.moveTo(sx - 4 * k, ry - 3 * k); x2.lineTo(sx, ry); x2.lineTo(sx + 4 * k, ry - 3 * k)
    x2.moveTo(sx - 3 * k, ry + 4 * k); x2.lineTo(sx + 3 * k, ry + 4 * k)
  }, 1.3 * k, 0x3c62a0, 0.95)
  for (let i = 0; i < 3; i++) fill(x, P.ellipse(sx + (i - 1) * 5 * k, B + 1, 3 * k, 1.4 * k), shade(0x7a8a5a, -0.1 * i), 0.8)
  line(x, body, 1.1, INK, 0.85)
}

/** The lone waystone's texture: 40×64, pad point 16 px above the bottom like a building. */
function buildWaystoneTexture(scene: Phaser.Scene) {
  const w = 40, h = 64, cx = w / 2, by = h - 16
  register(scene, 'ws_stone', paint(w, h, {
    under: x => contactShadow(x, cx, by + 2, 26),
    body: x => standingStone(x, cx, by, 1),
    outline: 1.6,
    grain: 0.1,
  }))
}

/** Texture canvas size per building. Generous headroom for roofs and flags. */
function texSize(key: BuildingKey, lvl: number) {
  const d = BUILDINGS[key]
  const extra = key === 'watchtower' ? 64 + lvl * 8 : key === 'cannonTower' ? 44 + lvl * 7
    : key === 'townHall' ? 60 + lvl * 8 : key === 'outpost' ? 64 : 48
  return { w: d.w + 72, h: d.h + extra + 28 }
}

export function buildingTextureKey(key: BuildingKey, lvl: number) { return `bld_${key}_${lvl}` }

/**
 * A wall piece's own art (S09b): `bld_wall_v_${lvl}` for a run seen end-on,
 * `bld_wallpost_${lvl}` for a corner or jamb, `bld_gate_v_${lvl}` for a
 * gatehouse turned side-on; level 0 is the staked-out site. Null when the
 * piece wears the plain texture (a horizontal run or gate).
 */
export function pieceTextureKey(key: BuildingKey, lvl: number, piece: { part: 'run' | 'post'; dir: 'h' | 'v' }): string | null {
  const name = key === 'wall' && piece.part === 'post' ? 'wallpost'
    : piece.dir === 'v' && (key === 'wall' || key === 'gate') ? `${key}_v` : null
  if (!name) return null
  return lvl > 0 ? `bld_${name}_${lvl}` : `blueprint_${name}`
}

/** How far above a texture's bottom edge its pad point sits: 16 px, more for art that reaches toward the viewer. */
const FOOT = new Map<string, number>()
export function textureFoot(texKey: string): number { return FOOT.get(texKey) ?? 16 }

function paintBuilding(key: BuildingKey, lvl: number, w: number, h: number) {
  const cx = w / 2, by = h - 16
  const def = BUILDINGS[key]
  rng = new Rng(key.length * 977 + lvl * 131)
  smokeQueue = []
  const plinthTone = key === 'quarry' || key === 'cannonTower' || (key === 'watchtower' && lvl >= 3) ? 0x8a8474
    : key === 'crystalDelve' ? 0x6a5a7a : key === 'mine' ? 0x6e5a46 : 0x8e6c48
  const walls = key === 'wall' || key === 'gate'
  return paint(w, h, {
    under: x => {
      if (!walls) plinth(x, cx, by, Math.max(46, def.w * 0.95), plinthTone)
      contactShadow(x, cx, by, def.w * (walls ? 1.1 : 0.9))
    },
    body: x => DRAW[key]({ x, lvl, cx, by, w, h }),
    over: x => { paintSmoke(x); GLOW[key]?.({ x, lvl, cx, by, w, h }) },
    outline: key === 'wall' ? 1.6 : 2,
    grain: 0.1,
  })
}

export function buildBuildingTextures(scene: Phaser.Scene) {
  buildWaystoneTexture(scene)
  for (const def of Object.values(BUILDINGS)) {
    for (let lvl = 1; lvl <= def.levels.length; lvl++) {
      const { w, h } = texSize(def.key, lvl)
      register(scene, buildingTextureKey(def.key, lvl), paintBuilding(def.key, lvl, w, h))
    }

    // ---- the staked-out site: surveyor's string and chalk on bare earth ----
    const { w, h } = texSize(def.key, 1)
    const cx = w / 2, by = h - 16
    const fw = def.w * 0.92, fd = Math.max(14, def.h * 0.42)
    bake(scene, `blueprint_${def.key}`, w, h, {
      under: x => {
        rng = new Rng(def.key.length * 31)
        if (def.key !== 'wall' && def.key !== 'gate') plinth(x, cx, by, Math.max(40, def.w * 0.9), 0x9a7a54)
        // chalk footprint, drawn as a dashed lozenge
        x.save()
        x.setLineDash([5, 4])
        x.strokeStyle = css(PAL.bone, 0.85)
        x.lineWidth = 1.6
        x.beginPath()
        x.moveTo(cx - fw / 2, by)
        x.lineTo(cx + fw / 2, by)
        x.lineTo(cx + fw / 2 + fd * 0.5, by - fd * 0.42)
        x.lineTo(cx - fw / 2 + fd * 0.5, by - fd * 0.42)
        x.closePath()
        x.stroke()
        x.restore()
      },
      body: x => {
        // corner stakes with string between them
        const corners: Pt[] = [[cx - fw / 2, by], [cx + fw / 2, by], [cx + fw / 2 + fd * 0.5, by - fd * 0.42], [cx - fw / 2 + fd * 0.5, by - fd * 0.42]]
        for (const [sx, sy] of corners) {
          form(x, P.poly([[sx - 1.4, sy + 1], [sx - 1.4, sy - 8], [sx, sy - 10], [sx + 1.4, sy - 8], [sx + 1.4, sy + 1]]), WOOD, { rim: 0.3, core: 0.6 })
          fill(x, P.rect(sx - 1.6, sy - 8, 3.2, 1.6), PAL.ember)
        }
        // a surveyor's pennant
        const [fx, fy] = corners[3]
        form(x, P.rect(fx - 0.9, fy - 22, 1.8, 22), WOOD_D, { rim: 0.2, core: 0.4 })
        form(x, P.poly([[fx + 1, fy - 22], [fx + 11, fy - 19], [fx + 1, fy - 15]]), PAL.lapis, { rim: 0.6, core: 1 })
      },
      outline: 1.2,
      grain: 0,
    })

    // ---- mid-construction: the frame going up ----
    bake(scene, `frame_${def.key}`, w, h, {
      under: x => {
        rng = new Rng(def.key.length * 53)
        if (def.key !== 'wall' && def.key !== 'gate') plinth(x, cx, by, Math.max(46, def.w * 0.95))
      },
      body: x => {
        const L = cx - fw / 2, fh = Math.max(16, def.h * 0.5)
        const s: BoxSpec = { L, B: by, w: fw, h: 5, d: fd, mat: 'stone', c: STONE }
        box(x, s)
        // posts and a ridge beam
        for (let i = 0; i <= 4; i++) {
          const px = L + (fw * i) / 4
          form(x, P.rect(px - 1.6, by - 5 - fh, 3.2, fh), WOOD, { rim: 0.4, core: 1 })
        }
        form(x, P.rect(L - 2, by - 5 - fh - 3, fw + 4, 3.2), WOOD, { rim: 0.4, core: 1 })
        for (let i = 0; i < 4; i++) {
          const x0 = L + (fw * i) / 4, x1 = L + (fw * (i + 1)) / 4
          line(x, x2 => { x2.moveTo(x0 + 2, by - 6); x2.lineTo(x1 - 2, by - 3 - fh) }, 1.6, WOOD_D, 1)
        }
        // a stack of fresh planks and a ladder
        for (let i = 0; i < 3; i++) form(x, P.rect(cx + fw / 2 - 12, by + 4 - i * 3, 18, 2.6), shade(WOOD, 0.15), { rim: 0.3, core: 0.6 })
        line(x, x2 => { x2.moveTo(L + 4, by); x2.lineTo(L + 10, by - fh - 4); x2.moveTo(L + 9, by); x2.lineTo(L + 15, by - fh - 4) }, 1.2, WOOD_D, 1)
      },
      outline: 1.6,
      grain: 0.08,
    })
  }
  buildWallPieceTextures(scene)
}



// ---- wall pieces (S09b) --------------------------------------------------------------
// A line of wall is laid as runs, posts and gates (world/wallLine.ts). Horizontal
// runs and gates wear the plain textures; these are the rest. A vertical run is
// seen end-on and reaches toward the viewer, so its pad point (the run's middle)
// sits V_HALF px above its near end: FOOT records that for Building's origin.

/** Half a vertical run's ground length as drawn: 31 px of share, 4 px over at each end. */
const V_HALF = 35
const WALL_V = { w: 64, h: 136, foot: 16 + V_HALF }
const POST = { w: 64, h: 92, foot: 28 }
const GATE_V = { w: 96, h: 148, foot: 16 + 34 }

function stake(x: Ctx, px: number, gy: number, hh: number, r: number, c: number) {
  const path = P.poly([[px - r, gy], [px - r, gy - hh], [px, gy - hh - r * 1.7], [px + r, gy - hh], [px + r, gy]])
  form(x, path, c, { rim: 0.6, core: 1.6 })
  line(x, path, 0.9, INK, 0.7)
}

/** A run seen end-on, from its far end (g0) to its near end (g1): stakes receding up the screen, or the wall-walk. */
function paintWallV(x: Ctx, lvl: number, cx: number, by: number) {
  const g0 = by - V_HALF, g1 = by + V_HALF
  if (lvl <= 1) {
    // two files of stakes, far to near, each nearer one hiding the foot of the last
    let i = 0
    for (let gy = g0; gy <= g1 + 0.1; gy += 5, i++) stake(x, cx + (i % 2 ? 2.6 : -2.6), gy, 24 + (i % 3) * 2, 3.4, i % 2 ? WOOD : shade(WOOD, -0.08))
    line(x, x2 => { x2.moveTo(cx + 6.4, g0 - 16); x2.lineTo(cx + 6.4, g1 - 16) }, 1.8, 0x8a7a5a, 1)
    return
  }
  const h = 20 + lvl * 4, T = 16, L = cx - T / 2
  // the east face in shadow, then the wall-walk, then the near end's face
  form(x, P.rect(L + T, g0 - h + 4, 5, g1 - g0 + h - 4), shade(STONE, -0.3), { rim: 0.4, core: 1 })
  const walk = P.rect(L, g0 - h, T, g1 - g0)
  form(x, walk, shade(STONE, 0.08), { rim: 0.6, core: 1.4 })
  for (let gy = g0 - h + 9; gy < g1 - h; gy += 9) line(x, x2 => { x2.moveTo(L + 1, gy); x2.lineTo(L + T - 1, gy) }, 0.7, INK, 0.3)
  for (let gy = g0 - h + 2; gy < g1 - h - 4; gy += 12) {
    for (const mx of [L - 1, L + T - 3]) box(x, { L: mx, B: gy + 6, w: 4, h: 6, d: 3, mat: 'stone', c: STONE })
  }
  box(x, { L, B: g1, w: T, h, d: 8, mat: 'stone', c: STONE })
  if (lvl >= 3) for (const mx of [L, L + T - 1.6]) fill(x, P.rect(mx, g0 - h, 1.6, g1 - g0), IRON)
}

/** A corner or jamb: three stakes bound together, or a stone pier, standing a little proud of the runs it caps. */
function paintWallPost(x: Ctx, lvl: number, cx: number, by: number) {
  const B = by + 8
  if (lvl <= 1) {
    stake(x, cx - 4, B - 12, 31, 4.4, shade(WOOD, -0.12))
    stake(x, cx + 5, B - 8, 33, 4.4, WOOD)
    stake(x, cx - 1, B, 35, 4.8, shade(WOOD, 0.05))
    for (const yy of [B - 26, B - 12]) fill(x, P.rect(cx - 7, yy, 14, 2.2), 0x8a7a5a)
    return
  }
  const h = 30 + lvl * 4
  box(x, { L: cx - 11, B, w: 22, h, d: 12, mat: 'stone', c: shade(STONE, 0.04) })
  box(x, { L: cx - 13, B: B - h, w: 26, h: 4, d: 13, mat: 'stone', c: STONE })
  for (const mx of [cx - 13, cx + 6]) box(x, { L: mx, B: B - h - 4, w: 7, h: 6, d: 6, mat: 'stone', c: STONE })
  if (lvl >= 3) fill(x, P.rect(cx - 11, B - h + 6, 22, 1.8), IRON)
}

/** The gatehouse turned side-on: a far tower, the shut doors edge-on under the wall-walk, the near tower. */
function paintGateV(x: Ctx, lvl: number, cx: number, by: number) {
  const stone = lvl >= 2
  const h = 30 + lvl * 5
  const mat: Mat = stone ? 'stone' : 'log', c = stone ? STONE : WOOD
  const far = by - 14, near = by + 34
  const tower = (B: number) => {
    box(x, { L: cx - 12, B, w: 24, h, d: 14, mat, c })
    for (const mx of [cx - 12, cx + 5]) box(x, { L: mx, B: B - h, w: 7, h: 5, d: 5, mat: stone ? 'stone' : 'plank', c })
  }
  tower(far)
  const dTop = far - h + 10
  form(x, P.rect(cx - 5, dTop, 10, near - 10 - dTop), WOOD_D, { rim: 0.8, core: 2 })
  for (let yy = dTop + 8; yy < near - 12; yy += 8) fill(x, P.rect(cx - 5, yy, 10, 1.8), IRON)
  const bridge = P.rect(cx - 12, far - h, 24, near - far - h + 12)
  form(x, bridge, stone ? shade(STONE, 0.06) : shade(WOOD, 0.1), { rim: 0.6, core: 1.4 })
  line(x, bridge, 1, INK, 0.7)
  tower(near)
  if (stone) banner(x, cx + 12, near - h - 4, 14)
  if (lvl >= 3) fill(x, P.rect(cx - 12, near - h + 4, 24, 1.8), IRON)
}

function vShadow(x: Ctx, cx: number, top: number, bottom: number, half: number) {
  x.save()
  x.fillStyle = css(0x1a1008, 0.16)
  x.beginPath(); x.roundRect(cx - half + 3, top, half * 2 + 4, bottom - top, half)
  x.fill()
  x.restore()
}

/** Chalk and stakes round a turned piece's footprint: a dashed rectangle rx × ry about (cx, by). */
function chalkSite(scene: Phaser.Scene, key: string, w: number, h: number, foot: number, rx: number, ry: number) {
  const cx = w / 2, by = h - foot
  FOOT.set(key, foot)
  bake(scene, key, w, h, {
    under: x => {
      x.save(); x.setLineDash([5, 4]); x.strokeStyle = css(PAL.bone, 0.85); x.lineWidth = 1.6
      x.strokeRect(cx - rx, by - ry, rx * 2, ry * 2); x.restore()
    },
    body: x => {
      for (const [sx, sy] of [[cx - rx, by - ry], [cx + rx, by - ry], [cx - rx, by + ry], [cx + rx, by + ry]] as Pt[]) {
        form(x, P.poly([[sx - 1.4, sy + 1], [sx - 1.4, sy - 8], [sx, sy - 10], [sx + 1.4, sy - 8], [sx + 1.4, sy + 1]]), WOOD, { rim: 0.3, core: 0.6 })
        fill(x, P.rect(sx - 1.6, sy - 8, 3.2, 1.6), PAL.ember)
      }
      const fx = cx - rx, fy = by - ry
      form(x, P.rect(fx - 0.9, fy - 22, 1.8, 22), WOOD_D, { rim: 0.2, core: 0.4 })
      form(x, P.poly([[fx + 1, fy - 22], [fx + 11, fy - 19], [fx + 1, fy - 15]]), PAL.lapis, { rim: 0.6, core: 1 })
    },
    outline: 1.2,
    grain: 0,
  })
}

function buildWallPieceTextures(scene: Phaser.Scene) {
  const levels = BUILDINGS.wall.levels.length
  for (let lvl = 1; lvl <= levels; lvl++) {
    const specs: [string, { w: number; h: number; foot: number }, (x: Ctx, cx: number, by: number) => void, (x: Ctx, cx: number, by: number) => void][] = [
      [`bld_wall_v_${lvl}`, WALL_V, (x, cx, by) => paintWallV(x, lvl, cx, by), (x, cx, by) => vShadow(x, cx, by - V_HALF, by + V_HALF + 3, 8)],
      [`bld_wallpost_${lvl}`, POST, (x, cx, by) => paintWallPost(x, lvl, cx, by), (x, cx, by) => contactShadow(x, cx, by + 8, 30)],
      [`bld_gate_v_${lvl}`, GATE_V, (x, cx, by) => paintGateV(x, lvl, cx, by), (x, cx, by) => vShadow(x, cx, by - 32, by + 37, 13)],
    ]
    for (const [key, sz, body, under] of specs) {
      FOOT.set(key, sz.foot)
      rng = new Rng(key.length * 977 + lvl * 131)
      const cx = sz.w / 2, by = sz.h - sz.foot
      bake(scene, key, sz.w, sz.h, { under: x => under(x, cx, by), body: x => body(x, cx, by), outline: 1.6, grain: 0.1 })
    }
  }
  chalkSite(scene, 'blueprint_wall_v', WALL_V.w, WALL_V.h, WALL_V.foot, 7, 30)
  chalkSite(scene, 'blueprint_wallpost', POST.w, POST.h, POST.foot, 10, 10)
  chalkSite(scene, 'blueprint_gate_v', GATE_V.w, GATE_V.h, GATE_V.foot, 12, 32)
}
