import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { short as shortNum } from '../core/math'
import { safeAreaInsets, wantsTouchTargets } from '../core/device'
import { screen, setColour, textStyle } from './theme'
import { PlateButton, SkinPanel } from './skin'

/**
 * The docked sheet every panel from S09b on is built from (re-exported by
 * skin.ts). The old build card floated over the building it described, so on a
 * phone it covered the building, the hero and half the fight. The sheet lives
 * in screen space on the HUD's scene instead: a bottom sheet in portrait, a
 * column on the right edge otherwise, collapsed to one row until you ask for
 * more. Nothing in it counter-scales by the camera's zoom, so every number
 * here is a CSS pixel.
 */
export const DOCK = {
  /** distance from the screen edge (safe area added on top) */
  gutter: 16,
  /** inner padding */
  pad: 10,
  /** minimum hit size on touch, CSS px */
  touch: 44,
  /** a text or chip row */
  rowH: 28,
  /** the collapsed sheet: one row of title, level, primary action and chevron */
  collapsedH: 64,
  /** width of the right-edge dock */
  sideW: 300,
  /** the most of the viewport's area the expanded sheet may take, on a phone and on a desk */
  phoneMaxFrac: 0.30,
  deskMaxFrac: 0.20,
  titleSize: 15,
  bodySize: 13,
  /** above the HUD (1.000M–1.000012M), below every modal (1.1M+) */
  depth: 1_050_000,
} as const

/** The smallest font any sheet may draw, at any width. */
const MIN_FONT = 12

export interface DockRect { x: number; y: number; w: number; h: number }

/** What a sheet publishes as `uiBands.dock`: its rect, its side, and the world point it is about. */
export interface DockBand extends DockRect {
  side: 'bottom' | 'right'
  focus?: { x: number; y: number }
}

/** The HUD bands a sheet must clear, and where it writes its own rect. */
export interface DockBands { top: number; bottom: number; dock?: DockBand | null }

/** One row of a sheet's body. Heights depend on the width (text wraps), so the sheet asks. */
export interface DockRow {
  measure(w: number): number
  place(x: number, y: number, w: number): void
  setVisible(v: boolean): void
  /** everything the row draws, for adding to the sheet */
  objects(): Phaser.GameObjects.GameObject[]
}

/** A tappable thing on a sheet, for the harness: its name and its hit rect in CSS px. */
export interface DockTarget { name: string; x: number; y: number; w: number; h: number }

export interface DockHead {
  title: string
  /** the second line: the level, or the state of the site */
  level?: string
  levelColour?: number
  /** width the caller's primary action needs in the header; 0 for none */
  primaryW?: number
}

/** The last state the player chose, for this page session. Phones start collapsed. */
let remembered: boolean | null = null

/** The target size of a compact control: a thumb on touch, a pointer's worth otherwise. */
export function compactH(viewW: number) {
  return wantsTouchTargets(viewW) ? DOCK.touch : 36
}

/**
 * A screen-space sheet. The owner calls `layout(head, rows)` every frame it is
 * shown (it is cheap when nothing changed) and places its primary action in
 * `primary`, the header's slot between the title and the chevron.
 */
export class DockSheet {
  readonly root: Phaser.GameObjects.Container
  private bg: SkinPanel
  /** eats taps that land on the sheet but miss its controls, so the stick never starts there */
  private blocker: Phaser.GameObjects.Zone
  private title: Phaser.GameObjects.Text
  private level: Phaser.GameObjects.Text
  private rule: Phaser.GameObjects.Rectangle
  readonly chevron: PlateButton
  collapsed: boolean
  side: 'bottom' | 'right' = 'bottom'
  rect: DockRect = { x: 0, y: 0, w: 0, h: 0 }
  /** where the header's primary action goes, in CSS px */
  primary: DockRect = { x: 0, y: 0, w: 0, h: 0 }
  /** the world point this sheet is about; the camera frames it in the clear area */
  focus?: { x: number; y: number }
  private scroll = 0
  private overflow = 0
  private dragY: number | null = null
  private shown = false
  private headSig = ''
  dead = false

