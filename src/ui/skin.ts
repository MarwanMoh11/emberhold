import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { css, lightOf, mix, Rng, shade, type Ctx } from '../art/ink'
import { screen, textStyle } from './theme'
import { DPR, wantsTouchTargets } from '../core/device'

/**
 * The interface's chrome, painted once rather than drawn every frame.
 *
 * Phaser's Graphics re-triangulates every rounded rectangle on every frame it
 * renders (the minimap notes measured it), so each piece of chrome is painted
 * once into a canvas, cached by what it looks like, and shown as a single
 * quad. A dozen buttons of one size share one texture; hovering one swaps it
 * for another cached texture rather than repainting anything.
 *
 * One surface carries the whole interface: smoked glass. It is dark, quiet
 * and slightly see-through, with a soft corner and a hairline edge, and it
 * carries no ornament at all, so the painted world stays the brightest and
 * busiest thing on screen and the few colours the chrome does use (health,
 * the gold of reward, the vermilion of danger) are what the eye finds.
 */

export type Skin = 'hud' | 'page' | 'plate' | 'ribbon' | 'callout' | 'well'

export interface SkinOpts {
  /** accent colour: a page's top mark, a plate's focus ring */
  accent?: number
  /** plate states */
  state?: 'idle' | 'hover' | 'active' | 'disabled'
  /** fill colour for plates and ribbons: smoke by default */
  lacquer?: number
  /** strength of the fill */
  alpha?: number
}

/** Extra canvas around every panel for its drop shadow. */
export const PAD = 8
/** How far a callout's pointer drops below its box. */
const TIP = 10

/** The glass itself: a warm near-black. */
const SMOKE = 0x100d0b
/** The light that catches its edge. */
const EDGE = 0xfff4e2
/** An ordinary button: warm charcoal. */
const PLATE_BASE = 0x2c2724

/**
 * Text colours for a card. The name survives from when cards were parchment;
 * they are light inks now, the same family the HUD uses.
 */
export const ON_PAGE = {
  text: PAL.uiText,
  dim: PAL.uiDim,
  gilt: PAL.gold,
  good: PAL.good,
  danger: PAL.danger,
  lapis: PAL.heroTrim,
  /** hairlines and rules drawn on a card */
  rule: 0xe8dcc4,
}

// ---- painting helpers ------------------------------------------------------

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** A rounded box, with a pointer dropping out of the middle of its bottom edge when `tip`. */
function box(x: Ctx, px: number, py: number, w: number, h: number, r: number, tip = false) {
  const mid = px + w / 2
  x.moveTo(px + r, py)
  x.arcTo(px + w, py, px + w, py + h, r)
  x.arcTo(px + w, py + h, px, py + h, r)
  if (tip) {
    x.lineTo(mid + 8, py + h)
    x.lineTo(mid, py + h + TIP)
    x.lineTo(mid - 8, py + h)
  }
  x.arcTo(px, py + h, px, py, r)
  x.arcTo(px, py, px + w, py, r)
  x.closePath()
}

/** Smoked glass: a soft shadow, a breath of light along the top, and a hairline edge. */
function glass(x: Ctx, w: number, h: number, rad: number, alpha: number, tint = SMOKE, tip = false) {
  const path = (xx: Ctx, inset = 0) => box(xx, PAD + inset, PAD + inset, w - inset * 2, h - inset * 2, Math.max(1, rad - inset), tip)
  x.save()
  x.shadowColor = 'rgba(0,0,0,0.32)'
  x.shadowBlur = 7 * DPR
  x.shadowOffsetY = 2 * DPR
  x.beginPath(); path(x)
  x.fillStyle = css(tint, alpha)
  x.fill()
  x.restore()
  x.save()
  x.beginPath(); path(x); x.clip()
  const g = x.createLinearGradient(0, PAD, 0, PAD + Math.min(h, 22))
  g.addColorStop(0, css(EDGE, 0.07)); g.addColorStop(1, css(EDGE, 0))
  x.fillStyle = g
  x.fillRect(PAD, PAD, w, h)
  x.restore()
  x.beginPath(); path(x, 0.5)
  x.strokeStyle = css(EDGE, 0.11); x.lineWidth = 1; x.stroke()
}

