import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { CAMPS, HALL, POIS, REGIONS, WORLD } from '../config/world'
import { IS_TOUCH, safeAreaInsets, wantsTouchTargets } from '../core/device'
import type { GameScene } from '../scenes/GameScene'
import { FOG_KEY, FOG_SCALE } from '../systems/RegionManager'
import { ATLAS_H, ATLAS_KEY, ATLAS_SCALE, ATLAS_W } from '../world/AtlasBake'
import { ChartMemory, windowCrop } from './chart'
import { CHART, POI_GLYPH, drawCamp, drawOutpost, drawStone, poiState } from './chartMarks'
import { HERO_PLATE_H } from './HUD'
import { PlateButton, SkinPanel } from './skin'
import { screen } from './theme'

/** The local window: this many world px round the hero, north up (S12). */
export const MINI_RADIUS = 2400
const SPAN = MINI_RADIUS * 2
/** Known ground at the start: the hold, mirroring the world's opening reveal. */
const SEED = 960

/** Marker refresh. Well below 60 Hz and still reads as live; the window itself slides every frame. */
const FAST_HZ = 9
/** A slow sweep so claimed ground (however it was claimed) is always known. */
const HEARTBEAT = 1.5

/** Biggest the panel is ever allowed to get, and its share of a narrow screen. */
const MAX_W = 188
const SCREEN_SHARE = 0.34
/** Below this the panel is unreadable, so it hides rather than shrinking. */
const MIN_H = 56
/** Margin between the map and the frame around it: room for the gilt rule. */
const INSET = 7
/** The chip: a full thumb target where one is wanted, tighter for a mouse. */
const CHIP_TALL = 44
const CHIP_SHORT = 30
const CHIP_W_TALL = 104
const CHIP_W_SHORT = 100

/**
 * The corner map (S12): a local window of MINI_RADIUS round the hero, north up.
 *
 * Nothing heavy is drawn per frame:
 * - `base` is the atlas bake (`atlas_bake`, 1/16 scale) and `fog` the world's
 *   own fog page (`fog_live`), each one image cropped to the window. Sliding
 *   the window is a new crop and position, one quad each.
 * - `marks` is what changes (pads, camps, POIs, stones, enemies, tonight's
 *   routes, the hero), rebuilt at FAST_HZ out of flat shapes and nudged by the
 *   hero's drift between rebuilds.
 * - the tray and the chip are painted textures.
 *
 * `memory` (where the hero has been) is shared with the atlas: marks show
 * only in seen ground, so the chart never hands you the world on turn one.
 * The chip, a tap on the map, `M` and a controller's Back open the atlas.
 */
export class Minimap {
  readonly memory = new ChartMemory(WORLD.width, WORLD.height)
  private tray: SkinPanel
  private base: Phaser.GameObjects.Image
  private fog: Phaser.GameObjects.Image
  private marks: Phaser.GameObjects.Graphics
  private hit: Phaser.GameObjects.Zone
  private chipBtn: PlateButton

  private roomy = true
  private heartbeat = 0
  private fastT = 0
  /** the window centre the marks were drawn about */
  private drawnX = 0
  private drawnY = 0

  private W = 0
  private H = 0
  private mapX = 0
  private mapY = 0
  /** panel side in CSS px (the window is square) */
  private side = 0
  private lastTop = -1
  private lastBottom = -1

  /** True while a modal owns the screen: the chip goes dead, like the HUD's. */
  blocked = false
  /** Harness: ms the last marks rebuild took, and the worst so far. */
  drawMs = 0
  worstDrawMs = 0

