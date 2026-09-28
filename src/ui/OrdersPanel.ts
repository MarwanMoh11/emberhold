import Phaser from 'phaser'
import { PAL } from '../config/palette'
import type { BuildingKey } from '../config/buildings'
import { IS_TOUCH, wantsTouchTargets } from '../core/device'
import { COMPANIES, ORDERS, type Company, type Order } from '../systems/companies'
import type { GameScene } from '../scenes/GameScene'
import { armyLook, ordersRows, type ArmyLook } from './ordersMath'
import { PlateButton, SkinPanel } from './skin'
import { screen, textStyle } from './theme'

/** Over the HUD and the minimap, under the modals. */
const DEPTH = 1_000_030

/** The building that musters each company. */
const MUSTER: Record<Company, BuildingKey> = { infantry: 'barracks', archers: 'archeryRange', riders: 'stable' }
const NAME: Record<Company, string> = { infantry: 'Infantry', archers: 'Archers', riders: 'Riders' }
const CHIP: Record<Order, string> = { defend: 'Defend', follow: 'Follow', hold: 'Hold' }

interface Row {
  company: Company
  name: Phaser.GameObjects.Text
  count: Phaser.GameObjects.Text
  /** one per order, in `ORDERS` order */
  chips: PlateButton[]
}

/**
 * R6b: the army button's drop-down. One row per company that has soldiers or
 * a muster building standing: its name, its head count, and a chip for each
 * order, the lit one being the order it has. Hold plants the banner at the
 * hero (again, if it already holds), so the banner can be moved.
 *
 * It does not pause the game. While it is open a sheet of glass over the rest
 * of the screen takes the next tap outside it and closes it, so that tap
 * neither walks the hero nor fires an ability.
 */
export class OrdersPanel {
  open = false
  private glass: SkinPanel
  private catcher: Phaser.GameObjects.Zone
  private head: Phaser.GameObjects.Text
  private keyHint: Phaser.GameObjects.Text
  private empty: Phaser.GameObjects.Text
  private rows: Row[]
  /** the glass's rectangle, for telling a tap on it from a tap outside */
  private box = new Phaser.Geom.Rectangle(0, 0, 0, 0)
  private shownRows: Company[] = []
  /** `companies()` is asked every frame by the HUD; the muster check runs at most this often, ms */
  private listAt = -Infinity
  private list: Company[] = []