// ---- painters ---------------------------------------------------------------

/** The HUD's panels: glass over the world. */
function paintHud(x: Ctx, w: number, h: number, o: SkinOpts) {
  glass(x, w, h, Math.min(10, h / 2, w / 2), o.alpha ?? 0.62, o.lacquer ?? SMOKE)
}

/** The same glass with a pointer: a card that floats over a building. */
function paintCallout(x: Ctx, w: number, h: number, o: SkinOpts) {
  glass(x, w, h, Math.min(10, h / 2, w / 2), o.alpha ?? 0.8, o.lacquer ?? SMOKE, true)
}

/** A card: what every menu and screen is written on. Denser glass, and a short mark of its accent on top. */
function paintPage(x: Ctx, w: number, h: number, o: SkinOpts) {
  glass(x, w, h, Math.min(14, h / 2, w / 2), o.alpha ?? 0.93, o.lacquer ?? SMOKE)
  const accent = o.accent ?? PAL.wax
  const mw = Math.min(56, w * 0.24)
  x.beginPath(); x.roundRect(PAD + w / 2 - mw / 2, PAD, mw, 2.5, 1.25)
  x.fillStyle = css(mix(accent, 0xffffff, 0.12), 0.95); x.fill()
}

/** A button: a flat pill of its tone, with a hairline edge that brightens under the pointer. */
function paintPlate(x: Ctx, w: number, h: number, o: SkinOpts) {
  const state = o.state ?? 'idle'
  const base = o.lacquer ?? PLATE_BASE
  const rad = Math.min(9, h / 2)
  const alpha = o.alpha ?? 1
  const fill = state === 'disabled' ? mix(base, 0x3a3532, 0.7)
    : state === 'hover' ? mix(base, 0xffffff, 0.1)
      : state === 'active' ? shade(base, -0.18) : base
  x.save()
  if (state !== 'active') {
    x.shadowColor = 'rgba(0,0,0,0.3)'
    x.shadowBlur = 4 * DPR
    x.shadowOffsetY = 1.5 * DPR
  }
  x.beginPath(); x.roundRect(PAD, PAD, w, h, rad)
  x.fillStyle = css(fill, state === 'disabled' ? Math.min(alpha, 0.7) : alpha)
  x.fill()
  x.restore()
  // a breath of light on the upper half, gone when pressed
  if (state !== 'active') {
    x.save(); x.beginPath(); x.roundRect(PAD, PAD, w, h, rad); x.clip()
    const lip = x.createLinearGradient(0, PAD, 0, PAD + h * 0.55)
    lip.addColorStop(0, css(EDGE, state === 'hover' ? 0.12 : 0.07)); lip.addColorStop(1, css(EDGE, 0))
    x.fillStyle = lip; x.fillRect(PAD, PAD, w, h)
    x.restore()
  }
  x.beginPath(); x.roundRect(PAD + 0.5, PAD + 0.5, w - 1, h - 1, Math.max(1, rad - 0.5))
  if (state === 'hover' && o.accent !== undefined) {
    // hover, or the pad's focus: the accent rings the plate
    x.strokeStyle = css(o.accent, 0.8); x.lineWidth = 1.5
  } else {
    x.strokeStyle = css(EDGE, state === 'disabled' ? 0.05 : 0.12); x.lineWidth = 1
  }
  x.stroke()
}

/**
 * A band of shade across the middle of the screen that fades out at both
 * ends, ruled above and below: headlines and news. No cloth, no tails.
 */
