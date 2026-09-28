import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { bake, fill, P } from '../art/ink'
import { buildingTextureKey } from '../art/buildings'
import { safeAreaInsets } from '../core/device'
import type { NightLog } from '../core/Events'
import type { GameScene } from '../scenes/GameScene'
import type { Enemy } from '../entities/Enemy'
import type { HUD } from './HUD'
import { SkinPanel } from './skin'
import { screen, textStyle } from './theme'
import { Clusterer, dawnParts, edgePoint, packParts } from './threatMath'

/**
 * Night awareness (R6): what is happening where you are not looking.
 *
 * - Chevrons on the screen edge point at what is off screen: the boss, the
 *   hall under attack, tonight's fronts (from the warning), the horde on
 *   claimed ground at night (clustered, with a count), and a raided holding
 *   (day or night, in ember, with the building's picture).
 * - The dawn card: at `night:summary`, one glass card under the day block.
 *
 * Both live in the UI scene, in CSS pixels, under the HUD's glass. The
 * targets are gathered at REFRESH_HZ; the markers are only moved each frame
 * (the camera moves every frame), and nothing is allocated to do it.
 */

const POOL = 14
const REFRESH_HZ = 5
/** the horde's grid: walkers in one cell (or two neighbouring) are one chevron */
const CELL = 600
const HORDES = 4
const RAIDS = 4
/** under the HUD's glass (1_000_000 and up), over the world */
const DEPTH = 999_000
const CHEVRON = 'ui_chevron'
/** baked at twice its size, shown at half, so it is crisp on a dense screen */
const U = 2
/**
 * A target this close outside the view still shows (a roof, a walker's
 * shoulder), so it gets no chevron: world px.
 */
const SEEN_MARGIN = 64

const seen = (v: Phaser.Geom.Rectangle, x: number, y: number) =>
  x > v.x - SEEN_MARGIN && x < v.right + SEEN_MARGIN && y > v.y - SEEN_MARGIN && y < v.bottom + SEEN_MARGIN

type Kind = 'boss' | 'hall' | 'front' | 'horde' | 'raid'

interface Target { kind: Kind; x: number; y: number; tint: number; scale: number; n: number; icon: string }

interface Marker {
  arrow: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
  icon: Phaser.GameObjects.Image
  iconKey: string
}

function chevronTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(CHEVRON)) return
  // a pennant arrowhead, tip up, white for tinting (the old fx_marker's shape)
  bake(scene, CHEVRON, 24 * U, 24 * U, {
    body: x => fill(x, P.poly([[12 * U, 2 * U], [21 * U, 20 * U], [12 * U, 15 * U], [3 * U, 20 * U]]), 0xffffff),
    outline: 1.4 * U,
    grain: 0,
  })
}

export class ThreatChevrons {
  private marks: Marker[] = []
  private targets: Target[] = []
  private count = 0
  private refreshT = 0
  private hordes = new Clusterer(CELL, HORDES)
  private pt = { x: 0, y: 0 }
  private readonly gather: (e: Enemy) => void

