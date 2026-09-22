import Phaser from 'phaser'
import { ZONES, type ZoneId, type ZoneSpec } from '../config/map'
import { WORLD } from '../config/balance'
import { PAL, CSS } from '../config/palette'
import { RESOURCE_ORDER } from '../core/types'
import { clamp, short } from '../core/math'
import { FogMemory } from '../core/FogMemory'
import { buildVellumTexture } from '../world/Terrain'
import type { GameScene } from '../scenes/GameScene'

/** World px per fog texel. */
const FOG_SCALE = 4
/** Banner frame width in world units; also its wrap width. */
const BANNER_W = 248
/** How close the hero has to be for a claim to fire. */
const CLAIM_RADIUS = 70
/**
 * How far outside its own border a zone's claim point is pushed.
 *
 * Authored banner anchors sit on the fence line, and two of them were inside
 * the rect outright — which put the claim disc inside the soft barrier that
 * shoves the hero back out. "Stand here to claim" then named a spot the game
 * actively refused to let you stand on. Every anchor is projected clear of its
 * own border now, so the disc always lands on ground you can hold.
 */
const CLAIM_MARGIN = 96
/** Dwell before a claim fires, mirroring the build pads. */
const CLAIM_DWELL = 0.45
/** The banner only draws within this range of the claim point. */
const BANNER_RANGE = 460
/** Far-future claims should explain themselves when approached, not crowd the starting view. */
const GATED_BANNER_RANGE = 230
/** Height of the flag planted on the claim ring; the frame clears it. */
const POLE_H = 44

interface ZoneView {
  spec: ZoneSpec
  /** Where the hero actually stands to claim. Never inside the zone itself. */
  cx: number
  cy: number
  overlay: Phaser.GameObjects.Rectangle
  banner: Phaser.GameObjects.Container
  bg: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  cost: Phaser.GameObjects.Text
  post: Phaser.GameObjects.Graphics
  marker: Phaser.GameObjects.Graphics
  dwell: number
  unlocked: boolean
}

/**
 * Project a banner anchor clear of its own zone rect, out through whichever
 * edge it sits nearest. Anchors already well outside are left where they are.
 */
function claimPointFor(s: ZoneSpec): { x: number; y: number } {
  const l = s.x - CLAIM_MARGIN, r = s.x + s.w + CLAIM_MARGIN
  const t = s.y - CLAIM_MARGIN, b = s.y + s.h + CLAIM_MARGIN
  const x = s.bannerX, y = s.bannerY
  if (x < l || x > r || y < t || y > b) return { x, y }
  const dl = x - l, dr = r - x, dt = y - t, db = b - y
  const m = Math.min(dl, dr, dt, db)
  if (m === dl) return { x: l, y }
  if (m === dr) return { x: r, y }
  if (m === dt) return { x, y: t }
  return { x, y: b }
}

/**
 * Territory + fog. Locked ground is visibly walled off and named, so the map
 * always advertises where the next chunk of progress is.
 */
export class ZoneManager {
  private views = new Map<ZoneId, ZoneView>()
  private fog!: Phaser.GameObjects.RenderTexture
  private brush!: Phaser.GameObjects.Image
  private explored = new FogMemory(WORLD.width, WORLD.height)
  private lastRevealX = -9999
  private lastRevealY = -9999
  unlockedCount = 1

  constructor(private scene: GameScene, depth: number) {
    this.buildFog(depth)
    for (const z of ZONES) this.buildZone(z, depth - 2)
  }

