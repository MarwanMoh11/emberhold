import { Overlay } from './Overlay'
import { ABILITY_KEYS } from '../config/abilities'
import { PAL } from '../config/palette'
import { QUESTS } from '../config/quests'
import { SaveManager } from '../systems/SaveManager'
import type { GameScene } from '../scenes/GameScene'
import type Phaser from 'phaser'

const QUALITY_NAMES = ['LOW', 'MED', 'HIGH']

/** Which screen a menu row opens. UIScene owns the actual overlays. */
export type ScreenName = 'quests'

/**
 * Rows in display order, grouped into the lines they share.
 *
 * A landscape phone gives this card barely 350px of height, and one row per
 * action ran off the bottom long before the reset button — before there was
 * anywhere to hang a quest log at all. Everything that pairs naturally shares
 * a line instead, so the list can grow without getting any taller.
 */
const LINES: number[][] = [[0], [1], [2, 3], [4, 5], [6], [7]]

export class PauseMenu extends Overlay {
  private heading!: Phaser.GameObjects.Text
  private stats!: Phaser.GameObjects.Text
  private controls!: Phaser.GameObjects.Text
  private rows: ReturnType<Overlay['button']>[] = []
  private confirmingReset = false

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_150_000)
    this.heading = this.text(28, PAL.gold, true)
    this.stats = this.text(12, PAL.uiDim)
    this.controls = this.text(11, PAL.uiDim)

    const open = (s: ScreenName) => () => {
      this.game.audio.play('ui')
      this.scene.events.emit('openScreen', s)
    }
    this.rows = [
      this.button('RESUME', () => this.scene.events.emit('togglePause'), PAL.good),
      this.button('QUEST LOG', open('quests'), PAL.gold, 12),
      this.button('MASTER', () => this.cycle('master'), PAL.heroTrim, 12),
      this.button('EFFECTS', () => this.cycle('sfx'), PAL.heroTrim, 12),
      this.button('MUSIC', () => this.cycle('music'), PAL.heroTrim, 12),
      this.button('QUALITY', () => this.cycleQuality(), PAL.heroTrim, 12),
      this.button('SAVE NOW', () => { this.game.saves.save(); this.rows[6].setLabel('SAVED ✓') }),
      this.button('RESET PROGRESS', () => this.resetProgress(), PAL.danger),
    ]
  }

  private cycle(which: 'master' | 'sfx' | 'music') {
    const s = { ...this.game.settings }
    const steps = [0, 0.25, 0.5, 0.75, 1]
    const cur = s[which]
    const i = steps.findIndex(v => Math.abs(v - cur) < 0.01)
    s[which] = steps[(i + 1) % steps.length]
    s.muted = s.master <= 0
    this.game.applySettings(s)
    this.game.audio.play('ui')
    this.layout()
  }

  private cycleQuality() {
    const s = { ...this.game.settings }
    s.quality = ((s.quality + 1) % 3) as 0 | 1 | 2
    this.game.applySettings(s)
    this.game.audio.play('ui')
    this.layout()
  }

  private resetProgress() {
    if (!this.confirmingReset) {
      this.confirmingReset = true
      this.rows[7].setLabel('TAP AGAIN TO WIPE')
      this.scene.time.delayedCall(2600, () => {
        this.confirmingReset = false
        this.rows[7].setLabel('RESET PROGRESS')
      })
      return
    }
    SaveManager.clear()
    window.location.reload()
  }

  protected layout() {
    const c = this.compact
    const g = this.game
    const w = Math.min(c ? 540 : 380, this.W - (c ? 24 : 48))

    // The control crib is set and measured before the card is sized, because
    // on a narrow card it wraps — it used to run out past both edges on a
    // portrait phone and on any window narrow enough to pin the card to 380.
    this.controls.setFontSize(c ? 9 : 11).setWordWrapWidth(w - 36).setText(
      c
        ? `WASD move  ·  ${ABILITY_KEYS.join(' ')} abilities  ·  R ultimate  ·  H hold  ·  stand in a site to build`
        : `WASD / arrows move   ·   auto-attack   ·   ${ABILITY_KEYS.join(' ')} abilities   ·   R ultimate\n` +
          'H hold or follow   ·   ESC pause   ·   F2 debug   ·   stand in a site to build',
    )

    const headH = c ? 68 : 118
    const footH = Math.round(this.controls.height) + (c ? 14 : 22)
    const pitch0 = c ? 34 : 44
    const h = Math.min(this.H - 20, headH + LINES.length * pitch0 + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    const cx = this.W / 2
    this.drawCard(x, y, w, h, PAL.gold)

    this.heading.setFontSize(c ? 20 : 28).setText('EMBERHOLD').setPosition(cx, y + (c ? 26 : 40))
    const mins = Math.floor(g.saves.playtime / 60)
    this.stats.setFontSize(c ? 10 : 12).setText(
      `night ${g.waves.wave}   ·   level ${g.player.level}   ·   ${g.combat.kills} slain\n` +
      `${g.army.count} troops   ·   ${g.workers.count} workers   ·   ${mins} min played`,
    ).setPosition(cx, y + (c ? 48 : 74))

    const labels = [
      'RESUME',
      `QUEST LOG  ${g.quests.index}/${QUESTS.length}`,
      `MASTER  ${Math.round(g.settings.master * 100)}%`,
      `EFFECTS  ${Math.round(g.settings.sfx * 100)}%`,
      `MUSIC  ${Math.round(g.settings.music * 100)}%`,
      `QUALITY  ${QUALITY_NAMES[g.settings.quality]}`,
      'SAVE NOW',
      this.confirmingReset ? 'TAP AGAIN TO WIPE' : 'RESET PROGRESS',
    ]

    const bw = w - (c ? 48 : 72)
    const gap = 10
    const half = (bw - gap) / 2
    const top = y + headH
    const pitch = Math.min(pitch0, (h - headH - footH) / LINES.length)
    const bh = Math.min(c ? 28 : 38, pitch - 6)

    for (let l = 0; l < LINES.length; l++) {
      const line = LINES[l]
      const by = top + l * pitch + pitch / 2
      for (let i = 0; i < line.length; i++) {
        const idx = line[i]
        this.rows[idx].setLabel(labels[idx])
        if (line.length === 1) {
          this.rows[idx].place(cx, by, bw, bh)
        } else {
          this.rows[idx].place(cx + (i === 0 ? -1 : 1) * (half + gap) / 2, by, half, bh)
        }
      }
    }

    this.controls.setPosition(cx, y + h - footH / 2 - 2)
  }
}
