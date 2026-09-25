import { Overlay } from './Overlay'
import { ABILITY_KEYS } from '../config/abilities'
import { PAL } from '../config/palette'
import { QUESTS, ACHIEVEMENTS } from '../config/quests'
import { SaveManager } from '../systems/SaveManager'
import { RELICS } from '../systems/Relics'
import { relicSealKey } from '../art/pois'
import { textStyle } from './theme'
import type { GameScene } from '../scenes/GameScene'
import type Phaser from 'phaser'

const QUALITY_NAMES = ['low', 'medium', 'high']

/** Which screen a menu row opens. UIScene owns the actual overlays. */
export type ScreenName = 'quests' | 'deeds' | 'respec' | 'summary'

/**
 * Rows in display order, grouped into the lines they share.
 *
 * Fourteen things to reach and only eight lines to reach them in: a landscape
 * phone gives the card barely 350px of height, and one row per action ran off
 * the bottom long before the reset button. Everything that pairs naturally
 * shares a line instead, so the list got four entries longer without getting
 * any taller.
 */
const LINES: number[][] = [[0], [1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13]]

export class PauseMenu extends Overlay {
  private heading!: Phaser.GameObjects.Text
  private stats!: Phaser.GameObjects.Text
  private controls!: Phaser.GameObjects.Text
  private rules!: Phaser.GameObjects.Graphics
  private rows: ReturnType<Overlay['button']>[] = []
  private confirmingReset = false
  private focusIndex = 0
  private saveNote = ''
  private exportNote = ''
  /** the Relics strip (S15): a painted seal per relic, blank until won, each with its tooltip */
  private relicLabel!: Phaser.GameObjects.Text
  private seals: Phaser.GameObjects.Image[] = []
  private tip!: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_150_000)
    this.rules = this.gfx()
    this.heading = this.text(30, PAL.uiText, true)
    this.stats = this.text(13, PAL.uiDim)
    this.stats.setFontStyle('italic 500')
    this.controls = this.text(11, PAL.uiDim)

    const open = (s: ScreenName) => () => {
      this.game.audio.play('ui')
      this.scene.events.emit('openScreen', s)
    }
    this.rows = [
      this.button('Resume', () => this.scene.events.emit('togglePause'), 'primary', 17),
      this.button('Quest log', open('quests'), 'plain', 14),
      this.button('Deeds', open('deeds'), 'plain', 14),
      this.button('Respec', open('respec'), 'plain', 14),
      this.button('Run summary', open('summary'), 'plain', 14),
      this.button('Master', () => this.cycle('master'), 'quiet', 13),
      this.button('Effects', () => this.cycle('sfx'), 'quiet', 13),
      this.button('Music', () => this.cycle('music'), 'quiet', 13),
      this.button('Quality', () => this.cycleQuality(), 'quiet', 13),
      this.button('Numbers', () => this.toggleSetting('showDamage'), 'quiet', 13),
      this.button('Motion', () => this.toggleSetting('reducedMotion'), 'quiet', 13),
      this.button('Save now', () => {
        this.saveNote = this.game.saves.save() ? 'Saved' : 'Save failed'
        this.layout()
      }, 'plain', 14),
      this.button('Export file', () => {
        this.exportNote = this.game.saves.download() ? 'File ready' : 'Export failed'
        this.layout()
      }, 'plain', 14),
      // Quiet plate, vermilion letters: findable, but not the brightest thing
      // on a menu whose first job is to get you back into the game.
      this.button('Reset progress', () => this.resetProgress(), 'quiet', 14),
    ]

    this.relicLabel = this.text(12, PAL.uiDim, true, 0, 0.5)
    this.seals = RELICS.map((_, i) => {
      const img = scene.add.image(0, 0, relicSealKey('empty')).setScrollFactor(0).setInteractive({ useHandCursor: true })
      img.on('pointerover', () => this.showTip(i))
      img.on('pointerdown', () => this.showTip(i))
      img.on('pointerout', () => this.tip.setVisible(false))
      this.root.add(img)
      return img
    })
    // last, so it draws over the seals and the rows
    this.tip = scene.add.text(0, 0, '', textStyle({ size: 12, colour: PAL.bone, weight: '600', align: 'center' }))
      .setOrigin(0.5, 1).setScrollFactor(0).setBackgroundColor('#26170cee').setPadding(9, 6, 9, 6).setVisible(false)
    this.root.add(this.tip)
  }

  /** A seal's tooltip: the relic and what it does, or where it is won while it is still missing. */
  private showTip(i: number) {
    const r = RELICS[i], img = this.seals[i]
    const held = this.game.relics.has(r.id)
    const name = r.name.replace(/^the /, 'The ')
    this.tip.setWordWrapWidth(Math.min(260, this.W - 32)).setText(held ? `${name}\n${r.effect}` : `${name}  ·  not yet won\n${r.source}`)
    const half = this.tip.width / 2
    this.tip.setPosition(Math.max(half + 8, Math.min(this.W - half - 8, img.x)), img.y - img.displayHeight / 2 - 4).setVisible(true)
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

  private toggleSetting(which: 'showDamage' | 'reducedMotion') {
    const s = { ...this.game.settings, [which]: !this.game.settings[which] }
    this.game.applySettings(s)
    this.game.audio.play('ui')
    this.layout()
  }

  private resetProgress() {
    if (!this.confirmingReset) {
      this.confirmingReset = true
      this.rows[13].setLabel('Tap again to wipe')
      this.scene.time.delayedCall(2600, () => {
        this.confirmingReset = false
        this.rows[13].setLabel('Reset progress')
      })
      return
    }
    SaveManager.clear()
    window.location.reload()
  }

  show() {
    this.rows[13].setTextColour(PAL.danger)
    this.saveNote = ''
    this.exportNote = ''
    super.show()
    this.focus(0)
  }

  private focus(index: number) {
    this.focusIndex = index
    this.rows.forEach((row, i) => row.setSelected(i === index))
  }

  navigate(direction: 'up' | 'down' | 'left' | 'right') {
    const line = LINES.findIndex(row => row.includes(this.focusIndex))
    const col = LINES[line].indexOf(this.focusIndex)
    const nextLine = Math.max(0, Math.min(LINES.length - 1,
      line + (direction === 'up' ? -1 : direction === 'down' ? 1 : 0)))
    const nextCol = direction === 'left' ? Math.max(0, col - 1)
      : direction === 'right' ? Math.min(LINES[nextLine].length - 1, col + 1) : col
    const next = LINES[nextLine][Math.min(nextCol, LINES[nextLine].length - 1)]
    if (next !== this.focusIndex) {
      this.focus(next)
      this.game.audio.play('ui')
    }
  }

  activateFocused() { this.rows[this.focusIndex].trigger() }

  protected layout() {
    const c = this.compact
    const g = this.game
    const w = Math.min(c ? 560 : 400, this.W - (c ? 24 : 40))

    // The control crib is set and measured before the card is sized, because
    // on a narrow card it wraps — it used to run out past both edges on a
    // portrait phone and on any window narrow enough to pin the card to 400.
    this.controls.setFontSize(c ? 10 : 12).setWordWrapWidth(w - 44).setText(
      c
        ? `WASD move  ·  X dodge  ·  ${ABILITY_KEYS.join(' ')} skills  ·  R ultimate  ·  H army`
        : `WASD move  ·  X dodge  ·  ${ABILITY_KEYS.join(' ')} skills\n` +
          'R ultimate  ·  H army  ·  ESC pause  ·  F2 debug\n' +
          'Stand at a site to build, recruit or claim',
    ).setLineSpacing(2)

    const head0 = c ? 74 : 126
    const stripH = c ? 26 : 40
    const headH = head0 + stripH
    const footH = Math.round(this.controls.height) + (c ? 22 : 34)
    const pitch0 = c ? 34 : 44
    const h = Math.min(this.H - 16, headH + LINES.length * pitch0 + footH)
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    const cx = this.W / 2
    this.drawCard(x, y, w, h, PAL.wax)

    this.heading.setText('Emberhold').setPosition(cx, y + (c ? 30 : 46))
    this.fitText(this.heading, c ? 24 : 34, w - 60)
    const mins = Math.floor(g.saves.playtime / 60)
    this.stats.setFontSize(c ? 11 : 13).setText(
      c
        ? `Night ${g.waves.wave}  ·  level ${g.player.level}  ·  ${g.combat.kills} slain  ·  ${g.army.count} troops  ·  ${mins} min`
        : `Night ${g.waves.wave}  ·  level ${g.player.level}  ·  ${g.combat.kills} slain\n` +
          `${g.army.count} troops  ·  ${g.workers.count} workers  ·  ${mins} min played`,
    ).setLineSpacing(2).setPosition(cx, y + (c ? 54 : 88))
    this.fitText(this.stats, c ? 11 : 13, w - 44)
    this.rules.clear()
    if (!c) this.rule(this.rules, cx, y + head0 - 12, Math.min(220, w - 80))
    this.layoutRelics(cx, y + head0 + stripH / 2 - 4, w - (c ? 48 : 64))

    const earned = g.quests.unlockedAchievements.size
    const labels = [
      'Resume',
      `Quest log  ${g.quests.index}/${QUESTS.length}`,
      `Deeds  ${earned}/${ACHIEVEMENTS.length}`,
      'Respec',
      'Run summary',
      `Master  ${Math.round(g.settings.master * 100)}%`,
      `Effects  ${Math.round(g.settings.sfx * 100)}%`,
      `Music  ${Math.round(g.settings.music * 100)}%`,
      `Quality  ${QUALITY_NAMES[g.settings.quality]}`,
      `Numbers  ${g.settings.showDamage ? 'on' : 'off'}`,
      `Motion  ${g.settings.reducedMotion ? 'low' : 'full'}`,
      this.saveNote || 'Save now',
      this.exportNote || 'Export file',
      this.confirmingReset ? 'Tap again to wipe' : 'Reset progress',
    ]

    const bw = w - (c ? 48 : 64)
    const gap = 10
    const half = (bw - gap) / 2
    const top = y + headH
    const pitch = Math.min(pitch0, (h - headH - footH) / LINES.length)
    const bh = Math.min(c ? 28 : 36, pitch - 7)

    for (let l = 0; l < LINES.length; l++) {
      const line = LINES[l]
      // Resume is the one row that is not a peer of the others: taller, and
      // set apart from the rows that follow it.
      const by = top + l * pitch + pitch / 2 + (l > 0 && !c ? 4 : 0)
      for (let i = 0; i < line.length; i++) {
        const idx = line[i]
        this.rows[idx].setLabel(labels[idx])
        if (line.length === 1) {
          this.rows[idx].place(cx, by, l === 0 ? bw : bw, l === 0 ? Math.min(bh + 6, pitch - 2) : bh)
        } else {
          this.rows[idx].place(cx + (i === 0 ? -1 : 1) * (half + gap) / 2, by, half, bh)
        }
      }
    }

    this.controls.setPosition(cx, y + h - footH / 2 - (c ? 2 : 4))
  }

  /** The Relics strip: its count, then the seven seals, centred as one line under the heading. */
  private layoutRelics(cx: number, cy: number, maxW: number) {
    const g = this.game, c = this.compact
    this.tip.setVisible(false)
    this.relicLabel.setFontSize(c ? 11 : 12).setText(`Relics  ${g.relics.list().length}/${RELICS.length}`)
    const labelW = this.relicLabel.width + 12
    const pitch = Math.min(c ? 28 : 38, (maxW - labelW) / RELICS.length)
    const size = pitch * 0.86
    const left = cx - (labelW + pitch * RELICS.length) / 2
    this.relicLabel.setPosition(left, cy)
    RELICS.forEach((r, i) => {
      const held = g.relics.has(r.id)
      this.seals[i].setTexture(relicSealKey(held ? r.id : 'empty')).setDisplaySize(size, size)
        .setPosition(left + labelW + pitch * (i + 0.5), cy)
    })
  }
}
