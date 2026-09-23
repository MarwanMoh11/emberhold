import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { applyGrain, css, glow, lightOf, mix, Rng, shade, shadowOf, type Ctx } from '../art/ink'
import { textStyle } from './theme'
import { DPR } from '../core/device'

/**
 * The interface's chrome, painted rather than drawn.
 *
 * Phaser's Graphics re-triangulates every rounded rectangle on every frame it
 * renders (the minimap notes measured it), and it can only do flat fills — the
 * reason the old HUD looked like debug rectangles laid over a painting. Every
 * piece of chrome here is painted once into a canvas with the same gouache,
 * grain and ink line as the world, cached by what it looks like, and shown as a
 * single quad. A dozen buttons of one size share one texture; hovering one
 * swaps it for another cached texture rather than repainting anything.
 *
 * Two surfaces carry the whole interface:
 *
 * - walnut lacquer with a gilt rule, for everything that sits over the world
 *   while you play — it is dark, so the painting stays the brightest thing on
 *   screen;
 * - a deckled parchment page with an inked double border, for everything you
 *   stop to read.
 */

export type Skin = 'hud' | 'page' | 'plate' | 'ribbon' | 'callout' | 'well'

export interface SkinOpts {
  /** gilt or accent colour for the trim */
  accent?: number
  /** plate states */
  state?: 'idle' | 'hover' | 'active' | 'disabled'
  /** lacquer colour for plates and ribbons: walnut by default */
  lacquer?: number
  /** strength of the lacquer's fill */
  alpha?: number
}

/** Extra canvas around every panel for its drop shadow. */
export const PAD = 8
/** How far a callout's pointer drops below its box. */
const TIP = 10

const WALNUT_TOP = 0x33251b
const WALNUT_BOT = 0x1a120d
const INK_EDGE = 0x0c0704

/** Text colours for the parchment page. */
export const ON_PAGE = {
  text: 0x2a1b10,
  dim: 0x6e5840,
  gilt: 0x94580e,
  good: 0x3d6a24,
  danger: 0xa3301c,
  lapis: 0x24508f,
}

// ---- painting helpers ------------------------------------------------------

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

function chamfer(x: Ctx, px: number, py: number, w: number, h: number, c: number) {
  x.moveTo(px + c, py)
  x.lineTo(px + w - c, py)
  x.lineTo(px + w, py + c)
  x.lineTo(px + w, py + h - c)
  x.lineTo(px + w - c, py + h)
  x.lineTo(px + c, py + h)
  x.lineTo(px, py + h - c)
  x.lineTo(px, py + c)
  x.closePath()
}

/** The same box with a pointer dropping out of the middle of its bottom edge. */
function calloutPath(x: Ctx, px: number, py: number, w: number, h: number, c: number) {
  const mid = px + w / 2
  x.moveTo(px + c, py)
  x.lineTo(px + w - c, py)
  x.lineTo(px + w, py + c)
  x.lineTo(px + w, py + h - c)
  x.lineTo(px + w - c, py + h)
  x.lineTo(mid + 9, py + h)
  x.lineTo(mid, py + h + TIP)
  x.lineTo(mid - 9, py + h)
  x.lineTo(px + c, py + h)
  x.lineTo(px, py + h - c)
  x.lineTo(px, py + c)
  x.closePath()
}

function giltGradient(x: Ctx, y0: number, y1: number, accent: number) {
  const g = x.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, css(mix(accent, 0xfff4d0, 0.45)))
  g.addColorStop(0.5, css(accent))
  g.addColorStop(1, css(shade(accent, -0.35)))
  return g
}

function diamond(x: Ctx, cx: number, cy: number, r: number, c: number) {
  x.beginPath()
  x.moveTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r, cy); x.closePath()
  x.fillStyle = css(INK_EDGE, 0.9); x.fill()
  x.beginPath()
  const q = r * 0.62
  x.moveTo(cx, cy - q); x.lineTo(cx + q, cy); x.lineTo(cx, cy + q); x.lineTo(cx - q, cy); x.closePath()
  x.fillStyle = css(mix(c, 0xfff4d0, 0.15)); x.fill()
}