  constructor(private ui: Phaser.Scene, private game: GameScene) {
    const text = (size: number, colour: number, weight = '700', ox = 0, voice: 'ui' | 'caps' = 'ui') =>
      ui.add.text(0, 0, '', textStyle({ voice, size, weight, colour })).setOrigin(ox, 0.5)
        .setScrollFactor(0).setDepth(DEPTH + 2).setVisible(false)

    this.catcher = ui.add.zone(0, 0, 10, 10).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH)
      .setInteractive()
    this.catcher.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // the pointer is in canvas pixels; the HUD is laid out in CSS pixels
      const at = ui.cameras.main.getWorldPoint(p.x, p.y)
      if (!this.box.contains(at.x, at.y)) this.hide()
    })
    this.catcher.setVisible(false).disableInteractive()

    this.glass = new SkinPanel(ui, 'hud', { alpha: 0.72 }).setScrollFactor(0).setDepth(DEPTH + 1).setVisible(false)
    this.head = text(11, PAL.uiDim, '800', 0, 'caps').setText('Orders')
    this.keyHint = text(10, PAL.uiDim, '500', 1).setText('H  ·  cycle all')
    this.empty = text(12, PAL.uiDim, 'italic 500').setText('No soldiers yet  ·  build a barracks')

    this.rows = COMPANIES.map(company => ({
      company,
      name: text(13, PAL.bone, '800').setText(NAME[company]),
      count: text(11, PAL.uiDim, '500'),
      chips: ORDERS.map(o => new PlateButton(ui, { label: CHIP[o], onClick: () => this.give(company, o), tone: 'quiet', size: 12 })
        .setScrollFactor(0).setDepth(DEPTH + 2).setVisible(false)),
    }))
  }

  /** The army button: open it, or close it again. */
  toggle() { if (this.open) this.hide(); else this.show() }

  show() {
    if (this.open) return
    this.open = true
    this.listAt = -Infinity
    this.catcher.setVisible(true).setInteractive()
    this.game.audio.play('ui')
  }

  hide() {
    if (!this.open) return
    this.open = false
    this.catcher.disableInteractive().setVisible(false)
    this.glass.setVisible(false)
    for (const t of [this.head, this.keyHint, this.empty]) t.setVisible(false)
    for (const r of this.rows) this.showRow(r, false)
    this.shownRows = []
  }

  /** The companies that get a row now (rechecked a few times a second). */
  companies(): Company[] {
    const now = this.game.now
    if (Math.abs(now - this.listAt) < 250) return this.list
    this.listAt = now
    const army = this.game.army
    const counts = { infantry: 0, archers: 0, riders: 0 } as Record<Company, number>
    const built = { infantry: false, archers: false, riders: false } as Record<Company, boolean>
    for (const c of COMPANIES) {
      counts[c] = army.companyCount(c)
      built[c] = this.game.buildings.has(MUSTER[c])
    }
    return this.list = ordersRows(counts, built)
  }

  /** What the army button shows, from the companies that are there. */
  look(): ArmyLook {
    return armyLook(this.game.army.orders, this.open ? this.shownRows : this.companies())
  }

  private give(c: Company, o: Order) {
    this.game.army.setOrder(c, o)
    this.game.audio.play('ui')
  }

  private showRow(r: Row, v: boolean) {
    r.name.setVisible(v)
    r.count.setVisible(v)
    for (const b of r.chips) b.setVisible(v)
  }

  /**
   * Place it under the icon row, its right edge on `right`, its top at `top`,
   * and light each company's order. Cheap to call every frame: the glass and
   * the chips only repaint when something changed.
   */
  update(right: number, top: number) {
    if (!this.open) return
    const W = screen(this.ui).w
    const H = screen(this.ui).h
    const touch = wantsTouchTargets(W)
    this.catcher.setSize(W, H)

    const list = this.companies()
    this.shownRows = list
    const pad = 12
    const w = Math.min(340, right - 10)
    const x = right - w
    const chipH = touch ? 44 : 32
    const gap = 6
    const nameW = 84
    const chipW = Math.floor((w - pad * 2 - nameW - gap * 2) / 3)
    const headH = 16
    const bodyH = list.length ? list.length * chipH + (list.length - 1) * gap : 18
    const h = pad - 2 + headH + 8 + bodyH + pad
    this.box.setTo(x, top, w, h)
    this.glass.setVisible(true).place(x, top, w, h)

    const hy = top + pad - 2 + headH / 2
    this.head.setPosition(x + pad, hy).setVisible(true)
    this.keyHint.setPosition(x + w - pad, hy).setVisible(!IS_TOUCH)
    const y0 = top + pad - 2 + headH + 8
    this.empty.setPosition(x + pad, y0 + 9).setVisible(list.length === 0)

    const army = this.game.army
    for (const r of this.rows) {
      const i = list.indexOf(r.company)
      this.showRow(r, i >= 0)
      if (i < 0) continue
      const ry = y0 + i * (chipH + gap)
      const cy = ry + chipH / 2
      const n = army.companyCount(r.company)
      r.name.setPosition(x + pad, cy - 7)
      r.count.setPosition(x + pad, cy + 8).setText(n ? `${n} ${n === 1 ? 'soldier' : 'soldiers'}` : 'none yet')
      const order = army.orders[r.company]
      r.chips.forEach((b, k) => {
        const lit = ORDERS[k] === order
        b.setTone(lit ? 'primary' : 'quiet')
          .place(x + pad + nameW + k * (chipW + gap) + chipW / 2, cy, chipW, chipH)
      })
    }
  }

  /** For the harness: what the panel shows. */
  inspect() {
    const army = this.game.army
    return {
      open: this.open,
      look: this.look(),
      rows: this.companies().map(c => ({ company: c, count: army.companyCount(c), order: army.orders[c] })),
      banner: army.banner,
      box: this.open ? { x: this.box.x, y: this.box.y, w: this.box.width, h: this.box.height } : null,
    }
  }

  /** For the harness: press a company's chip as a tap would. */
  press(c: Company, o: Order) {
    const r = this.rows.find(k => k.company === c)
    r?.chips[ORDERS.indexOf(o)]?.trigger()
  }
}