  constructor(private ui: Phaser.Scene, private game: GameScene, private openAtlas: () => void) {
    // All of these sit below the floating joystick on purpose: a thumb dragging
    // over the panel should see its own stick, not have it hidden under a map.
    this.tray = new SkinPanel(ui, 'hud').setScrollFactor(0).setDepth(1_000_006)
    this.base = ui.add.image(0, 0, ATLAS_KEY).setOrigin(0, 0).setScrollFactor(0).setDepth(1_000_007)
    this.fog = ui.add.image(0, 0, FOG_KEY).setOrigin(0, 0).setScrollFactor(0).setDepth(1_000_007).setAlpha(0.92)
    this.marks = ui.add.graphics().setScrollFactor(0).setDepth(1_000_008)
    this.hit = ui.add.zone(0, 0, 10, 10).setOrigin(0, 0).setScrollFactor(0).setDepth(1_000_008)
    this.hit.setInteractive()
    this.hit.on('pointerdown', () => { if (!this.blocked) this.openAtlas() })

    this.chipBtn = new PlateButton(ui, {
      label: 'Map', icon: 'ico_map', keyHint: IS_TOUCH ? undefined : 'M', tone: 'quiet', size: 13,
      onClick: () => this.openAtlas(),
    }).setScrollFactor(0).setDepth(1_000_009)

    // The world restores its explored fog before the UI launches: rebuild the
    // seen grid from those marks so a reload keeps what was walked.
    this.memory.reveal(HALL.x, HALL.y, SEED)
    game.regions.forEachExplored((x, y) => this.memory.reveal(x, y))
    this.sweepClaims()
    game.bus.on('region:claimed', () => this.sweepClaims())

    this.layout()
    ui.scale.on('resize', () => this.layout())
  }

  private sweepClaims() {
    for (const z of REGIONS) if (this.game.regions.claimed(z.id)) this.memory.revealPoly(z.poly)
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

    // `uiBands.top` covers the objective row but not the PAUSE and stance
    // chips in the corner, so the taller of the two wins.
    const stack = padT + HERO_PLATE_H + 6 + CHIP_TALL + 8
    const top = Math.max(bands.top, stack) + 6
    const chipH = touch ? CHIP_TALL : CHIP_SHORT
    const chipW = touch ? CHIP_W_TALL : CHIP_W_SHORT

    const mapY = top + chipH + 6 + INSET
    const availH = this.H - bands.bottom - 10 - INSET - mapY
    const side = Math.min(MAX_W, this.W * SCREEN_SHARE, availH)
    this.roomy = side >= MIN_H
    this.mapX = padL + INSET
    this.mapY = mapY
    this.side = side

    this.chipBtn.place(padL + chipW / 2, top + chipH / 2, chipW, chipH)
    this.chipBtn.setVisible(this.roomy)
    this.tray.setVisible(this.roomy)
    this.base.setVisible(this.roomy)
    this.fog.setVisible(this.roomy)
    this.marks.setVisible(this.roomy)
    if (this.roomy) this.tray.place(this.mapX - INSET, mapY - INSET, side + INSET * 2, side + INSET * 2)
    this.hit.setPosition(this.mapX, mapY).setSize(side, side)
    this.fastT = 0
  }

  // ---- the window ---------------------------------------------------------

  /** Slide the base and the fog to the window round (cx, cy). */
  private slide(cx: number, cy: number) {
    const k = this.side / SPAN
    const x0 = cx - MINI_RADIUS, y0 = cy - MINI_RADIUS
    const b = windowCrop(x0, y0, SPAN, ATLAS_SCALE, ATLAS_W, ATLAS_H)
    const bs = ATLAS_SCALE * k
    this.base.setScale(bs).setCrop(b.x, b.y, b.w, b.h)
      .setPosition(this.mapX + b.dx * k - b.x * bs, this.mapY + b.dy * k - b.y * bs)

    // the world's fog page (a render texture: Phaser crops it top-down like any other)
    const fogTex = this.game.textures.get(FOG_KEY)
    if (this.fog.texture !== fogTex) this.fog.setTexture(FOG_KEY)
    const f = windowCrop(x0, y0, SPAN, FOG_SCALE, this.fog.frame.width, this.fog.frame.height)
    const fs = FOG_SCALE * k
    this.fog.setScale(fs).setCrop(f.x, f.y, f.w, f.h)
      .setPosition(this.mapX + f.dx * k - f.x * fs, this.mapY + f.dy * k - f.y * fs)
  }