/** Walnut lacquer, grained, with a lip of light along the top edge. */
function lacquer(x: Ctx, path: (x: Ctx) => void, w: number, h: number, r: Rng, alpha: number, top = WALNUT_TOP, bot = WALNUT_BOT) {
  x.save()
  x.shadowColor = 'rgba(8,4,2,0.55)'
  x.shadowBlur = 6 * DPR
  x.shadowOffsetY = 2 * DPR
  x.beginPath(); path(x)
  const g = x.createLinearGradient(0, PAD, 0, PAD + h)
  g.addColorStop(0, css(top, alpha))
  g.addColorStop(1, css(bot, alpha))
  x.fillStyle = g
  x.fill()
  x.restore()

  x.save()
  x.beginPath(); path(x); x.clip()
  for (let i = 0; i < Math.max(4, h / 3); i++) {
    const yy = PAD + r.range(2, h - 2)
    x.strokeStyle = css(r.next() < 0.5 ? shade(top, 0.22) : 0x0c0806, r.range(0.1, 0.26))
    x.lineWidth = r.range(0.5, 1.2)
    x.beginPath(); x.moveTo(PAD, yy)
    x.bezierCurveTo(PAD + w * 0.3, yy + r.range(-2, 2), PAD + w * 0.7, yy + r.range(-2, 2), PAD + w, yy + r.range(-1.5, 1.5))
    x.stroke()
  }
  // depth: the middle is lit, the edges fall away
  const v = x.createRadialGradient(PAD + w / 2, PAD + h * 0.3, Math.min(w, h) * 0.2, PAD + w / 2, PAD + h / 2, Math.max(w, h) * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(6,3,1,0.3)')
  x.fillStyle = v
  x.fillRect(PAD, PAD, w, h)
  const lip = x.createLinearGradient(0, PAD, 0, PAD + 7)
  lip.addColorStop(0, css(0xfff0d0, 0.13)); lip.addColorStop(1, css(0xfff0d0, 0))
  x.fillStyle = lip; x.fillRect(PAD, PAD, w, 7)
  x.restore()
  x.save(); x.beginPath(); path(x); x.clip()
  applyGrain(x, w + PAD * 2, h + PAD * 2, 0.05)
  x.restore()
}

// ---- painters ---------------------------------------------------------------

/** Walnut lacquer with a gilt rule: the HUD's panels. */
function paintHud(x: Ctx, w: number, h: number, o: SkinOpts, r: Rng) {
  const accent = o.accent ?? PAL.gilt
  const c = Math.min(7, h * 0.22, w * 0.1)
  lacquer(x, xx => chamfer(xx, PAD, PAD, w, h, c), w, h, r, o.alpha ?? 0.94)
  x.beginPath(); chamfer(x, PAD + 0.5, PAD + 0.5, w - 1, h - 1, c)
  x.strokeStyle = css(INK_EDGE, 0.95); x.lineWidth = 1.5; x.stroke()
  const inset = 3
  x.beginPath(); chamfer(x, PAD + inset, PAD + inset, w - inset * 2, h - inset * 2, Math.max(1, c - 2))
  x.strokeStyle = giltGradient(x, PAD, PAD + h, accent); x.lineWidth = 1.1
  x.globalAlpha = 0.85; x.stroke(); x.globalAlpha = 1
  if (h > 24 && w > 48) {
    const dr = Math.min(3.4, h * 0.1)
    const e = c * 0.55 + inset * 0.3
    diamond(x, PAD + e, PAD + e, dr, accent)
    diamond(x, PAD + w - e, PAD + e, dr, accent)
    diamond(x, PAD + e, PAD + h - e, dr, accent)
    diamond(x, PAD + w - e, PAD + h - e, dr, accent)
  }
}

/** The HUD panel with a pointer: the card that floats over a building. */
function paintCallout(x: Ctx, w: number, h: number, o: SkinOpts, r: Rng) {
  const accent = o.accent ?? PAL.gilt
  const c = Math.min(7, h * 0.22, w * 0.1)
  lacquer(x, xx => calloutPath(xx, PAD, PAD, w, h, c), w, h + TIP, r, o.alpha ?? 0.95)
  x.beginPath(); calloutPath(x, PAD + 0.5, PAD + 0.5, w - 1, h - 1, c)
  x.strokeStyle = css(INK_EDGE, 0.95); x.lineWidth = 1.5; x.stroke()
  const inset = 3
  x.beginPath(); chamfer(x, PAD + inset, PAD + inset, w - inset * 2, h - inset * 2, Math.max(1, c - 2))
  x.strokeStyle = giltGradient(x, PAD, PAD + h, accent); x.lineWidth = 1.1
  x.globalAlpha = 0.85; x.stroke(); x.globalAlpha = 1
  const e = c * 0.55 + inset * 0.3
  for (const [cx, cy] of [[PAD + e, PAD + e], [PAD + w - e, PAD + e]]) diamond(x, cx, cy, 3.2, accent)
}

/** A parchment page: what every card and menu is written on. */
function paintPage(x: Ctx, w: number, h: number, o: SkinOpts, r: Rng) {
  const accent = o.accent ?? PAL.wax
  // a deckled edge: the page is cut by hand
  const edge: [number, number][] = []
  const step = 9
  for (let px = 0; px <= w; px += step) edge.push([PAD + px, PAD + r.range(-0.8, 0.9)])
  for (let py = step; py <= h; py += step) edge.push([PAD + w + r.range(-0.9, 0.8), PAD + py])
  for (let px = w - step; px >= 0; px -= step) edge.push([PAD + px, PAD + h + r.range(-0.9, 0.8)])
  for (let py = h - step; py > 0; py -= step) edge.push([PAD + r.range(-0.8, 0.9), PAD + py])
  const page = (xx: Ctx) => {
    xx.moveTo(edge[0][0], edge[0][1])
    for (let i = 1; i < edge.length; i++) xx.lineTo(edge[i][0], edge[i][1])
    xx.closePath()
  }

  x.save()
  x.shadowColor = 'rgba(8,4,2,0.6)'
  x.shadowBlur = 10 * DPR
  x.shadowOffsetY = 4 * DPR
  x.beginPath(); page(x)
  x.fillStyle = css(PAL.parchment)
  x.fill()
  x.restore()

  x.save()
  x.beginPath(); page(x); x.clip()
  // mottled paper
  for (let i = 0; i < Math.max(12, Math.min(160, (w * h) / 2500)); i++) {
    const px = PAD + r.range(0, w), py = PAD + r.range(0, h)
    glow(x, px, py, r.range(10, 40), r.next() < 0.6 ? 0xd8c090 : 0xfff4dc, r.range(0.12, 0.3))
  }
  // foxing
  for (let i = 0; i < Math.max(3, Math.min(30, (w * h) / 16000)); i++) {
    glow(x, PAD + r.range(0, w), PAD + r.range(0, h), r.range(2, 6), 0xa07a4a, r.range(0.15, 0.3))
  }
  // edges browned by handling
  const burn = Math.min(w, h) * 0.2
  for (const [x0, y0, x1, y1] of [[PAD, 0, PAD + burn, 0], [PAD + w, 0, PAD + w - burn, 0], [0, PAD, 0, PAD + burn], [0, PAD + h, 0, PAD + h - burn]]) {
    const g = x.createLinearGradient(x0, y0, x1, y1)
    g.addColorStop(0, css(0x8a6a3a, 0.42)); g.addColorStop(1, css(0x8a6a3a, 0))
    x.fillStyle = g
    x.fillRect(PAD, PAD, w, h)
  }
  x.restore()
  x.save(); x.beginPath(); page(x); x.clip()
  applyGrain(x, w + PAD * 2, h + PAD * 2, 0.08)
  x.restore()

  // inked edge and a double rule inside it
  x.beginPath(); page(x)
  x.strokeStyle = css(0x5a3e26, 0.9); x.lineWidth = 1.2; x.stroke()
  const i1 = 7, i2 = 11
  x.strokeStyle = css(0x3a2616, 0.75); x.lineWidth = 1.6
  x.strokeRect(PAD + i1, PAD + i1, w - i1 * 2, h - i1 * 2)
  x.strokeStyle = css(0x3a2616, 0.45); x.lineWidth = 0.7
  x.strokeRect(PAD + i2, PAD + i2, w - i2 * 2, h - i2 * 2)
  // corner pieces: a lozenge in the accent colour where the rules meet
  for (const [cx, cy] of [[PAD + i1, PAD + i1], [PAD + w - i1, PAD + i1], [PAD + i1, PAD + h - i1], [PAD + w - i1, PAD + h - i1]]) {
    diamond(x, cx, cy, 5, accent)
  }
}

/** A button: a walnut (or coloured lacquer) plate with a gilt border. */
function paintPlate(x: Ctx, w: number, h: number, o: SkinOpts) {
  const state = o.state ?? 'idle'
  const accent = o.accent ?? PAL.gilt
  const base = o.lacquer ?? 0x3a2a1e
  const c = Math.min(6, h * 0.25)
  const lift = state === 'hover'
  const down = state === 'active'
  x.save()
  x.shadowColor = 'rgba(8,4,2,0.5)'
  x.shadowBlur = (down ? 2 : lift ? 7 : 4) * DPR
  x.shadowOffsetY = (down ? 0.5 : state === 'disabled' ? 1 : 2.5) * DPR
  x.beginPath(); chamfer(x, PAD, PAD, w, h, c)
  const top = state === 'disabled' ? mix(base, 0x5a5048, 0.55) : lift ? shade(base, 0.14) : down ? shade(base, -0.12) : base
  const g = x.createLinearGradient(0, PAD, 0, PAD + h)
  if (down) {
    g.addColorStop(0, css(shade(top, -0.3)))
    g.addColorStop(0.5, css(top))
    g.addColorStop(1, css(shade(top, 0.04)))
  } else {
    g.addColorStop(0, css(shade(top, 0.1)))
    g.addColorStop(0.5, css(top))
    g.addColorStop(1, css(shade(top, -0.42)))
  }
  x.fillStyle = g
  x.fill()
  x.restore()
  // highlight along the top, or a pressed shadow when held down
  x.save()
  x.beginPath(); chamfer(x, PAD, PAD, w, h, c); x.clip()
  const lip = x.createLinearGradient(0, PAD, 0, PAD + h * 0.5)
  lip.addColorStop(0, down ? css(0x000000, 0.25) : css(0xfff4dc, lift ? 0.24 : 0.13))
  lip.addColorStop(1, css(0xfff4dc, 0))
  x.fillStyle = lip; x.fillRect(PAD, PAD, w, h * 0.5)
  applyGrain(x, w + PAD * 2, h + PAD * 2, 0.06)
  x.restore()
  x.beginPath(); chamfer(x, PAD + 0.5, PAD + 0.5, w - 1, h - 1, c)
  x.strokeStyle = css(INK_EDGE, 0.95); x.lineWidth = 1.4; x.stroke()
  x.beginPath(); chamfer(x, PAD + 2.5, PAD + 2.5, w - 5, h - 5, Math.max(1, c - 1.5))
  x.strokeStyle = state === 'disabled' ? css(0x7a6a5a, 0.5) : giltGradient(x, PAD, PAD + h, lift ? mix(accent, 0xfff4d0, 0.25) : accent)
  x.lineWidth = lift || down ? 1.6 : 1.1
  x.globalAlpha = state === 'idle' ? 0.85 : 1
  x.stroke()
  x.globalAlpha = 1
}

/** A pennant ribbon with swallow-tailed ends: headers and toasts. */
function paintRibbon(x: Ctx, w: number, h: number, o: SkinOpts, r: Rng) {
  const col = o.lacquer ?? PAL.wax
  const accent = o.accent ?? PAL.gilt
  const tail = Math.min(18, w * 0.08)
  const body = (xx: Ctx) => {
    xx.moveTo(PAD, PAD)
    xx.lineTo(PAD + w, PAD)
    xx.lineTo(PAD + w - tail, PAD + h / 2)
    xx.lineTo(PAD + w, PAD + h)
    xx.lineTo(PAD, PAD + h)
    xx.lineTo(PAD + tail, PAD + h / 2)
    xx.closePath()
  }
  x.save()
  x.shadowColor = 'rgba(8,4,2,0.55)'; x.shadowBlur = 6 * DPR; x.shadowOffsetY = 3 * DPR
  x.beginPath(); body(x)
  const g = x.createLinearGradient(0, PAD, 0, PAD + h)
  g.addColorStop(0, css(shade(col, 0.15))); g.addColorStop(0.55, css(col)); g.addColorStop(1, css(shade(col, -0.35)))
  x.fillStyle = g; x.fill()
  x.restore()
  x.save(); x.beginPath(); body(x); x.clip()
  // soft folds across the cloth
  for (let i = 0; i < Math.max(2, w / 70); i++) {
    const fx = PAD + r.range(tail, w - tail)
    const fg = x.createLinearGradient(fx - 14, 0, fx + 14, 0)
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, css(0x000000, r.range(0.06, 0.14))); fg.addColorStop(1, 'rgba(0,0,0,0)')
    x.fillStyle = fg; x.fillRect(fx - 14, PAD, 28, h)
  }
  applyGrain(x, w + PAD * 2, h + PAD * 2, 0.1)
  x.restore()
  x.beginPath(); body(x)
  x.strokeStyle = css(INK_EDGE, 0.9); x.lineWidth = 1.4; x.stroke()
  x.strokeStyle = giltGradient(x, PAD, PAD + h, accent); x.lineWidth = 1
  x.beginPath(); x.moveTo(PAD + tail + 3, PAD + 3.5); x.lineTo(PAD + w - tail - 3, PAD + 3.5); x.stroke()
  x.beginPath(); x.moveTo(PAD + tail + 3, PAD + h - 3.5); x.lineTo(PAD + w - tail - 3, PAD + h - 3.5); x.stroke()
}

