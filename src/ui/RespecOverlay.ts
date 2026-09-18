import Phaser from 'phaser'
import { Overlay } from './Overlay'
import { PAL, CSS } from '../config/palette'
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
    this.heading = this.text(22, PAL.gold, true)
    this.sub = this.text(11, PAL.uiDim)
    this.empty = this.text(12, PAL.uiDim)
    this.costLabel = this.text(10, PAL.uiDim)
    for (let i = 0; i < UPGRADES.length; i++) this.picks.push(this.text(11, PAL.uiText, false, 0, 0.5))
    for (let i = 0; i < RESOURCE_ORDER.length; i++) this.prices.push(this.text(13, PAL.uiText, true))
    this.backBtn = this.button('BACK', () => this.scene.events.emit('closeScreen'), PAL.heroTrim, 13)
    this.confirmBtn = this.button('RESPEC', () => this.confirm(), PAL.gold, 13)
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
    const w = Math.min(c ? 600 : 440, this.W - 28)
    const headH = c ? 52 : 70
    const rowH = c ? 18 : 20
    const costH = c ? 44 : 56
    const footH = c ? 42 : 54
    const h = Math.min(this.H - 20, headH + perCol * rowH + costH + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    const cx = this.W / 2
    this.drawCard(x, y, w, h, PAL.gold)

    this.heading.setText('RESPEC').setPosition(cx, y + (c ? 24 : 32))
    this.fitText(this.heading, c ? 18 : 22, w - 36)
    this.sub
      .setText(n > 0
        ? `Unmake all ${n} boons and choose every one again`
        : 'Nothing to unmake yet — boons come from levelling')
      .setPosition(cx, y + (c ? 40 : 52))
    this.fitText(this.sub, c ? 10 : 11, w - 28)

    // ---- what you would be giving back ----------------------------------
    const padX = c ? 16 : 24
    const gap = 12
    const colW = (w - padX * 2 - gap * (cols - 1)) / cols
    const top = y + headH
    const avail = h - headH - costH - footH
    const pitch = Math.min(rowH, avail / perCol)

    this.panel.clear()
    this.empty.setVisible(taken.length === 0)
    if (taken.length === 0) {
      this.empty.setFontSize(c ? 11 : 12).setText('No boons taken.').setPosition(cx, top + avail / 2)
    }
    for (let i = 0; i < this.picks.length; i++) {
      const t = this.picks[i]
      const def = taken[i]
      t.setVisible(!!def)
      if (!def) continue
      const col = Math.floor(i / perCol)
      const bx = x + padX + col * (colW + gap)
      const by = top + (i % perCol) * pitch + pitch / 2
      this.panel.fillStyle(def.colour, 0.9)
      this.panel.fillRect(bx, by - 3, 3, 6)
      t.setFontSize(pitch < 17 ? 9 : c ? 10 : 11)
        .setText(`${def.name}  ×${lv.stacks(def.id)}`)
        .setColor(CSS(PAL.uiText)).setAlpha(0.85)
        .setPosition(bx + 9, by)
    }

    // ---- the bill --------------------------------------------------------
    // Measured down from the top of its own band, so the label always keeps
    // clear of the last row of picks however few picks there are.
    const costTop = y + h - footH - costH
    const costY = costTop + (c ? 27 : 34)
    this.costLabel.setFontSize(c ? 9 : 10)
      .setText(n > 0 ? 'THE SMITHS WANT' : '')
      .setPosition(cx, costTop + (c ? 11 : 14))

    const shown: ResourceType[] = RESOURCE_ORDER.filter(k => (cost[k] ?? 0) > 0)
    for (let i = shown.length; i < this.prices.length; i++) this.prices[i].setVisible(false)

    // A deep rebuild bills in five currencies at once, which is a long line on
    // a phone: measure the whole row and shrink it until it fits the card.
    const spacing = c ? 12 : 18
    const widths: number[] = []
    let size = c ? 11 : 13
    let rowW = 0
    for (;;) {
      widths.length = 0
      rowW = spacing * Math.max(0, shown.length - 1)
      for (let i = 0; i < shown.length; i++) {
        const k = shown[i]
        const t = this.prices[i].setVisible(true).setFontSize(size)
        t.setText(`${short(cost[k] ?? 0)} ${k}`)
          .setColor(CSS(this.game.res.available(k) >= (cost[k] ?? 0) ? PAL[k] : PAL.danger))
        widths.push(t.width)
        rowW += t.width
      }
      if (rowW <= w - 28 || size <= 8) break
      size--
    }
    let px = cx - rowW / 2
    for (let i = 0; i < shown.length; i++) {
      this.prices[i].setPosition(px + widths[i] / 2, costY)
      px += widths[i] + spacing
    }

    // ---- buttons ---------------------------------------------------------
    const bw = Math.min(200, (w - padX * 2 - 12) / 2)
    const by = y + h - (c ? 20 : 28)
    const bh = c ? 28 : 36
    this.backBtn.place(cx - bw / 2 - 6, by, bw, bh)
    this.confirmBtn.setLabel(
      this.confirming ? 'TAP AGAIN' : n === 0 ? 'NO BOONS' : affordable ? `RESPEC — ${n} BACK` : 'CANNOT AFFORD',
    )
    this.confirmBtn.place(cx + bw / 2 + 6, by, bw, bh)
    this.confirmBtn.setEnabled(affordable)
  }
}
