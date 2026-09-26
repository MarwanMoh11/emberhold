import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { WAYSTONE } from '../config/balance'
import { CAMPS, POIS, REGIONS, WORLD, type RegionId } from '../config/world'
import { mix } from '../art/ink'
import { DPR, IS_TOUCH, safeAreaInsets, wantsTouchTargets } from '../core/device'
import type { GameScene } from '../scenes/GameScene'
import { FOG_KEY, FOG_SCALE } from '../systems/RegionManager'
import type { StoneInfo } from '../systems/Waystones'
import { ATLAS_KEY, ATLAS_SCALE } from '../world/AtlasBake'
import { polyCentroid } from '../world/raster'
import { AtlasView, pickStone, travelOrder, type ChartMemory } from './chart'
import { CHART, POI_GLYPH, drawCamp, drawOutpost, drawStone, poiState } from './chartMarks'
import { DOCK, PlateButton, SkinPanel } from './skin'
import { screen, textStyle, titleCase } from './theme'

/** Above the docked sheets, below the pause menu and its screens. */
const DEPTH = 1_080_000
/** Live marks (hero, bodies, routes) refresh this often while nothing moves the view. */
const LIVE_HZ = 6
/** A press that travels further than this is a drag, not a tap (CSS px). */
const DRAG_SLOP = 8
/** Seen cells (256 px) inside a region before the atlas names it: about a screen's worth. */
const EXPLORED_CELLS = 6
/** How long a refusal stays in the footer, s. */
const NOTE_S = 3

/**
 * The atlas (S12): the whole frontier on a parchment page, full screen.
 *
 * The page is the atlas bake (`atlas_bake`, the world at 1/16) under the
 * world's own fog page (`fog_live`), both uncropped images scaled by the
 * view; over them, in screen px, the borders and names of explored regions,
 * claim state, seen camps (burned ones crossed out), seen POIs, outposts and
 * waystones, tonight's routes, the walk to the quest target and the hero.
 *
 * Drag pans, pinch or the wheel zooms. Tapping a lit stone while the hero
 * stands on one travels there (`waystones.travel`); a controller cycles the
 * lit stones with the d-pad and travels with A. The game pauses while it is
 * open; `UIScene` opens it on `M`, the Map chip, a tap on the minimap, the
 * Travel chip and a controller's Back.
 */
export class Atlas {
  open = false
  readonly view = new AtlasView(WORLD.width, WORLD.height)
  private bg: Phaser.GameObjects.Rectangle
  private base: Phaser.GameObjects.Image
  private fog: Phaser.GameObjects.Image
  private marks: Phaser.GameObjects.Graphics
  private labels: Phaser.GameObjects.Text[]
  /** S14: names under seen landmarks and shrines */
  private poiLabels: { poi: (typeof POIS)[number]; text: Phaser.GameObjects.Text }[]
  private head: SkinPanel
  private foot: SkinPanel
  private title: Phaser.GameObjects.Text
  private note: Phaser.GameObjects.Text
  private closeBtn: PlateButton

  private headH = 52
  private footH = 34
  private first = true
  private dirty = true
  private liveT = 0
  private noteT = 0
  private why = ''
  /** the stone a controller has picked, by id */
  focus: string | null = null
  private explored = new Set<RegionId>()
  private pointers = new Map<number, { x: number; y: number; x0: number; y0: number }>()
  private dragged = false
  private pinchD = 0
  /** Harness: ms the last open took (layout and first draw). */
  openMs = 0