/** The groove a bar runs in: a dark channel cut into the lacquer. */
function paintWell(x: Ctx, w: number, h: number, o: SkinOpts) {
  const rad = Math.min(3, h / 2)
  const path = (xx: Ctx) => xx.roundRect(PAD, PAD, w, h, rad)
  x.beginPath(); path(x)
  x.fillStyle = css(0x0d0805, o.alpha ?? 0.92); x.fill()
  x.save(); x.beginPath(); path(x); x.clip()
  const s = x.createLinearGradient(0, PAD, 0, PAD + Math.max(3, h * 0.6))
  s.addColorStop(0, css(0x000000, 0.6)); s.addColorStop(1, css(0x000000, 0))
  x.fillStyle = s; x.fillRect(PAD, PAD, w, h)
  x.restore()
  x.beginPath(); path(x)
  x.strokeStyle = css(INK_EDGE, 1); x.lineWidth = 1; x.stroke()
  // the lacquer catches light along the lower lip of the cut
  x.beginPath(); x.moveTo(PAD + rad, PAD + h + 0.8); x.lineTo(PAD + w - rad, PAD + h + 0.8)
  x.strokeStyle = css(o.accent ?? 0xfff0d0, 0.16); x.lineWidth = 1; x.stroke()
}

const PAINTERS: Record<Skin, (x: Ctx, w: number, h: number, o: SkinOpts, r: Rng) => void> = {
  hud: paintHud, page: paintPage, plate: paintPlate, ribbon: paintRibbon, callout: paintCallout, well: paintWell,
}

