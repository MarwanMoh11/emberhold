import Phaser from 'phaser'
import { PAL, CSS } from '../config/palette'
import { short } from '../core/math'
import type { Building } from '../entities/Building'
import { wantsTouchTargets } from '../core/device'

interface Row {
  icon: Phaser.GameObjects.Image
  barBg: Phaser.GameObjects.Rectangle
  barFill: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
}

const W = 268
const ROW_H = 20

/**
 * The world-space card that appears over whatever pad you are standing in.
 * Deliberately not a menu: it only reports state, the deposit happens by
 * standing there.
 */
export class BuildingPanel {
  private root: Phaser.GameObjects.Container
  private bg: Phaser.GameObjects.Graphics
  private title: Phaser.GameObjects.Text
  private sub: Phaser.GameObjects.Text
  private hint: Phaser.GameObjects.Text
  private rows: Row[] = []
  private shown = false

  private btnG: Phaser.GameObjects.Graphics
  private btnText: Phaser.GameObjects.Text
  private btnZone: Phaser.GameObjects.Zone
  private btnHover = false
  private current: Building | null = null
  /** Height of the card as last drawn, for the hit test below. */
  private cardH = 0
  /** Counter-zoom applied to the card, so hit tests match what is drawn. */
  private cardScale = 1

  constructor(private scene: Phaser.Scene, private onUpgrade: (b: Building) => void) {
    this.root = scene.add.container(0, 0).setDepth(900_000).setVisible(false)
    this.bg = scene.add.graphics()
    this.title = scene.add.text(0, 0, '', {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '15px',
      color: CSS(PAL.uiText), fontStyle: 'bold',
    }).setOrigin(0.5, 0)
    this.sub = scene.add.text(0, 0, '', {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '11px',
      color: CSS(PAL.uiDim), align: 'center', wordWrap: { width: W - 26 },
    }).setOrigin(0.5, 0)
    this.hint = scene.add.text(0, 0, '', {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '11px',
      color: CSS(PAL.gold), align: 'center', wordWrap: { width: W - 26 },
    }).setOrigin(0.5, 0)
    this.root.add([this.bg, this.title, this.sub, this.hint])

    for (let i = 0; i < 4; i++) {
      const icon = scene.add.image(0, 0, 'res_coins').setScale(0.72).setVisible(false)
      const barBg = scene.add.rectangle(0, 0, W - 76, 9, PAL.uiBg, 0.9).setOrigin(0, 0.5).setVisible(false)
      const barFill = scene.add.rectangle(0, 0, 1, 9, PAL.gold, 1).setOrigin(0, 0.5).setVisible(false)
      const label = scene.add.text(0, 0, '', {
        fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '11px', color: CSS(PAL.uiText),
      }).setOrigin(1, 0.5).setVisible(false)
      this.root.add([barBg, barFill, icon, label])
      this.rows.push({ icon, barBg, barFill, label })
    }

    this.btnG = scene.add.graphics()
    this.btnText = scene.add.text(0, 0, 'UPGRADE', {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '13px',
      color: CSS(PAL.uiText), fontStyle: 'bold',
    }).setOrigin(0.5)
    this.btnZone = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true })
    this.btnZone.on('pointerover', () => { this.btnHover = true })
    this.btnZone.on('pointerout', () => { this.btnHover = false })
    this.btnZone.on('pointerdown', () => { if (this.current) this.onUpgrade(this.current) })
    this.root.add([this.btnG, this.btnText, this.btnZone])
  }

  hide() {
    if (!this.shown) return
    this.shown = false
    this.current = null
    this.btnZone.setSize(1, 1)
    this.root.setVisible(false)
  }

  get isShown() { return this.shown }

  /**
   * Does this world point land on the card? The movement stick asks before it
   * claims a touch: a thumb that misses UPGRADE should do nothing, not walk
   * the hero off the pad and cancel the upgrade it was reaching for.
   */
  containsWorldPoint(x: number, y: number) {
    if (!this.shown) return false
    const k = this.cardScale
    return x >= this.root.x - (W / 2) * k && x <= this.root.x + (W / 2) * k
      && y >= this.root.y && y <= this.root.y + this.cardH * k
  }


  show(
    b: Building, title: string, sub: string,
    rows: { tex: string; have: number; need: number }[], hint: string,
    showButton = false, committed = false, affordable = false,
  ) {
    this.shown = true
    this.current = b
    this.root.setVisible(true)

    this.title.setText(title)
    this.sub.setText(sub)
    this.hint.setText(hint)

    const n = Math.min(rows.length, this.rows.length)
    let y = 26
    this.title.setPosition(0, 8)
    this.sub.setPosition(0, y)
    y += Math.max(14, this.sub.height) + 6

    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i]
      if (i >= n) {
        r.icon.setVisible(false); r.barBg.setVisible(false)
        r.barFill.setVisible(false); r.label.setVisible(false)
        continue
      }
      const d = rows[i]
      const cy = y + ROW_H / 2
      const barX = -W / 2 + 34
      const barW = W - 76 - 34
      r.icon.setVisible(true).setTexture(d.tex).setPosition(-W / 2 + 20, cy)
      r.barBg.setVisible(true).setPosition(barX, cy).setSize(barW, 9)
      const p = d.need > 0 ? Math.min(1, d.have / d.need) : 1
      r.barFill.setVisible(true).setPosition(barX, cy).setSize(Math.max(1, barW * p), 9)
      r.barFill.setFillStyle(p >= 1 ? PAL.good : PAL.gold, 1)
      r.label.setVisible(true).setPosition(W / 2 - 12, cy)
        .setText(`${short(d.have)}/${short(d.need)}`)
        .setColor(p >= 1 ? CSS(PAL.good) : CSS(PAL.uiText))
      y += ROW_H
    }

    if (n > 0) y += 4
    this.hint.setPosition(0, y)
    y += Math.max(14, this.hint.height) + 6

    if (showButton) {
      // A 30px-tall button is about 5mm on a phone — far under a thumb. Missing
      // it landed on the card background, which is not a control, so the move
      // stick popped up instead and the press looked like it did nothing.
      const fat = wantsTouchTargets(this.scene.scale.width)
      const bw = fat ? 200 : 148
      const bh = fat ? 46 : 30
      const by = y + bh / 2
      // Breathe when the cost is already banked. "I have the wood and nothing
      // is happening" is the single most confusing moment on a build site, and
      // a button that visibly wants pressing answers it without a tutorial.
      const ready = affordable && !committed
      const pulse = ready ? 0.55 + Math.abs(Math.sin(this.scene.time.now * 0.004)) * 0.45 : 1
      this.btnG.clear()
      this.btnG.fillStyle(committed ? PAL.good : this.btnHover ? PAL.uiEdge : PAL.uiPanel, 1)
      this.btnG.fillRoundedRect(-bw / 2, y, bw, bh, 7)
      this.btnG.lineStyle(ready ? 3 : 2, committed ? PAL.good : PAL.gold, ready ? pulse : 1)
      this.btnG.strokeRoundedRect(-bw / 2, y, bw, bh, 7)
      this.btnG.setVisible(true)
      this.btnText.setVisible(true).setText(committed ? 'UPGRADING' : 'UPGRADE')
        .setPosition(0, by).setFontSize(fat ? 16 : 13)
      // Local coordinates: btnZone is a child of `root`, so setting it to the
      // container's own world position offset it twice and left the tap target
      // far from the drawn button. The button simply never worked.
      // The tap target is deliberately larger than the drawn button: a near
      // miss should still press it rather than grab the movement stick.
      const slop = fat ? 22 : 6
      this.btnZone.setSize(bw + slop * 2, bh + slop).setPosition(0, by)
      y += bh + 6
    } else {
      this.btnG.clear().setVisible(false)
      this.btnText.setVisible(false)
      this.btnZone.setSize(1, 1)
    }

    const h = y + 6
    this.cardH = h

    this.bg.clear()
    this.bg.fillStyle(PAL.uiBg, 0.92)
    this.bg.fillRoundedRect(-W / 2, 0, W, h, 8)
    this.bg.lineStyle(2, PAL.uiEdge, 1)
    this.bg.strokeRoundedRect(-W / 2, 0, W, h, 8)
    this.bg.fillStyle(PAL.gold, 0.9)
    this.bg.fillRoundedRect(-W / 2 + 10, 3, W - 20, 2, 1)
    // little pointer down at the building
    this.bg.fillStyle(PAL.uiBg, 0.92)
    this.bg.fillTriangle(-8, h - 1, 8, h - 1, 0, h + 9)

    // Keep the card on screen. It normally floats above the structure, but a
    // pad near the top or bottom of the frame pushed half the card — UPGRADE
    // button included — off the edge. Clamp to the playfield *between* the
    // fixed HUD bands, not to the raw camera edges, or the card lands on top
    // of the objective banner and neither is readable.
    const cam = this.scene.cameras.main
    const view = cam.worldView

    // Everything above is laid out in world units, but the camera zooms — at
    // 0.72 on a phone a 46-unit button is only 33 real pixels, which is how a
    // "thumb-sized" target ended up thumb-sized in name only. Counter-scaling
    // the card by 1/zoom makes every number here mean screen pixels.
    const k = 1 / cam.zoom
    this.cardScale = k
    this.root.setScale(k)

    const bands = (this.scene as unknown as { uiBands: { top: number; bottom: number } }).uiBands
    const topBand = (bands?.top ?? 104) * k
    const bottomBand = (bands?.bottom ?? 104) * k
    const sideBand = (W / 2 + 10) * k
    const cardH = h * k
    const topY = b.y - b.def.h - 52 * k - cardH
    const minY = view.y + topBand
    const maxY = Math.max(minY, view.bottom - bottomBand - cardH)
    const minX = view.x + sideBand
    const x = Phaser.Math.Clamp(b.x, minX, Math.max(minX, view.right - sideBand))
    this.root.setPosition(Math.round(x), Math.round(Phaser.Math.Clamp(topY, minY, maxY)))
    if (showButton) this.btnZone.setPosition(0, this.btnText.y)
  }

  destroy() { this.root.destroy() }
}