  private buildFog(depth: number) {
    // Quarter resolution: fog is low-frequency, and a full- or half-res target
    // over a 3400x2800 world is a lot of GPU memory to ask a phone for.
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
    // 480px source art drawn at half size in fog space -> ~960 world px reveal
    this.brush.setScale(0.5)
    // the hold itself is already known ground
    this.revealArea(WORLD.centerX, WORLD.centerY, 950)
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

  private buildZone(spec: ZoneSpec, depth: number) {
    const unlocked = !!spec.startsUnlocked
    const overlay = this.scene.add
      .rectangle(spec.x + spec.w / 2, spec.y + spec.h / 2, spec.w, spec.h, spec.tint, unlocked ? 0 : 0.45)
      .setDepth(depth).setVisible(!unlocked)

    const post = this.scene.add.graphics().setDepth(depth + 1)
    if (!unlocked) this.drawBoundary(post, spec)

    const { x: cx, y: cy } = claimPointFor(spec)
    // The ring is the actual affordance: a marked patch of ground you can walk
    // onto. The frame above it is only a label.
    const marker = this.scene.add.graphics().setDepth(depth + 1).setVisible(false)

    const banner = this.scene.add.container(cx, cy).setDepth(depth + 2)
    // The frame is drawn in update() once the text has been measured: the name
    // plus its blurb runs well past a fixed 248px box, and on a phone that box
    // is most of the screen anyway.
    const bg = this.scene.add.graphics()
    const label = this.scene.add.text(0, -50, spec.name.toUpperCase(), {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '15px',
      color: CSS(PAL.gold), fontStyle: 'bold', align: 'center',
      wordWrap: { width: BANNER_W - 24 },
    }).setOrigin(0.5, 0)
    const cost = this.scene.add.text(0, -30, '', {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '11px',
      color: CSS(PAL.uiText), align: 'center',
      wordWrap: { width: BANNER_W - 24 },
    }).setOrigin(0.5, 0)
    banner.add([bg, label, cost])
    banner.setVisible(!unlocked)

    this.views.set(spec.id, {
      spec, cx, cy, overlay, banner, bg, label, cost, post, marker, dwell: 0, unlocked,
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
    const ch = v.cost.height
    // The frame floats a flag's height above its anchor so it clears both the
    // pole and the ring drawn on the ground around it.
    const top = -POLE_H - 46 - lh - ch
    v.label.setPosition(0, top + 10)
    v.cost.setPosition(0, top + 14 + lh)
    const h = -top - POLE_H + 4

    const cam = this.scene.cameras.main
    const view = cam.worldView
    const bands = this.scene.uiBands
    // -top is the banner's height above its anchor, so this keeps the frame
    // itself clear of the HUD rather than just its foot.
    const minY = view.y + bands.top / cam.zoom - top
    const maxY = view.bottom - bands.bottom / cam.zoom
    const side = BANNER_W / 2 + 12 / cam.zoom
    v.banner.x = Phaser.Math.Clamp(v.cx, view.left + side, view.right - side)
    v.banner.y = Phaser.Math.Clamp(v.cy, minY, Math.max(minY, maxY))

    v.bg.clear()
    // The banner can move to clear screen edges, but the flag and ring never
    // move. A diagonal tether keeps the callout unambiguously attached to it.
    const sideways = v.cx - v.banner.x
    const drop = v.cy - v.banner.y
    if (Math.hypot(sideways, drop) > 8) {
      v.bg.lineStyle(2, PAL.gold, 0.4)
      v.bg.lineBetween(0, -POLE_H, sideways, drop - 34)
    }
    v.bg.fillStyle(PAL.uiBg, 0.9)
    v.bg.fillRoundedRect(-BANNER_W / 2, top, BANNER_W, h, 8)
    v.bg.lineStyle(2, PAL.gold, 1)
    v.bg.strokeRoundedRect(-BANNER_W / 2, top, BANNER_W, h, 8)
  }

  private drawBoundary(g: Phaser.GameObjects.Graphics, spec: ZoneSpec) {
    g.clear()
    g.lineStyle(3, PAL.gold, 0.35)
    g.strokeRect(spec.x, spec.y, spec.w, spec.h)
    // rope-and-post fence along the edges
    const step = 96
    g.fillStyle(0x6b4a2a, 0.85)
    for (let x = spec.x; x <= spec.x + spec.w; x += step) {
      g.fillRect(x - 2, spec.y - 10, 4, 20)
      g.fillRect(x - 2, spec.y + spec.h - 10, 4, 20)
    }
    for (let y = spec.y; y <= spec.y + spec.h; y += step) {
      g.fillRect(spec.x - 2, y - 10, 4, 20)
      g.fillRect(spec.x + spec.w - 2, y - 10, 4, 20)
    }
  }

  isUnlocked(id: ZoneId) { return this.views.get(id)?.unlocked ?? true }

  /** Where the hero has to stand to claim a zone — also what the arrow aims at. */
  claimPoint(id: ZoneId): { x: number; y: number } | null {
    const v = this.views.get(id)
    return v ? { x: v.cx, y: v.cy } : null
  }

  zoneAt(x: number, y: number): ZoneView | null {
    for (const v of this.views.values()) {
      const s = v.spec
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return v
    }
    return null
  }

  /** The locked zone a point sits in, if any. Used to redirect guidance. */
  lockedZoneAt(x: number, y: number): ZoneSpec | null {
    const v = this.zoneAt(x, y)
    return v && !v.unlocked ? v.spec : null
  }

  canUnlock(v: ZoneView) {
    return this.scene.buildings.townHallLevel >= v.spec.requiresTownHall &&
      this.scene.res.canAfford(v.spec.cost)
  }

  canUnlockId(id: ZoneId) {
    const v = this.views.get(id)
    return !!v && !v.unlocked && this.canUnlock(v)
  }

  unlock(id: ZoneId, silent = false) {
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
    this.scene.fx.popup(v.cx, v.cy - 70, `${v.spec.name.toUpperCase()} CLAIMED`, PAL.gold, 26)
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
      const hallGap = v.spec.requiresTownHall - this.scene.buildings.townHallLevel
      const range = hallGap >= 2 ? GATED_BANNER_RANGE : BANNER_RANGE
      const near = d < range && !this.scene.buildings.panelShown
      v.banner.setVisible(near)
      v.marker.setVisible(near)
      if (!near) { v.dwell = 0; continue }

      const affordable = this.canUnlock(v)
      const needHall = this.scene.buildings.townHallLevel < v.spec.requiresTownHall
      const costStr = RESOURCE_ORDER.filter(k => v.spec.cost[k])
        .map(k => `${short(v.spec.cost[k] ?? 0)} ${k}`).join('   ')
      v.cost.setText(
        needHall ? `COMMAND HALL LV.${v.spec.requiresTownHall} REQUIRED`
          : `${costStr}\n${affordable ? 'STAND ON THE RING TO CLAIM' : 'not enough'}`,
      ).setColor(affordable ? CSS(PAL.good) : needHall ? CSS(PAL.danger) : CSS(PAL.uiDim))
      v.label.setText(`${v.spec.name.toUpperCase()}  ·  ${v.spec.blurb}`)
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
      const s = here.spec
      const dl = p.x - s.x, dr = s.x + s.w - p.x
      const dtp = p.y - s.y, db = s.y + s.h - p.y
      const m = Math.min(dl, dr, dtp, db)
      const push = 240 * dt
      if (m === dl) p.x -= push
      else if (m === dr) p.x += push
      else if (m === dtp) p.y -= push
      else p.y += push
      p.x = clamp(p.x, 24, WORLD.width - 24)
      p.y = clamp(p.y, 24, WORLD.height - 24)
    }
  }

  revealAll() {
    this.fog.clear()
  }

  toJSON() {
    return [...this.views.values()].filter(v => v.unlocked).map(v => v.spec.id)
  }

  load(ids: ZoneId[]) {
    for (const id of ids) this.unlock(id, true)
  }
}