function skinHeight(skin: Skin, h: number) {
  return skin === 'callout' ? h + TIP : h
}

// ---- the texture cache ---------------------------------------------------------

/**
 * Painted chrome is cached by its look, and reference-counted so a texture is
 * never pulled out from under something still showing it. Textures nothing
 * uses any more are kept for a while — hover, press and release flip between
 * the same few — and only the oldest are dropped past a ceiling.
 */
const refs = new Map<string, number>()
const idle: string[] = []
const IDLE_MAX = 48

function acquire(scene: Phaser.Scene, key: string, w: number, h: number, paint: (x: Ctx) => void) {
  const tm = scene.textures
  if (!tm.exists(key)) {
    // painted at the device's resolution and shown at 1/DPR: see hiRes
    const tex = tm.createCanvas(key, Math.ceil(w * DPR), Math.ceil(h * DPR)) as Phaser.Textures.CanvasTexture
    const x = tex.context
    x.setTransform(DPR, 0, 0, DPR, 0, 0)
    x.lineJoin = 'round'
    x.lineCap = 'round'
    paint(x)
    tex.refresh()
  }
  refs.set(key, (refs.get(key) ?? 0) + 1)
  const i = idle.indexOf(key)
  if (i >= 0) idle.splice(i, 1)
  return key
}

function release(scene: Phaser.Scene, key: string) {
  const n = (refs.get(key) ?? 1) - 1
  if (n > 0) { refs.set(key, n); return }
  refs.delete(key)
  idle.push(key)
  while (idle.length > IDLE_MAX) {
    const k = idle.shift()!
    if (!refs.has(k) && scene.textures.exists(k)) scene.textures.remove(k)
  }
}

/**
 * A painted texture shared by look. Holds one reference at a time and trades it
 * in whenever the look changes.
 */
class Held {
  key = ''
  constructor(private scene: Phaser.Scene) {}
  swap(key: string, w: number, h: number, paint: (x: Ctx) => void) {
    if (key === this.key) return false
    const old = this.key
    this.key = acquire(this.scene, key, w, h, paint)
    if (old) release(this.scene, old)
    return true
  }
  drop() {
    if (this.key) release(this.scene, this.key)
    this.key = ''
  }
}

/**
 * One piece of chrome. `place()` is cheap to call every frame: it only looks
 * up a different texture when the size or look actually changes.
 */
export class SkinPanel {
  readonly img: Phaser.GameObjects.Image
  private held: Held
  private dead = false

  constructor(private scene: Phaser.Scene, private skin: Skin, private opts: SkinOpts = {}) {
    this.held = new Held(scene)
    this.img = scene.add.image(0, 0, '__WHITE').setOrigin(0, 0).setVisible(false).setScale(1 / DPR)
    scene.events.once('shutdown', this.destroy, this)
  }

  /** Change the look (hover, disabled, accent) without moving it. */
  style(o: SkinOpts) {
    this.opts = { ...this.opts, ...o }
    return this
  }

  place(x: number, y: number, w: number, h: number) {
    if (this.dead) return this
    w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h))
    const o = this.opts
    const key = `skin:${this.skin}:${w}x${h}:${o.accent ?? ''}:${o.state ?? ''}:${o.lacquer ?? ''}:${o.alpha ?? ''}`
    const skin = this.skin
    if (this.held.swap(key, w + PAD * 2, skinHeight(skin, h) + PAD * 2, cx => PAINTERS[skin](cx, w, h, o, new Rng(hash(key))))) {
      this.img.setTexture(key)
      if (!this.img.visible && !this.hidden) this.img.setVisible(true)
    }
    this.img.setPosition(Math.round(x) - PAD, Math.round(y) - PAD)
    return this
  }

  private hidden = false
  setVisible(v: boolean) { this.hidden = !v; this.img.setVisible(v && !!this.held.key); return this }
  setDepth(d: number) { this.img.setDepth(d); return this }
  setScrollFactor(f: number) { this.img.setScrollFactor(f); return this }
  setAlpha(a: number) { this.img.setAlpha(a); return this }

  destroy() {
    if (this.dead) return
    this.dead = true
    this.scene.events.off('shutdown', this.destroy, this)
    this.held.drop()
    this.img.destroy()
  }
}

// ---- bars -------------------------------------------------------------------

/** A painted liquid fill: lit along the top, darker below, brushed and grained. */
function paintFill(x: Ctx, w: number, h: number, colour: number, pale: boolean, r: Rng) {
  const c = pale ? mix(colour, 0xfff4dc, 0.6) : colour
  const rad = Math.min(2, h / 2)
  x.beginPath(); x.roundRect(0, 0, w, h, rad)
  const g = x.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, css(lightOf(c, 0.35)))
  g.addColorStop(0.45, css(c))
  g.addColorStop(1, css(shadowOf(c, 0.4)))
  x.fillStyle = g
  x.fill()
  x.save(); x.beginPath(); x.roundRect(0, 0, w, h, rad); x.clip()
  if (h >= 6) {
    for (let i = 0; i < Math.max(2, h / 3); i++) {
      const yy = r.range(1, h - 1)
      x.strokeStyle = css(r.next() < 0.5 ? shade(c, 0.3) : shade(c, -0.3), r.range(0.1, 0.22))
      x.lineWidth = r.range(0.6, 1.2)
      x.beginPath(); x.moveTo(0, yy); x.lineTo(w, yy + r.range(-0.6, 0.6)); x.stroke()
    }
  }
  x.fillStyle = css(0xffffff, pale ? 0.12 : 0.22)
  x.fillRect(0, Math.max(1, h * 0.14), w, Math.max(1, h * 0.22))
  applyGrain(x, w, h, 0.08)
  x.restore()
}

