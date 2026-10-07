import Phaser from 'phaser'
import { Overlay } from './Overlay'
import { PAL } from '../config/palette'
import { ON_PAGE } from './skin'
import { ACTS, QUESTS, actOf } from '../config/quests'
import type { GameScene } from '../scenes/GameScene'

interface Row {
  title: Phaser.GameObjects.Text
  task: Phaser.GameObjects.Text
}

/** The longest act: the log keeps one row per quest of the act you are in. */
const ROWS = Math.max(...ACTS.map((_, i) => QUESTS.filter(q => actOf(q) === i + 1).length))

/** Cut a line to `maxW` with an ellipsis (layout only runs on open and resize). */
function clip(t: Phaser.GameObjects.Text, s: string, maxW: number) {
  t.setText(s)
  if (maxW <= 12) return t.setText('')
  let n = s.length
  while (t.width > maxW && n > 1) t.setText(`${s.slice(0, --n).trimEnd()}…`)
  return t
}

/**
 * The quest log, read like a mission briefing: the act you are in, the quest
 * you are on (what it asks, the step in its way, how far along, what it pays),
 * and every quest of the act with what each one asks.
 *
 * It opens from the tracker at the top of the HUD (a tap, or J, or the pad's
 * d-pad up) over a paused game, and from the pause menu.
 */