  constructor(private ui: Phaser.Scene, private game: GameScene) {
    chevronTexture(ui)
    for (let i = 0; i < POOL; i++) {
      this.targets.push({ kind: 'front', x: 0, y: 0, tint: 0, scale: 1, n: 0, icon: '' })
      this.marks.push({
        arrow: ui.add.image(0, 0, CHEVRON).setScrollFactor(0).setDepth(DEPTH).setVisible(false),
        label: ui.add.text(0, 0, '', textStyle({ size: 11, weight: '800', colour: PAL.bone, stroke: 3 }))
          .setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH + 1).setVisible(false),
        icon: ui.add.image(0, 0, '__WHITE').setScrollFactor(0).setDepth(DEPTH + 1).setVisible(false),
        iconKey: '',
      })
    }
    // walkers on claimed ground that the camera cannot see (not camp guards, not camp buildings)
    this.gather = e => {
      if (e.def.structure || e.home) return
      const v = this.game.cameras.main.worldView
      if (seen(v, e.x, e.y) || !this.game.regions.claimedAt(e.x, e.y)) return
      this.hordes.add(e.x, e.y)
    }
  }

  private put(kind: Kind, x: number, y: number, tint: number, scale: number, n = 0, icon = '') {
    if (this.count >= POOL) return
    const t = this.targets[this.count++]
    t.kind = kind; t.x = x; t.y = y; t.tint = tint; t.scale = scale; t.n = n; t.icon = icon
  }

  /** What deserves a chevron now. Whether each is off screen is judged per frame. */
  private refresh() {
    const g = this.game
    this.count = 0
    const boss = g.enemies.bossRef
    if (boss?.alive) this.put('boss', boss.x, boss.y, PAL.danger, 1.35)
    const hall = g.buildings.townHall
    if (hall.damageT > 0) this.put('hall', hall.x, hall.y, PAL.gold, 1.2)

    const raids = g.buildings.raided(g.now)
    for (let i = 0; i < raids.length && i < RAIDS; i++) {
      const r = raids[i]
      const key = buildingTextureKey(r.key, 1)
      this.put('raid', r.x, r.y, PAL.ember, 1.1, 0, g.textures.exists(key) ? key : '')
    }

    // tonight's fronts, from the warning on (as before R6)
    for (const a of g.waves.nextApproaches()) this.put('front', a.x, a.y, PAL.danger, 0.85)

    if (g.waves.isNight) {
      this.hordes.begin()
      g.enemies.forEachAlive(this.gather)
      for (const c of this.hordes.finish()) this.put('horde', c.x, c.y, PAL.danger, 1, c.n)
    }
  }

  update(dt: number) {
    this.refreshT -= dt
    if (this.refreshT <= 0) {
      this.refreshT = 1 / REFRESH_HZ
      this.refresh()
    }

    const g = this.game
    const view = g.cameras.main.worldView
    const { w: W, h: H } = screen(this.ui)
    const sa = safeAreaInsets()
    const pad = W < 720 ? 24 : 32
    // clear of the day block along the top; the rest is the screen's edge
    const top = Math.max(pad + sa.top, Math.min(g.uiBands.top + 12, H * 0.3))
    const left = pad + sa.left, right = W - pad - sa.right, bottom = H - pad - sa.bottom
    const cx = W / 2, cy = H / 2
    const vcx = view.centerX, vcy = view.centerY
    const pulse = 0.78 + Math.sin(g.now * 0.006) * 0.17

    let i = 0
    for (let k = 0; k < this.count; k++) {
      const t = this.targets[k]
      if (seen(view, t.x, t.y)) continue
      const m = this.marks[i++]
      const ang = Math.atan2(t.y - vcy, t.x - vcx)
      const p = edgePoint(cx, cy, ang, left, top, right, bottom, this.pt)
      const s = t.scale
      m.arrow.setVisible(true).setPosition(p.x, p.y).setRotation(ang + Math.PI / 2)
        .setTint(t.tint).setScale(s / U)
        .setAlpha(t.kind === 'front' ? 0.6 : t.kind === 'horde' ? 0.9 : pulse)
      // what it is, a step in from the tip: a count for the horde, a picture for a raid
      const lx = p.x - Math.cos(ang) * 22 * s, ly = p.y - Math.sin(ang) * 22 * s
      if (t.kind === 'horde') {
        const txt = String(t.n)
        if (m.label.text !== txt) m.label.setText(txt)
        m.label.setVisible(true).setPosition(lx, ly)
      } else m.label.setVisible(false)
      if (t.icon) {
        if (m.iconKey !== t.icon) {
          m.iconKey = t.icon
          m.icon.setTexture(t.icon)
          const f = m.icon.frame
          m.icon.setScale(24 / Math.max(f.width, f.height, 1))
        }
        m.icon.setVisible(true).setPosition(lx, ly).setAlpha(pulse)
      } else m.icon.setVisible(false)
    }
    for (; i < POOL; i++) {
      const m = this.marks[i]
      if (!m.arrow.visible) break
      m.arrow.setVisible(false)
      m.label.setVisible(false)
      m.icon.setVisible(false)
    }
  }

  /** Harness: the chevrons showing now. */
  inspect() {
    const out: { kind: Kind; n: number; x: number; y: number; icon: string }[] = []
    const view = this.game.cameras.main.worldView
    for (let k = 0, i = 0; k < this.count; k++) {
      const t = this.targets[k]
      if (seen(view, t.x, t.y)) continue
      const m = this.marks[i++]
      if (!m) break
      out.push({ kind: t.kind, n: t.n, x: Math.round(m.arrow.x), y: Math.round(m.arrow.y), icon: t.icon })
    }
    return out
  }
}

