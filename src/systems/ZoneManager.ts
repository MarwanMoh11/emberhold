import Phaser from 'phaser'
import { HALL, REGIONS, WORLD, raster, type RegionDef, type RegionId } from '../config/world'
import { segProj } from '../world/raster'
import { PAL } from '../config/palette'
import { RESOURCE_ORDER } from '../core/types'
import { clamp, short } from '../core/math'
import { FogMemory } from '../core/FogMemory'
import { buildVellumTexture } from '../world/Terrain'
import type { GameScene } from '../scenes/GameScene'
import { setColour, textStyle } from '../ui/theme'
import { SkinPanel } from '../ui/skin'
import { DPR } from '../core/device'

/** World px per fog texel: the fog RenderTexture is the world at 1/8. */
export const FOG_SCALE = 8
/** Banner frame width in world units; also its wrap width. */
const BANNER_W = 248
/** How close the hero has to be for a claim to fire. */
const CLAIM_RADIUS = 70
/** Tint of unclaimed ground under the fog: the region's own colour, dimmed. */
const LOCKED_SHADE = 0x140f0b
const LOCKED_ALPHA = 0.42
/** How far past a border the soft barrier looks to see what is on the other side. */
const BARRIER_PROBE = 48
/** Dwell before a claim fires, mirroring the build pads. */
const CLAIM_DWELL = 0.45
/** The banner only draws within this range of the claim point. */
const BANNER_RANGE = 460
/** Far-future claims should explain themselves when approached, not crowd the starting view. */
const GATED_BANNER_RANGE = 230
/** Height of the flag planted on the claim ring; the frame clears it. */
const POLE_H = 44
/**
 * The banner is something you read, so it sits above the lightmap with the
 * rest of the world's labels. Under it, night dimmed the words you most need.
 */
const LABEL_DEPTH = 780_000

interface ZoneView {
  spec: RegionDef
  /** Where the hero actually stands to claim: the blueprint's claim point, always outside the region. */
  cx: number
  cy: number
  overlay: Phaser.GameObjects.Graphics
  banner: Phaser.GameObjects.Container
  bg: Phaser.GameObjects.Graphics
  frame: SkinPanel
  label: Phaser.GameObjects.Text
  blurb: Phaser.GameObjects.Text
  cost: Phaser.GameObjects.Text
  post: Phaser.GameObjects.Graphics
  marker: Phaser.GameObjects.Graphics
  dwell: number
  unlocked: boolean
}

/** A polygon's bounding circle, for the culler. */
function bounds(poly: readonly [number, number][]): { x: number; y: number; r: number } {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1])
  const x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2
  return { x, y, r: Math.max(...poly.map(p => Math.hypot(p[0] - x, p[1] - y))) + 24 }
}

/** True when a polygon edge lies along the world's outer boundary. */
const onWorldEdge = (a: readonly number[], b: readonly number[]) =>
  (a[0] <= 0 && b[0] <= 0) || (a[1] <= 0 && b[1] <= 0)
  || (a[0] >= WORLD.width && b[0] >= WORLD.width) || (a[1] >= WORLD.height && b[1] >= WORLD.height)

/**
 * Territory + fog. Locked ground is visibly walled off and named, so the map
 * always advertises where the next chunk of progress is.
 */
export class ZoneManager {
  private views = new Map<RegionId, ZoneView>()
  private fog!: Phaser.GameObjects.RenderTexture
  private brush!: Phaser.GameObjects.Image
  private explored = new FogMemory(WORLD.width, WORLD.height)
  private lastRevealX = -9999
  private lastRevealY = -9999
  unlockedCount = 1

  constructor(private scene: GameScene, depth: number) {
    this.buildFog(depth)
    for (const z of REGIONS) this.buildZone(z, depth - 2)
  }

  private buildFog(depth: number) {
    // Eighth resolution: fog is low-frequency, and even a quarter-res target
    // over the 10240x9216 frontier is a lot of GPU memory to ask a phone for.
    const w = Math.ceil(WORLD.width / FOG_SCALE)
    const h = Math.ceil(WORLD.height / FOG_SCALE)
    this.fog = this.scene.add.renderTexture(0, 0, w, h)
      .setOrigin(0, 0).setScale(FOG_SCALE).setDepth(depth).setAlpha(0.9)
    // Unwalked ground is the blank page with the surveyor's sketch on it,
    // not a black void: see buildVellumTexture.
    if (!this.scene.textures.exists('fog_vellum')) buildVellumTexture(this.scene, FOG_SCALE)
    this.fog.draw('fog_vellum', 0, 0)
    this.brush = this.scene.make.image({ key: 'fx_fogbrush', add: false })
    this.brush.setOrigin(0.5, 0.5)
    // 480px source art drawn at 2/FOG_SCALE in fog space -> ~960 world px reveal
    this.brush.setScale(2 / FOG_SCALE)
    // the hold itself is already known ground
    this.revealArea(HALL.x, HALL.y, 950)
  }

