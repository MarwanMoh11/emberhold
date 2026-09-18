import Phaser from 'phaser'
import { Overlay } from './Overlay'
import { PAL, CSS } from '../config/palette'
import { QUESTS } from '../config/quests'
import type { GameScene } from '../scenes/GameScene'

interface Row {
  title: Phaser.GameObjects.Text
  note: Phaser.GameObjects.Text
}

/**
 * The whole chain at once: what you did, what you are on, what is left.
 *
 * Only the single live objective was ever visible, which made a twenty-step
 * campaign feel like an endless corridor of one-line errands. One line per
 * quest and no prose — the chain is still the tutorial, and a wall of hints
 * would undo the reason it works.
 */
export class QuestLog extends Overlay {
  private built = false
  private heading!: Phaser.GameObjects.Text
  private sub!: Phaser.GameObjects.Text
  private marks!: Phaser.GameObjects.Graphics
  private rows: Row[] = []
  private btn!: ReturnType<Overlay['button']>

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_160_000)
  }

  private ensure() {
    if (this.built) return
    this.built = true
    this.marks = this.gfx()
    this.heading = this.text(22, PAL.gold, true)
    this.sub = this.text(11, PAL.uiDim)
    for (let i = 0; i < QUESTS.length; i++) {
      this.rows.push({
        title: this.text(11, PAL.uiText, false, 0, 0.5),
        note: this.text(10, PAL.uiDim, false, 1, 0.5),
      })
    }
    this.btn = this.button('BACK', () => this.scene.events.emit('closeScreen'), PAL.heroTrim)
  }

  show() { this.ensure(); super.show() }

  protected layout() {
    if (!this.built) return
    const c = this.compact
    const cols = this.W >= 560 ? 2 : 1
    const perCol = Math.ceil(QUESTS.length / cols)

    const w = Math.min(cols === 2 ? 660 : 400, this.W - 28)
    const headH = c ? 50 : 66
    const footH = c ? 40 : 52
    const rowH = c ? 24 : 26
    const h = Math.min(this.H - 20, headH + perCol * rowH + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    const cx = this.W / 2
    this.drawCard(x, y, w, h, PAL.gold)

    const q = this.game.quests
    const view = q.view()
    this.heading.setText('QUEST LOG').setPosition(cx, y + (c ? 23 : 32))
    this.fitText(this.heading, c ? 18 : 22, w - 36)
    this.sub
      .setText(q.index >= QUESTS.length
        ? `All ${QUESTS.length} done  ·  the nights keep coming`
        : `${q.index} of ${QUESTS.length} done  ·  ${view?.hint ?? ''}`)
      .setPosition(cx, y + (c ? 39 : 51))
    this.fitText(this.sub, c ? 10 : 11, w - 28)

    const padX = c ? 16 : 22
    const gap = 14
    const colW = (w - padX * 2 - gap * (cols - 1)) / cols
    const top = y + headH
    const avail = h - headH - footH
    const pitch = Math.min(rowH, avail / perCol)

    this.marks.clear()
    for (let i = 0; i < this.rows.length; i++) {
      const def = QUESTS[i]
      const r = this.rows[i]
      const col = Math.floor(i / perCol)
      const bx = x + padX + col * (colW + gap)
      const by = top + (i % perCol) * pitch + pitch / 2

      const done = q.done.has(def.id)
      const active = !done && i === q.index
      const colour = done ? PAL.good : active ? PAL.gold : PAL.uiDim

      if (active) {
        this.marks.fillStyle(PAL.gold, 0.13)
        this.marks.fillRoundedRect(bx - 6, by - pitch / 2 + 1, colW + 12, pitch - 2, 5)
      }
      // The pip carries the state, so the row text never has to say it twice.
      this.marks.fillStyle(colour, done || active ? 1 : 0.45)
      if (done) this.marks.fillRect(bx, by - 3, 6, 6)
      else this.marks.fillCircle(bx + 3, by, active ? 4 : 2.5)

      const fs = pitch < 22 ? 10 : c ? 10 : 11
      r.title.setFontSize(fs).setText(def.title)
        .setColor(CSS(done ? PAL.uiText : active ? PAL.gold : PAL.uiDim))
        .setAlpha(done ? 0.8 : 1)
        .setPosition(bx + 14, by)
      r.note.setFontSize(fs - 1)
        .setText(active && view ? `${view.have}/${view.need}` : done ? '✓' : '')
        .setColor(CSS(active ? PAL.gold : PAL.good))
        .setAlpha(done && !active ? 0.7 : 1)
        .setPosition(bx + colW, by)
    }

    this.btn.place(cx, y + h - (c ? 19 : 26), Math.min(240, w - 80), c ? 26 : 34)
  }
}
