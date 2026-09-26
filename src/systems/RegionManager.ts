import Phaser from 'phaser'
import { CAMPS, HALL, REGIONS, REGION_BY_ID, WORLD, raster, type RegionDef, type RegionId } from '../config/world'
import { BUILDINGS } from '../config/buildings'
import { segProj } from '../world/raster'
import { claimRect, setClaimed } from '../world/claimTint'
import { PAL } from '../config/palette'
import { bake, form, glow, line, P } from '../art/ink'
import { groundShadow } from '../art/props'
import { RESOURCE_ORDER } from '../core/types'
import { clamp, short } from '../core/math'
import { FogMemory } from '../core/FogMemory'
import { buildVellumTexture } from '../world/Terrain'
import type { GameScene } from '../scenes/GameScene'
import { setColour, textStyle } from '../ui/theme'
import { SkinPanel } from '../ui/skin'
import { CostChips, DockSheet, StatLine, type DockRow } from '../ui/dock'
import { DPR } from '../core/device'

/** World px per fog texel: the fog RenderTexture is the world at 1/8. */
export const FOG_SCALE = 8
/** The live fog page's texture key (S12): world px / FOG_SCALE per texel. */
export const FOG_KEY = 'fog_live'
/** Banner frame width in world units; also its wrap width. */
const BANNER_W = 248
/** Standing this close to a stone opens its card on the dock (S09b): the name alone floats over the stone. */
const STONE_DOCK_RANGE = 220
/** How close the hero has to be for a claim to fire. */
const CLAIM_RADIUS = 70
/** How far past a border the soft barrier looks to see what is on the other side. */
const BARRIER_PROBE = 48
/** Dwell before a claim fires, mirroring the build pads. */
const CLAIM_DWELL = 0.45
/** The banner only draws within this range of the claim point. */
const BANNER_RANGE = 460
/** Far-future claims should explain themselves when approached, not crowd the starting view. */
const GATED_BANNER_RANGE = 230
/** Height of the border stone standing in the claim ring; the frame clears it. */
const POLE_H = 78
/**
 * The banner is something you read, so it sits above the lightmap with the
 * rest of the world's labels. Under it, night dimmed the words you most need.
 */
const LABEL_DEPTH = 780_000

/** Why a region cannot be claimed yet, in the order `canClaim` checks them. */
export type ClaimReason = 'hall' | 'adjacent' | 'camps' | 'cost'
/** `why` is the border stone's tooltip line: the failing reason, or what to do next. */
export interface ClaimCheck { ok: boolean; reason: ClaimReason | null; why: string }

/** The hall tier a region asks for, by name: "a Stone Hall". */
const hallName = (level: number) => BUILDINGS.townHall.levels[level - 1]?.label ?? `level ${level} hall`

interface StoneView {
  spec: RegionDef
  /** Where the hero actually stands to claim: the blueprint's claim point, always outside the region. */
  cx: number
  cy: number
  /** The border stone itself; the hold has none (its claim point is the hall). */
  stone: Phaser.GameObjects.Image | null
  banner: Phaser.GameObjects.Container
  bg: Phaser.GameObjects.Graphics
  frame: SkinPanel
  label: Phaser.GameObjects.Text
  blurb: Phaser.GameObjects.Text
  cost: Phaser.GameObjects.Text
  marker: Phaser.GameObjects.Graphics
  dwell: number
}

/** A standing stone with the hold's mark cut in it: dull until its region is claimed, then the mark burns gold. */
function stoneTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('claim_stone')) return
  const W = 44, H = 72, by = H - 8
  for (const lit of [false, true]) {
    bake(scene, lit ? 'claim_stone_lit' : 'claim_stone', W, H, {
      under: x => groundShadow(x, W / 2 + 3, by, 18, 5),
      body: x => {
        form(x, P.blob([[11, by], [9, by - 30], [14, by - 52], [23, by - 58], [32, by - 50], [35, by - 26], [33, by]], 0.5),
          lit ? 0xa49c8a : 0x8e887c, { rim: 1.4, core: 5 })
        if (lit) glow(x, 22, by - 30, 15, PAL.gold, 0.4)
        line(x, c => {
          c.moveTo(22, by - 44); c.lineTo(22, by - 16)
          c.moveTo(15, by - 38); c.lineTo(22, by - 31); c.lineTo(29, by - 38)
          c.moveTo(16, by - 16); c.lineTo(28, by - 16)
        }, 2.6, lit ? PAL.gold : 0x4a443c, lit ? 1 : 0.85)
      },
      outline: 1.8,
      grain: 0.12,
    })
  }
}