  /** Clear a disc of fog without waiting for the player to walk it. */
  revealArea(x: number, y: number, radius: number) {
    const step = 200
    for (let ry = -radius; ry <= radius; ry += step) {
      for (let rx = -radius; rx <= radius; rx += step) {
        if (rx * rx + ry * ry > radius * radius) continue
        this.eraseFog(x + rx, y + ry)
      }
    }
    this.eraseFog(x, y)
  }

  private eraseFog(x: number, y: number) {
    this.explored.mark(x, y)
    this.fog.erase(this.brush, x / FOG_SCALE, y / FOG_SCALE)
  }

  fogJSON() { return this.explored.toJSON() }

  forEachExplored(fn: (x: number, y: number) => void) {
    this.explored.forEachMarked(fn)
  }

  loadFog(encoded: string) {
    this.explored.load(encoded)
    this.explored.forEachMarked((x, y) => this.fog.erase(this.brush, x / FOG_SCALE, y / FOG_SCALE))
  }

  private buildZone(spec: RegionDef, depth: number) {
    const unlocked = spec.id === 'hold'
    const pts = spec.poly.map(([x, y]) => new Phaser.Math.Vector2(x, y))
    const overlay = this.scene.add.graphics().setDepth(depth).setVisible(!unlocked)
    overlay.fillStyle(LOCKED_SHADE, LOCKED_ALPHA)
    overlay.fillPoints(pts, true)

    const post = this.scene.add.graphics().setDepth(depth + 1)
    if (!unlocked) this.drawBoundary(post, spec)
    // Graphics replay every command each frame: let the culler skip the far ones.
    const b = bounds(spec.poly)
    this.scene.culler.add(overlay, b.x, b.y, b.r)
    this.scene.culler.add(post, b.x, b.y, b.r)

    const { x: cx, y: cy } = spec.claim
    // The ring is the actual affordance: a marked patch of ground you can walk
    // onto. The frame above it is only a label.
    const marker = this.scene.add.graphics().setDepth(depth + 1).setVisible(false)

    const banner = this.scene.add.container(cx, cy).setDepth(LABEL_DEPTH)
    // The frame is sized in update() once the text has been measured: the name
    // plus its blurb runs well past a fixed box, and on a phone that box is
    // most of the screen anyway.
    const bg = this.scene.add.graphics()
    const frame = new SkinPanel(this.scene, 'hud')
    const label = this.scene.add.text(0, -50, spec.name,
      textStyle({ voice: 'display', size: 21, colour: PAL.gold, align: 'center', wrap: BANNER_W - 28, shadow: true }))
      .setOrigin(0.5, 0)
    const blurb = this.scene.add.text(0, -40, spec.blurb,
      textStyle({ size: 13, weight: 'italic 500', colour: PAL.uiDim, align: 'center', wrap: BANNER_W - 28 }))
      .setOrigin(0.5, 0)
    const cost = this.scene.add.text(0, -30, '',
      textStyle({ voice: 'caps', size: 13, weight: '800', colour: PAL.uiText, align: 'center', wrap: BANNER_W - 28 }))
      .setOrigin(0.5, 0).setLineSpacing(2)
    banner.add([bg, frame.img, label, blurb, cost])
    banner.setVisible(!unlocked)

    this.views.set(spec.id, {
      spec, cx, cy, overlay, banner, bg, frame, label, blurb, cost, post, marker, dwell: 0, unlocked,
    })
  }

