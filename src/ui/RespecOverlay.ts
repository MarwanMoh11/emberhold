import Phaser from 'phaser'
import { Overlay } from './Overlay'
import { PAL } from '../config/palette'
import { UPGRADE_ICON } from '../art/icons'
import { UPGRADES } from '../config/upgrades'
import { RESOURCE_ORDER, type ResourceType } from '../core/types'
import { short } from '../core/math'
import type { GameScene } from '../scenes/GameScene'

/**
 * Buy your way out of a bad build.
 *
 * The level-up picks stack up to eight deep and never come off, across a save
 * that spans weeks — so three unlucky early choices used to be permanent. This
 * unmakes all of them and hands the picks straight back, and charges for it in
 * the currencies the settlement actually banks. The price is per pick undone
 * and quadratic in coins: a second thought is cheap, a tenth one is a project.
 */
export class RespecOverlay extends Overlay {
  private built = false
  private heading!: Phaser.GameObjects.Text
  private sub!: Phaser.GameObjects.Text
  private empty!: Phaser.GameObjects.Text
  private costLabel!: Phaser.GameObjects.Text
  private panel!: Phaser.GameObjects.Graphics
  private picks: Phaser.GameObjects.Text[] = []
  private pickIcons: Phaser.GameObjects.Image[] = []
  private priceIcons: Phaser.GameObjects.Image[] = []
  private prices: Phaser.GameObjects.Text[] = []
  private confirmBtn!: ReturnType<Overlay['button']>
  private backBtn!: ReturnType<Overlay['button']>
  private confirming = false

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_160_000)
  }

  private ensure() {
    if (this.built) return
    this.built = true
    this.panel = this.gfx()
    this.heading = this.text(26, PAL.uiText, true)
    this.sub = this.text(12, PAL.uiDim)
    this.sub.setFontStyle('italic 500')
    this.empty = this.text(13, PAL.uiDim)
    this.empty.setFontStyle('italic 500')
    this.costLabel = this.text(11, PAL.uiDim, true, 0.5, 0.5, 'caps')
    for (let i = 0; i < UPGRADES.length; i++) {
      const icon = this.scene.add.image(0, 0, 'ico_blade').setScrollFactor(0)
      this.root.add(icon)
      this.pickIcons.push(icon)
      this.picks.push(this.text(12, PAL.uiText, false, 0, 0.5))
    }
    for (let i = 0; i < RESOURCE_ORDER.length; i++) {
      const icon = this.scene.add.image(0, 0, 'res_coins').setScrollFactor(0)
      this.root.add(icon)
      this.priceIcons.push(icon)
      this.prices.push(this.text(14, PAL.uiText, true, 0, 0.5))
    }
    this.backBtn = this.button('Back', () => this.scene.events.emit('closeScreen'), 'plain', 14)
    this.confirmBtn = this.button('Respec', () => this.confirm(), 'danger', 14)
  }

  show() { this.ensure(); this.confirming = false; super.show() }
  hide() { this.confirming = false; super.hide() }

  /**
   * Two taps, like the wipe button: the bill is large and the picks vanish the
   * instant it goes through.
   */
  private confirm() {
    const lv = this.game.levels
    if (!lv.canRespec()) return
    if (!this.confirming) {
      this.confirming = true
      this.scene.time.delayedCall(2800, () => { if (this.confirming) { this.confirming = false; this.layout() } })
      this.layout()
      return
    }
    this.confirming = false
    const n = lv.respec()
    if (n <= 0) { this.layout(); return }
    this.scene.events.emit('respecDone', n)
  }

  protected layout() {
    if (!this.built) return
    const c = this.compact
    const lv = this.game.levels
    const taken = UPGRADES.filter(u => lv.stacks(u.id) > 0)
    const n = lv.pickCount
    const cost = lv.respecCost()
    const affordable = lv.canRespec()

    const cols = c ? 3 : 2
    const perCol = Math.max(1, Math.ceil(Math.max(taken.length, 1) / cols))
    const w = Math.min(c ? 620 : 460, this.W - 24)
    const headH = c ? 58 : 84
    const rowH = c ? 20 : 24
    const costH = c ? 48 : 64
    const footH = c ? 46 : 60
    const h = Math.min(this.H - 16, headH + perCol * rowH + costH + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    const cx = this.W / 2
    this.drawCard(x, y, w, h, PAL.wax)

    this.heading.setText('Respec').setPosition(cx, y + (c ? 25 : 36))
    this.fitText(this.heading, c ? 22 : 28, w - 44)
    this.sub
      .setText(n > 0
        ? `Unmake all ${n} boons and choose every one again`
        : 'Nothing to unmake yet — boons come from levelling')
      .setPosition(cx, y + (c ? 44 : 60))
    this.fitText(this.sub, c ? 11 : 13, w - 40)

    // ---- what you would be giving back ----------------------------------
    const padX = c ? 22 : 30
    const gap = 14
    const colW = (w - padX * 2 - gap * (cols - 1)) / cols
    const top = y + headH
    const avail = h - headH - costH - footH
    const pitch = Math.min(rowH, avail / perCol)

    this.panel.clear()
    this.empty.setVisible(taken.length === 0)
    if (taken.length === 0) {
      this.empty.setFontSize(c ? 12 : 13).setText('No boons taken.').setPosition(cx, top + avail / 2)
    }
    for (let i = 0; i < this.picks.length; i++) {
      const t = this.picks[i]
      const icon = this.pickIcons[i]
      const def = taken[i]
      t.setVisible(!!def)
      icon.setVisible(!!def)
      if (!def) continue
      const col = Math.floor(i / perCol)
      const bx = x + padX + col * (colW + gap)
      const by = top + (i % perCol) * pitch + pitch / 2
      const is = Math.min(20, pitch - 2)
      icon.setTexture(UPGRADE_ICON[def.id]).setDisplaySize(is, is).setPosition(bx + is / 2, by)
      t.setFontSize(pitch < 19 ? 10 : c ? 11 : 13)
        .setText(`${def.name}  ×${lv.stacks(def.id)}`)
        .setPosition(bx + is + 7, by)
    }

    // ---- the bill --------------------------------------------------------
    // Measured down from the top of its own band, so the label always keeps
    // clear of the last row of picks however few picks there are.
    const costTop = y + h - footH - costH
    this.panel.lineStyle(1, 0x3a2616, 0.3)
    this.panel.lineBetween(x + padX, costTop + 2, x + w - padX, costTop + 2)
    const costY = costTop + (c ? 30 : 40)
    this.costLabel.setFontSize(c ? 10 : 12)
      .setText(n > 0 ? 'The smiths want' : '')
      .setPosition(cx, costTop + (c ? 13 : 17))

    const shown: ResourceType[] = RESOURCE_ORDER.filter(k => (cost[k] ?? 0) > 0)
    for (let i = shown.length; i < this.prices.length; i++) {
      this.prices[i].setVisible(false)
      this.priceIcons[i].setVisible(false)
    }

    // A deep rebuild bills in five currencies at once, which is a long line on
    // a phone: measure the whole row and shrink it until it fits the card.
    const spacing = c ? 14 : 20
    const iconW = c ? 16 : 20
    const widths: number[] = []
    let size = c ? 12 : 15
    let rowW = 0
    for (;;) {
      widths.length = 0
      rowW = spacing * Math.max(0, shown.length - 1)
      for (let i = 0; i < shown.length; i++) {
        const k = shown[i]
        const t = this.prices[i].setVisible(true).setFontSize(size)
        t.setText(short(cost[k] ?? 0))
        this.ink(t, this.game.res.available(k) >= (cost[k] ?? 0) ? PAL.uiText : PAL.danger)
        widths.push(iconW + 4 + t.width)
        rowW += iconW + 4 + t.width
      }
      if (rowW <= w - 40 || size <= 8) break
      size--
    }
    let px = cx - rowW / 2
    for (let i = 0; i < shown.length; i++) {
      this.priceIcons[i].setVisible(true).setTexture(`ui_res_${shown[i]}`)
        .setDisplaySize(iconW, iconW).setPosition(px + iconW / 2, costY)
      this.prices[i].setPosition(px + iconW + 4, costY)
      px += widths[i] + spacing
    }

    // ---- buttons ---------------------------------------------------------
    const bw = Math.min(200, (w - padX * 2 - 12) / 2)
    const by = y + h - (c ? 23 : 33)
    const bh = c ? 28 : 36
    this.backBtn.place(cx - bw / 2 - 6, by, bw, bh)
    this.confirmBtn.setLabel(
      this.confirming ? 'Tap again' : n === 0 ? 'No boons' : affordable ? `Respec — ${n} back` : 'Cannot afford',
    )
    this.confirmBtn.place(cx + bw / 2 + 6, by, bw, bh)
    this.confirmBtn.setEnabled(affordable)
  }
}