/**
 * A bar in a painted groove. The fill is painted once at full width and cropped
 * to the fraction, so a health bar changing every frame costs nothing but a
 * crop rectangle. A pale ghost trails behind a fall, so a hit reads as the
 * chunk it took rather than as a number that quietly changed.
 */
export class SkinBar {
  readonly well: SkinPanel
  readonly ghost: Phaser.GameObjects.Image
  readonly fill: Phaser.GameObjects.Image
  private fillHeld: Held
  private ghostHeld: Held
  private frac = 1
  private ghostFrac = 1
  private ghostHold = 0
  private fw = 0
  private fh = 0
  private dead = false
  private shown = true

  constructor(private scene: Phaser.Scene, private colour: number, private opts: { ghost?: boolean; inset?: number } = {}) {
    this.well = new SkinPanel(scene, 'well')
    this.ghost = scene.add.image(0, 0, '__WHITE').setOrigin(0, 0).setVisible(false).setScale(1 / DPR)
    this.fill = scene.add.image(0, 0, '__WHITE').setOrigin(0, 0).setVisible(false).setScale(1 / DPR)
    this.fillHeld = new Held(scene)
    this.ghostHeld = new Held(scene)
    scene.events.once('shutdown', this.destroy, this)
  }

  objects(): Phaser.GameObjects.GameObject[] { return [this.well.img, this.ghost, this.fill] }

  place(x: number, y: number, w: number, h: number) {
    if (this.dead) return this
    w = Math.max(4, Math.round(w)); h = Math.max(2, Math.round(h))
    const inset = this.opts.inset ?? (h >= 8 ? 2 : 1)
    this.well.place(x, y, w, h)
    this.fw = w - inset * 2
    this.fh = h - inset * 2
    this.repaint()
    this.fill.setPosition(Math.round(x) + inset, Math.round(y) + inset)
    this.ghost.setPosition(Math.round(x) + inset, Math.round(y) + inset)
    this.crop()
    return this
  }

  private repaint() {
    const { fw, fh, colour } = this
    if (fw <= 0 || fh <= 0) return
    const key = `bar:${colour}:${fw}x${fh}`
    if (this.fillHeld.swap(key, fw, fh, x => paintFill(x, fw, fh, colour, false, new Rng(hash(key))))) {
      this.fill.setTexture(key)
    }
    if (this.opts.ghost) {
      const gk = `bar:ghost:${colour}:${fw}x${fh}`
      if (this.ghostHeld.swap(gk, fw, fh, x => paintFill(x, fw, fh, colour, true, new Rng(hash(gk))))) {
        this.ghost.setTexture(gk)
      }
    }
    this.syncVisible()
  }

  private syncVisible() {
    this.fill.setVisible(this.shown && !!this.fillHeld.key)
    this.ghost.setVisible(this.shown && !!this.opts.ghost && !!this.ghostHeld.key)
  }

  /** Crops are in texture pixels, which are DPR times the CSS size. */
  private crop() {
    const k = DPR
    this.fill.setCrop(0, 0, Math.max(0, Math.round(this.fw * this.frac * k)), Math.ceil(this.fh * k))
    if (this.opts.ghost) this.ghost.setCrop(0, 0, Math.max(0, Math.round(this.fw * this.ghostFrac * k)), Math.ceil(this.fh * k))
  }

  /** Set the fraction, and optionally recolour. */
  set(frac: number, colour?: number) {
    frac = Math.max(0, Math.min(1, frac))
    if (colour !== undefined && colour !== this.colour) {
      this.colour = colour
      this.repaint()
    }
    if (frac < this.frac) this.ghostHold = 0.4
    if (frac > this.ghostFrac) this.ghostFrac = frac
    this.frac = frac
    this.crop()
    return this
  }

  /** Let the ghost catch up. */
  tick(dt: number) {
    if (!this.opts.ghost || this.ghostFrac <= this.frac) return
    if (this.ghostHold > 0) { this.ghostHold -= dt; return }
    this.ghostFrac = Math.max(this.frac, this.ghostFrac - dt * Math.max(0.25, (this.ghostFrac - this.frac) * 2.5))
    this.crop()
  }

  setVisible(v: boolean) {
    this.shown = v
    this.well.setVisible(v)
    this.syncVisible()
    return this
  }

  setDepth(d: number) { this.well.setDepth(d); this.ghost.setDepth(d); this.fill.setDepth(d); return this }
  setScrollFactor(f: number) { this.well.setScrollFactor(f); this.ghost.setScrollFactor(f); this.fill.setScrollFactor(f); return this }
  setAlpha(a: number) { this.well.setAlpha(a); this.ghost.setAlpha(a); this.fill.setAlpha(a); return this }

  destroy() {
    if (this.dead) return
    this.dead = true
    this.scene.events.off('shutdown', this.destroy, this)
    this.fillHeld.drop()
    this.ghostHeld.drop()
    this.well.destroy()
    this.fill.destroy()
    this.ghost.destroy()
  }
}

// ---- buttons ------------------------------------------------------------------

export type Tone = 'plain' | 'primary' | 'danger' | 'quiet' | 'good'

