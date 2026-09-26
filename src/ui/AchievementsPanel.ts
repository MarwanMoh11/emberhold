import Phaser from 'phaser'
import { Overlay } from './Overlay'
import { ON_PAGE, PAD, sealTexture } from './skin'
import { PAL } from '../config/palette'
import { ACHIEVEMENTS } from '../config/quests'
import { short } from '../core/math'
import type { GameScene } from '../scenes/GameScene'

interface Row {
  name: Phaser.GameObjects.Text
  desc: Phaser.GameObjects.Text
  score: Phaser.GameObjects.Text
  seal: Phaser.GameObjects.Image
  icon: Phaser.GameObjects.Image
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
    this.heading = this.text(26, PAL.uiText, true)
    this.sub = this.text(12, PAL.uiDim)
    this.sub.setFontStyle('italic 500')
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      this.rows.push({
        name: this.text(15, PAL.uiText, true, 0, 0.5),
        desc: this.text(11, PAL.uiDim, false, 0, 0.5),
        score: this.text(11, PAL.uiDim, true, 1, 0.5, 'caps'),
        seal: this.scene.add.image(0, 0, '__WHITE').setScrollFactor(0),
        icon: this.scene.add.image(0, 0, 'ico_crown').setScrollFactor(0),
      })
    }
    for (const r of this.rows) this.root.add([r.seal, r.icon])
    this.btn = this.button('Back', () => this.scene.events.emit('closeScreen'), 'plain')
  }

  show() { this.ensure(); super.show() }

  protected layout() {
    if (!this.built) return
    const c = this.compact
    // Two columns whenever the window is wide and not tall enough for eight
    // stacked rows — which covers a landscape phone and a squat desktop window
    // with the same rule.
    const cols = this.W >= 640 && this.H < 680 ? 2 : 1
    const perCol = Math.ceil(ACHIEVEMENTS.length / cols)

    const w = Math.min(cols === 2 ? 720 : 460, this.W - 24)
    const headH = c ? 58 : 86
    const footH = c ? 46 : 62
    const rowH = c ? 48 : 56
    const h = Math.min(this.H - 16, headH + perCol * rowH + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    const cx = this.W / 2
    this.drawCard(x, y, w, h, PAL.gilt)

    const unlocked = this.game.quests.unlockedAchievements
    this.heading.setText('Deeds').setPosition(cx, y + (c ? 25 : 36))
    this.fitText(this.heading, c ? 22 : 28, w - 44)
    this.sub.setText(`${unlocked.size} of ${ACHIEVEMENTS.length} earned`)
      .setPosition(cx, y + (c ? 44 : 60))
    this.fitText(this.sub, c ? 11 : 13, w - 40)

    const stats = this.game.quests.achievementStats()
    const padX = c ? 22 : 28
    const gap = 14
    const colW = (w - padX * 2 - gap * (cols - 1)) / cols
    const top = y + headH
    const avail = h - headH - footH
    const pitch = Math.min(rowH, avail / perCol)

    this.bars.clear()
    if (!c) this.rule(this.bars, cx, top - 10, Math.min(240, w - 80), PAL.gilt)
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

      // an earned deed is washed in gilt; an open one is only ruled off
      if (got) {
        this.bars.fillStyle(PAL.gold, 0.1)
        this.bars.fillRoundedRect(bx, by, colW, rh, 4)
      }
      this.bars.lineStyle(1, got ? PAL.gold : ON_PAGE.rule, got ? 0.4 : 0.12)
      this.bars.strokeRoundedRect(bx, by, colW, rh, 4)

      // a seal on the left: gilt and crowned once earned, blank wax until then
      const sr = Math.min(16, rh / 2 - 4)
      const sx = bx + 8 + sr
      const sy = by + rh / 2
      r.seal.setTexture(sealTexture(this.scene, got ? PAL.gilt : 0x8a7a68, got, 20)).setPosition(sx, sy)
        .setDisplaySize((sr + PAD * sr / 20) * 2, (sr + PAD * sr / 20) * 2)
      r.icon.setPosition(sx, sy).setDisplaySize(sr * 1.25, sr * 1.25).setAlpha(got ? 1 : 0.35)
      const tx = sx + sr + 10

      // progress rail along the bottom of the row
      const railX = tx
      const railW = bx + colW - 12 - railX
      const railY = by + rh - (c ? 8 : 10)
      this.bars.fillStyle(ON_PAGE.rule, 0.12)
      this.bars.fillRect(railX, railY, railW, 3)
      this.bars.fillStyle(got ? PAL.gold : PAL.good, 0.9)
      this.bars.fillRect(railX, railY, railW * frac, 3)

      r.name.setFontSize(c ? 13 : 16)
        .setText(a.title)
        .setAlpha(got ? 1 : 0.8)
        .setPosition(tx, by + (c ? 12 : 15))
      this.ink(r.name, got ? PAL.gold : PAL.uiText)
      r.desc.setFontSize(c ? 10 : 12).setText(a.desc)
        .setPosition(tx, by + (c ? 26 : 32))
      this.fitText(r.desc, c ? 10 : 12, railW, 8)
      r.score.setFontSize(c ? 10 : 12)
        .setText(got ? 'Earned' : `${short(have)} / ${short(a.amount)}`)
        .setPosition(bx + colW - 10, by + (c ? 12 : 15))
      this.ink(r.score, got ? PAL.gold : PAL.uiDim)
    }

    this.btn.place(cx, y + h - (c ? 23 : 33), Math.min(220, w - 80), c ? 28 : 36)
  }
}
