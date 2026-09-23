import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { HALL, REGIONS, WALL_RING, WORLD, type RegionDef } from '../config/world'
import { inPoly } from '../world/raster'
import { biomeColour } from '../world/Terrain'
import { clamp } from '../core/math'
import { IS_TOUCH, safeAreaInsets, wantsTouchTargets } from '../core/device'
import { mix } from '../art/ink'
import type { GameScene } from '../scenes/GameScene'
import { HERO_PLATE_H } from './HUD'
import { PlateButton, SkinPanel } from './skin'
import { screen } from './theme'

/** The chart's inks: it is drawn as a surveyor's map on the same paper as the world's fog. */
const CHART = {
  wild: mix(PAL.grassA, PAL.parchment, 0.5),
  held: mix(PAL.grassB, PAL.parchment, 0.38),
  uncharted: PAL.vellum,
  ink: 0x3a2616,
  wax: PAL.wax,
  lapis: 0x24508f,
  gilt: 0x94580e,
  moss: 0x3d6a24,
}
const OPEN_KEY = 'emberhold.minimap.v1'

/**
 * The map is baked at a fixed texture resolution and then *scaled* to whatever
 * the panel works out to be, so a window resize or an orientation flip never
 * re-bakes the world — it sets a display size and moves on.
 *
 * 10240/320 and 9216/288 are both 32, so the aspect is exact and nothing has
 * to be letterboxed. (S12 replaces this with a local window and the atlas.)
 */
const TEX_W = 320
const TEX_H = 288
/** World pixels per baked texel. */
const T = WORLD.width / TEX_W

/**
 * Fog grid. One cell is 8 texels wide, so a shroud block always lands on a
 * texel boundary and the unexplored edge reads as a deliberate stair rather
 * than a smear.
 */
const CELL = 8 * T
const COLS = Math.round(WORLD.width / CELL)
const ROWS = Math.round(WORLD.height / CELL)

/**
 * How much ground walking clears. Deliberately tighter than the world's own
 * fog brush (~480px): the minimap should never know more than the screen does.
 */
const REVEAL = 400
/** Known ground at the start — the hold, mirroring the world's opening reveal. */
const SEED = 960

/** Ceiling on re-bakes per second while the hero is walking into new ground. */
const COLD_HZ = 4
/** A slow sweep so a razed building or a dead camp can never linger. */
const COLD_HEARTBEAT = 1.5
/** Marker refresh. Well below 60Hz and still reads as live. */
const FAST_HZ = 9

/** Biggest the panel is ever allowed to get, and its share of a narrow screen. */
const MAX_W = 188
const SCREEN_SHARE = 0.34
/** Below this the panel is unreadable, so it hides rather than shrinking. */
const MIN_H = 56
/** Margin between the map and the frame around it: room for the gilt rule. */
const INSET = 7
/** Toggle chip: a full thumb target where one is wanted, tighter for a mouse. */
const CHIP_TALL = 44
const CHIP_SHORT = 30
const CHIP_W_TALL = 104
const CHIP_W_SHORT = 100

/**
 * A corner map of the settlement.
 *
 * Nothing here is drawn per frame. There are three surfaces, each rebuilt only
 * when its own inputs change:
 *
 * - `tray` is the lacquered frame, and the toggle is a plate button. Both are
 *   painted once into cached textures rather than drawn live, for a measured
 *   reason: a `fillRoundedRect` is a path Phaser re-triangulates on every frame
 *   it renders, and the four the old frame used cost 0.13ms — nine times
 *   everything else this class does. Painted, they cost one quad each.
 * - `cold` is the map itself: ground, territory, the rampart ring, structures,
 *   camps and the fog shroud. Re-baked at most COLD_HZ times a second, and only
 *   when something has actually changed.
 * - `unitG` is the handful of things that genuinely move — hero, camera box,
 *   enemy and crew density, the night's gates, claim rings — rebuilt at FAST_HZ
 *   out of flat rectangles, for the same reason as above.
 *
 * It deliberately does not show what you have not been to. Unexplored cells are
 * shrouded and every structure, pad and camp is culled against the same grid,
 * so the map cannot hand you the world on turn one — which is the whole point
 * of walking it.
 */
export class Minimap {
  private tray: SkinPanel
  private cold: Phaser.GameObjects.RenderTexture
  private unitG: Phaser.GameObjects.Graphics
  /** Off-list scratch surface; everything baked is drawn here first. */
  private scratch: Phaser.GameObjects.Graphics

  private chipBtn: PlateButton