  /**
   * Draw the claim disc where the hero has to stand, plus the flag planted on
   * it. The pole lives here rather than on the banner container so it stays on
   * the spot even when the frame above it slides to clear the HUD.
   */
  private drawMarker(v: ZoneView, affordable: boolean, inside: boolean) {
    const g = v.marker
    const ry = CLAIM_RADIUS * 0.55
    g.clear()
    const col = affordable ? PAL.good : PAL.uiDim
    g.fillStyle(col, inside ? 0.22 : 0.1)
    g.fillEllipse(v.cx, v.cy, CLAIM_RADIUS * 2, ry * 2)
    g.lineStyle(3, col, affordable ? 0.95 : 0.5)
    g.strokeEllipse(v.cx, v.cy, CLAIM_RADIUS * 2, ry * 2)

    if (v.dwell > 0) {
      const f = Math.min(1, v.dwell / CLAIM_DWELL)
      const steps = Math.max(2, Math.round(f * 40))
      g.lineStyle(6, PAL.gold, 1)
      g.beginPath()
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + (i / steps) * f * Math.PI * 2
        const px = v.cx + Math.cos(a) * CLAIM_RADIUS
        const py = v.cy + Math.sin(a) * ry
        if (i === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.strokePath()
    }

    // planted on the spot, rising out of the ring rather than hanging off the
    // frame — the frame is a label and may slide; this never does
    g.fillStyle(0x4a3320, 1)
    g.fillRect(v.cx - 2, v.cy - 34, 4, 34)
    g.fillStyle(PAL.gold, 1)
    g.fillTriangle(v.cx + 2, v.cy - 34, v.cx + 26, v.cy - 27, v.cx + 2, v.cy - 19)
  }

  /** Fit the frame inside the viewport, with a tether to the real claim ring. */
  private frameBanner(v: ZoneView) {
    const lh = v.label.height
    const bh = v.blurb.height
    const ch = v.cost.height
    // The frame floats a flag's height above its anchor so it clears both the
    // pole and the ring drawn on the ground around it.
    const top = -POLE_H - 50 - lh - bh - ch
    v.label.setPosition(0, top + 10)
    v.blurb.setPosition(0, top + 10 + lh)
    v.cost.setPosition(0, top + 18 + lh + bh)
    const h = -top - POLE_H + 4

    const cam = this.scene.cameras.main
    const view = cam.worldView
    const bands = this.scene.uiBands
    // -top is the banner's height above its anchor, so this keeps the frame
    // itself clear of the HUD rather than just its foot.
    // the bands are CSS pixels; the camera's zoom already carries the DPR
    const px = DPR / cam.zoom
    const minY = view.y + bands.top * px - top
    const maxY = view.bottom - bands.bottom * px
    const side = BANNER_W / 2 + 12 * px
    v.banner.x = Phaser.Math.Clamp(v.cx, view.left + side, view.right - side)
    v.banner.y = Phaser.Math.Clamp(v.cy, minY, Math.max(minY, maxY))

    v.bg.clear()
    // The banner can move to clear screen edges, but the flag and ring never
    // move. A diagonal tether keeps the callout unambiguously attached to it.
    const sideways = v.cx - v.banner.x
    const drop = v.cy - v.banner.y
    if (Math.hypot(sideways, drop) > 8) {
      v.bg.lineStyle(2, PAL.gilt, 0.55)
      v.bg.lineBetween(0, top + h, sideways, drop - 34)
    }
    v.frame.place(-BANNER_W / 2, top, BANNER_W, h)
  }

  /** Rope-and-post fence along every border the region shares with another. S08 swaps it for border stones. */
  private drawBoundary(g: Phaser.GameObjects.Graphics, spec: RegionDef) {
    g.clear()
    const step = 96
    const poly = spec.poly
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      if (onWorldEdge(a, b)) continue
      g.lineStyle(3, PAL.gold, 0.35)
      g.lineBetween(a[0], a[1], b[0], b[1])
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      g.fillStyle(0x6b4a2a, 0.85)
      for (let d = 0; d <= len; d += step) {
        const t = d / len
        g.fillRect(a[0] + (b[0] - a[0]) * t - 2, a[1] + (b[1] - a[1]) * t - 10, 4, 20)
      }
    }
  }

  isUnlocked(id: RegionId) { return this.views.get(id)?.unlocked ?? true }

  /** Where the hero has to stand to claim a zone — also what the arrow aims at. */
  claimPoint(id: RegionId): { x: number; y: number } | null {
    const v = this.views.get(id)
    return v ? { x: v.cx, y: v.cy } : null
  }

  /** The region under a point, from the 32 px region raster. */
  zoneAt(x: number, y: number): ZoneView | null {
    const r = raster()
    const i = r.cell(x, y)
    const k = i < 0 ? -1 : r.region[i]
    return k < 0 ? null : this.views.get(REGIONS[k].id) ?? null
  }

  /** The locked region a point sits in, if any. Used to redirect guidance. */
  lockedZoneAt(x: number, y: number): RegionDef | null {
    const v = this.zoneAt(x, y)
    return v && !v.unlocked ? v.spec : null
  }

  canUnlock(v: ZoneView) {
    return this.scene.buildings.townHallLevel >= v.spec.hall &&
      this.scene.res.canAfford(v.spec.cost)
  }

  canUnlockId(id: RegionId) {
    const v = this.views.get(id)
    return !!v && !v.unlocked && this.canUnlock(v)
  }

