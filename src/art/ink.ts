import Phaser from 'phaser'
import { PAL } from '../config/palette'

/**
 * The ink-and-gouache toolkit every texture in the game is drawn with.
 *
 * Phaser's Graphics can only fill flat shapes, which is how the old art ended
 * up as outline-less vector stickers. A 2D canvas can clip, composite and blur,
 * so each texture is painted the way an illustrator would: a flat gouache base,
 * a light rim and a core shadow clipped to each form, a tooth of paper grain,
 * and finally one continuous ink line traced around the whole silhouette.
 *
 * The recipe is the style. Keep new art going through `bake()` and `form()` and
 * it will sit in the same world as everything else without anyone curating it.
 */

export type Ctx = CanvasRenderingContext2D
export type PathFn = (x: Ctx) => void

export const INK = PAL.ink

// ---- colour ------------------------------------------------------------

export function css(c: number, a = 1): string {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(3)})`
}

/** Lighten (amt > 0, toward white) or darken (amt < 0, toward black). */
export const shade = (c: number, amt: number): number => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))))
  return (f(r) << 16) | (f(g) << 8) | f(b)
}

export const mix = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return (r << 16) | (g << 8) | bl
}

/**
 * Shadows lean toward violet-brown and lights toward straw, the way gouache
 * does, instead of simply going black and white. This one rule is most of why
 * the palette reads as painted rather than computed.
 */
export const shadowOf = (c: number, amt = 0.34) => mix(shade(c, -amt), 0x3a2340, 0.18)
export const lightOf = (c: number, amt = 0.3) => mix(shade(c, amt), 0xfff0c8, 0.2)

// ---- canvases ----------------------------------------------------------

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  const x = c.getContext('2d', { willReadFrequently: false }) as Ctx
  x.lineCap = 'round'
  x.lineJoin = 'round'
  return [c, x]
}

/** A tiny deterministic generator for the art, independent of gameplay rng. */
export class Rng {
  private s: number
  constructor(seed: number) { this.s = (seed >>> 0) || 1 }
  next() {
    let s = this.s
    s ^= s << 13; s >>>= 0
    s ^= s >> 17
    s ^= s << 5; s >>>= 0
    this.s = s
    return s / 4294967296
  }
  range(lo: number, hi: number) { return lo + this.next() * (hi - lo) }
  int(lo: number, hi: number) { return Math.floor(this.range(lo, hi + 1)) }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length) % a.length] }
}

let grainPattern: HTMLCanvasElement | null = null
let hatchPattern: HTMLCanvasElement | null = null

/** Paper tooth: a speckle of ink that catches only where paint already is. */
function grain(): HTMLCanvasElement {
  if (grainPattern) return grainPattern
  const [c, x] = makeCanvas(96, 96)
  const r = new Rng(9091)
  for (let i = 0; i < 900; i++) {
    x.fillStyle = css(INK, r.range(0.25, 0.8))
    x.fillRect(r.range(0, 96), r.range(0, 96), r.range(0.6, 1.6), r.range(0.6, 1.4))
  }
  for (let i = 0; i < 260; i++) {
    x.fillStyle = css(0xfff4d8, r.range(0.3, 0.7))
    x.fillRect(r.range(0, 96), r.range(0, 96), r.range(0.6, 1.4), r.range(0.6, 1.2))
  }
  grainPattern = c
  return c
}

/** Diagonal hatching, the engraver's way of saying "this side is in shadow". */
function hatch(): HTMLCanvasElement {
  if (hatchPattern) return hatchPattern
  const [c, x] = makeCanvas(6, 6)
  x.strokeStyle = css(INK, 1)
  x.lineWidth = 0.9
  x.beginPath()
  x.moveTo(-1, 7); x.lineTo(7, -1)
  x.moveTo(-4, 4); x.lineTo(4, -4)
  x.moveTo(2, 10); x.lineTo(10, 2)
  x.stroke()
  hatchPattern = c
  return c
}

// ---- forms -------------------------------------------------------------

export interface FormOpts {
  /** colour of the lit rim; default derived from base */
  light?: number
  /** colour of the core shadow; default derived from base */
  dark?: number
  /** how far the lit rim reaches in from the top-left edge, px */
  rim?: number
  /** how far the core shadow reaches in from the bottom-right edge, px */
  core?: number
  /** strength of lit rim / core shadow */
  lightA?: number
  darkA?: number
  /** add engraved hatching inside the shadow */
  hatch?: number
  /** light direction in radians; default is the afternoon sun, top-left */
  sun?: number
}

/**
 * Paint one solid form: flat base, then a lit rim and a core shadow that follow
 * the form's own outline, both clipped to it. The rim is the form minus a copy
 * of itself nudged away from the light; the shadow is the form minus a copy
 * nudged toward it. That keeps shading glued to arbitrary shapes — a helmet,
 * a roof, a boulder — with no per-shape shading code at all.
 */
export function form(x: Ctx, path: PathFn, base: number, o: FormOpts = {}) {
  const sun = o.sun ?? -2.4
  const lx = Math.cos(sun), ly = Math.sin(sun)
  const rim = o.rim ?? 2
  const core = o.core ?? 4

  x.beginPath(); path(x)
  x.fillStyle = css(base)
  x.fill()

  x.save()
  x.beginPath(); path(x)
  x.clip()

  if (core > 0) {
    const dark = o.dark ?? shadowOf(base)
    x.beginPath()
    x.rect(-4000, -4000, 8000, 8000)
    x.save(); x.translate(lx * core, ly * core); path(x); x.restore()
    x.fillStyle = css(dark, o.darkA ?? 1)
    x.fill('evenodd')
    if (o.hatch) {
      x.beginPath()
      x.rect(-4000, -4000, 8000, 8000)
      x.save(); x.translate(lx * core * 1.25, ly * core * 1.25); path(x); x.restore()
      x.globalAlpha = o.hatch
      x.fillStyle = x.createPattern(hatch(), 'repeat') as CanvasPattern
      x.fill('evenodd')
      x.globalAlpha = 1
    }
  }
  if (rim > 0) {
    const light = o.light ?? lightOf(base)
    x.beginPath()
    x.rect(-4000, -4000, 8000, 8000)
    x.save(); x.translate(-lx * rim, -ly * rim); path(x); x.restore()
    x.fillStyle = css(light, o.lightA ?? 1)
    x.fill('evenodd')
  }
  x.restore()
}

/**
 * A second light on a form, from `dir` (radians), in its own colour. The horde
 * gets its ember glow this way — lit from below by the fire inside — which does
 * more to separate the two sides than any amount of red paint.
 */
export function rimLight(x: Ctx, path: PathFn, c: number, w: number, dir = Math.PI * 0.62, a = 0.9) {
  const lx = Math.cos(dir), ly = Math.sin(dir)
  x.save()
  x.beginPath(); path(x)
  x.clip()
  x.beginPath()
  x.rect(-4000, -4000, 8000, 8000)
  x.save(); x.translate(-lx * w, -ly * w); path(x); x.restore()
  x.fillStyle = css(c, a)
  x.fill('evenodd')
  x.restore()
}

/** Thin interior ink line: seams, folds, planks, stones. */
export function line(x: Ctx, path: PathFn, w = 1.1, c = INK, a = 0.85) {
  x.beginPath(); path(x)
  x.strokeStyle = css(c, a)
  x.lineWidth = w
  x.stroke()
}

/** Flat fill with no shading, for small details. */
export function fill(x: Ctx, path: PathFn, c: number, a = 1) {
  x.beginPath(); path(x)
  x.fillStyle = css(c, a)
  x.fill()
}

/** Soft radial glow, for things that give off light. */
export function glow(x: Ctx, cx: number, cy: number, r: number, c: number, a = 0.8) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r)
  g.addColorStop(0, css(c, a))
  g.addColorStop(0.45, css(c, a * 0.35))
  g.addColorStop(1, css(c, 0))
  x.fillStyle = g
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill()
}

// ---- path helpers -------------------------------------------------------

export const P = {
  ellipse: (cx: number, cy: number, rx: number, ry: number, rot = 0): PathFn =>
    x => x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2),
  circle: (cx: number, cy: number, r: number): PathFn =>
    x => x.arc(cx, cy, Math.max(0.1, r), 0, Math.PI * 2),
  rect: (px: number, py: number, w: number, h: number): PathFn =>
    x => x.rect(px, py, w, h),
  round: (px: number, py: number, w: number, h: number, r: number): PathFn =>
    x => x.roundRect(px, py, w, h, Math.min(r, w / 2, h / 2)),
  poly: (pts: number[][]): PathFn => x => {
    x.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1])
    x.closePath()
  },
  /**
   * A closed shape through the points with softened, hand-drawn corners.
   * `k` is how much of each edge the rounding eats: 1 is a smooth pebble,
   * 0.2 is a cut stone with its corners barely taken off.
   */
  blob: (pts: number[][], k = 1): PathFn => x => {
    const n = pts.length
    const at = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    for (let i = 0; i < n; i++) {
      const p = pts[i]
      const prev = pts[(i + n - 1) % n]
      const next = pts[(i + 1) % n]
      const a = at(p, prev, k / 2)
      const b = at(p, next, k / 2)
      if (i === 0) x.moveTo(a[0], a[1])
      else x.lineTo(a[0], a[1])
      x.quadraticCurveTo(p[0], p[1], b[0], b[1])
    }
    x.closePath()
  },
  /** Several circles fused into one outline: foliage, smoke, clouds. */
  cluster: (circles: number[][]): PathFn => x => {
    for (const c of circles) {
      x.moveTo(c[0] + c[2], c[1])
      x.arc(c[0], c[1], c[2], 0, Math.PI * 2)
    }
  },
  merge: (...paths: PathFn[]): PathFn => x => { for (const p of paths) p(x) },
}

// ---- outlining and baking ----------------------------------------------

/**
 * Trace one ink line around everything painted on `src`. The silhouette is
 * stamped in ink colour at a ring of offsets and the painting laid back on top,
 * so the line follows any shape and is thicker underneath — ink pools where a
 * pen slows, and it gives every sprite a sense of weight on the ground.
 */
export function outlined(src: HTMLCanvasElement, t: number, colour = INK): HTMLCanvasElement {
  const w = src.width, h = src.height
  const [sil, sx] = makeCanvas(w, h)
  sx.drawImage(src, 0, 0)
  sx.globalCompositeOperation = 'source-in'
  sx.fillStyle = css(colour)
  sx.fillRect(0, 0, w, h)

  const [out, ox] = makeCanvas(w, h)
  const steps = t <= 1.2 ? 8 : t <= 2.2 ? 12 : 16
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const r = t * (1 + 0.32 * Math.max(0, Math.sin(a)))
    ox.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r)
  }
  ox.drawImage(src, 0, 0)
  return out
}

/** Speckle paper grain over whatever has been painted, and nowhere else. */
export function applyGrain(x: Ctx, w: number, h: number, a = 0.12) {
  x.save()
  x.globalCompositeOperation = 'source-atop'
  x.globalAlpha = a
  x.fillStyle = x.createPattern(grain(), 'repeat') as CanvasPattern
  x.fillRect(0, 0, w, h)
  x.restore()
}

export interface BakeLayers {
  /** painted first and never outlined: ground shadows, pads, halos */
  under?: (x: Ctx) => void
  /** the thing itself; this is what gets the ink line */
  body: (x: Ctx) => void
  /** painted last and never outlined: glows, eyes, sparks */
  over?: (x: Ctx) => void
  /** ink line thickness in px; 0 for none */
  outline?: number
  /** paper grain strength */
  grain?: number
}

/** Paint the layers into one canvas. */
export function paint(w: number, h: number, l: BakeLayers): HTMLCanvasElement {
  const [body, bx] = makeCanvas(w, h)
  l.body(bx)
  if ((l.grain ?? 0.1) > 0) applyGrain(bx, w, h, l.grain ?? 0.1)
  const inked = (l.outline ?? 2) > 0 ? outlined(body, l.outline ?? 2) : body

  const [out, ox] = makeCanvas(w, h)
  if (l.under) l.under(ox)
  ox.drawImage(inked, 0, 0)
  if (l.over) l.over(ox)
  return out
}

/** Register a canvas as a Phaser texture, replacing any older one. */
export function register(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement) {
  const tm = scene.textures
  if (tm.exists(key)) tm.remove(key)
  tm.addCanvas(key, canvas)
}

/** Paint and register in one go. */
export function bake(scene: Phaser.Scene, key: string, w: number, h: number, l: BakeLayers) {
  const c = paint(w, h, l)
  register(scene, key, c)
  return c
}