/** True when a polygon edge lies along the world's outer boundary. */
const onWorldEdge = (a: readonly number[], b: readonly number[]) =>
  (a[0] <= 0 && b[0] <= 0) || (a[1] <= 0 && b[1] <= 0)
  || (a[0] >= WORLD.width && b[0] >= WORLD.width) || (a[1] >= WORLD.height && b[1] >= WORLD.height)

/**
 * Regions, claims and fog (S08; was ZoneManager). Every region but the hold
 * starts unclaimed: its ground painted drained and darker, its pads hidden and
 * its camps asleep. A border stone at the blueprint's claim point names the
 * price, or what stands in the way, and the hero claims by standing on it.
 */
export class RegionManager {
  private views = new Map<RegionId, StoneView>()
  private fog!: Phaser.GameObjects.RenderTexture
  private brush!: Phaser.GameObjects.Image
  private explored = new FogMemory(WORLD.width, WORLD.height)
  private lastRevealX = -9999
  private lastRevealY = -9999
  /** 1 per claimed region, by `REGIONS` index. */
  private owned = new Uint8Array(REGIONS.length)
  private mask: Uint8Array | null = null
  claimedCount = 1
  /** Wall time of the last claim's own work (flags, mask, chunk invalidation); the repaint itself streams. */
  lastClaimMs = 0

  constructor(private scene: GameScene, depth: number) {
    this.owned[REGION_BY_ID.get('hold')!.index] = 1
    setClaimed(this.owned)
    this.buildFog(depth)
    stoneTextures(scene)
    for (const z of REGIONS) this.buildStone(z, depth - 2)
  }

  private buildFog(depth: number) {
    // Eighth resolution: fog is low-frequency, and even a quarter-res target
    // over the 10240x9216 frontier is a lot of GPU memory to ask a phone for.
    const w = Math.ceil(WORLD.width / FOG_SCALE)
    const h = Math.ceil(WORLD.height / FOG_SCALE)
    this.fog = this.scene.add.renderTexture(0, 0, w, h)
      .setOrigin(0, 0).setScale(FOG_SCALE).setDepth(depth).setAlpha(0.9)
    // Shared under FOG_KEY: the minimap and the atlas (S12) crop this same page,
    // so the chart never knows more, or less, than the world does.
    // A restart keeps the last run's page one generation longer under another
    // key, so a UI image still pointing at it never draws a freed texture.
    const tm = this.scene.textures
    if (tm.exists(FOG_KEY)) {
      if (tm.exists(`${FOG_KEY}_prev`)) tm.remove(`${FOG_KEY}_prev`)
      tm.renameTexture(FOG_KEY, `${FOG_KEY}_prev`)
    }
    this.fog.saveTexture(FOG_KEY)
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
    // POIs are seen when the fog clears round them (S14)
    this.scene?.pois?.revealAt(x, y)
  }

  fogJSON() { return this.explored.toJSON() }

  /** True when explored ground lies within `r` of (x, y) (S14: a POI is seen). */
  exploredNear(x: number, y: number, r: number): boolean {
    return this.explored.anyWithin(x, y, r)
  }

  forEachExplored(fn: (x: number, y: number) => void) {
    this.explored.forEachMarked(fn)
  }

  loadFog(encoded: string) {
    this.explored.load(encoded)
    this.explored.forEachMarked((x, y) => this.fog.erase(this.brush, x / FOG_SCALE, y / FOG_SCALE))
  }