const TONES: Record<Tone, { lacquer: number; accent: number; text: number }> = {
  /** walnut with a gilt rule: most buttons */
  plain: { lacquer: 0x3a2a1e, accent: PAL.gilt, text: PAL.uiText },
  /** lapis enamel: the one thing a screen most wants pressed */
  primary: { lacquer: 0x264a86, accent: 0xe9c46a, text: 0xfff6e2 },
  /** oxblood: anything that throws something away */
  danger: { lacquer: 0x7a2419, accent: 0xd9a24a, text: 0xfff0e4 },
  /** dark and quiet: toggles and secondary rows */
  quiet: { lacquer: 0x2a1e16, accent: 0xa9884a, text: PAL.uiText },
  /** moss: something already under way */
  good: { lacquer: 0x3c5a26, accent: 0xd9b45a, text: 0xf4f0dc },
}

export interface ButtonOpts {
  label: string
  onClick: () => void
  tone?: Tone
  /** label size in px */
  size?: number
  /** a second, smaller line under the label */
  sub?: string
  /** an icon texture drawn left of the label */
  icon?: string
  /** a keyboard hint in the plate's corner */
  keyHint?: string
  /** label colour, when the tone's own is not the point */
  textColour?: number
}

/**
 * A plate with a label. One rectangle decides where it draws and where it can
 * be pressed. It fires on press rather than release, as every control in this
 * game always has — a phone's release comes late and a tap should feel instant.
 */
export class PlateButton {
  readonly plate: SkinPanel
  readonly label: Phaser.GameObjects.Text
  readonly sub: Phaser.GameObjects.Text
  readonly icon: Phaser.GameObjects.Image
  readonly key: Phaser.GameObjects.Text
  readonly zone: Phaser.GameObjects.Zone
  x = 0
  y = 0
  w = 140
  h = 40
  private hover = false
  private down = false
  private enabled = true
  private selected = false
  private visible = true
  private live = true
  private textColour?: number
  private tone: Tone
  private size: number
  private hasIcon: boolean

  constructor(private scene: Phaser.Scene, private o: ButtonOpts) {
    this.tone = o.tone ?? 'plain'
    this.size = o.size ?? 15
    this.textColour = o.textColour
    this.plate = new SkinPanel(scene, 'plate')
    this.label = scene.add.text(0, 0, o.label, textStyle({ voice: 'caps', size: this.size, weight: '800', colour: TONES[this.tone].text }))
      .setOrigin(0.5)
    this.label.setShadow(0, 1, 'rgba(8,4,2,0.8)', 0, false, true)
    this.sub = scene.add.text(0, 0, o.sub ?? '', textStyle({ size: Math.max(10, Math.round(this.size * 0.72)), weight: 'italic 500', colour: PAL.uiDim }))
      .setOrigin(0.5).setVisible(!!o.sub)
    this.hasIcon = !!o.icon
    this.icon = scene.add.image(0, 0, o.icon ?? '__WHITE').setVisible(this.hasIcon)
    this.key = scene.add.text(0, 0, o.keyHint ?? '', textStyle({ voice: 'caps', size: 10, weight: '700', colour: PAL.uiDim }))
      .setOrigin(1, 1).setAlpha(0.75).setVisible(!!o.keyHint)
    this.zone = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true })
    this.zone.on('pointerover', () => { this.hover = true; this.redraw() })
    this.zone.on('pointerout', () => { this.hover = false; this.down = false; this.redraw() })
    this.zone.on('pointerdown', () => {
      if (!this.enabled) return
      this.down = true
      this.redraw()
      this.scene.time.delayedCall(110, () => { this.down = false; this.redraw() })
      this.o.onClick()
    })
    this.zone.on('pointerup', () => { if (this.down) { this.down = false; this.redraw() } })
  }

  /** Every object, for adding to a container in draw order. */
  objects(): Phaser.GameObjects.GameObject[] {
    return [this.plate.img, this.icon, this.label, this.sub, this.key, this.zone]
  }

  private redraw() {
    const t = TONES[this.tone]
    const state = !this.enabled ? 'disabled' : this.down ? 'active' : (this.hover || this.selected) ? 'hover' : 'idle'
    this.plate.style({ lacquer: t.lacquer, accent: this.selected ? 0xfff0b8 : t.accent, state })
      .place(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h)
    const nudge = state === 'active' ? 1 : 0
    const hasSub = this.sub.visible && !!this.sub.text
    const iconW = this.hasIcon ? Math.min(this.h * 0.62, 30) : 0
    const gap = this.hasIcon ? 7 : 0
    const labelW = this.label.width
    const left = this.x - (iconW + gap + labelW) / 2
    const ly = this.y + nudge + (hasSub ? -this.h * 0.14 : 0)
    this.label.setPosition(left + iconW + gap + labelW / 2, ly)
      .setColor(this.enabled ? `#${(this.textColour ?? t.text).toString(16).padStart(6, '0')}` : '#9a8a78')
      .setAlpha(this.enabled ? 1 : 0.8)
    if (this.hasIcon) {
      this.icon.setPosition(left + iconW / 2, ly).setDisplaySize(iconW, iconW).setAlpha(this.enabled ? 1 : 0.5)
    }
    this.sub.setPosition(this.x, this.y + nudge + this.h * 0.24)
    this.key.setPosition(this.x + this.w / 2 - 7, this.y + this.h / 2 - 4 + nudge)
  }

  private placed = ''

  place(x: number, y: number, w = 140, h = 40) {
    // Called every frame by world cards: a repeat of the last placement is free.
    const sig = `${x}|${y}|${w}|${h}|${this.label.text}`
    if (sig === this.placed) return this
    this.placed = sig
    this.x = x; this.y = y; this.w = w; this.h = h
    // shrink the label rather than let it run off the plate
    const room = w - 20 - (this.hasIcon ? Math.min(h * 0.62, 30) + 7 : 0) - (this.key.visible ? 18 : 0)
    let s = this.size
    this.label.setFontSize(s)
    while (this.label.width > room && s > 9) { s--; this.label.setFontSize(s) }
    this.redraw()
    this.zone.setPosition(x, y)
    this.syncZone()
    return this
  }

  private syncZone() {
    const on = this.visible && this.live
    this.zone.setSize(on ? this.w : 1, on ? this.h : 1)
  }

  /** Still drawn, but deaf: a modal owns the screen. */
  setLive(v: boolean) { if (v !== this.live) { this.live = v; this.syncZone() } return this }
  setTextColour(c: number | undefined) { if (c !== this.textColour) { this.textColour = c; this.redraw() } return this }

  setLabel(s: string) {
    if (this.label.text !== s) { this.label.setText(s); this.placed = ''; this.place(this.x, this.y, this.w, this.h) }
    return this
  }
  setSub(s: string) { this.sub.setText(s).setVisible(this.visible && !!s); this.redraw(); return this }
  setIcon(key: string) { if (this.icon.texture.key !== key) this.icon.setTexture(key); return this }
  setTone(t: Tone) { if (t !== this.tone) { this.tone = t; this.redraw() } return this }
  setVisible(v: boolean) {
    this.visible = v
    this.plate.setVisible(v)
    this.label.setVisible(v)
    this.sub.setVisible(v && !!this.sub.text)
    this.icon.setVisible(v && this.hasIcon)
    this.key.setVisible(v && !!this.key.text)
    this.syncZone()
    return this
  }
  /** A greyed button still draws, but the tap does nothing. */
  setEnabled(v: boolean) { if (v !== this.enabled) { this.enabled = v; this.redraw() } return this }
  setSelected(v: boolean) { if (v !== this.selected) { this.selected = v; this.redraw() } return this }
  setDepth(d: number) {
    for (const o of this.objects()) (o as unknown as { setDepth(d: number): void }).setDepth(d)
    return this
  }
  setScrollFactor(f: number) {
    for (const o of this.objects()) (o as unknown as { setScrollFactor(f: number): void }).setScrollFactor(f)
    return this
  }
  trigger() { if (this.enabled) this.o.onClick() }

  /**
   * Hand the plate's texture back. Destroying a container only frees the
   * images; without this, a screen rebuilt on every resize step would hold on
   * to a texture for every size the window passed through.
   */
  destroy() {
    this.plate.destroy()
    for (const o of [this.icon, this.label, this.sub, this.key, this.zone]) o.destroy()
  }
}