  /** World (x, y) to panel px about the window round (cx, cy); null outside it. */
  private toPanel(x: number, y: number, cx: number, cy: number, out: [number, number]) {
    const dx = x - cx, dy = y - cy
    if (dx < -MINI_RADIUS || dx > MINI_RADIUS || dy < -MINI_RADIUS || dy > MINI_RADIUS) return false
    const k = this.side / SPAN
    out[0] = (dx + MINI_RADIUS) * k
    out[1] = (dy + MINI_RADIUS) * k
    return true
  }

  private drawMarks(cx: number, cy: number) {
    const t0 = performance.now()
    const g = this.marks
    const gs = this.game
    const mem = this.memory
    const k = this.side / SPAN
    const p: [number, number] = [0, 0]
    g.clear()
    this.drawnX = cx
    this.drawnY = cy

    // claim rings for the regions the hall can take now
    for (const z of REGIONS) {
      if (gs.regions.claimed(z.id) || gs.buildings.townHallLevel < z.hall) continue
      const c = gs.regions.claimPoint(z.id)
      if (!c || !this.toPanel(c.x, c.y, cx, cy, p)) continue
      const ready = gs.regions.canClaim(z.id).ok
      g.lineStyle(1.5, ready ? CHART.moss : CHART.gilt, ready ? 1 : 0.75)
      g.strokeRect(p[0] - 4, p[1] - 4, 8, 8)
    }

    // pads in their colours: built ones filled, empty ones hollow
    const hall = gs.buildings.townHallLevel
    for (const b of gs.buildings.buildings) {
      if (b.key === 'wall' || b.key === 'gate') continue
      if (!this.toPanel(b.x, b.y, cx, cy, p) || !mem.seenAt(b.x, b.y)) continue
      if (b.key === 'outpost' && b.level > 0 && b.alive) { drawOutpost(g, p[0], p[1], 3.2); continue }
      if (b.level > 0) {
        const colour = b.key === 'townHall' ? PAL.gilt
          : b.def.category === 'defense' ? CHART.lapis
            : b.def.category === 'military' ? PAL.lapis
              : CHART.moss
        const s = b.key === 'townHall' ? 7 : 4.2
        g.fillStyle(CHART.ink, 0.9)
        g.fillRect(p[0] - s / 2 - 0.8, p[1] - s / 2 - 0.8, s + 1.6, s + 1.6)
        g.fillStyle(colour, 1)
        g.fillRect(p[0] - s / 2, p[1] - s / 2, s, s)
      } else {
        const gated = Math.max(b.requiresTownHall, b.def.requiresTownHall ?? 0) > hall
        g.lineStyle(1, gated ? CHART.ink : CHART.gilt, gated ? 0.3 : 0.75)
        g.strokeRect(p[0] - 2, p[1] - 2, 4, 4)
      }
    }

    // camps and POIs, once seen; waystones lit or dark
    for (const spec of CAMPS) {
      if (!this.toPanel(spec.x, spec.y, cx, cy, p) || !mem.seenAt(spec.x, spec.y)) continue
      drawCamp(g, p[0], p[1], 3.6, gs.camps.isBurned(spec.id), spec.tier !== 'warcamp')
    }
    const ws = gs.waystones
    for (const poi of POIS) {
      if (!this.toPanel(poi.x, poi.y, cx, cy, p)) continue
      const st = poiState(gs, mem, poi)
      if (st === 'unseen') continue
      if (poi.kind === 'waystone') drawStone(g, p[0], p[1], 3, ws.isActive(poi.id), ws.here === poi.id)
      else POI_GLYPH[poi.kind](g, p[0], p[1], st === 'done' ? 2 : 2.8)
    }

    // bodies: allies blue, enemies red (seen ground only)
    g.fillStyle(CHART.lapis, 0.9)
    for (const s of gs.army.soldiers) if (this.toPanel(s.x, s.y, cx, cy, p)) g.fillRect(p[0] - 1.2, p[1] - 1.2, 2.4, 2.4)
    for (const w of gs.workers.workers) if (this.toPanel(w.x, w.y, cx, cy, p)) g.fillRect(p[0] - 1, p[1] - 1, 2, 2)
    g.fillStyle(CHART.enemy, 0.95)
    gs.enemies.forEachAlive(e => {
      if (this.toPanel(e.x, e.y, cx, cy, p) && mem.seenAt(e.x, e.y)) g.fillRect(p[0] - 1.6, p[1] - 1.6, 3.2, 3.2)
    })

    // tonight's routes, dotted during the warning and the march
    if (gs.waves.phase !== 'day') {
      g.fillStyle(PAL.ember, 0.95)
      const step = Math.max(1, Math.round(5 / (k * 32))) // a dot every ~5 px; route points are a nav cell apart
      for (const t of gs.waves.tonight) {
        const pts = t.route
        for (let i = 0; i < pts.length; i += step) {
          if (this.toPanel(pts[i][0], pts[i][1], cx, cy, p)) g.fillRect(p[0] - 1, p[1] - 1, 2, 2)
        }
      }
    }

    // what is on screen, then the hero (always the centre)
    const view = gs.cameras.main.worldView
    g.lineStyle(1, CHART.ink, 0.45)
    g.strokeRect((view.x - cx + MINI_RADIUS) * k, (view.y - cy + MINI_RADIUS) * k, view.width * k, view.height * k)
    const hero = gs.player
    if (hero.alive) {
      const hx = (hero.x - cx + MINI_RADIUS) * k, hy = (hero.y - cy + MINI_RADIUS) * k
      g.fillStyle(PAL.bone, 1).fillRect(hx - 3.6, hy - 3.6, 7.2, 7.2)
      g.fillStyle(CHART.ink, 1).fillRect(hx - 2.8, hy - 2.8, 5.6, 5.6)
      g.fillStyle(PAL.lapis, 1).fillRect(hx - 2, hy - 2, 4, 4)
    }
    this.drawMs = performance.now() - t0
    this.worstDrawMs = Math.max(this.worstDrawMs, this.drawMs)
  }