  private buildStone(spec: RegionDef, depth: number) {
    const unclaimed = !this.claimed(spec.id)
    const { x: cx, y: cy } = spec.claim
    let stone: Phaser.GameObjects.Image | null = null
    if (spec.id !== 'hold') {
      // a landmark, not a prop: it stands a head taller than the hero
      stone = this.scene.add.image(cx, cy, 'claim_stone').setOrigin(0.5, 1 - 8 / 72).setScale(1.35).setDepth(cy)
      this.scene.culler.add(stone, cx, cy - 40, 64)
    }
    // The ring is the actual affordance: a marked patch of ground you can walk
    // onto. The frame above it is only a label.
    const marker = this.scene.add.graphics().setDepth(depth + 1).setVisible(false)

    const banner = this.scene.add.container(cx, cy).setDepth(LABEL_DEPTH)
    // The frame is sized in update() once the text has been measured: the name
    // plus its blurb runs well past a fixed box, and on a phone that box is
    // most of the screen anyway.
    const bg = this.scene.add.graphics()
    const frame = new SkinPanel(this.scene, 'hud', { alpha: 0.8 })
    const label = this.scene.add.text(0, -50, spec.name,
      textStyle({ voice: 'display', size: 17, colour: PAL.gold, align: 'center', wrap: BANNER_W - 28, shadow: true }))
      .setOrigin(0.5, 0)
    const blurb = this.scene.add.text(0, -40, spec.blurb,
      textStyle({ size: 13, weight: 'italic 500', colour: PAL.uiDim, align: 'center', wrap: BANNER_W - 28 }))
      .setOrigin(0.5, 0)
    const cost = this.scene.add.text(0, -30, '',
      textStyle({ voice: 'caps', size: 13, weight: '800', colour: PAL.uiText, align: 'center', wrap: BANNER_W - 28 }))
      .setOrigin(0.5, 0).setLineSpacing(2)
    blurb.setVisible(false)
    cost.setVisible(false)
    banner.add([bg, frame.img, label, blurb, cost])
    banner.setVisible(unclaimed)

    this.views.set(spec.id, { spec, cx, cy, stone, banner, bg, frame, label, blurb, cost, marker, dwell: 0 })
  }

  /** Draw the claim disc around the border stone, where the hero has to stand. */
  private drawMarker(v: StoneView, affordable: boolean, inside: boolean) {
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
  }

  /** Fit the frame inside the viewport, with a tether to the real claim ring. */
  private frameBanner(v: StoneView) {
    // Only the name floats over the stone now; the blurb and the cost are on
    // the dock. The frame floats a flag's height above its anchor so it clears
    // both the pole and the ring drawn on the ground around it.
    const lh = v.label.height
    const top = -POLE_H - 24 - lh
    v.label.setPosition(0, top + 8)
    const h = -top - POLE_H + 4
    const bw = Math.min(BANNER_W, Math.ceil(v.label.width) + 36)

    const cam = this.scene.cameras.main
    const view = cam.worldView
    const bands = this.scene.uiBands
    // -top is the banner's height above its anchor, so this keeps the frame
    // itself clear of the HUD rather than just its foot.
    // the bands are CSS pixels; the camera's zoom already carries the DPR
    const px = DPR / cam.zoom
    const minY = view.y + bands.top * px - top
    const maxY = view.bottom - bands.bottom * px
    const side = bw / 2 + 12 * px
    v.banner.x = Phaser.Math.Clamp(v.cx, view.left + side, view.right - side)
    v.banner.y = Phaser.Math.Clamp(v.cy, minY, Math.max(minY, maxY))

    v.bg.clear()
    // The banner can move to clear screen edges, but the stone and ring never
    // move. A diagonal tether keeps the callout unambiguously attached to it.
    const sideways = v.cx - v.banner.x
    const drop = v.cy - v.banner.y
    if (Math.hypot(sideways, drop) > 8) {
      v.bg.lineStyle(2, PAL.gilt, 0.55)
      v.bg.lineBetween(0, top + h, sideways, drop - 70)
    }
    v.frame.place(-bw / 2, top, bw, h)
  }

  private sheet: DockSheet | null = null
  private sheetUi: { blurb: StatLine; costs: CostChips; why: StatLine } | null = null