  constructor(private scene: Phaser.Scene, private bands: DockBands) {
    const view = screen(scene)
    this.collapsed = remembered ?? wantsTouchTargets(view.w)
    this.root = scene.add.container(0, 0).setDepth(DOCK.depth).setScrollFactor(0).setVisible(false)
    this.bg = new SkinPanel(scene, 'hud')
    this.blocker = scene.add.zone(0, 0, 1, 1).setOrigin(0, 0).setInteractive()
    this.blocker.on('pointerdown', (p: Phaser.Input.Pointer) => { this.dragY = p.y })
    this.blocker.on('pointerup', () => { this.dragY = null })
    this.blocker.on('pointerout', () => { this.dragY = null })
    this.blocker.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragY === null || !p.isDown) return
      // pointer positions arrive in device pixels, the sheet is laid out in CSS pixels
      this.scrollBy((this.dragY - p.y) / (scene.cameras.main.zoom || 1))
      this.dragY = p.y
    })
    this.title = scene.add.text(0, 0, '', textStyle({ voice: 'display', size: DOCK.titleSize, colour: PAL.bone, shadow: true }))
      .setOrigin(0, 0.5)
    this.level = scene.add.text(0, 0, '', textStyle({ size: DOCK.bodySize, weight: '600', colour: PAL.uiDim }))
      .setOrigin(0, 0.5)
    this.rule = scene.add.rectangle(0, 0, 10, 1, PAL.gilt, 0.35).setOrigin(0, 0.5).setVisible(false)
    this.chevron = new PlateButton(scene, { label: '', tone: 'quiet', size: 'compact', onClick: () => this.toggle() })
    this.root.add([this.bg.img, this.blocker, this.title, this.level, this.rule, ...this.chevron.objects()])
    scene.input.on('wheel', this.onWheel, this)
    scene.events.once('shutdown', this.destroy, this)
  }

  get isShown() { return this.shown }

  /** Add the owner's own objects (its primary action, its rows) in draw order. */
  add(objs: Phaser.GameObjects.GameObject[]) { this.root.add(objs); return this }

  toggle() {
    this.collapsed = !this.collapsed
    remembered = this.collapsed
    this.scroll = 0
  }

  private onWheel(p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) {
    if (!this.shown || this.collapsed) return
    const z = this.scene.cameras.main.zoom || 1
    if (this.contains(p.x / z, p.y / z)) this.scrollBy(dy * 0.5)
  }

  private scrollBy(d: number) {
    this.scroll = Phaser.Math.Clamp(this.scroll + d, 0, this.overflow)
  }

  /** Is this CSS-pixel point on the sheet? */
  contains(x: number, y: number) {
    const r = this.rect
    return this.shown && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  }

  /**
   * Size and place the sheet for this frame and publish its rect. Returns the
   * rect; `primary` holds the slot for the caller's primary action.
   */
  layout(head: DockHead, rows: DockRow[]): DockRect {
    if (this.dead) return this.rect
    const appearing = !this.shown
    this.shown = true
    this.root.setVisible(true)

    const { w: W, h: H } = screen(this.scene)
    const touch = wantsTouchTargets(W)
    const hit = compactH(W)
    const sa = safeAreaInsets()
    const top = this.bands.top
    const bottom = this.bands.bottom
    this.side = H >= W ? 'bottom' : 'right'
    const frac = touch ? DOCK.phoneMaxFrac : DOCK.deskMaxFrac

    let x: number, w: number, maxH: number
    if (this.side === 'bottom') {
      x = DOCK.gutter + sa.left
      w = W - x - DOCK.gutter - sa.right
      maxH = Math.min((frac * W * H) / w, H - bottom - top - 8)
    } else {
      w = Math.min(DOCK.sideW, W * 0.42)
      x = W - DOCK.gutter - sa.right - w
      maxH = Math.min((frac * W * H) / w, H - top - bottom - 8)
    }
    maxH = Math.max(DOCK.collapsedH, maxH)

    // body first: its height decides the sheet's
    const inner = w - DOCK.pad * 2
    const gap = 6
    const heights = this.collapsed ? [] : rows.map(r => r.measure(inner))
    const bodyH = heights.length ? heights.reduce((a, b) => a + b, 0) + gap * (heights.length - 1) + DOCK.pad : 0
    const h = Math.min(maxH, DOCK.collapsedH + bodyH)
    const viewH = h - DOCK.collapsedH - (bodyH > 0 ? DOCK.pad : 0)
    this.overflow = Math.max(0, bodyH - DOCK.pad - viewH)
    this.scroll = Math.min(this.scroll, this.overflow)

    const y = this.side === 'bottom' ? H - bottom - h : top
    this.rect = { x, y, w, h }
    this.bg.place(x, y, w, h)
    this.blocker.setPosition(x, y).setSize(w, h)
    if (this.blocker.input) this.blocker.input.hitArea.setTo(0, 0, w, h)

    // header: [title / level] [primary] [chevron]
    const cy = y + DOCK.collapsedH / 2
    const chevX = x + w - DOCK.pad - hit / 2
    this.chevron.setVisible(true).setLabel(this.collapsed ? '▲' : '▼').place(chevX, cy, hit, hit)
    const pw = head.primaryW ?? 0
    const pRight = chevX - hit / 2 - 8
    this.primary = { x: pRight - pw, y: cy - hit / 2, w: pw, h: hit }
    const textX = x + DOCK.pad + 2
    const room = Math.max(40, (pw > 0 ? this.primary.x - 8 : pRight) - textX)
    const hasLevel = !!head.level
    const sig = `${head.title}|${head.level ?? ''}|${Math.round(room)}`
    if (sig !== this.headSig) {
      this.headSig = sig
      fitText(this.title.setText(head.title), DOCK.titleSize, room)
      fitText(this.level.setText(head.level ?? ''), DOCK.bodySize, room)
    }
    this.title.setPosition(textX, hasLevel ? cy - 9 : cy)
    this.level.setVisible(hasLevel)
    setColour(this.level, head.levelColour ?? PAL.uiDim)
    this.level.setPosition(textX, cy + 10)

    // body: rows in order, scrolled, clipped by whole rows
    this.rule.setVisible(!this.collapsed && rows.length > 0)
      .setPosition(x + DOCK.pad, y + DOCK.collapsedH - 1).setSize(inner, 1)
    let ry = y + DOCK.collapsedH - this.scroll
    const clipTop = y + DOCK.collapsedH - 1
    const clipBottom = y + h - DOCK.pad + 1
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (this.collapsed) { r.setVisible(false); continue }
      const rh = heights[i]
      const inView = ry >= clipTop && ry + rh <= clipBottom
      r.setVisible(inView)
      if (inView) r.place(x + DOCK.pad, ry, inner)
      ry += rh + gap
    }

    this.bands.dock = { x, y, w, h, side: this.side, focus: this.focus }

    if (appearing) {
      this.root.setAlpha(0)
      this.scene.tweens.killTweensOf(this.root)
      this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 140, ease: 'Sine.easeOut' })
    }
    return this.rect
  }

  hide() {
    if (!this.shown) return
    this.shown = false
    this.dragY = null
    if (!this.dead) {
      this.root.setVisible(false)
      this.blocker.setSize(1, 1)
      if (this.blocker.input) this.blocker.input.hitArea.setTo(0, 0, 1, 1)
      this.chevron.setVisible(false)
    }
    if (this.bands.dock && this.bands.dock.x === this.rect.x && this.bands.dock.y === this.rect.y) this.bands.dock = null
  }

  /** The sheet's own controls, for the harness. */
  targets(): DockTarget[] {
    if (!this.shown) return []
    const c = this.chevron
    return [{ name: this.collapsed ? 'expand' : 'collapse', x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h }]
  }

  /** Every visible text on the sheet, for the harness's font floor. */
  fonts(): number[] {
    const out: number[] = []
    const walk = (o: Phaser.GameObjects.GameObject) => {
      const t = o as Phaser.GameObjects.Text
      if (t.type === 'Text' && t.visible && t.text) out.push(parseFloat(String(t.style.fontSize)))
    }
    this.root.each(walk)
    return out
  }

  destroy() {
    if (this.dead) return
    this.dead = true
    if (this.bands.dock && this.shown) this.bands.dock = null
    this.shown = false
    this.scene.input?.off('wheel', this.onWheel, this)
    this.scene.events.off('shutdown', this.destroy, this)
    this.bg.destroy()
    this.chevron.destroy()
    this.root.destroy()
  }
}