  // ---- loop --------------------------------------------------------------

  update(dt: number) {
    const view = screen(this.ui)
    const bands = this.game.uiBands
    // The HUD moves its own bands as resource rows and the objective come and go.
    if (view.w !== this.W || view.h !== this.H
      || bands.top !== this.lastTop || bands.bottom !== this.lastBottom) {
      this.layout()
    }
    this.chipBtn.setLive(!this.blocked && this.roomy)

    // Seen ground is tracked whether or not the panel shows, so the atlas knows it too.
    const hero = this.game.player
    if (hero.alive) this.memory.reveal(hero.x, hero.y)
    this.heartbeat -= dt
    if (this.heartbeat <= 0) { this.heartbeat = HEARTBEAT; this.sweepClaims() }
    if (!this.roomy) return

    // round the hero; while he is down, round what the camera shows
    const cam = this.game.cameras.main.worldView
    const cx = hero.alive ? hero.x : cam.centerX
    const cy = hero.alive ? hero.y : cam.centerY
    this.slide(cx, cy)

    this.fastT -= dt
    if (this.fastT <= 0) {
      this.fastT = 1 / FAST_HZ
      this.drawMarks(cx, cy)
    }
    const k = this.side / SPAN
    this.marks.setPosition(this.mapX + (this.drawnX - cx) * k, this.mapY + (this.drawnY - cy) * k)
  }

  /** Harness: the panel's rect in CSS px and what the window centres on. */
  inspect() {
    return {
      rect: { x: this.mapX, y: this.mapY, w: this.side, h: this.side },
      roomy: this.roomy, radius: MINI_RADIUS, drawMs: Math.round(this.drawMs * 100) / 100,
      worstDrawMs: Math.round(this.worstDrawMs * 100) / 100,
      seen: this.memory.cells.reduce((a, b) => a + b, 0),
    }
  }

  destroy() {
    this.tray.destroy()
    this.base.destroy()
    this.fog.destroy()
    this.marks.destroy()
    this.hit.destroy()
    this.chipBtn.destroy()
  }
}