  /**
   * The stone's card on the dock (S09b): the "buy" panel. Collapsed, the
   * region's name and whether it can be claimed; expanded, its blurb, the cost
   * as chips against what you hold, and what still stands in the way. Paying
   * is still standing in the ring.
   */
  private dockStone(v: StoneView | null) {
    if (!v) { this.sheet?.hide(); return }
    if (!this.sheet || this.sheet.dead) {
      const ui = this.scene.scene.get('UI')
      if (!ui || !ui.sys.isActive()) return
      this.sheet = new DockSheet(ui, this.scene.uiBands)
      const blurb = new StatLine(ui, { italic: true, colour: PAL.uiDim })
      const costs = new CostChips(ui)
      const why = new StatLine(ui)
      this.sheet.add([...blurb.objects(), ...costs.objects(), ...why.objects()])
      this.sheetUi = { blurb, costs, why }
    }
    const { blurb, costs, why } = this.sheetUi!
    const check = this.canClaim(v.spec.id)
    const res = this.scene.res
    const chips = RESOURCE_ORDER.filter(k => v.spec.cost[k]).map(k => {
      const need = v.spec.cost[k] ?? 0
      const have = res.available(k)
      return { tex: `res_${k}`, have, need, short: have < need }
    })
    blurb.set(v.spec.blurb)
    costs.set(chips)
    const colour = check.ok ? PAL.good : check.reason === 'cost' ? PAL.uiDim : PAL.danger
    why.set(check.ok ? 'Step into the ring to claim it.' : check.why, colour)
    const rows: DockRow[] = [blurb]
    if (chips.length) rows.push(costs)
    rows.push(why)
    const p = this.scene.player
    this.sheet.focus = { x: (p.x + v.cx) / 2, y: (p.y + v.cy - 40) / 2 }
    this.sheet.layout({
      title: v.spec.name,
      level: check.ok ? 'Step into the ring to claim' : `Tier ${v.spec.tier} · ${check.reason === 'cost' ? 'not enough banked' : 'not yet'}`,
      levelColour: colour,
    }, rows)
  }

  /** For the harness: the stone's sheet, when it is up. */
  inspectDock() {
    const s = this.sheet
    if (!s || s.dead || !s.isShown) return null
    return { rect: { ...s.rect }, collapsed: s.collapsed, side: s.side, targets: s.targets(), fonts: s.fonts() }
  }

  /** Whether a region is claimed. Unknown ids read as claimed, so nothing hides behind a typo. */
  claimed(id: RegionId): boolean {
    const r = REGION_BY_ID.get(id)
    return r ? this.owned[r.index] === 1 : true
  }

  /** Whether the ground under a point is claimed, from the 32 px region raster. Off the map is not. */
  claimedAt(x: number, y: number): boolean {
    const r = raster()
    const i = r.cell(x, y)
    const k = i < 0 ? -1 : r.region[i]
    return k >= 0 && this.owned[k] === 1
  }

  /** One byte per raster cell, 1 where the region is claimed. Rebuilt after a claim; do not write to it. */
  claimMask(): Uint8Array {
    if (this.mask) return this.mask
    const reg = raster().region
    const m = new Uint8Array(reg.length)
    for (let i = 0; i < reg.length; i++) { const k = reg[i]; if (k >= 0 && this.owned[k]) m[i] = 1 }
    return (this.mask = m)
  }

  /** Where the hero has to stand to claim a region: the border stone. Also what the arrow aims at. */
  claimPoint(id: RegionId): { x: number; y: number } | null {
    const v = this.views.get(id)
    return v ? { x: v.cx, y: v.cy } : null
  }

  /** The region under a point, from the 32 px region raster. */
  regionAt(x: number, y: number): RegionDef | null {
    const r = raster()
    const i = r.cell(x, y)
    const k = i < 0 ? -1 : r.region[i]
    return k < 0 ? null : REGIONS[k]
  }

  /** The unclaimed region a point sits in, if any. Used to redirect guidance. */
  unclaimedAt(x: number, y: number): RegionDef | null {
    const r = this.regionAt(x, y)
    return r && !this.claimed(r.id) ? r : null
  }