// ---- text ----------------------------------------------------------------------

/** The display face with a gilt gradient, for a heading that has to carry a screen. */
export function giltHeading(t: Phaser.GameObjects.Text, lo = 0x9a6418, hi = 0xffe7a0) {
  const h = t.height || 40
  const g = t.context.createLinearGradient(0, h * 0.18, 0, h * 0.86)
  g.addColorStop(0, css(hi))
  g.addColorStop(0.5, css(mix(hi, lo, 0.45)))
  g.addColorStop(1, css(lo))
  t.setFill(g)
  return t
}


// ---- one-off textures --------------------------------------------------------

/**
 * A canvas texture of `w`×`h` CSS pixels, backed at the device's resolution.
 * Images made from these are shown at `1 / DPR` (or given a display size), so
 * the chrome is exactly as sharp as the screen under it.
 */
function hiRes(scene: Phaser.Scene, key: string, w: number, h: number) {
  const tex = scene.textures.createCanvas(key, Math.ceil(w * DPR), Math.ceil(h * DPR)) as Phaser.Textures.CanvasTexture
  const x = tex.context
  x.setTransform(DPR, 0, 0, DPR, 0, 0)
  x.lineJoin = 'round'
  x.lineCap = 'round'
  return { tex, x }
}

/**
 * Colours that read on walnut do not read on parchment. Text on a page goes
 * through this: bone becomes ink, gold becomes a burnt gold, the signal
 * colours darken until they hold up on paper.
 */
export function onPage(c: number): number {
  switch (c) {
    case PAL.uiText: return ON_PAGE.text
    case PAL.uiDim: return ON_PAGE.dim
    case PAL.gold: return ON_PAGE.gilt
    case PAL.good: return ON_PAGE.good
    case PAL.danger: return ON_PAGE.danger
    case PAL.heroTrim: return ON_PAGE.lapis
    case PAL.uiEdge: return 0x7a6048
    default: return shade(c, -0.42)
  }
}

/** A wax seal: the ability buttons. Painted once per colour, state and size. */
export function sealTexture(scene: Phaser.Scene, colour: number, ready: boolean, r = 40, gilt = false): string {
  const key = `seal_${colour.toString(16)}_${ready ? 1 : 0}_${r}_${gilt ? 1 : 0}`
  if (scene.textures.exists(key)) return key
  const S = r * 2 + PAD * 2
  const { tex, x } = hiRes(scene, key, S, S)
  const c = S / 2
  const rng = new Rng((colour & 0xffff) + r)
  // the ability's own hue, deepened into wax rather than mixed toward red —
  // mixing made every seal the same muddy plum
  const wax = ready ? mix(shade(colour, -0.38), PAL.wax, 0.14) : 0x463830
  // the poured blob, never quite round
  const blob = (xx: Ctx, rad: number) => {
    const n = 26
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2
      const rr = rad * (1 + (i % n ? rng.range(-0.03, 0.03) : 0))
      const px = c + Math.cos(a) * rr, py = c + Math.sin(a) * rr
      if (i === 0) xx.moveTo(px, py); else xx.lineTo(px, py)
    }
    xx.closePath()
  }
  const body = r - 1
  x.save()
  x.shadowColor = 'rgba(8,4,2,0.65)'; x.shadowBlur = 6 * DPR; x.shadowOffsetY = 2 * DPR
  x.beginPath(); blob(x, body)
  const g = x.createRadialGradient(c - body * 0.35, c - body * 0.4, body * 0.1, c, c, body)
  g.addColorStop(0, css(mix(wax, 0xffffff, 0.28)))
  g.addColorStop(0.55, css(wax))
  g.addColorStop(1, css(shade(wax, -0.5)))
  x.fillStyle = g
  x.fill()
  x.restore()
  x.save(); x.beginPath(); blob(x, body); x.clip()
  applyGrain(x, S, S, 0.08)
  x.restore()
  // the pressed ring of the stamp
  x.beginPath(); x.arc(c, c, body * 0.74, 0, Math.PI * 2)
  x.strokeStyle = css(shade(wax, -0.55), 0.85); x.lineWidth = 2.2; x.stroke()
  x.beginPath(); x.arc(c + 0.8, c + 1, body * 0.74, 0, Math.PI * 2)
  x.strokeStyle = css(mix(wax, 0xffffff, 0.35), 0.35); x.lineWidth = 1; x.stroke()
  x.beginPath(); x.arc(c, c, body * 0.74 - 2, 0, Math.PI * 2)
  x.fillStyle = css(shade(wax, -0.3), 0.5); x.fill()
  x.beginPath(); blob(x, body)
  x.strokeStyle = css(INK_EDGE, 0.95); x.lineWidth = 1.6; x.stroke()
  if (gilt) {
    x.beginPath(); x.arc(c, c, body + 0.5, 0, Math.PI * 2)
    x.strokeStyle = giltGradient(x, c - body, c + body, ready ? PAL.gilt : 0x7a6a5a); x.lineWidth = 2.4; x.stroke()
    x.beginPath(); x.arc(c, c, body + 2, 0, Math.PI * 2)
    x.strokeStyle = css(INK_EDGE, 0.9); x.lineWidth = 1; x.stroke()
  }
  // a glint
  x.beginPath(); x.ellipse(c - body * 0.42, c - body * 0.52, body * 0.17, body * 0.08, -0.6, 0, Math.PI * 2)
  x.fillStyle = css(0xffffff, ready ? 0.45 : 0.14); x.fill()
  tex.refresh()
  return key
}

