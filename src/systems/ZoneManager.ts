import Phaser from 'phaser'
import { ZONES, type ZoneId, type ZoneSpec } from '../config/map'
import { WORLD } from '../config/balance'
import { PAL, CSS } from '../config/palette'
import { RESOURCE_ORDER } from '../core/types'
import { clamp, short } from '../core/math'
import type { GameScene } from '../scenes/GameScene'

/** World px per fog texel. */
const FOG_SCALE = 4
/** Banner frame width in world units; also its wrap width. */
const BANNER_W = 248

interface ZoneView {
  spec: ZoneSpec
  overlay: Phaser.GameObjects.Rectangle
  banner: Phaser.GameObjects.Container
  bg: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  cost: Phaser.GameObjects.Text
  post: Phaser.GameObjects.Graphics
  unlocked: boolean
}

/**
 * Territory + fog. Locked ground is visibly walled off and named, so the map
 * always advertises where the next chunk of progress is.
 */
export class ZoneManager {
  private views = new Map<ZoneId, ZoneView>()
  private fog!: Phaser.GameObjects.RenderTexture
  private brush!: Phaser.GameObjects.Image
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
      .setOrigin(0, 0).setScale(FOG_SCALE).setDepth(depth).setAlpha(0.62)
    this.fog.fill(0x050a14, 1)
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
        this.fog.erase(this.brush, (x + rx) / FOG_SCALE, (y + ry) / FOG_SCALE)
      }
    }
    this.fog.erase(this.brush, x / FOG_SCALE, y / FOG_SCALE)
  }

  private buildZone(spec: ZoneSpec, depth: number) {
    const unlocked = !!spec.startsUnlocked
    const overlay = this.scene.add
      .rectangle(spec.x + spec.w / 2, spec.y + spec.h / 2, spec.w, spec.h, spec.tint, unlocked ? 0 : 0.45)
      .setDepth(depth).setVisible(!unlocked)

    const post = this.scene.add.graphics().setDepth(depth + 1)
    if (!unlocked) this.drawBoundary(post, spec)

    const banner = this.scene.add.container(spec.bannerX, spec.bannerY).setDepth(depth + 2)
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
    const flagPole = this.scene.add.graphics()
    flagPole.fillStyle(0x4a3320, 1); flagPole.fillRect(-2, 0, 4, 34)
    flagPole.fillStyle(PAL.gold, 1)
    flagPole.fillTriangle(2, 2, 26, 9, 2, 17)
    banner.add([bg, label, cost, flagPole])
    banner.setVisible(!unlocked)

    this.views.set(spec.id, { spec, overlay, banner, bg, label, cost, post, unlocked })
  }


  /**
   * Fit the frame around whatever the label wrapped to, then keep the whole
   * banner inside the camera. A banner near the edge of the view used to run
   * off the side of the screen, which on a phone hid the claim prompt itself.
   */
  private frameBanner(v: ZoneView) {
    const lh = v.label.height
    const ch = v.cost.height
    const top = -46 - lh - ch
    v.label.setPosition(0, top + 10)
    v.cost.setPosition(0, top + 14 + lh)
    const h = -top + 4

    v.bg.clear()
    v.bg.fillStyle(PAL.uiBg, 0.9)
    v.bg.fillRoundedRect(-BANNER_W / 2, top, BANNER_W, h, 8)
    v.bg.lineStyle(2, PAL.gold, 1)
    v.bg.strokeRoundedRect(-BANNER_W / 2, top, BANNER_W, h, 8)

    const cam = this.scene.cameras.main
    const view = cam.worldView
    const bands = this.scene.uiBands
    const halfW = BANNER_W / 2 + 10
    // -top is the banner's height above its anchor, so this keeps the frame
    // itself clear of the HUD rather than just the flag pole at its foot.
    const minY = view.y + bands.top / cam.zoom - top
    const maxY = view.bottom - bands.bottom / cam.zoom
    v.banner.x = Phaser.Math.Clamp(
      v.spec.bannerX, view.x + halfW, Math.max(view.x + halfW, view.right - halfW),
    )
    v.banner.y = Phaser.Math.Clamp(v.spec.bannerY, minY, Math.max(minY, maxY))
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

  zoneAt(x: number, y: number): ZoneView | null {
    for (const v of this.views.values()) {
      const s = v.spec
      if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return v
    }
    return null
  }

  canUnlock(v: ZoneView) {
    return this.scene.buildings.townHallLevel >= v.spec.requiresTownHall &&
      this.scene.res.canAfford(v.spec.cost)
  }

  unlock(id: ZoneId, silent = false) {
    const v = this.views.get(id)
    if (!v || v.unlocked) return
    v.unlocked = true
    this.unlockedCount++
    v.post.clear()
    v.banner.setVisible(false)
    if (silent) {
      v.overlay.setVisible(false)
      return
    }
    this.scene.tweens.add({
      targets: v.overlay, alpha: 0, duration: 700, ease: 'Cubic.easeOut',
      onComplete: () => v.overlay.setVisible(false),
    })
    this.scene.fx.popup(v.spec.bannerX, v.spec.bannerY - 70, `${v.spec.name.toUpperCase()} CLAIMED`, PAL.gold, 26)
    this.scene.fx.ring(v.spec.bannerX, v.spec.bannerY, 340, PAL.gold, 0.9)
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
      this.fog.erase(this.brush, p.x / FOG_SCALE, p.y / FOG_SCALE)
    }

    const here = this.zoneAt(p.x, p.y)
    for (const v of this.views.values()) {
      if (v.unlocked) continue
      const near = Math.hypot(p.x - v.spec.bannerX, p.y - v.spec.bannerY) < 460
      v.banner.setVisible(near)
      if (!near) continue

      const affordable = this.canUnlock(v)
      const needHall = this.scene.buildings.townHallLevel < v.spec.requiresTownHall
      const costStr = RESOURCE_ORDER.filter(k => v.spec.cost[k])
        .map(k => `${short(v.spec.cost[k] ?? 0)} ${k}`).join('   ')
      v.cost.setText(
        needHall ? `COMMAND HALL LV.${v.spec.requiresTownHall} REQUIRED`
          : `${costStr}\n${affordable ? 'STAND HERE TO CLAIM' : 'not enough'}`,
      ).setColor(affordable ? CSS(PAL.good) : needHall ? CSS(PAL.danger) : CSS(PAL.uiDim))
      v.label.setText(`${v.spec.name.toUpperCase()}  ·  ${v.spec.blurb}`)
      this.frameBanner(v)

      const onBanner = Math.hypot(p.x - v.spec.bannerX, p.y - v.spec.bannerY) < 70
      if (onBanner && affordable) {
        this.scene.res.spend(v.spec.cost)
        this.unlock(v.spec.id)
      }
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