  constructor(
    private ui: Phaser.Scene,
    private gs: GameScene,
    private memory: ChartMemory,
    private onClose: () => void,
  ) {
    this.bg = ui.add.rectangle(0, 0, 10, 10, mix(PAL.parchmentDark, 0x3a2414, 0.25), 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH).setInteractive()
    this.base = ui.add.image(0, 0, ATLAS_KEY).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 1)
    this.fog = ui.add.image(0, 0, FOG_KEY).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH + 2).setAlpha(0.9)
    this.marks = ui.add.graphics().setScrollFactor(0).setDepth(DEPTH + 3)
    this.labels = REGIONS.map(r => ui.add.text(0, 0, r.name.toUpperCase(),
      textStyle({ voice: 'caps', size: 12, weight: '800', colour: CHART.ink, align: 'center' }))
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(DEPTH + 4).setStroke('#efe0bc', 3))
    this.poiLabels = POIS.filter(p => p.kind === 'landmark' || p.kind === 'shrine').map(poi => ({
      poi,
      text: ui.add.text(0, 0, titleCase(poi.name), textStyle({ size: 11, weight: 'italic 700', colour: CHART.ink, align: 'center' }))
        .setOrigin(0.5, 0).setScrollFactor(0).setDepth(DEPTH + 4).setStroke('#efe0bc', 3).setVisible(false),
    }))
    this.head = new SkinPanel(ui, 'hud', { alpha: 0.86 }).setScrollFactor(0).setDepth(DEPTH + 5)
    this.foot = new SkinPanel(ui, 'hud', { alpha: 0.86 }).setScrollFactor(0).setDepth(DEPTH + 5)
    this.title = ui.add.text(0, 0, 'THE FRONTIER', textStyle({ voice: 'caps', size: 16, weight: '800', colour: PAL.gold }))
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(DEPTH + 6)
    this.note = ui.add.text(0, 0, '', textStyle({ size: 13, weight: 'italic 600', colour: PAL.bone, align: 'center' }))
      .setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(DEPTH + 6)
    this.closeBtn = new PlateButton(ui, {
      label: 'Close', size: 'compact', tone: 'quiet', keyHint: IS_TOUCH ? undefined : 'M',
      onClick: () => this.close(),
    }).setScrollFactor(0).setDepth(DEPTH + 6)
    this.setShown(false)

    const inp = ui.input
    inp.on('pointerdown', this.onDown, this)
    inp.on('pointermove', this.onMove, this)
    inp.on('pointerup', this.onUp, this)
    inp.on('pointerupoutside', this.onUp, this)
    inp.on('wheel', this.onWheel, this)
    ui.scale.on('resize', () => { if (this.open) this.layout() })
    ui.events.once('shutdown', () => {
      inp.off('pointerdown', this.onDown, this)
      inp.off('pointermove', this.onMove, this)
      inp.off('pointerup', this.onUp, this)
      inp.off('pointerupoutside', this.onUp, this)
      inp.off('wheel', this.onWheel, this)
    })
  }

  private setShown(v: boolean) {
    for (const o of [this.bg, this.base, this.fog, this.marks, this.title, this.note, ...this.labels]) o.setVisible(v)
    if (!v) for (const l of this.poiLabels) l.text.setVisible(false)
    this.head.setVisible(v)
    this.foot.setVisible(v)
    this.closeBtn.setVisible(v)
  }

  show() {
    const t0 = performance.now()
    this.open = true
    this.pointers.clear()
    this.why = ''
    this.setShown(true)
    this.layout()
    const hero = this.gs.player
    // on a stone, a controller starts on the first place it can go
    const ws = this.gs.waystones
    const order = this.order()
    this.focus = ws.here && order.length ? order[0].id : null
    if (this.first) {
      this.first = false
      this.view.z = Math.max(this.view.zMin, Math.min(this.view.zMax, this.view.vp.w / 7000))
    }
    this.view.centre(hero.x, hero.y)
    this.refreshExplored()
    this.draw()
    this.openMs = performance.now() - t0
  }

  hide() {
    if (!this.open) return
    this.open = false
    this.pointers.clear()
    this.setShown(false)
  }

  /** Close and hand the game back (UIScene resumes it). */
  close() {
    if (!this.open) return
    this.hide()
    this.gs.audio.play('ui')
    this.onClose()
  }

  private layout() {
    const { w: W, h: H } = screen(this.ui)
    const sa = safeAreaInsets()
    const touch = wantsTouchTargets(W)
    this.headH = (touch ? 56 : 48) + sa.top
    this.footH = 34 + sa.bottom
    this.bg.setSize(W, H)
    if (this.bg.input) this.bg.input.hitArea.setTo(0, 0, W, H)
    this.head.place(-10, -10, W + 20, this.headH + 10)
    this.foot.place(-10, H - this.footH, W + 20, this.footH + 10)
    this.title.setPosition(DOCK.gutter + sa.left, sa.top + (this.headH - sa.top) / 2)
    const bh = this.closeBtn.compactH
    this.closeBtn.place(W - DOCK.gutter - sa.right - 55, sa.top + (this.headH - sa.top) / 2, 110, bh)
    this.note.setPosition(W / 2, H - this.footH + 17).setWordWrapWidth(W - 32)
    this.view.resize(0, this.headH, W, H - this.headH - this.footH, this.first)
    this.dirty = true
  }

  // ---- stones --------------------------------------------------------------

  /** Standing stones the chart shows: lit ones, and dark ones in seen ground. */
  private stones(): StoneInfo[] {
    return this.gs.waystones.list().filter(s => s.active || this.memory.seenAt(s.x, s.y))
  }

  /** What a controller cycles: from a stone, the lit ones (Hall first, then nearest); else every lit stone. */
  private order(): StoneInfo[] {
    const ws = this.gs.waystones
    const list = ws.list()
    const here = ws.here ? list.find(s => s.id === ws.here) ?? null : null
    return here ? travelOrder(list, here, WAYSTONE.hallStone) : list.filter(s => s.active)
  }

  /** Controller: step the focus through `order()` and bring it into view. */
  cycle(dir: 1 | -1) {
    const order = this.order()
    if (!order.length) { this.say('Light other waystones to travel'); return }
    const i = order.findIndex(s => s.id === this.focus)
    const next = order[(i + dir + order.length) % order.length]
    this.focus = next.id
    this.view.centre(next.x, next.y)
    this.gs.audio.play('ui', 0.6)
    this.dirty = true
  }

  /** Controller A: travel to the focused stone. */
  confirm() {
    if (this.focus) this.travelTo(this.focus)
  }

  /** Ask to travel to stone `id`; closes the atlas when the channel starts. */
  travelTo(id: string): boolean {
    const ws = this.gs.waystones
    if (!ws.here) { this.say('Stand on a lit waystone to travel'); return false }
    if (id === ws.here) { this.say('You are standing on it'); return false }
    if (!ws.travel(id)) { this.say(ws.lastWhy || 'Cannot travel there now'); return false }
    this.close()
    return true
  }

  private say(why: string) {
    this.why = why
    this.noteT = NOTE_S
    this.gs.audio.play('deny', 1, 0.4)
  }

  // ---- input ---------------------------------------------------------------

  private css(p: Phaser.Input.Pointer): [number, number] { return [p.x / DPR, p.y / DPR] }

  private inMap(y: number) { return y > this.headH && y < screen(this.ui).h - this.footH }

  private onDown(p: Phaser.Input.Pointer) {
    if (!this.open) return
    const [x, y] = this.css(p)
    if (!this.inMap(y)) return
    this.pointers.set(p.id, { x, y, x0: x, y0: y })
    if (this.pointers.size === 1) this.dragged = false
    if (this.pointers.size === 2) { this.pinchD = this.spread(); this.dragged = true }
  }

  private spread() {
    const [a, b] = [...this.pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y) || 1
  }

  private onMove(p: Phaser.Input.Pointer) {
    const q = this.pointers.get(p.id)
    if (!this.open || !q) return
    const [x, y] = this.css(p)
    const dx = x - q.x, dy = y - q.y
    q.x = x; q.y = y
    if (this.pointers.size >= 2) {
      // pinch: zoom about the midpoint, and pan by half this finger's move
      const d = this.spread()
      const [a, b] = [...this.pointers.values()]
      this.view.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / this.pinchD)
      this.view.pan(dx / 2, dy / 2)
      this.pinchD = d
      this.dirty = true
      return
    }
    if (!this.dragged && Math.hypot(x - q.x0, y - q.y0) < DRAG_SLOP) return
    this.dragged = true
    this.view.pan(dx, dy)
    this.dirty = true
  }

  private onUp(p: Phaser.Input.Pointer) {
    const q = this.pointers.get(p.id)
    if (!q) return
    this.pointers.delete(p.id)
    if (!this.open || this.dragged || this.pointers.size) return
    this.tap(q.x, q.y)
  }

  private onWheel(p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) {
    if (!this.open) return
    const [x, y] = this.css(p)
    this.view.zoomAt(x, y, Math.exp(-dy * 0.0015))
    this.dirty = true
  }

  /** A tap or click at CSS (x, y): travel if it lands on a stone. */
  tap(x: number, y: number) {
    const s = pickStone(this.stones(), this.view, x, y, wantsTouchTargets(screen(this.ui).w) ? 30 : 20)
    if (!s) return
    this.focus = s.id
    this.dirty = true
    if (!s.active) { this.say(`${s.name} is dark: walk to it once to light it`); return }
    this.travelTo(s.id)
  }

  // ---- drawing ---------------------------------------------------------------

  private refreshExplored() {
    for (const r of REGIONS) {
      if (this.explored.has(r.id)) continue
      if (this.gs.regions.claimed(r.id) || this.memory.anySeenIn(r.poly, EXPLORED_CELLS)) this.explored.add(r.id)
    }
  }

  private draw() {
    const g = this.marks
    const gs = this.gs
    const v = this.view
    const z = v.z
    g.clear()

    this.base.setScale(z * ATLAS_SCALE).setPosition(v.ox, v.oy)
    if (this.fog.texture !== gs.textures.get(FOG_KEY)) this.fog.setTexture(FOG_KEY)
    this.fog.setScale(z * FOG_SCALE).setPosition(v.ox, v.oy)

    // explored regions: borders (lapis when held, gilt when not) and names
    REGIONS.forEach((r, i) => {
      const label = this.labels[i]
      if (!this.explored.has(r.id)) { label.setVisible(false); return }
      const held = gs.regions.claimed(r.id)
      g.lineStyle(held ? 2 : 1.5, held ? CHART.lapis : CHART.gilt, held ? 0.85 : 0.7)
      g.strokePoints(r.poly.map(([x, y]) => ({ x: v.ox + x * z, y: v.oy + y * z })), true)
      const [cx, cy] = polyCentroid(r.poly)
      label.setVisible(true).setPosition(v.ox + cx * z, v.oy + cy * z)
        .setColor(held ? '#1d3f73' : '#5c3a10').setAlpha(held ? 1 : 0.85)
    })
    // claimable next: the stone where the banner goes
    for (const r of REGIONS) {
      if (gs.regions.claimed(r.id) || !this.explored.has(r.id) || gs.buildings.townHallLevel < r.hall) continue
      const c = gs.regions.claimPoint(r.id)
      if (!c) continue
      const ready = gs.regions.canClaim(r.id).ok
      g.lineStyle(2, ready ? CHART.moss : CHART.gilt, ready ? 1 : 0.7)
      g.strokeCircle(v.ox + c.x * z, v.oy + c.y * z, 7)
    }

    const s = Math.min(8, Math.max(4, 3 + z * 40))
    for (const spec of CAMPS) {
      const burned = gs.camps.isBurned(spec.id)
      if (!burned && !this.memory.seenAt(spec.x, spec.y)) continue
      drawCamp(g, v.ox + spec.x * z, v.oy + spec.y * z, s, burned, spec.tier !== 'warcamp')
    }
    for (const poi of POIS) {
      if (poi.kind === 'waystone') continue
      const st = poiState(gs, this.memory, poi)
      if (st === 'unseen') continue
      POI_GLYPH[poi.kind](g, v.ox + poi.x * z, v.oy + poi.y * z, st === 'done' ? s * 0.55 : s * 0.8)
    }
    for (const { poi, text } of this.poiLabels) {
      const seen = poiState(gs, this.memory, poi) !== 'unseen'
      text.setVisible(seen)
      if (seen) text.setPosition(v.ox + poi.x * z, v.oy + poi.y * z + s + 2)
    }
    for (const b of gs.buildings.outposts()) drawOutpost(g, v.ox + b.x * z, v.oy + b.y * z, s * 0.8)
    const ws = gs.waystones
    for (const st of this.stones()) {
      drawStone(g, v.ox + st.x * z, v.oy + st.y * z, s * 0.85, st.active, ws.here === st.id, this.focus === st.id)
    }
    this.drawLive(g)
    this.dirty = false
  }

  /** The things that move: routes, the quest walk, the hero. */
  private drawLive(g: Phaser.GameObjects.Graphics) {
    const gs = this.gs
    const v = this.view
    const z = v.z
    if (gs.waves.phase !== 'day') {
      g.fillStyle(PAL.ember, 0.95)
      const step = Math.max(1, Math.round(7 / (z * 32)))
      for (const t of gs.waves.tonight) {
        for (let i = 0; i < t.route.length; i += step) g.fillRect(v.ox + t.route[i][0] * z - 1.5, v.oy + t.route[i][1] * z - 1.5, 3, 3)
      }
      g.fillStyle(CHART.wax, 1)
      for (const m of gs.waves.nextApproaches()) {
        const x = v.ox + m.x * z, y = v.oy + m.y * z
        g.fillTriangle(x, y - 7, x + 6, y + 5, x - 6, y + 5)
      }
    }
    const q = gs.quests.view()
    if (q && q.targetX !== undefined && q.targetY !== undefined) {
      const r = gs.questRoute
      g.fillStyle(PAL.gold, 0.95)
      if (r) {
        const step = Math.max(1, Math.round(9 / Math.max(1e-6, z * 64)))
        for (let i = 0; i < r.length; i += step) g.fillRect(v.ox + r[i][0] * z - 1.2, v.oy + r[i][1] * z - 1.2, 2.4, 2.4)
      }
      const x = v.ox + q.targetX * z, y = v.oy + q.targetY * z
      g.lineStyle(2, CHART.ink, 1).strokeCircle(x, y, 6)
      g.fillCircle(x, y, 4)
    }
    const p = gs.player
    const hx = v.ox + p.x * z, hy = v.oy + p.y * z
    g.fillStyle(PAL.bone, 1).fillRect(hx - 5, hy - 5, 10, 10)
    g.fillStyle(CHART.ink, 1).fillRect(hx - 4, hy - 4, 8, 8)
    g.fillStyle(p.alive ? PAL.lapis : PAL.danger, 1).fillRect(hx - 2.8, hy - 2.8, 5.6, 5.6)
  }

  update(dt: number) {
    if (!this.open) return
    // the game is paused under the atlas: keep the bake going so it fills in
    this.gs.atlasBake.update(dt)
    this.liveT -= dt
    if (this.liveT <= 0) { this.liveT = 1 / LIVE_HZ; this.dirty = true }
    if (this.dirty) this.draw()
    this.noteT = Math.max(0, this.noteT - dt)
    const ws = this.gs.waystones
    const hint = this.noteT > 0 ? this.why
      : ws.here ? (IS_TOUCH ? 'Tap a lit stone to travel  ·  drag to pan, pinch to zoom' : 'Click a lit stone to travel  ·  drag to pan, wheel to zoom')
        : 'Stand on a lit waystone to travel  ·  drag to pan, pinch or wheel to zoom'
    if (this.note.text !== hint) this.note.setText(hint)
  }

  /** Harness: the view, what is shown, and each standing stone's screen point. */
  inspect() {
    const v = this.view
    return {
      open: this.open, openMs: Math.round(this.openMs * 10) / 10,
      z: Math.round(v.z * 1e4) / 1e4, zMin: Math.round(v.zMin * 1e4) / 1e4, vp: v.vp,
      explored: [...this.explored], focus: this.focus, note: this.note.text,
      pois: POIS.filter(p => poiState(this.gs, this.memory, p) !== 'unseen').length,
      named: this.poiLabels.filter(l => l.text.visible).map(l => l.poi.id),
      stones: this.stones().map(s => {
        const [x, y] = v.toScreen(s.x, s.y)
        return { id: s.id, lit: s.active, x: Math.round(x), y: Math.round(y) }
      }),
    }
  }
}