/** A gilt medallion with an enamel face: the hero's level, the day's dial. */
export function medalTexture(scene: Phaser.Scene, r: number, enamel = PAL.lapis): string {
  const key = `medal_${r}_${enamel.toString(16)}`
  if (scene.textures.exists(key)) return key
  const S = r * 2 + PAD * 2
  const { tex, x } = hiRes(scene, key, S, S)
  const c = S / 2
  x.save()
  x.shadowColor = 'rgba(8,4,2,0.6)'; x.shadowBlur = 6 * DPR; x.shadowOffsetY = 2 * DPR
  x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2)
  x.fillStyle = giltGradient(x, c - r, c + r, PAL.gilt); x.fill()
  x.restore()
  // notched bezel
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    x.beginPath(); x.moveTo(c + Math.cos(a) * (r - 1), c + Math.sin(a) * (r - 1))
    x.lineTo(c + Math.cos(a) * (r - 3.5), c + Math.sin(a) * (r - 3.5))
    x.strokeStyle = css(shade(PAL.gilt, -0.45), 0.6); x.lineWidth = 1; x.stroke()
  }
  const inner = r - 4.5
  x.beginPath(); x.arc(c, c, inner, 0, Math.PI * 2)
  const e = x.createRadialGradient(c - inner * 0.3, c - inner * 0.35, inner * 0.1, c, c, inner)
  e.addColorStop(0, css(lightOf(enamel, 0.3)))
  e.addColorStop(0.6, css(enamel))
  e.addColorStop(1, css(shadowOf(enamel, 0.5)))
  x.fillStyle = e; x.fill()
  x.strokeStyle = css(INK_EDGE, 0.9); x.lineWidth = 1.2; x.stroke()
  x.save(); x.beginPath(); x.arc(c, c, inner, 0, Math.PI * 2); x.clip()
  applyGrain(x, S, S, 0.08)
  x.restore()
  x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2)
  x.strokeStyle = css(INK_EDGE, 0.95); x.lineWidth = 1.5; x.stroke()
  x.beginPath(); x.ellipse(c - inner * 0.35, c - inner * 0.5, inner * 0.3, inner * 0.12, -0.5, 0, Math.PI * 2)
  x.fillStyle = css(0xffffff, 0.2); x.fill()
  tex.refresh()
  return key
}

/** Dark edges that fall in toward the middle of the screen, behind a modal. */
export function vignetteTexture(scene: Phaser.Scene, colour = 0x0a0603): string {
  const key = `ui_vignette_${colour.toString(16)}`
  if (scene.textures.exists(key)) return key
  const S = 256
  const tex = scene.textures.createCanvas(key, S, S) as Phaser.Textures.CanvasTexture
  const x = tex.context
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.72)
  g.addColorStop(0, css(colour, 0))
  g.addColorStop(0.6, css(colour, 0.35))
  g.addColorStop(1, css(shade(colour, -0.4), 0.85))
  x.fillStyle = g
  x.fillRect(0, 0, S, S)
  tex.refresh()
  return key
}

/** The movement stick's ring: a dark glass disc with an inked bone rim and compass ticks. */
export function stickRingTexture(scene: Phaser.Scene, r: number): string {
  const key = `stick_ring_${r}`
  if (scene.textures.exists(key)) return key
  const S = r * 2 + PAD * 2
  const { tex, x } = hiRes(scene, key, S, S)
  const c = S / 2
  x.beginPath(); x.arc(c, c, r - 2, 0, Math.PI * 2)
  const g = x.createRadialGradient(c, c, r * 0.2, c, c, r)
  g.addColorStop(0, css(0x0c0704, 0.15))
  g.addColorStop(1, css(0x0c0704, 0.45))
  x.fillStyle = g; x.fill()
  x.beginPath(); x.arc(c, c, r - 2, 0, Math.PI * 2)
  x.strokeStyle = css(INK_EDGE, 0.7); x.lineWidth = 5; x.stroke()
  x.beginPath(); x.arc(c, c, r - 2, 0, Math.PI * 2)
  x.strokeStyle = css(PAL.bone, 0.75); x.lineWidth = 2.2; x.stroke()
  x.beginPath(); x.arc(c, c, r * 0.56, 0, Math.PI * 2)
  x.strokeStyle = css(PAL.bone, 0.25); x.lineWidth = 1.2; x.setLineDash([3, 5]); x.stroke(); x.setLineDash([])
  // compass ticks
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 2
    const px = c + Math.cos(a) * (r - 11), py = c + Math.sin(a) * (r - 11)
    x.save(); x.translate(px, py); x.rotate(a + Math.PI / 2)
    x.beginPath(); x.moveTo(0, -5); x.lineTo(4, 3); x.lineTo(-4, 3); x.closePath()
    x.fillStyle = css(INK_EDGE, 0.8); x.fill()
    x.beginPath(); x.moveTo(0, -3.5); x.lineTo(2.6, 2); x.lineTo(-2.6, 2); x.closePath()
    x.fillStyle = css(PAL.gilt, 0.9); x.fill()
    x.restore()
  }
  tex.refresh()
  return key
}