  /** 1 where the hero has been, or where territory has been claimed. */
  private explored = new Uint8Array(COLS * ROWS)
  /** Scratch density buckets, reused every tick so the loop never allocates. */
  private hostiles = new Uint16Array(COLS * ROWS)
  private friends = new Uint16Array(COLS * ROWS)

  private open: boolean
  private roomy = true
  private coldDirty = true
  private coldT = 0
  private heartbeat = 0
  private fastT = 0
  private lastStampX = -99999
  private lastStampY = -99999

  private W = 0
  private H = 0
  private mapX = 0
  private mapY = 0
  private mapW = 0
  private mapH = 0
  private lastTop = -1
  private lastBottom = -1

  /** True while a modal owns the screen: the toggle goes dead, like the HUD's. */
  blocked = false

  constructor(private ui: Phaser.Scene, private game: GameScene) {
    this.open = !wantsTouchTargets(screen(ui).w)
    try {
      const saved = localStorage.getItem(OPEN_KEY)
      if (saved === '1' || saved === '0') this.open = saved === '1'
    } catch { /* private mode */ }

    // All of these sit below the floating joystick on purpose: a thumb dragging
    // over the panel should see its own stick, not have it hidden under a map.
    this.tray = new SkinPanel(ui, 'hud').setScrollFactor(0).setDepth(1_000_006)
    this.cold = ui.add.renderTexture(0, 0, TEX_W, TEX_H)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1_000_007)
    this.unitG = ui.add.graphics().setScrollFactor(0).setDepth(1_000_008)
    this.scratch = ui.make.graphics({}, false)

    this.chipBtn = new PlateButton(ui, {
      label: 'Map', icon: 'ico_map', keyHint: IS_TOUCH ? undefined : 'M', tone: 'quiet', size: 13,
      onClick: () => this.toggle(),
    }).setScrollFactor(0).setDepth(1_000_009)

    ui.input.keyboard?.on('keydown-M', () => this.toggle())

    // The world restores its explored fog before UI launches. Rebuild this
    // cheaper map from those marks so travel beyond the hold stays visible on
    // the minimap after a reload as well.
    this.reveal(HALL.x, HALL.y, SEED)
    this.restoreWorldExploration()
    for (const z of REGIONS) if (game.zones.isUnlocked(z.id)) this.revealZone(z)

    game.bus.on('zone:unlocked', () => {
      for (const z of REGIONS) if (game.zones.isUnlocked(z.id)) this.revealZone(z)
      this.coldDirty = true
    })
    game.bus.on('building:built', () => { this.coldDirty = true })
    game.bus.on('camp:destroyed', () => { this.coldDirty = true })

