import Phaser from 'phaser'
import { Overlay } from './Overlay'
import { PAL, CSS } from '../config/palette'
import { ACHIEVEMENTS } from '../config/quests'
import { short } from '../core/math'
import type { GameScene } from '../scenes/GameScene'

interface Row {
  name: Phaser.GameObjects.Text
  desc: Phaser.GameObjects.Text
  score: Phaser.GameObjects.Text
}

/**
 * The eight deeds, earned and unearned, with how far along the unearned ones
 * are. They were tracked, saved and worth exactly one toast each: miss the
 * toast and the achievement may as well not have existed. A bar is the whole
 * point — "1,000 enemies" means nothing until you can see you are at 380.
 */
export class AchievementsPanel extends Overlay {
  private built = false
  private heading!: Phaser.GameObjects.Text
  private sub!: Phaser.GameObjects.Text
  private bars!: Phaser.GameObjects.Graphics
  private rows: Row[] = []
  private btn!: ReturnType<Overlay['button']>

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_160_000)
  }

  private ensure() {
    if (this.built) return
    this.built = true
    this.bars = this.gfx()
    this.heading = this.text(22, PAL.gold, true)
    this.sub = this.text(11, PAL.uiDim)
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      this.rows.push({
        name: this.text(13, PAL.uiText, true, 0, 0.5),
        desc: this.text(10, PAL.uiDim, false, 0, 0.5),
        score: this.text(10, PAL.uiDim, false, 1, 0.5),
      })
    }
    this.btn = this.button('BACK', () => this.scene.events.emit('closeScreen'), PAL.heroTrim)
  }

  show() { this.ensure(); super.show() }

  protected layout() {
    if (!this.built) return
    const c = this.compact
    // Two columns whenever the window is wide and not tall enough for eight
    // stacked rows — which covers a landscape phone and a squat desktop window
    // with the same rule.
    const cols = this.W >= 640 && this.H < 620 ? 2 : 1
    const perCol = Math.ceil(ACHIEVEMENTS.length / cols)

    const w = Math.min(cols === 2 ? 700 : 440, this.W - 28)
    const headH = c ? 52 : 74
    const footH = c ? 44 : 56
    const rowH = c ? 48 : 52
    const h = Math.min(this.H - 20, headH + perCol * rowH + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    const cx = this.W / 2
    this.drawCard(x, y, w, h, PAL.gold)

    const unlocked = this.game.quests.unlockedAchievements
    this.heading.setText('DEEDS').setPosition(cx, y + (c ? 24 : 34))
    this.fitText(this.heading, c ? 18 : 22, w - 36)
    this.sub.setText(`${unlocked.size} of ${ACHIEVEMENTS.length} earned`)
      .setPosition(cx, y + (c ? 42 : 56))
    this.fitText(this.sub, c ? 10 : 11, w - 28)

    const stats = this.game.quests.achievementStats()
    const padX = c ? 18 : 24
    const gap = 12
    const colW = (w - padX * 2 - gap * (cols - 1)) / cols
    const top = y + headH
    const avail = h - headH - footH
    const pitch = Math.min(rowH, avail / perCol)

    this.bars.clear()
    for (let i = 0; i < this.rows.length; i++) {
      const a = ACHIEVEMENTS[i]
      const r = this.rows[i]
      const col = Math.floor(i / perCol)
      const bx = x + padX + col * (colW + gap)
      const by = top + (i % perCol) * pitch
      const rh = pitch - 6

      const got = unlocked.has(a.id)
      const have = stats[a.stat] ?? 0
      const frac = Math.max(0, Math.min(1, have / a.amount))

      this.bars.fillStyle(got ? PAL.gold : PAL.uiBg, got ? 0.12 : 0.5)
      this.bars.fillRoundedRect(bx, by, colW, rh, 7)
      this.bars.lineStyle(1, got ? PAL.gold : PAL.uiEdge, got ? 0.8 : 0.5)
      this.bars.strokeRoundedRect(bx, by, colW, rh, 7)

      // progress rail along the bottom of the row
      const railY = by + rh - 6
      const railW = colW - 22
      this.bars.fillStyle(PAL.uiBg, 0.9)
      this.bars.fillRect(bx + 11, railY, railW, 3)
      this.bars.fillStyle(got ? PAL.gold : PAL.good, got ? 1 : 0.85)
      this.bars.fillRect(bx + 11, railY, railW * frac, 3)

      r.name.setFontSize(c ? 12 : 13)
        .setText(got ? `✦ ${a.title}` : a.title)
        .setColor(CSS(got ? PAL.gold : PAL.uiText))
        .setAlpha(got ? 1 : 0.75)
        .setPosition(bx + 11, by + (c ? 13 : 15))
      r.desc.setFontSize(c ? 9 : 10).setText(a.desc)
        .setPosition(bx + 11, by + (c ? 27 : 31))
      r.score.setFontSize(c ? 9 : 10)
        .setText(got ? 'EARNED' : `${short(have)} / ${short(a.amount)}`)
        .setColor(CSS(got ? PAL.gold : PAL.uiDim))
        .setPosition(bx + colW - 11, by + (c ? 13 : 15))
    }

    this.btn.place(cx, y + h - (c ? 20 : 28), Math.min(240, w - 80), c ? 28 : 36)
  }
}