/**
 * The Travel chip (S12, replacing S11's list): while the hero stands on a lit
 * stone, a plate at the bottom of the view opens the atlas; during the
 * channel it shows the progress.
 */
export class TravelChip {
  private btn: PlateButton
  private shown = false

  constructor(private ui: Phaser.Scene, private gs: GameScene, onOpen: () => void) {
    this.btn = new PlateButton(ui, { label: 'Travel', size: 'compact', tone: 'primary', icon: 'ico_map', keyHint: IS_TOUCH ? undefined : 'M', onClick: onOpen })
      .setScrollFactor(0).setDepth(DOCK.depth - 1)
    this.btn.setVisible(false)
  }

  update(blocked: boolean) {
    const ws = this.gs.waystones
    const show = !blocked && !!ws?.here && this.gs.player.alive
    if (!show) { if (this.shown) { this.shown = false; this.btn.setVisible(false) } return }
    const { w: W, h: H } = screen(this.ui)
    const bands = this.gs.uiBands
    const dock = bands.dock
    const floor = dock && dock.side === 'bottom' ? dock.y - 8 : H - bands.bottom - 8
    const h = this.btn.compactH
    this.btn.setLabel(ws.channel ? `Travelling… ${Math.round(ws.progress * 100)}%` : 'Travel')
    this.btn.setEnabled(!ws.channel)
    this.btn.place(W / 2, floor - h / 2, 180, h)
    if (!this.shown) { this.shown = true; this.btn.setVisible(true) }
  }

  get isShown() { return this.shown }
}