  unlock(id: RegionId, silent = false) {
    const v = this.views.get(id)
    if (!v || v.unlocked) return
    v.unlocked = true
    this.unlockedCount++
    v.post.clear()
    v.marker.clear()
    v.marker.setVisible(false)
    v.banner.setVisible(false)
    if (silent) {
      v.overlay.setVisible(false)
      return
    }
    this.scene.tweens.add({
      targets: v.overlay, alpha: 0, duration: 700, ease: 'Cubic.easeOut',
      onComplete: () => v.overlay.setVisible(false),
    })
    this.scene.fx.popup(v.cx, v.cy - 70, `${v.spec.name} claimed`, PAL.gold, 26)
    this.scene.fx.ring(v.cx, v.cy, 340, PAL.gold, 0.9)
    this.scene.fx.flash(0xffe9b0, 0.22)
    this.scene.audio.play('quest', 0.8)
    this.scene.bus.emit('zone:unlocked', { id })
    this.scene.buildings.recomputeBonuses()
  }

  update(dt: number) {
    const p = this.scene.player
    if (!p.alive) return

    // fog reveal
    if (Math.hypot(p.x - this.lastRevealX, p.y - this.lastRevealY) > 26) {
      this.lastRevealX = p.x
      this.lastRevealY = p.y
      this.eraseFog(p.x, p.y)
    }

    const here = this.zoneAt(p.x, p.y)
    for (const v of this.views.values()) {
      if (v.unlocked) continue
      // Stand off while a build-site card is up. You cannot fund a building and
      // claim territory in the same moment, and two world panels fighting for
      // the middle of a phone screen just looks broken.
      const d = Math.hypot(p.x - v.cx, p.y - v.cy)
      const hallGap = v.spec.hall - this.scene.buildings.townHallLevel
      const range = hallGap >= 2 ? GATED_BANNER_RANGE : BANNER_RANGE
      const near = d < range && !this.scene.buildings.panelShown
      v.banner.setVisible(near)
      v.marker.setVisible(near)
      if (!near) { v.dwell = 0; continue }

      const affordable = this.canUnlock(v)
      const needHall = this.scene.buildings.townHallLevel < v.spec.hall
      const costStr = RESOURCE_ORDER.filter(k => v.spec.cost[k])
        .map(k => `${short(v.spec.cost[k] ?? 0)} ${k}`).join('   ')
      setColour(v.cost.setText(
        needHall ? `Command Hall level ${v.spec.hall} required`
          : `${costStr}\n${affordable ? 'Stand on the ring to claim' : 'Not enough yet'}`,
      ), affordable ? PAL.good : needHall ? PAL.danger : PAL.uiDim)
      this.frameBanner(v)

      const inside = d < CLAIM_RADIUS
      if (inside && affordable) {
        v.dwell += dt
        if (v.dwell >= CLAIM_DWELL) {
          this.scene.res.spend(v.spec.cost)
          this.unlock(v.spec.id)
          continue
        }
      } else v.dwell = 0
      this.drawMarker(v, affordable, inside)
    }

    // soft barrier: nudge the hero back out of land they have not claimed
    if (here && !here.unlocked) {
      const [tx, ty] = this.exitToward(here.spec, p.x, p.y)
      const d = Math.hypot(tx - p.x, ty - p.y) || 1
      const push = 240 * dt
      p.x = clamp(p.x + (tx - p.x) / d * push, 24, WORLD.width - 24)
      p.y = clamp(p.y + (ty - p.y) / d * push, 24, WORLD.height - 24)
    }
  }

  /**
   * Where the soft barrier pushes the hero: the nearest point on a border
   * whose far side is claimed. A border into another locked region would
   * just bounce them between the two, so those are skipped; with none left
   * (teleported deep into the wild), the way home is toward the hall.
   */
  private exitToward(spec: RegionDef, x: number, y: number): [number, number] {
    const poly = spec.poly
    let best = Infinity, bx = HALL.x, by = HALL.y
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length]
      if (onWorldEdge(a, b)) continue
      const { tc, d } = segProj(x, y, a[0], a[1], b[0], b[1])
      if (d >= best) continue
      const qx = a[0] + (b[0] - a[0]) * tc, qy = a[1] + (b[1] - a[1]) * tc
      const k = Math.hypot(qx - x, qy - y) || 1
      const beyond = this.zoneAt(qx + (qx - x) / k * BARRIER_PROBE, qy + (qy - y) / k * BARRIER_PROBE)
      if (!beyond?.unlocked) continue
      best = d; bx = qx + (qx - x) / k * BARRIER_PROBE; by = qy + (qy - y) / k * BARRIER_PROBE
    }
    return [bx, by]
  }

  revealAll() {
    this.fog.clear()
  }

  toJSON() {
    return [...this.views.values()].filter(v => v.unlocked).map(v => v.spec.id)
  }

  load(ids: RegionId[]) {
    for (const id of ids) this.unlock(id, true)
  }
}
