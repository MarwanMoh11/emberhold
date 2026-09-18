import { Overlay } from './Overlay'
import { PAL } from '../config/palette'
import { SaveManager } from '../systems/SaveManager'
import type { GameScene } from '../scenes/GameScene'
import type Phaser from 'phaser'

const QUALITY_NAMES = ['LOW', 'MEDIUM', 'HIGH']

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

    this.rows = [
      this.button('RESUME', () => this.scene.events.emit('togglePause'), PAL.good),
      this.button('MASTER', () => this.cycle('master')),
      this.button('EFFECTS', () => this.cycle('sfx')),
      this.button('MUSIC', () => this.cycle('music')),
      this.button('QUALITY', () => this.cycleQuality()),
      this.button('SAVE NOW', () => { this.game.saves.save(); this.rows[5].setLabel('SAVED ✓') }),
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
      this.rows[6].setLabel('TAP AGAIN TO WIPE')
      this.scene.time.delayedCall(2600, () => {
        this.confirmingReset = false
        this.rows[6].setLabel('RESET PROGRESS')
      })
      return
    }
    SaveManager.clear()
    window.location.reload()
  }

  protected layout() {
    const w = Math.min(380, this.W - 48)
    const h = Math.min(520, this.H - 40)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    this.drawCard(x, y, w, h, PAL.gold)

    this.heading.setText('EMBERHOLD').setPosition(this.W / 2, y + 40)
    const g = this.game
    const mins = Math.floor(g.saves.playtime / 60)
    this.stats.setText(
      `night ${g.waves.wave}   ·   level ${g.player.level}   ·   ${g.combat.kills} slain\n` +
      `${g.army.count} troops   ·   ${g.workers.count} workers   ·   ${mins} min played`,
    ).setPosition(this.W / 2, y + 74)

    const labels = [
      'RESUME',
      `MASTER  ${Math.round(g.settings.master * 100)}%`,
      `EFFECTS  ${Math.round(g.settings.sfx * 100)}%`,
      `MUSIC  ${Math.round(g.settings.music * 100)}%`,
      `QUALITY  ${QUALITY_NAMES[g.settings.quality]}`,
      'SAVE NOW',
      this.confirmingReset ? 'TAP AGAIN TO WIPE' : 'RESET PROGRESS',
    ]
    const bw = w - 72
    let by = y + 124
    for (let i = 0; i < this.rows.length; i++) {
      this.rows[i].setLabel(labels[i])
      this.rows[i].place(this.W / 2, by, bw, 38)
      by += 44
    }

    this.controls.setText(
      'WASD / arrows move   ·   auto-attack   ·   SPACE Q E F abilities   ·   R ultimate\n' +
      'H hold or follow   ·   ESC pause   ·   F2 debug   ·   stand in a site to build',
    ).setPosition(this.W / 2, y + h - 34)
  }
}
