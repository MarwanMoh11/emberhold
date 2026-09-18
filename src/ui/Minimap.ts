import Phaser from 'phaser'
import { PAL, CSS } from '../config/palette'
import { WORLD } from '../config/balance'
import { ZONES, WALL_RING, type ZoneSpec } from '../config/map'
import { clamp } from '../core/math'
import { safeAreaInsets, wantsTouchTargets } from '../core/device'
import type { GameScene } from '../scenes/GameScene'

const FONT = 'Verdana, Geneva, sans-serif'
const OPEN_KEY = 'emberhold.minimap.v1'

/**
 * The map is baked at a fixed texture resolution and then *scaled* to whatever
 * the panel works out to be, so a window resize or an orientation flip never
 * re-bakes the world — it sets a display size and moves on.
 *
 * 3400/272 and 2800/224 are both 12.5, so the aspect is exact and nothing has
 * to be letterboxed.
 */
const TEX_W = 272
const TEX_H = 224
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
/** Margin between the map and the frame around it. */
const INSET = 4
/** Toggle chip: a full thumb target where one is wanted, tighter for a mouse. */
const CHIP_TALL = 44
const CHIP_SHORT = 30
const CHIP_W_TALL = 86
const CHIP_W_SHORT = 68

/**
 * The frame texture is allocated once at the largest it could ever need to be
 * and never resized. `RenderTexture.resize()` leaves the thing looking healthy —
 * right size, right position — while quietly swallowing every `draw()` after
 * it, so anything that has to change size gets a fixed texture and unused
 * transparent margin instead.
 */
const CHROME_W = MAX_W + INSET * 2
const CHROME_H = CHIP_TALL + 6 + Math.ceil(MAX_W * (WORLD.height / WORLD.width)) + INSET * 2