/** Shrink a text to fit a width, down to the floor, then cut it with an ellipsis. */
function fitText(t: Phaser.GameObjects.Text, size: number, maxW: number) {
  let s = size
  t.setFontSize(s)
  while (t.width > maxW && s > MIN_FONT) { s--; t.setFontSize(s) }
  if (t.width <= maxW) return
  const full = t.text
  let n = full.length
  while (n > 1 && t.width > maxW) { n--; t.setText(full.slice(0, n).trimEnd() + '…') }
}

// ---- rows ---------------------------------------------------------------------

export interface CostChip {
  /** the resource's pickup texture; the interface's `ui_` copy is used when there is one */
  tex: string
  have: number
  need: number
  /** red: the stores cannot cover what is left. Defaults to false */
  short?: boolean
}

/**
 * Costs as a row of chips, an icon with `have/need` beside it: green once a
 * line is covered, red when the stores are short of it. Replaces the tall bar
 * rows: four resources fit on one line of a phone.
 */
export class CostChips implements DockRow {
  private icons: Phaser.GameObjects.Image[] = []
  private labels: Phaser.GameObjects.Text[] = []
  private data: CostChip[] = []
  private visible = true

  constructor(private scene: Phaser.Scene, max = 5) {
    for (let i = 0; i < max; i++) {
      this.icons.push(scene.add.image(0, 0, '__WHITE').setVisible(false))
      this.labels.push(scene.add.text(0, 0, '', textStyle({ size: DOCK.bodySize, weight: '800', colour: PAL.uiText }))
        .setOrigin(0, 0.5).setVisible(false))
    }
  }