function paintRibbon(x: Ctx, w: number, h: number, o: SkinOpts) {
  const tint = mix(SMOKE, o.lacquer ?? SMOKE, 0.22)
  const accent = o.accent ?? PAL.gold
  const band = x.createLinearGradient(PAD, 0, PAD + w, 0)
  band.addColorStop(0, css(tint, 0))
  band.addColorStop(0.2, css(tint, o.alpha ?? 0.72))
  band.addColorStop(0.8, css(tint, o.alpha ?? 0.72))
  band.addColorStop(1, css(tint, 0))
  x.fillStyle = band
  x.fillRect(PAD, PAD, w, h)
  const rule = x.createLinearGradient(PAD, 0, PAD + w, 0)
  rule.addColorStop(0, css(accent, 0))
  rule.addColorStop(0.5, css(accent, 0.7))
  rule.addColorStop(1, css(accent, 0))
  x.fillStyle = rule
  x.fillRect(PAD, PAD, w, 1)
  x.fillRect(PAD, PAD + h - 1, w, 1)
}

/** The channel a bar runs in: a dark rounded groove. */
function paintWell(x: Ctx, w: number, h: number, o: SkinOpts) {
  x.beginPath(); x.roundRect(PAD, PAD, w, h, Math.min(h / 2, 4))
  x.fillStyle = css(0x000000, o.alpha ?? 0.5); x.fill()
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

/** A flat fill with a little light along its top: the colour is the message. */
function paintFill(x: Ctx, w: number, h: number, colour: number, pale: boolean) {
  const c = pale ? mix(colour, 0xfff4dc, 0.55) : colour
  const rad = Math.min(3, h / 2)
  x.beginPath(); x.roundRect(0, 0, w, h, rad)
  const g = x.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, css(lightOf(c, 0.18), pale ? 0.55 : 1))
  g.addColorStop(1, css(shade(c, -0.12), pale ? 0.55 : 1))
  x.fillStyle = g
  x.fill()
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
    if (this.fillHeld.swap(key, fw, fh, x => paintFill(x, fw, fh, colour, false))) {
      this.fill.setTexture(key)
    }
    if (this.opts.ghost) {
      const gk = `bar:ghost:${colour}:${fw}x${fh}`
      if (this.ghostHeld.swap(gk, fw, fh, x => paintFill(x, fw, fh, colour, true))) {
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

const TONES: Record<Tone, { lacquer: number; accent: number; text: number; alpha: number }> = {
  /** charcoal: most buttons */
  plain: { lacquer: PLATE_BASE, accent: 0xe8d8b8, text: PAL.uiText, alpha: 0.92 },
  /** lapis: the one thing a screen most wants pressed */
  primary: { lacquer: 0x2f62b0, accent: 0xcfe2ff, text: 0xffffff, alpha: 1 },
  /** oxblood: anything that throws something away */
  danger: { lacquer: 0x94301f, accent: 0xffc2a8, text: 0xfff0e4, alpha: 1 },
  /** smoke: toggles, secondary rows and the HUD's own buttons */
  quiet: { lacquer: SMOKE, accent: 0xd8c8a8, text: PAL.uiText, alpha: 0.62 },
  /** moss: something already under way */
  good: { lacquer: 0x3d6a2c, accent: 0xd8f0b8, text: 0xf4f0dc, alpha: 1 },
}

export interface ButtonOpts {
  label: string
  onClick: () => void
  tone?: Tone
  /** label size in px, or `compact`: a docked sheet's button, 44 px tall on touch and 36 with a mouse */
  size?: number | 'compact'
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
  readonly compact: boolean

  constructor(private scene: Phaser.Scene, private o: ButtonOpts) {
    this.tone = o.tone ?? 'plain'
    this.compact = o.size === 'compact'
    this.size = o.size === 'compact' ? 14 : o.size ?? 15
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
    this.plate.style({ lacquer: t.lacquer, accent: this.selected ? 0xfff0b8 : t.accent, state, alpha: t.alpha })
      .place(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h)
    const nudge = state === 'active' ? 1 : 0
    const hasSub = this.sub.visible && !!this.sub.text
    const iconW = this.hasIcon ? Math.min(this.h * 0.62, 30) : 0
    const gap = this.hasIcon && this.label.text ? 7 : 0
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

  /** A compact button's height at the current viewport. */
  get compactH() { return wantsTouchTargets(screen(this.scene).w) ? 44 : 36 }

  place(x: number, y: number, w = 140, h = this.compact ? this.compactH : 40) {
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
 * Colours as they sit on a card. Cards are the same dark glass as the HUD, so
 * the HUD's own colours already hold up; this is kept so a panel never has to
 * know which surface it sits on.
 */
export function onPage(c: number): number {
  return c === PAL.uiEdge ? 0x8a7a64 : c
}

/**
 * An ability's disc: smoked glass ringed in the ability's colour. Cooling
 * down, the ring goes grey and the glass thins; ready, it takes its colour
 * back. The ultimate wears a second, outer ring. Painted once per colour,
 * state and size.
 */
export function sealTexture(scene: Phaser.Scene, colour: number, ready: boolean, r = 40, gilt = false): string {
  const key = `disc_${colour.toString(16)}_${ready ? 1 : 0}_${r}_${gilt ? 1 : 0}`
  if (scene.textures.exists(key)) return key
  const S = r * 2 + PAD * 2
  const { tex, x } = hiRes(scene, key, S, S)
  const c = S / 2
  const body = r - 1
  x.save()
  x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 6 * DPR; x.shadowOffsetY = 2 * DPR
  x.beginPath(); x.arc(c, c, body, 0, Math.PI * 2)
  x.fillStyle = css(SMOKE, ready ? 0.72 : 0.6)
  x.fill()
  x.restore()
  if (ready) {
    // the colour glows up from the bottom of the glass
    const g = x.createRadialGradient(c, c + body * 0.5, body * 0.1, c, c, body)
    g.addColorStop(0, css(colour, 0.32))
    g.addColorStop(1, css(colour, 0.06))
    x.beginPath(); x.arc(c, c, body, 0, Math.PI * 2)
    x.fillStyle = g; x.fill()
  }
  const ring = ready ? mix(colour, 0xffffff, 0.15) : 0x8a8480
  const lw = gilt ? 2.6 : 2
  x.beginPath(); x.arc(c, c, body - lw / 2, 0, Math.PI * 2)
  x.strokeStyle = css(ring, ready ? 0.95 : 0.4); x.lineWidth = lw; x.stroke()
  if (gilt) {
    x.beginPath(); x.arc(c, c, body - lw - 2.5, 0, Math.PI * 2)
    x.strokeStyle = css(ring, ready ? 0.35 : 0.15); x.lineWidth = 1; x.stroke()
  }
  tex.refresh()
  return key
}

/** A disc with a coloured ring: the hero's level, the stick's knob. */
export function medalTexture(scene: Phaser.Scene, r: number, enamel = PAL.heroTrim): string {
  const key = `medal2_${r}_${enamel.toString(16)}`
  if (scene.textures.exists(key)) return key
  const S = r * 2 + PAD * 2
  const { tex, x } = hiRes(scene, key, S, S)
  const c = S / 2
  x.save()
  x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 5 * DPR; x.shadowOffsetY = 1.5 * DPR
  x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2)
  x.fillStyle = css(mix(SMOKE, enamel, 0.18), 0.92); x.fill()
  x.restore()
  x.beginPath(); x.arc(c, c, r - 1, 0, Math.PI * 2)
  x.strokeStyle = css(enamel, 0.95); x.lineWidth = 2; x.stroke()
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


/** The movement stick's ring: a faint disc and a thin bone rim. */
export function stickRingTexture(scene: Phaser.Scene, r: number): string {
  const key = `stick_ring2_${r}`
  if (scene.textures.exists(key)) return key
  const S = r * 2 + PAD * 2
  const { tex, x } = hiRes(scene, key, S, S)
  const c = S / 2
  x.beginPath(); x.arc(c, c, r - 2, 0, Math.PI * 2)
  x.fillStyle = css(SMOKE, 0.22); x.fill()
  x.strokeStyle = css(PAL.bone, 0.45); x.lineWidth = 1.5; x.stroke()
  tex.refresh()
  return key
}

// ---- the dock (S09b) -------------------------------------------------------------
export * from './dock'