/**
 * A corner map of the settlement.
 *
 * Nothing here is drawn per frame. There are three surfaces, each rebuilt only
 * when its own inputs change:
 *
 * - `chrome` is the panel frame and the toggle chip, baked on layout, hover and
 *   toggle. It is a RenderTexture rather than a live Graphics for a measured
 *   reason: a `fillRoundedRect` is a path Phaser re-triangulates on every frame
 *   it renders, and the four of them here cost 0.13ms — nine times everything
 *   else this class does. Baked, they cost one quad.
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
  private chrome: Phaser.GameObjects.RenderTexture
  private cold: Phaser.GameObjects.RenderTexture
  private unitG: Phaser.GameObjects.Graphics
  /** Off-list scratch surface; everything baked is drawn here first. */
  private scratch: Phaser.GameObjects.Graphics

  private chipLabel: Phaser.GameObjects.Text
  private chipKey: Phaser.GameObjects.Text
  private chipZone: Phaser.GameObjects.Zone
  private chip = { x: 0, y: 0, w: 0, h: 0, hover: false }

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
    this.open = !wantsTouchTargets(ui.cameras.main.width)
    try {
      const saved = localStorage.getItem(OPEN_KEY)
      if (saved === '1' || saved === '0') this.open = saved === '1'
    } catch { /* private mode */ }

    // All of these sit below the floating joystick on purpose: a thumb dragging
    // over the panel should see its own stick, not have it hidden under a map.
    this.chrome = ui.add.renderTexture(0, 0, CHROME_W, CHROME_H)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1_000_006)
    this.cold = ui.add.renderTexture(0, 0, TEX_W, TEX_H)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(1_000_007)
    this.unitG = ui.add.graphics().setScrollFactor(0).setDepth(1_000_008)
    this.scratch = ui.make.graphics({}, false)

    this.chipLabel = ui.add.text(0, 0, 'MAP', {
      fontFamily: FONT, fontSize: '11px', color: CSS(PAL.uiText), fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1_000_009)
    this.chipKey = ui.add.text(0, 0, 'M', {
      fontFamily: FONT, fontSize: '9px', color: CSS(PAL.uiDim),
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1_000_009)

    this.chipZone = ui.add.zone(0, 0, 10, 10).setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
    this.chipZone.on('pointerover', () => { this.chip.hover = true; this.drawChrome() })
    this.chipZone.on('pointerout', () => { this.chip.hover = false; this.drawChrome() })
    this.chipZone.on('pointerdown', () => this.toggle())

    ui.input.keyboard?.on('keydown-M', () => this.toggle())

    // Claimed ground counts as known ground, which also keeps a loaded save
    // honest: the world's fog is not persisted, so both start from the hold.
    this.reveal(WORLD.centerX, WORLD.centerY, SEED)
    for (const z of ZONES) if (game.zones.isUnlocked(z.id)) this.revealZone(z)

    game.bus.on('zone:unlocked', () => {
      for (const z of ZONES) if (game.zones.isUnlocked(z.id)) this.revealZone(z)
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

  private revealZone(z: ZoneSpec) {
    const c0 = clamp(Math.floor(z.x / CELL), 0, COLS - 1)
    const c1 = clamp(Math.ceil((z.x + z.w) / CELL) - 1, 0, COLS - 1)
    const r0 = clamp(Math.floor(z.y / CELL), 0, ROWS - 1)
    const r1 = clamp(Math.ceil((z.y + z.h) / CELL) - 1, 0, ROWS - 1)
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c
        if (this.explored[i]) continue
        this.explored[i] = 1
        this.coldDirty = true
      }
    }
  }

  // ---- layout ------------------------------------------------------------

  private layout() {
    const cam = this.ui.cameras.main
    this.W = cam.width
    this.H = cam.height
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
    // wins: health panel (46), a 6px gap, and a chip at its full thumb height.
    const stack = padT + 46 + 6 + CHIP_TALL + 8
    const top = Math.max(bands.top, stack) + 6

    const chipH = touch ? CHIP_TALL : CHIP_SHORT
    const chipW = touch ? CHIP_W_TALL : CHIP_W_SHORT
    this.chip.x = padL
    this.chip.y = top
    this.chip.w = chipW
    this.chip.h = chipH

    const mapY = top + chipH + 6
    const availH = this.H - bands.bottom - 10 - mapY
    let w = Math.min(MAX_W, this.W * SCREEN_SHARE)
    let h = w * (WORLD.height / WORLD.width)
    if (h > availH) {
      h = availH
      w = h * (WORLD.width / WORLD.height)
    }
    this.roomy = h >= MIN_H
    this.mapX = padL
    this.mapY = mapY
    this.mapW = w
    this.mapH = h

    const show = this.open && this.roomy
    this.cold.setPosition(this.mapX, mapY).setDisplaySize(w, h).setVisible(show)
    this.unitG.setPosition(this.mapX, mapY).setVisible(show)

    // One rectangle decides both where the chip draws and where it answers, so
    // the two cannot drift — the failure this HUD has had before.
    this.chipZone.setPosition(padL + chipW / 2, top + chipH / 2).setSize(chipW, chipH)
    this.chipLabel.setPosition(padL + chipW / 2, top + chipH / 2 - (touch ? 6 : 4))
      .setVisible(this.roomy)
    this.chipKey.setPosition(padL + chipW / 2, top + chipH - (touch ? 11 : 9))
      .setVisible(this.roomy)

    this.drawChrome()
    this.fastT = 0
    this.coldDirty = true
  }

  /**
   * The frame: the chip's rounded box and, when the map is open, the tray it
   * sits in. Baked once per layout rather than drawn live — see the note on the
   * class. The map is laid over the tray's middle, so the border only ever has
   * to live in the INSET margin around it.
   */
  private drawChrome() {
    const c = this.chip
    const show = this.open && this.roomy
    const ox = c.x - INSET
    const oy = c.y - INSET

    this.chrome.setVisible(this.roomy).setPosition(ox, oy)
    if (!this.roomy) return

    const g = this.scratch
    g.clear()
    g.fillStyle(PAL.uiBg, c.hover ? 0.95 : 0.8)
    g.fillRoundedRect(INSET, INSET, c.w, c.h, 8)
    g.lineStyle(1.5, this.open ? PAL.heroTrim : PAL.uiEdge, c.hover ? 1 : 0.9)
    g.strokeRoundedRect(INSET, INSET, c.w, c.h, 8)

    if (show) {
      const ty = this.mapY - INSET - oy
      g.fillStyle(PAL.uiBg, 0.8)
      g.fillRoundedRect(0, ty, this.mapW + INSET * 2, this.mapH + INSET * 2, 6)
      g.lineStyle(1.5, PAL.uiEdge, 0.9)
      g.strokeRoundedRect(1, ty + 1, this.mapW + INSET * 2 - 2, this.mapH + INSET * 2 - 2, 6)
    }

    this.chrome.clear()
    this.chrome.draw([g])

    this.chipLabel.setText(this.open ? 'MAP' : 'MAP +')
      .setColor(CSS(this.open ? PAL.heroTrim : PAL.uiText))
  }

  // ---- the baked map -----------------------------------------------------

  private drawCold() {
    const g = this.scratch
    const gs = this.game
    g.clear()

    // wild ground everything sits on
    g.fillStyle(PAL.grassC, 0.55)
    g.fillRect(0, 0, TEX_W, TEX_H)

    for (const z of ZONES) {
      const x = z.x / T, y = z.y / T, w = z.w / T, h = z.h / T
      if (gs.zones.isUnlocked(z.id)) {
        g.fillStyle(PAL.grassB, 0.9)
        g.fillRect(x, y, w, h)
        g.lineStyle(1, PAL.heroTrim, 0.4)
      } else {
        g.fillStyle(z.tint, 0.85)
        g.fillRect(x, y, w, h)
        g.lineStyle(1, PAL.gold, 0.35)
      }
      g.strokeRect(x, y, w, h)
    }

    // the rampart ring, and the four gaps the horde funnels through
    const wr = WALL_RING
    g.lineStyle(1.5, PAL.stoneLight, 0.8)
    g.strokeRect(wr.left / T, wr.top / T, (wr.right - wr.left) / T, (wr.bottom - wr.top) / T)
    g.fillStyle(PAL.gold, 0.8)
    for (const gate of wr.gates) g.fillRect(gate.x / T - 1.5, gate.y / T - 1.5, 3, 3)

    // structures — claimed territory only, and only where you have actually been
    for (const b of gs.buildings.buildings) {
      if (b.key === 'wall' || b.key === 'gate') continue
      if (!gs.zones.isUnlocked(b.zone)) continue
      if (!this.exploredAt(b.x, b.y)) continue
      const x = b.x / T, y = b.y / T
      if (b.level > 0) {
        const colour = b.key === 'townHall' ? PAL.gold
          : b.def.category === 'defense' ? PAL.heroTrim
            : b.def.category === 'military' ? PAL.allyBody
              : PAL.allyAlt
        const s = b.key === 'townHall' ? 7 : 4.5
        g.fillStyle(colour, 0.95)
        g.fillRect(x - s / 2, y - s / 2, s, s)
      } else {
        // An empty pad: the promise of a building, drawn hollow. One the hall
        // has not earned yet reads colder, exactly as it does out in the world.
        const need = Math.max(b.requiresTownHall, b.def.requiresTownHall ?? 0)
        const gated = need > gs.buildings.townHallLevel
        g.lineStyle(1, gated ? PAL.uiDim : PAL.gold, gated ? 0.4 : 0.55)
        g.strokeRect(x - 2, y - 2, 4, 4)
      }
    }

    for (const rec of gs.camps.camps) {
      if (!this.exploredAt(rec.spec.x, rec.spec.y)) continue
      const x = rec.spec.x / T, y = rec.spec.y / T
      const s = 4
      if (rec.destroyed) {
        g.lineStyle(1, PAL.uiDim, 0.55)
        g.lineBetween(x - s, y - s, x + s, y + s)
        g.lineBetween(x - s, y + s, x + s, y - s)
      } else {
        g.fillStyle(PAL.enemyBody, 0.95)
        g.fillPoints([
          { x, y: y - s }, { x: x + s, y }, { x, y: y + s }, { x: x - s, y },
        ], true)
      }
    }

    // ---- the shroud ------------------------------------------------------
    // Merged into runs along each row, so a map that is mostly unknown costs a
    // couple of rectangles a row rather than one per cell.
    g.fillStyle(PAL.uiBg, 0.94)
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
    for (const z of ZONES) {
      if (gs.zones.isUnlocked(z.id)) continue
      if (gs.buildings.townHallLevel < z.requiresTownHall) continue
      const c = gs.zones.claimPoint(z.id)
      if (!c) continue
      const ready = gs.zones.canUnlockId(z.id)
      const colour = ready ? PAL.good : PAL.gold
      g.lineStyle(1.5, colour, ready ? 1 : 0.6)
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

    g.fillStyle(PAL.heroTrim, 0.75)
    this.blips(g, this.friends, sx, sy, 2, 2.6)
    g.fillStyle(PAL.danger, 0.9)
    this.blips(g, this.hostiles, sx, sy, 2.4, 4.4)

    // ---- where the night is coming from ----------------------------------
    if (gs.waves.phase !== 'day') {
      const pulse = 0.55 + Math.sin(gs.now * 0.006) * 0.35
      g.fillStyle(PAL.danger, pulse)
      for (const gate of gs.waves.nextGates()) {
        const x = gate.x * sx, y = gate.y * sy
        g.fillPoints([
          { x, y: y - 5 }, { x: x + 4.5, y: y + 4 }, { x: x - 4.5, y: y + 4 },
        ], true)
      }
    }

    // ---- what is on screen right now -------------------------------------
    const view = gs.cameras.main.worldView
    g.lineStyle(1, PAL.uiText, 0.45)
    g.strokeRect(view.x * sx, view.y * sy, view.width * sx, view.height * sy)

    const p = gs.player
    if (p.alive) {
      g.fillStyle(0x05070c, 0.85)
      g.fillRect(p.x * sx - 3.2, p.y * sy - 3.2, 6.4, 6.4)
      g.fillStyle(PAL.heroTrim, 1)
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
    const cam = this.ui.cameras.main
    const bands = this.game.uiBands
    // The HUD moves its own bands about as resource rows are discovered and the
    // objective row comes and goes, so follow them rather than laying out once.
    if (cam.width !== this.W || cam.height !== this.H
      || bands.top !== this.lastTop || bands.bottom !== this.lastBottom) {
      this.layout()
    }

    const live = !this.blocked && this.roomy
    this.chipZone.setSize(live ? this.chip.w : 1, live ? this.chip.h : 1)
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
      for (const z of ZONES) if (this.game.zones.isUnlocked(z.id)) this.revealZone(z)
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
    this.chrome.destroy()
    this.cold.destroy()
    this.unitG.destroy()
    this.scratch.destroy()
    this.chipLabel.destroy()
    this.chipKey.destroy()
    this.chipZone.destroy()
  }
}