  /**
   * Can the hero claim `id` now? Checked in order: the hall's tier, the
   * region it is claimed from, the camps that must burn first, then the price.
   */
  canClaim(id: RegionId): ClaimCheck {
    const spec = REGION_BY_ID.get(id)
    if (!spec || this.claimed(id)) return { ok: false, reason: null, why: 'Claimed' }
    if (this.scene.buildings.townHallLevel < spec.hall) {
      return { ok: false, reason: 'hall', why: `Needs a ${hallName(spec.hall)}` }
    }
    if (!this.claimed(spec.claim.from)) {
      return { ok: false, reason: 'adjacent', why: `Claim ${REGION_BY_ID.get(spec.claim.from)?.name ?? spec.claim.from} first` }
    }
    const standing = spec.requiresCamps?.find(c => !this.scene.camps.isBurned(c))
    if (standing) {
      return { ok: false, reason: 'camps', why: `Burn ${CAMPS.find(c => c.id === standing)?.name ?? standing} first` }
    }
    if (!this.scene.res.canAfford(spec.cost)) return { ok: false, reason: 'cost', why: 'Not enough yet' }
    return { ok: true, reason: null, why: 'Stand on the stone to claim' }
  }

  /**
   * Claim a region: its pads appear (subject to the hall), its camps wake (on
   * CampManager's next tick) and its chunks repaint in full colour. `silent`
   * (loading, the harness) skips the fanfare, the event and the bonus recompute.
   */
  claim(id: RegionId, silent = false) {
    const v = this.views.get(id)
    const spec = REGION_BY_ID.get(id)
    if (!v || !spec || this.claimed(id)) return
    const t0 = performance.now()
    this.owned[spec.index] = 1
    this.claimedCount++
    this.mask = null
    this.claimMask()
    setClaimed(this.owned)
    this.scene.terrain?.invalidate(claimRect(spec.index))
    this.scene.atlasBake?.invalidate(claimRect(spec.index))
    this.lastClaimMs = performance.now() - t0
    v.dwell = 0
    v.marker.clear()
    v.marker.setVisible(false)
    v.banner.setVisible(false)
    v.stone?.setTexture('claim_stone_lit')
    if (silent) return
    this.scene.fx.popup(v.cx, v.cy - 90, `${spec.name} claimed`, PAL.gold, 26)
    this.scene.fx.ring(v.cx, v.cy, 340, PAL.gold, 0.9)
    this.scene.fx.flash(0xffe9b0, 0.22)
    this.scene.audio.play('quest', 0.8)
    this.scene.bus.emit('region:claimed', { id })
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

    const here = this.regionAt(p.x, p.y)
    let docked: StoneView | null = null
    let dockedD = STONE_DOCK_RANGE
    for (const v of this.views.values()) {
      if (this.claimed(v.spec.id)) continue
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

      // the price once it is the only thing left in the way; before that, what is
      const check = this.canClaim(v.spec.id)
      const affordable = check.ok
      const costStr = RESOURCE_ORDER.filter(k => v.spec.cost[k])
        .map(k => `${short(v.spec.cost[k] ?? 0)} ${k}`).join('   ')
      setColour(v.cost.setText(
        check.ok || check.reason === 'cost' ? `${costStr}\n${check.why}` : check.why,
      ), check.ok ? PAL.good : check.reason === 'cost' ? PAL.uiDim : PAL.danger)
      this.frameBanner(v)
      if (d < dockedD) { docked = v; dockedD = d }

      const inside = d < CLAIM_RADIUS
      if (inside && affordable) {
        v.dwell += dt
        if (v.dwell >= CLAIM_DWELL) {
          this.scene.res.spend(v.spec.cost)
          this.claim(v.spec.id)
          continue
        }
      } else v.dwell = 0
      this.drawMarker(v, affordable, inside)
    }

    this.dockStone(docked)

    // soft barrier: nudge the hero back out of land they have not claimed
    if (here && !this.claimed(here.id)) {
      const [tx, ty] = this.exitToward(here, p.x, p.y)
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
      if (!this.claimedAt(qx + (qx - x) / k * BARRIER_PROBE, qy + (qy - y) / k * BARRIER_PROBE)) continue
      best = d; bx = qx + (qx - x) / k * BARRIER_PROBE; by = qy + (qy - y) / k * BARRIER_PROBE
    }
    return [bx, by]
  }

  revealAll() {
    this.fog.clear()
  }

  toJSON(): RegionId[] {
    return REGIONS.filter(r => this.owned[r.index]).map(r => r.id)
  }

  load(ids: RegionId[]) {
    for (const id of ids) this.claim(id, true)
  }
}