/** How long the dawn card stays, fades included (s). */
const DAWN_SHOW = 6
const FADE_IN = 0.4
const FADE_OUT = 0.9
/** Below this width (CSS px) the minimap hides, and the card may span the screen. */
const NARROW = 520

/**
 * The dawn card (R6): a small glass card under the day/objective block for a
 * few seconds after a night, with the night's tally. It never takes input.
 */
export class DawnCard {
  private panel: SkinPanel
  private head: Phaser.GameObjects.Text
  private tail: Phaser.GameObjects.Text
  private t = 0
  private parts: [string[], string[]] = [[], []]
  /** the width the lines were last packed for: repacked only when it changes */
  private packedW = 0
  /** Harness: the lines last shown, as packed. */
  lines: string[] = []

  constructor(private ui: Phaser.Scene, private game: GameScene, private hud: HUD) {
    this.panel = new SkinPanel(ui, 'hud', { alpha: 0.5 }).setScrollFactor(0).setDepth(1_000_000).setVisible(false)
    this.head = ui.add.text(0, 0, '', textStyle({ size: 13, weight: '800', colour: PAL.bone, align: 'center' }))
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(1_000_005).setVisible(false).setLineSpacing(2)
    this.tail = ui.add.text(0, 0, '', textStyle({ size: 11, weight: '600', colour: PAL.uiDim, align: 'center' }))
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(1_000_005).setVisible(false).setLineSpacing(2)
    game.bus.on('night:summary', log => this.show(log))
  }

  show(log: NightLog) {
    this.parts = dawnParts(log)
    this.packedW = 0
    this.t = DAWN_SHOW
  }

  get showing() { return this.t > 0 }

  /** Each group on as few lines as fit, broken only between its parts. */
  private pack(maxW: number) {
    const fit = (t: Phaser.GameObjects.Text, parts: string[]) => {
      const out = packParts(parts, s => t.setText(s).width, maxW)
      t.setText(out.join('\n'))
      return out
    }
    this.lines = [...fit(this.head, this.parts[0]), ...fit(this.tail, this.parts[1])]
  }

  update(dt: number) {
    if (this.t <= 0) return
    // it waits out a pause (a modal covers it) rather than running out behind one
    if (!this.game.paused) this.t -= dt
    if (this.t <= 0) {
      this.panel.setVisible(false)
      this.head.setVisible(false)
      this.tail.setVisible(false)
      return
    }
    const age = DAWN_SHOW - this.t
    const a = Math.min(1, age / FADE_IN, this.t / FADE_OUT)
    const rise = (1 - Math.min(1, age / FADE_IN)) * 6
    const o = this.hud.objRect
    const { w: W } = screen(this.ui)
    let w: number, x: number, y: number
    if (W < NARROW && o.x + o.w / 2 < W / 2 - 1) {
      // a phone held upright: the day block is tucked under the vitals and
      // there is no minimap, so the card spans the screen below both columns
      w = Math.min(420, W - 24)
      x = (W - w) / 2
      y = Math.max(o.y + o.h, this.hud.rightBottom, this.game.uiBands.top - 8) + 6
    } else {
      // as wide as the day block, under it (and under the boss bar, if up)
      w = Math.max(160, Math.min(o.w || 320, W - 24))
      x = Math.max(12, Math.min(W - 12 - w, o.x + o.w / 2 - w / 2))
      y = Math.max(o.y + o.h + 6, this.game.uiBands.top - 2)
    }
    y -= rise
    if (w !== this.packedW) { this.packedW = w; this.pack(w - 20) }
    const two = this.parts[1].length > 0
    const h = 8 + this.head.height + (two ? 2 + this.tail.height : 0) + 8
    this.panel.setVisible(true).setAlpha(a).place(x, y, w, h)
    this.head.setVisible(true).setAlpha(a).setPosition(x + w / 2, y + 8)
    if (two) this.tail.setVisible(true).setAlpha(a).setPosition(x + w / 2, y + 10 + this.head.height)
    else this.tail.setVisible(false)
  }
}
