import type Phaser from 'phaser'
import { WAYSTONE } from '../config/balance'
import type { GameScene } from '../scenes/GameScene'
import type { StoneInfo } from '../systems/Waystones'
import { DOCK, ON_PAGE, PlateButton, SkinPanel } from './skin'
import { screen, textStyle } from './theme'

/**
 * The waystone travel list (S11, a stopgap): a parchment card in the top-left
 * corner, under the HUD's top band, shown while the hero stands on a lit
 * stone. One plate per other lit stone, the Hall Stone first, then nearest
 * first; a stone the hero cannot reach now is greyed and the footer says why.
 * S12 replaces this with travel from the atlas: delete this file and its two
 * lines in UIScene, and call `waystones.travel(id)` from the atlas instead.
 */
export class TravelList {
  private readonly panel: SkinPanel
  private readonly title: Phaser.GameObjects.Text
  private readonly foot: Phaser.GameObjects.Text
  private readonly bar: Phaser.GameObjects.Graphics
  private readonly rows: PlateButton[] = []
  private ids: string[] = []
  private shown = false
  /** Harness: the last layout, in CSS px. */
  rect = { x: 0, y: 0, w: 0, h: 0 }

  constructor(private readonly ui: Phaser.Scene, private readonly gs: GameScene) {
    this.panel = new SkinPanel(ui, 'page').setDepth(DOCK.depth)
    this.title = ui.add.text(0, 0, 'WAYSTONE', textStyle({ voice: 'caps', size: 14, weight: '800', colour: ON_PAGE.gilt }))
      .setDepth(DOCK.depth + 1).setVisible(false)
    this.foot = ui.add.text(0, 0, '', textStyle({ size: 12, weight: 'italic 600', colour: ON_PAGE.dim }))
      .setDepth(DOCK.depth + 1).setVisible(false)
    this.bar = ui.add.graphics().setDepth(DOCK.depth + 1).setVisible(false)
  }

  get isShown() { return this.shown }

  /** What the list offers now: `{ id, name, ok, why }` per row (harness). */
  entries() {
    const ws = this.gs.waystones
    return this.order().map(s => ({ id: s.id, name: s.name, ...ws.canTravel(s.id) }))
  }

  private order(): StoneInfo[] {
    const ws = this.gs.waystones
    const here = ws.here ? ws.stone(ws.here) : null
    if (!here) return []
    const d = (s: StoneInfo) => (s.id === WAYSTONE.hallStone ? -1 : Math.hypot(s.x - here.x, s.y - here.y))
    return ws.list().filter(s => s.active && s.id !== here.id).sort((a, b) => d(a) - d(b))
  }

  update() {
    const ws = this.gs.waystones
    if (!ws || !ws.here || !this.gs.player.alive) { this.hide(); return }
    const stones = this.order()
    const { w: sw, h: sh } = screen(this.ui)
    const w = Math.min(250, sw - DOCK.gutter * 2)
    const x = DOCK.gutter
    const y = this.gs.uiBands.top + 8
    const dock = this.gs.uiBands.dock
    const floor = dock && dock.side === 'bottom' ? dock.y - 8 : sh - this.gs.uiBands.bottom - 8
    const rowH = this.rows[0]?.compactH ?? 44
    const head = 30
    const footH = 22
    // over the middle of a narrow view the card leaves the hero room below it,
    // and the camera frames the hero there (`uiBands.card`)
    const overMiddle = x + w > sw / 2 - 60
    const room = overMiddle ? 150 : 0
    const fit = Math.max(1, Math.floor((floor - y - head - footH - DOCK.pad - room) / (rowH + 6)))
    const n = Math.min(stones.length, fit)

    while (this.rows.length < n) {
      const i = this.rows.length
      const b = new PlateButton(this.ui, { label: '', size: 'compact', onClick: () => this.pick(i) })
      b.setDepth(DOCK.depth + 1)
      this.rows.push(b)
    }
    this.ids = stones.slice(0, n).map(s => s.id)

    const h = head + n * (rowH + 6) + footH + DOCK.pad
    this.panel.place(x, y, w, h).setVisible(true)
    this.title.setPosition(x + DOCK.pad, y + 8).setVisible(true)
      .setText(ws.channel ? `TRAVELLING…` : 'WAYSTONE · TRAVEL TO')

    let blocked = ''
    this.rows.forEach((b, i) => {
      if (i >= n) { b.setVisible(false); return }
      const s = stones[i]
      const c = ws.canTravel(s.id)
      if (!c.ok && !blocked) blocked = c.why
      b.setVisible(true)
      b.setLabel(s.name)
      b.setEnabled(c.ok && !ws.channel)
      b.setSelected(ws.channel?.to === s.id)
      b.setTone(s.id === WAYSTONE.hallStone ? 'primary' : 'plain')
      b.place(x + w / 2, y + head + i * (rowH + 6) + rowH / 2, w - DOCK.pad * 2, rowH)
    })

    this.bar.clear()
    if (ws.channel) {
      const by = y + head - 6
      this.bar.fillStyle(ON_PAGE.dim, 0.35).fillRect(x + DOCK.pad, by, w - DOCK.pad * 2, 3)
      this.bar.fillStyle(ON_PAGE.lapis, 1).fillRect(x + DOCK.pad, by, (w - DOCK.pad * 2) * ws.progress, 3)
    }
    this.bar.setVisible(!!ws.channel)

    const more = stones.length - n
    const note = !stones.length ? 'Light other stones to travel'
      : ws.lastWhy || blocked || (more > 0 ? `+${more} more` : 'Stand still: a blow breaks the channel')
    this.foot.setText(note).setPosition(x + DOCK.pad, y + h - footH - 2).setVisible(true)
    this.rect = { x, y, w, h }
    this.gs.uiBands.card = overMiddle ? y + h + 8 : null
    this.shown = true
  }

  private pick(i: number) {
    const id = this.ids[i]
    if (id) this.gs.waystones.travel(id)
  }

  hide() {
    if (!this.shown) return
    this.shown = false
    this.panel.setVisible(false)
    this.title.setVisible(false)
    this.foot.setVisible(false)
    this.bar.setVisible(false)
    for (const b of this.rows) b.setVisible(false)
    this.gs.uiBands.card = null
    if (this.gs.waystones) this.gs.waystones.lastWhy = ''
  }
}