    this.layout()
    ui.scale.on('resize', () => this.layout())
  }

  toggle() {
    if (this.blocked || !this.roomy) return
    this.open = !this.open
    try { localStorage.setItem(OPEN_KEY, this.open ? '1' : '0') } catch { /* private mode */ }
    this.game.audio.play('ui')
    this.layout()
  }

  // ---- fog ---------------------------------------------------------------

  private cellIndex(x: number, y: number) {
    const c = clamp(Math.floor(x / CELL), 0, COLS - 1)
    const r = clamp(Math.floor(y / CELL), 0, ROWS - 1)
    return r * COLS + c
  }

  private exploredAt(x: number, y: number) {
    return this.explored[this.cellIndex(x, y)] !== 0
  }

  private reveal(x: number, y: number, radius: number) {
    const span = Math.ceil(radius / CELL)
    const cc = Math.floor(x / CELL)
    const cr = Math.floor(y / CELL)
    const r2 = radius * radius
    for (let r = Math.max(0, cr - span); r <= Math.min(ROWS - 1, cr + span); r++) {
      for (let c = Math.max(0, cc - span); c <= Math.min(COLS - 1, cc + span); c++) {
        const dx = (c + 0.5) * CELL - x
        const dy = (r + 0.5) * CELL - y
        if (dx * dx + dy * dy > r2) continue
        const i = r * COLS + c
        if (this.explored[i]) continue
        this.explored[i] = 1
        this.coldDirty = true
      }
    }
  }

  private restoreWorldExploration() {
    this.game.zones.forEachExplored((x, y) => this.reveal(x, y, REVEAL))
  }

  private revealZone(z: RegionDef) {
    const xs = z.poly.map(p => p[0]), ys = z.poly.map(p => p[1])
    const c0 = clamp(Math.floor(Math.min(...xs) / CELL), 0, COLS - 1)
    const c1 = clamp(Math.ceil(Math.max(...xs) / CELL) - 1, 0, COLS - 1)
    const r0 = clamp(Math.floor(Math.min(...ys) / CELL), 0, ROWS - 1)
    const r1 = clamp(Math.ceil(Math.max(...ys) / CELL) - 1, 0, ROWS - 1)
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!inPoly((c + 0.5) * CELL, (r + 0.5) * CELL, z.poly)) continue
        const i = r * COLS + c
        if (this.explored[i]) continue
        this.explored[i] = 1
        this.coldDirty = true
      }
    }
  }

  // ---- layout ------------------------------------------------------------

  private layout() {
    const view = screen(this.ui)
    this.W = view.w
    this.H = view.h
    const base = this.W < 720 ? 10 : 16
    const sa = safeAreaInsets()
    const padL = base + sa.left
    const padT = base + sa.top
    const touch = wantsTouchTargets(this.W)
    const bands = this.game.uiBands
    this.lastTop = bands.top
    this.lastBottom = bands.bottom

    // Two things have to be cleared. `uiBands.top` is the number the HUD
    // publishes, and it already covers the objective row — which on a phone
    // drops underneath both the health panel and the resources. It does not
    // cover the PAUSE and stance chips in the corner, so the taller of the two
    // wins: hero plate, a 6px gap, and a chip at its full thumb height.
    const stack = padT + HERO_PLATE_H + 6 + CHIP_TALL + 8
    const top = Math.max(bands.top, stack) + 6

    const chipH = touch ? CHIP_TALL : CHIP_SHORT
    const chipW = touch ? CHIP_W_TALL : CHIP_W_SHORT

    const mapY = top + chipH + 6 + INSET
    const availH = this.H - bands.bottom - 10 - INSET - mapY
    let w = Math.min(MAX_W, this.W * SCREEN_SHARE)
    let h = w * (WORLD.height / WORLD.width)
    if (h > availH) {
      h = availH
      w = h * (WORLD.width / WORLD.height)
    }
    this.roomy = h >= MIN_H
    this.mapX = padL + INSET
    this.mapY = mapY
    this.mapW = w
    this.mapH = h

    const show = this.open && this.roomy
    this.cold.setPosition(this.mapX, mapY).setDisplaySize(w, h).setVisible(show)
    this.unitG.setPosition(this.mapX, mapY).setVisible(show)

    // One rectangle decides both where the chip draws and where it answers, so
    // the two cannot drift — the failure this HUD has had before.
    this.chipBtn.place(padL + chipW / 2, top + chipH / 2, chipW, chipH)

    this.drawChrome()
    this.fastT = 0
    this.coldDirty = true
  }

  /**
   * The frame: a lacquered tray the chart sits in, and the chip's label. The
   * tray is a cached painted texture; nothing here draws per frame.
   */
  private drawChrome() {
    const show = this.open && this.roomy
    this.chipBtn.setVisible(this.roomy)
    this.tray.setVisible(show)
    if (!this.roomy) return
    if (show) this.tray.place(this.mapX - INSET, this.mapY - INSET, this.mapW + INSET * 2, this.mapH + INSET * 2)
    this.chipBtn.setLabel(this.open ? 'Map' : 'Map +')
  }

  // ---- the baked map -----------------------------------------------------

  private drawCold() {
    const g = this.scratch
    const gs = this.game
    g.clear()

    // wild ground everything sits on, washed in over the paper
    g.fillStyle(CHART.wild, 1)
    g.fillRect(0, 0, TEX_W, TEX_H)

    for (const z of REGIONS) {
      const pts = z.poly.map(([x, y]) => new Phaser.Math.Vector2(x / T, y / T))
      if (gs.zones.isUnlocked(z.id)) {
        g.fillStyle(CHART.held, 1)
        g.fillPoints(pts, true)
        g.lineStyle(1, CHART.lapis, 0.55)
      } else {
        // each region keeps its own cast, softened into the paper
        g.fillStyle(mix(biomeColour(z.biome), PAL.parchmentDark, 0.55), 0.9)
        g.fillPoints(pts, true)
        g.lineStyle(1, CHART.gilt, 0.5)
      }
      g.strokePoints(pts, true)
    }

    // the rampart ring, and the four gaps the horde funnels through
    const wr = WALL_RING
    g.lineStyle(1.5, CHART.ink, 0.75)
    g.strokeRect(wr.left / T, wr.top / T, (wr.right - wr.left) / T, (wr.bottom - wr.top) / T)
    g.fillStyle(CHART.wax, 0.9)
    for (const gate of wr.gates) g.fillRect(gate.x / T - 1.5, gate.y / T - 1.5, 3, 3)

    // structures — claimed territory only, and only where you have actually been
    for (const b of gs.buildings.buildings) {
      if (b.key === 'wall' || b.key === 'gate') continue
      if (!gs.zones.isUnlocked(b.region)) continue
      if (!this.exploredAt(b.x, b.y)) continue
      const x = b.x / T, y = b.y / T
      if (b.level > 0) {
        const colour = b.key === 'townHall' ? PAL.gilt
          : b.def.category === 'defense' ? CHART.lapis
            : b.def.category === 'military' ? PAL.lapis
              : CHART.moss
        const s = b.key === 'townHall' ? 7 : 4.5
        g.fillStyle(CHART.ink, 0.9)
        g.fillRect(x - s / 2 - 0.8, y - s / 2 - 0.8, s + 1.6, s + 1.6)
        g.fillStyle(colour, 1)
        g.fillRect(x - s / 2, y - s / 2, s, s)
      } else {
        // An empty pad: the promise of a building, drawn hollow. One the hall
        // has not earned yet reads colder, exactly as it does out in the world.
        const need = Math.max(b.requiresTownHall, b.def.requiresTownHall ?? 0)
        const gated = need > gs.buildings.townHallLevel
        g.lineStyle(1, gated ? CHART.ink : CHART.gilt, gated ? 0.3 : 0.7)
        g.strokeRect(x - 2, y - 2, 4, 4)
      }
    }

    for (const rec of gs.camps.camps) {
      if (!this.exploredAt(rec.spec.x, rec.spec.y)) continue
      const x = rec.spec.x / T, y = rec.spec.y / T
      const s = 4
      if (rec.destroyed) {
        g.lineStyle(1.2, CHART.ink, 0.6)
        g.lineBetween(x - s, y - s, x + s, y + s)
        g.lineBetween(x - s, y + s, x + s, y - s)
      } else {
        g.fillStyle(CHART.ink, 0.9)
        g.fillPoints([
          { x, y: y - s - 1 }, { x: x + s + 1, y }, { x, y: y + s + 1 }, { x: x - s - 1, y },
        ], true)
        g.fillStyle(CHART.wax, 1)
        g.fillPoints([
          { x, y: y - s }, { x: x + s, y }, { x, y: y + s }, { x: x - s, y },
        ], true)
      }
    }

    // ---- the shroud ------------------------------------------------------
    // Uncharted ground is blank vellum, the way it is out in the world: the
    // chart simply has not been drawn there yet. Merged into runs along each
    // row, so a map that is mostly unknown costs a couple of rectangles a row
    // rather than one per cell.
    g.fillStyle(CHART.uncharted, 1)
    for (let r = 0; r < ROWS; r++) {
      let c = 0
      while (c < COLS) {
        if (this.explored[r * COLS + c]) { c++; continue }
        let end = c
        while (end < COLS && !this.explored[r * COLS + end]) end++
        g.fillRect(c * 8, r * 8, (end - c) * 8, 8)
        c = end
      }
    }

    this.cold.clear()
    this.cold.draw([g])
  }

  // ---- the live layer ----------------------------------------------------

  private drawFast() {
    const g = this.unitG
    g.clear()
    if (!this.open || !this.roomy) return

    const gs = this.game
    const sx = this.mapW / WORLD.width
    const sy = this.mapH / WORLD.height

    // Claim rings sit on top of the shroud on purpose. The objective arrow
    // already flies you to this exact point, so naming it here is not a leak —
    // and it is the one thing the whole tycoon loop is asking you to walk to.
    // It is `claimPoint`, never the raw banner anchor: those two differ now, and
    // the anchor is not somewhere a hero can stand.
    for (const z of REGIONS) {
      if (gs.zones.isUnlocked(z.id)) continue
      if (gs.buildings.townHallLevel < z.hall) continue
      const c = gs.zones.claimPoint(z.id)
      if (!c) continue
      const ready = gs.zones.canUnlockId(z.id)
      const colour = ready ? CHART.moss : CHART.gilt
      g.lineStyle(1.5, colour, ready ? 1 : 0.75)
      g.strokeEllipse(c.x * sx, c.y * sy, 9, 9, 10)
      g.fillStyle(colour, ready ? 1 : 0.5)
      g.fillRect(c.x * sx - 1.4, c.y * sy - 1.4, 2.8, 2.8)
    }

    // ---- density blips ---------------------------------------------------
    // One mark per grid cell rather than one per body: at this scale a hundred
    // enemies fifty pixels apart are the same pixel anyway, and the count is
    // what actually tells you whether that is a patrol or the night arriving.
    this.hostiles.fill(0)
    gs.enemies.forEachAlive(e => {
      if (!this.exploredAt(e.x, e.y)) return
      this.hostiles[this.cellIndex(e.x, e.y)]++
    })
    this.friends.fill(0)
    for (const s of gs.army.soldiers) this.friends[this.cellIndex(s.x, s.y)]++
    for (const w of gs.workers.workers) this.friends[this.cellIndex(w.x, w.y)]++

    g.fillStyle(CHART.lapis, 0.85)
    this.blips(g, this.friends, sx, sy, 2, 2.6)
    g.fillStyle(0xc0301c, 0.95)
    this.blips(g, this.hostiles, sx, sy, 2.4, 4.4)

    // ---- where the night is coming from ----------------------------------
    if (gs.waves.phase !== 'day') {
      const pulse = 0.55 + Math.sin(gs.now * 0.006) * 0.35
      g.fillStyle(CHART.wax, pulse)
      for (const gate of gs.waves.nextGates()) {
        const x = gate.x * sx, y = gate.y * sy
        g.fillPoints([
          { x, y: y - 5 }, { x: x + 4.5, y: y + 4 }, { x: x - 4.5, y: y + 4 },
        ], true)
      }
    }

    // ---- what is on screen right now -------------------------------------
    const view = gs.cameras.main.worldView
    g.lineStyle(1, CHART.ink, 0.5)
    g.strokeRect(view.x * sx, view.y * sy, view.width * sx, view.height * sy)

    const p = gs.player
    if (p.alive) {
      g.fillStyle(PAL.bone, 1)
      g.fillRect(p.x * sx - 3.6, p.y * sy - 3.6, 7.2, 7.2)
      g.fillStyle(CHART.ink, 1)
      g.fillRect(p.x * sx - 2.8, p.y * sy - 2.8, 5.6, 5.6)
      g.fillStyle(PAL.lapis, 1)
      g.fillRect(p.x * sx - 2, p.y * sy - 2, 4, 4)
    }
  }

  /**
   * Squares, not circles, and that is not a style choice. Phaser keeps a
   * Graphics as a command list and re-walks it on every frame it renders; a
   * `fillCircle` is a 32-point path that gets triangulated on each of those
   * walks, and a hundred of them cost more than everything else this class
   * does put together. A `fillRect` is one batched quad.
   */
  private blips(
    g: Phaser.GameObjects.Graphics, buckets: Uint16Array,
    sx: number, sy: number, base: number, grow: number,
  ) {
    for (let i = 0; i < buckets.length; i++) {
      const n = buckets[i]
      if (n === 0) continue
      const c = i % COLS
      const r = (i - c) / COLS
      const s = base + Math.min(grow, n * 0.7)
      g.fillRect((c + 0.5) * CELL * sx - s / 2, (r + 0.5) * CELL * sy - s / 2, s, s)
    }
  }

  // ---- loop --------------------------------------------------------------

  update(dt: number) {
    const view = screen(this.ui)
    const bands = this.game.uiBands
    // The HUD moves its own bands about as resource rows are discovered and the
    // objective row comes and goes, so follow them rather than laying out once.
    if (view.w !== this.W || view.h !== this.H
      || bands.top !== this.lastTop || bands.bottom !== this.lastBottom) {
      this.layout()
    }

    this.chipBtn.setLive(!this.blocked && this.roomy)
    if (!this.roomy) return

    // Fog is tracked whether the panel is open or not, so folding the map away
    // never costs you the ground you walked while it was shut.
    const p = this.game.player
    if (p.alive) {
      const dx = p.x - this.lastStampX
      const dy = p.y - this.lastStampY
      if (dx * dx + dy * dy > (CELL * 0.5) * (CELL * 0.5)) {
        this.lastStampX = p.x
        this.lastStampY = p.y
        this.reveal(p.x, p.y, REVEAL)
      }
    }

    if (!this.open) return

    this.heartbeat -= dt
    if (this.heartbeat <= 0) {
      this.heartbeat = COLD_HEARTBEAT
      // Claimed ground is known ground however it got claimed — including the
      // silent unlocks a load or the debug panel performs, which never reach
      // the bus. Cells already set are skipped, so after the first pass this is
      // a read-only sweep.
      for (const z of REGIONS) if (this.game.zones.isUnlocked(z.id)) this.revealZone(z)
      this.coldDirty = true
    }
    this.coldT -= dt
    if (this.coldDirty && this.coldT <= 0) {
      this.coldT = 1 / COLD_HZ
      this.coldDirty = false
      this.drawCold()
    }

    this.fastT -= dt
    if (this.fastT <= 0) {
      this.fastT = 1 / FAST_HZ
      this.drawFast()
    }
  }

  destroy() {
    this.tray.destroy()
    this.cold.destroy()
    this.unitG.destroy()
    this.scratch.destroy()
  }
}