export class QuestLog extends Overlay {
  private built = false
  /** opened from the pause menu: Back returns there rather than to the fight */
  fromPause = false
  private kicker!: Phaser.GameObjects.Text
  private heading!: Phaser.GameObjects.Text
  private blurb!: Phaser.GameObjects.Text
  private marks!: Phaser.GameObjects.Graphics
  private curLabel!: Phaser.GameObjects.Text
  private curTitle!: Phaser.GameObjects.Text
  private curTask!: Phaser.GameObjects.Text
  private curStep!: Phaser.GameObjects.Text
  private curCount!: Phaser.GameObjects.Text
  private curReward!: Phaser.GameObjects.Text
  private rows: Row[] = []
  private btn!: ReturnType<Overlay['button']>

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_160_000)
  }

  private ensure() {
    if (this.built) return
    this.built = true
    this.marks = this.gfx()
    this.kicker = this.text(11, PAL.gold, true, 0.5, 0.5, 'caps')
    this.heading = this.text(26, PAL.uiText, true)
    this.blurb = this.text(12, PAL.uiDim)
    this.blurb.setFontStyle('italic 500')
    this.curLabel = this.text(10, PAL.gold, true, 0, 0.5, 'caps')
    this.curTitle = this.text(20, PAL.uiText, true, 0, 0.5)
    this.curTask = this.text(13, PAL.uiText, false, 0, 0)
    this.curStep = this.text(12, PAL.gold, true, 0, 0)
    this.curCount = this.text(12, PAL.gold, true, 1, 0.5)
    this.curReward = this.text(11, PAL.uiDim, false, 0, 0.5)
    for (let i = 0; i < ROWS; i++) {
      this.rows.push({
        title: this.text(12, PAL.uiText, false, 0, 0.5),
        task: this.text(11, PAL.uiDim, false, 0, 0.5),
      })
    }
    this.btn = this.button('Back', () => this.scene.events.emit('closeScreen'), 'plain')
  }

  show() { this.ensure(); super.show() }

  protected layout() {
    if (!this.built) return
    const c = this.compact
    const q = this.game.quests
    const view = q.view()
    const act = Math.min(ACTS.length, q.current ? actOf(q.current) : ACTS.length)
    const a = ACTS[act - 1]
    const list = QUESTS.filter(d => actOf(d) === act)
    const doneHere = list.filter(d => q.done.has(d.id)).length
    const cols = this.W >= 600 ? 2 : 1
    const perCol = Math.ceil(list.length / cols)

    const w = Math.min(cols === 2 ? 720 : 440, this.W - 24)
    const padX = c ? 20 : 28
    const inner = w - padX * 2
    const cx = this.W / 2

    // ---- the quest you are on: set the words first, then measure the box ----
    const boxPad = c ? 10 : 14
    const textW = inner - boxPad * 2
    const finished = q.campaignComplete
    const place = view?.place
    this.curLabel.setText(finished ? 'Campaign complete'
      : `Current quest  ·  ${place?.n ?? 0} of ${place?.of ?? 0}`)
    this.curTitle.setText(view?.title ?? '')
    this.fitText(this.curTitle, c ? 16 : 20, textW - 60)
    this.curTask.setFontSize(c ? 12 : 13).setWordWrapWidth(textW, true).setText(view?.task ?? '')
    const step = view && view.hint !== view.task ? `Next step: ${view.hint}` : ''
    this.curStep.setFontSize(c ? 11 : 12).setWordWrapWidth(textW, true).setText(step)
    this.curCount.setText(view && view.need > 1 && !finished ? `${view.have}/${view.need}` : '')
    this.curReward.setText(view?.reward ? `Reward   ${view.reward}` : '')
    this.fitText(this.curReward, c ? 10 : 11, textW)

    const labelH = c ? 14 : 16
    const titleH = c ? 22 : 28
    const taskH = Math.ceil(this.curTask.height)
    const stepH = step ? Math.ceil(this.curStep.height) + 4 : 0
    const barH = finished ? 0 : 14
    const rewardH = view?.reward ? (c ? 16 : 20) : 0
    const boxH = boxPad * 2 + labelH + titleH + taskH + stepH + barH + rewardH

    // ---- the card --------------------------------------------------------
    const headH = c ? 44 : 92
    const rowH = c ? 22 : 26
    const listTop0 = headH + boxH + (c ? 12 : 18)
    const footH = c ? 44 : 60
    const h = Math.min(this.H - 16, listTop0 + perCol * rowH + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    this.drawCard(x, y, w, h, PAL.wax)

    // ---- the act ---------------------------------------------------------
    this.kicker.setVisible(!c)
      .setText(`Quest log  ·  Act ${a.roman} of ${ACTS[ACTS.length - 1].roman}  ·  ${doneHere} of ${list.length} done`)
      .setPosition(cx, y + 22)
    this.fitText(this.kicker, 11, inner)
    this.heading.setText(c ? `Act ${a.roman} · ${a.name}  ·  ${doneHere}/${list.length}` : a.name)
      .setPosition(cx, y + (c ? 24 : 48))
    this.fitText(this.heading, c ? 20 : 28, inner)
    this.blurb.setVisible(!c).setText(finished ? 'Every quest is done. The nights keep coming.' : a.blurb)
      .setPosition(cx, y + 74)
    this.fitText(this.blurb, 12, inner)

    // ---- the box ---------------------------------------------------------
    const m = this.marks
    m.clear()
    const bx = x + padX
    const by = y + headH
    m.fillStyle(PAL.gold, 0.09)
    m.fillRoundedRect(bx, by, inner, boxH, 6)
    m.lineStyle(1, PAL.gold, 0.45)
    m.strokeRoundedRect(bx, by, inner, boxH, 6)
    const tx = bx + boxPad
    let ty = by + boxPad
    this.curLabel.setPosition(tx, ty + labelH / 2 - 1)
    ty += labelH
    this.curTitle.setPosition(tx, ty + titleH / 2)
    this.curCount.setPosition(bx + inner - boxPad, ty + titleH / 2)
    ty += titleH
    this.curTask.setPosition(tx, ty)
    ty += taskH
    this.curStep.setVisible(!!step).setPosition(tx, ty + 4)
    ty += stepH
    if (barH) {
      const frac = view && view.need > 0 ? Math.min(1, view.have / view.need) : 0
      const barY = ty + 6
      m.fillStyle(ON_PAGE.rule, 0.14)
      m.fillRoundedRect(tx, barY, textW, 4, 2)
      if (frac > 0) {
        m.fillStyle(PAL.gold, 1)
        m.fillRoundedRect(tx, barY, Math.max(4, textW * frac), 4, 2)
      }
    }
    ty += barH
    this.curReward.setVisible(!!view?.reward).setPosition(tx, ty + rewardH / 2)

    // ---- every quest of the act ----------------------------------------------
    const gap = 24
    const colW = (inner - gap * (cols - 1)) / cols
    const top = y + listTop0
    const avail = h - listTop0 - footH
    const pitch = Math.min(rowH, avail / perCol)
    if (cols === 2) {
      m.lineStyle(1, ON_PAGE.rule, 0.14)
      m.lineBetween(cx, top + 2, cx, top + perCol * pitch - 2)
    }
    const INK = ON_PAGE.rule
    for (let i = 0; i < this.rows.length; i++) {
      const def = list[i]
      const r = this.rows[i]
      r.title.setVisible(!!def)
      r.task.setVisible(!!def)
      if (!def) continue
      const col = Math.floor(i / perCol)
      const rx = x + padX + col * (colW + gap)
      const ry = top + (i % perCol) * pitch + pitch / 2

      const done = q.done.has(def.id)
      const active = !done && def === q.current

      if (active) {
        m.fillStyle(PAL.gold, 0.12)
        m.fillRoundedRect(rx - 6, ry - pitch / 2 + 2, colW + 12, pitch - 4, 3)
      }
      // The mark carries the state: an inked tick for done, a filled lozenge
      // for the one you are on, and a hollow one for what is still ahead.
      if (done) {
        m.lineStyle(2, PAL.good, 1)
        m.beginPath()
        m.moveTo(rx - 1, ry)
        m.lineTo(rx + 2.5, ry + 3.5)
        m.lineTo(rx + 8, ry - 4)
        m.strokePath()
      } else {
        const s = active ? 4.5 : 3.2
        const pts = [{ x: rx + 3.5, y: ry - s }, { x: rx + 3.5 + s, y: ry }, { x: rx + 3.5, y: ry + s }, { x: rx + 3.5 - s, y: ry }]
        if (active) {
          m.fillStyle(PAL.wax, 1)
          m.fillPoints(pts, true)
        }
        m.lineStyle(1, INK, active ? 0.9 : 0.4)
        m.strokePoints(pts, true)
      }

      // the title, then what it asks, cut to the column
      const fs = pitch < 22 ? 11 : c ? 11 : 13
      const left = rx + 16
      r.title.setFontSize(fs).setText(def.title)
        .setFontStyle(active ? '800' : '600')
        .setAlpha(done ? 0.5 : 1)
        .setPosition(left, ry)
      this.ink(r.title, done || active ? PAL.uiText : PAL.uiDim)
      const tw = Math.min(r.title.width, colW * 0.5)
      if (r.title.width > tw) clip(r.title, def.title, tw)
      r.task.setFontSize(fs - 1).setAlpha(done ? 0.4 : active ? 0.95 : 0.7).setPosition(left + tw + 8, ry)
      clip(r.task, def.hint, colW - 16 - tw - 8)
      this.ink(r.task, active ? PAL.gold : PAL.uiDim)
    }

    this.btn.setLabel(this.fromPause ? 'Back' : 'Back to the fight')
    this.btn.place(cx, y + h - (c ? 22 : 32), Math.min(240, w - 80), c ? 28 : 36)
  }
}