  objects() { return [...this.icons, ...this.labels] }

  set(chips: CostChip[]) {
    this.data = chips.slice(0, this.icons.length)
    for (let i = 0; i < this.icons.length; i++) {
      const d = this.data[i]
      if (!d) continue
      const tex = this.scene.textures.exists(`ui_${d.tex}`) ? `ui_${d.tex}` : d.tex
      if (this.icons[i].texture.key !== tex) this.icons[i].setTexture(tex)
      const done = d.have >= d.need
      setColour(this.labels[i].setText(`${shortNum(d.have)}/${shortNum(d.need)}`),
        done ? PAL.good : d.short ? PAL.danger : PAL.uiText)
    }
    return this
  }

  private chipW(i: number) { return 20 + 4 + this.labels[i].width + 12 }

  measure(w: number) {
    if (!this.data.length) return 0
    let lines = 1, x = 0
    for (let i = 0; i < this.data.length; i++) {
      const cw = this.chipW(i)
      if (x > 0 && x + cw > w) { lines++; x = 0 }
      x += cw
    }
    return lines * DOCK.rowH
  }

  place(x0: number, y0: number, w: number) {
    let x = 0, y = y0
    for (let i = 0; i < this.icons.length; i++) {
      const on = this.visible && i < this.data.length
      this.icons[i].setVisible(on)
      this.labels[i].setVisible(on)
      if (!on) continue
      const cw = this.chipW(i)
      if (x > 0 && x + cw > w) { x = 0; y += DOCK.rowH }
      const cy = y + DOCK.rowH / 2
      this.icons[i].setPosition(x0 + x + 10, cy).setDisplaySize(20, 20)
      this.labels[i].setPosition(x0 + x + 24, cy)
      x += cw
    }
  }

  setVisible(v: boolean) {
    this.visible = v
    for (let i = 0; i < this.icons.length; i++) {
      const on = v && i < this.data.length
      this.icons[i].setVisible(on)
      this.labels[i].setVisible(on)
    }
  }
}

/**
 * One line of effect: "+0.6 coins/s", "+15% food within 600 px", "heals 2 hp/s".
 * It wraps rather than shrinks when a line runs long.
 */
export class StatLine implements DockRow {
  readonly text: Phaser.GameObjects.Text
  private icon: Phaser.GameObjects.Image
  private hasIcon = false

  constructor(scene: Phaser.Scene, o: { colour?: number; italic?: boolean; weight?: string } = {}) {
    this.icon = scene.add.image(0, 0, '__WHITE').setVisible(false)
    this.text = scene.add.text(0, 0, '', textStyle({
      size: DOCK.bodySize, weight: o.weight ?? (o.italic ? 'italic 500' : '700'), colour: o.colour ?? PAL.uiText, wrap: 200,
    })).setOrigin(0, 0)
  }

  objects() { return [this.icon, this.text] }

  set(s: string, colour?: number, icon?: string) {
    this.text.setText(s)
    if (colour !== undefined) setColour(this.text, colour)
    if (icon && this.icon.texture.key !== icon) this.icon.setTexture(icon)
    this.hasIcon = !!icon
    return this
  }

  measure(w: number) {
    if (!this.text.text) return 0
    this.text.setWordWrapWidth(w - (this.hasIcon ? 22 : 0), true)
    return Math.max(18, Math.ceil(this.text.height))
  }

  place(x: number, y: number, w: number) {
    const ix = this.hasIcon ? 22 : 0
    this.text.setWordWrapWidth(w - ix, true).setPosition(x + ix, y)
    this.icon.setPosition(x + 9, y + 9).setDisplaySize(18, 18)
  }

  setVisible(v: boolean) {
    this.text.setVisible(v && !!this.text.text)
    this.icon.setVisible(v && this.hasIcon)
  }
}
