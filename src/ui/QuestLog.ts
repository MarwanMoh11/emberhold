import Phaser from 'phaser'
import { Overlay } from './Overlay'
import { PAL } from '../config/palette'
import { ACTS, QUESTS, actOf } from '../config/quests'
import type { GameScene } from '../scenes/GameScene'

interface Row {
  title: Phaser.GameObjects.Text
  note: Phaser.GameObjects.Text
}

/** The longest act: the log keeps one row per quest of the act you are in. */
const ROWS = Math.max(...ACTS.map((_, i) => QUESTS.filter(q => actOf(q) === i + 1).length))

/**
 * The act you are in at once: what you did, what you are on, what is left.
 * (Campaign 2.0 has 50-odd quests: the whole chain no longer fits a phone.)
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
    this.heading = this.text(26, PAL.uiText, true)
    this.sub = this.text(12, PAL.uiDim)
    this.sub.setFontStyle('italic 500')
    for (let i = 0; i < ROWS; i++) {
      this.rows.push({
        title: this.text(12, PAL.uiText, false, 0, 0.5),
        note: this.text(11, PAL.uiDim, true, 1, 0.5),
      })
    }
    this.btn = this.button('Back', () => this.scene.events.emit('closeScreen'), 'plain')
  }

  show() { this.ensure(); super.show() }

  protected layout() {
    if (!this.built) return
    const c = this.compact
    const q = this.game.quests
    const act = Math.min(ACTS.length, q.current ? actOf(q.current) : ACTS.length)
    const list = QUESTS.filter(d => actOf(d) === act)
    const cols = this.W >= 560 ? 2 : 1
    const perCol = Math.ceil(list.length / cols)

    const w = Math.min(cols === 2 ? 680 : 420, this.W - 24)
    const headH = c ? 58 : 84
    const footH = c ? 44 : 60
    const rowH = c ? 24 : 27
    const h = Math.min(this.H - 16, headH + perCol * rowH + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    const cx = this.W / 2
    this.drawCard(x, y, w, h, PAL.wax)

    const view = q.view()
    const a = ACTS[act - 1]
    const doneHere = list.filter(d => q.done.has(d.id)).length
    this.heading.setText(`Act ${a.roman} · ${a.name}`).setPosition(cx, y + (c ? 25 : 36))
    this.fitText(this.heading, c ? 22 : 28, w - 44)
    this.sub
      .setText(q.index >= QUESTS.length
        ? `All ${QUESTS.length} done  ·  the nights keep coming`
        : `${doneHere} of ${list.length} done  ·  ${view?.hint ?? ''}`)
      .setPosition(cx, y + (c ? 44 : 60))
    this.fitText(this.sub, c ? 11 : 13, w - 40)

    const padX = c ? 22 : 30
    const gap = 22
    const colW = (w - padX * 2 - gap * (cols - 1)) / cols
    const top = y + headH
    const avail = h - headH - footH
    const pitch = Math.min(rowH, avail / perCol)

    this.marks.clear()
    if (!c) this.rule(this.marks, cx, top - 10, Math.min(260, w - 80))
    if (cols === 2) {
      this.marks.lineStyle(1, 0x3a2616, 0.25)
      this.marks.lineBetween(cx, top + 2, cx, top + perCol * pitch - 2)
    }
    const INK = 0x2a1b10
    for (let i = 0; i < this.rows.length; i++) {
      const def = list[i]
      const r = this.rows[i]
      r.title.setVisible(!!def)
      r.note.setVisible(!!def)
      if (!def) continue
      const col = Math.floor(i / perCol)
      const bx = x + padX + col * (colW + gap)
      const by = top + (i % perCol) * pitch + pitch / 2

      const done = q.done.has(def.id)
      const active = !done && def === q.current

      if (active) {
        // a gilt wash behind the line you are on
        this.marks.fillStyle(0xd9a53a, 0.28)
        this.marks.fillRoundedRect(bx - 8, by - pitch / 2 + 2, colW + 16, pitch - 4, 3)
        this.marks.lineStyle(1, 0x94580e, 0.5)
        this.marks.strokeRoundedRect(bx - 8, by - pitch / 2 + 2, colW + 16, pitch - 4, 3)
      }
      // The mark carries the state, so the row text never has to say it twice:
      // an inked tick for done, a filled lozenge for the one you are on, and a
      // hollow one for what is still ahead.
      if (done) {
        this.marks.lineStyle(2, 0x3d6a24, 1)
        this.marks.beginPath()
        this.marks.moveTo(bx - 1, by)
        this.marks.lineTo(bx + 2.5, by + 3.5)
        this.marks.lineTo(bx + 8, by - 4)
        this.marks.strokePath()
      } else {
        const s = active ? 4.5 : 3.2
        const pts = [{ x: bx + 3.5, y: by - s }, { x: bx + 3.5 + s, y: by }, { x: bx + 3.5, y: by + s }, { x: bx + 3.5 - s, y: by }]
        if (active) {
          this.marks.fillStyle(PAL.wax, 1)
          this.marks.fillPoints(pts, true)
        }
        this.marks.lineStyle(1, INK, active ? 0.9 : 0.4)
        this.marks.strokePoints(pts, true)
      }

      const fs = pitch < 22 ? 11 : c ? 11 : 13
      r.title.setFontSize(fs).setText(def.title)
        .setFontStyle(active ? '800' : '500')
        .setAlpha(done ? 0.55 : active ? 1 : 0.75)
        .setPosition(bx + 16, by)
      this.ink(r.title, done ? PAL.uiText : active ? PAL.uiText : PAL.uiDim)
      r.note.setFontSize(fs - 1)
        .setText(active && view ? `${view.have}/${view.need}` : '')
        .setPosition(bx + colW, by)
      this.ink(r.note, PAL.gold)
    }

    this.btn.place(cx, y + h - (c ? 22 : 32), Math.min(220, w - 80), c ? 28 : 36)
  }
}
