import Phaser from 'phaser'
import { Overlay } from './Overlay'
import { PAL } from '../config/palette'
import { UPGRADE_ICON } from '../art/icons'
import type { UpgradeDef } from '../config/upgrades'
import type { GameScene } from '../scenes/GameScene'
import { textStyle } from './theme'
import { ON_PAGE, PAD, sealTexture, SkinPanel } from './skin'
import { IS_TOUCH } from '../core/device'

interface Card {
  box: Phaser.GameObjects.Container
  page: SkinPanel
  marks: Phaser.GameObjects.Graphics
  seal: Phaser.GameObjects.Image
  icon: Phaser.GameObjects.Image
  title: Phaser.GameObjects.Text
  desc: Phaser.GameObjects.Text
  stacks: Phaser.GameObjects.Text
  keyHint: Phaser.GameObjects.Text
  zone: Phaser.GameObjects.Zone
  def: UpgradeDef | null
  hover: boolean
}

/**
 * Three picks on level-up. Short, punchy, and it pauses the fight.
 *
 * Each boon is its own page with its own wax seal, dealt onto the darkened
 * field under a ribbon. On a phone held upright three columns would be a word
 * wide each, so the cards lie down and stack instead.
 */
export class LevelUpOverlay extends Overlay {
  private ribbon: SkinPanel
  private heading!: Phaser.GameObjects.Text
  private sub!: Phaser.GameObjects.Text
  private cards: Card[] = []
  private choices: UpgradeDef[] = []

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_200_000)
    // A level-up stops the fight outright, and its cards float with no page of
    // their own behind them, so the HUD under them is pushed further back.
    this.dim.setFillStyle(0x0c0704, 0.72)
    this.ribbon = new SkinPanel(scene, 'ribbon', { lacquer: PAL.wax })
    this.root.add(this.ribbon.img)
    this.heading = scene.add.text(0, 0, '', textStyle({ voice: 'display', size: 32, colour: PAL.bone, weight: '800', shadow: true }))
      .setOrigin(0.5).setScrollFactor(0)
    this.sub = scene.add.text(0, 0, '', textStyle({ voice: 'caps', size: 14, colour: PAL.uiDim, weight: '800', stroke: 3 }))
      .setOrigin(0.5).setScrollFactor(0)
    this.root.add([this.heading, this.sub])

    for (let i = 0; i < 3; i++) {
      const box = scene.add.container(0, 0).setScrollFactor(0)
      const page = new SkinPanel(scene, 'page')
      const marks = scene.add.graphics()
      const seal = scene.add.image(0, 0, '__WHITE')
      const icon = scene.add.image(0, 0, 'ico_blade')
      const title = scene.add.text(0, 0, '', textStyle({ voice: 'display', size: 22, colour: ON_PAGE.text, align: 'center' }))
        .setOrigin(0.5)
      const desc = scene.add.text(0, 0, '', textStyle({ size: 14, colour: ON_PAGE.dim, weight: '500', align: 'center', wrap: 170 }))
        .setOrigin(0.5, 0).setLineSpacing(1)
      const stacks = scene.add.text(0, 0, '', textStyle({ voice: 'caps', size: 12, colour: ON_PAGE.dim, weight: '800' }))
        .setOrigin(0.5)
      const keyHint = scene.add.text(0, 0, '', textStyle({ voice: 'caps', size: 12, colour: ON_PAGE.gilt, weight: '800' }))
        .setOrigin(0.5)
      const zone = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true })
      box.add([page.img, marks, seal, icon, title, desc, stacks, keyHint, zone])
      this.root.add(box)
      const card: Card = { box, page, marks, seal, icon, title, desc, stacks, keyHint, zone, def: null, hover: false }
      zone.on('pointerdown', () => this.choose(i))
      zone.on('pointerover', () => this.lift(card, true))
      zone.on('pointerout', () => this.lift(card, false))
      this.cards.push(card)
    }

    scene.input.keyboard?.on('keydown-ONE', () => this.open && this.choose(0))
    scene.input.keyboard?.on('keydown-TWO', () => this.open && this.choose(1))
    scene.input.keyboard?.on('keydown-THREE', () => this.open && this.choose(2))
  }

  private lift(c: Card, on: boolean) {
    c.hover = on
    this.scene.tweens.add({
      targets: c.box, scale: on ? 1.035 : 1, duration: 120, ease: 'Sine.easeOut',
    })
  }

  offer() {
    this.choices = this.game.levels.roll(3)
    if (!this.choices.length) return false
    this.show()
    // deal the cards in, one after another
    this.cards.forEach((c, i) => {
      if (!c.def) return
      const y = c.box.y
      c.box.setAlpha(0).setY(y + 26)
      this.scene.tweens.add({
        targets: c.box, alpha: 1, y, duration: 260, delay: 60 + i * 70, ease: 'Back.easeOut',
      })
    })
    return true
  }

  choose(i: number) {
    if (!this.open || i >= this.choices.length) return
    this.game.levels.apply(this.choices[i].id)
    this.hide()
    this.scene.events.emit('upgradeChosen')
  }

  protected layout() {
    this.drawDim()
    const stacked = this.W < 560 && this.H > this.W
    const compact = this.compact
    const n = 3

    // ---- card geometry ----------------------------------------------------
    let cw: number, ch: number, gap: number
    if (stacked) {
      cw = Math.min(420, this.W - 32)
      ch = Math.min(118, (this.H - 190) / n - 10)
      gap = 12
    } else {
      cw = Math.min(214, (this.W - 64) / n)
      ch = compact ? Math.min(230, this.H - 140) : 256
      gap = Math.min(22, (this.W - cw * n - 40) / 2)
    }
    const totalW = stacked ? cw : cw * n + gap * (n - 1)
    const totalH = stacked ? ch * n + gap * (n - 1) : ch
    const headH = compact ? 78 : 104
    const blockH = headH + totalH
    const top = Math.max(8, this.H / 2 - blockH / 2)
    const x0 = this.W / 2 - totalW / 2
    const y0 = top + headH

    // ---- heading ------------------------------------------------------------
    const rw = Math.min(this.W - 24, 330)
    const rh = compact ? 46 : 54
    this.ribbon.place(this.W / 2 - rw / 2, top, rw, rh)
    this.heading.setText(`Level ${this.game.player.level}`).setPosition(this.W / 2, top + rh / 2 - 1)
      .setFontSize(compact ? 26 : 32)
    this.sub.setText('Choose a boon').setPosition(this.W / 2, top + rh + (compact ? 14 : 20))
      .setFontSize(compact ? 13 : 15)

    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]
      const def = this.choices[i]
      c.def = def ?? null
      c.box.setVisible(!!def)
      c.zone.setSize(def ? cw : 1, def ? ch : 1)
      if (!def) continue

      // The card is laid out around its own centre so it can scale on hover.
      const cx = stacked ? x0 + cw / 2 : x0 + i * (cw + gap) + cw / 2
      const cy = stacked ? y0 + i * (ch + gap) + ch / 2 : y0 + ch / 2
      c.box.setPosition(cx, cy).setScale(c.hover ? 1.035 : 1).setAlpha(1)
      c.page.style({ accent: def.colour }).place(-cw / 2, -ch / 2, cw, ch)
      c.zone.setPosition(0, 0)

      const taken = this.game.levels.stacks(def.id)
      c.marks.clear()
      c.title.setText(def.name)
      c.desc.setText(def.desc)
      c.keyHint.setText(IS_TOUCH ? 'Tap to take' : `Press ${i + 1}`)

      if (stacked) {
        // seal on the left, words to its right
        const sr = Math.min(30, ch / 2 - 16)
        const sx = -cw / 2 + 22 + sr
        this.placeSeal(c, def, sx, 0, sr)
        const tx = sx + sr + 16
        const tw = cw / 2 - 20 - tx
        c.title.setOrigin(0, 0.5).setAlign('left').setPosition(tx, -ch / 2 + 26).setFontSize(20)
        this.fit(c.title, 20, tw)
        c.desc.setOrigin(0, 0).setAlign('left').setWordWrapWidth(tw).setPosition(tx, -ch / 2 + 40).setFontSize(13)
        c.stacks.setOrigin(0, 0.5).setPosition(tx, ch / 2 - 18)
        c.keyHint.setOrigin(1, 0.5).setPosition(cw / 2 - 20, ch / 2 - 18)
        this.pips(c, def, taken, tx + (def.evergreen ? c.stacks.width + 8 : 0), ch / 2 - 18, 'left')
      } else {
        const sr = compact ? 26 : 32
        const sy = -ch / 2 + (compact ? 22 : 30) + sr
        this.placeSeal(c, def, 0, sy, sr)
        const ty = sy + sr + (compact ? 20 : 24)
        c.title.setOrigin(0.5).setAlign('center').setPosition(0, ty)
        this.fit(c.title, compact ? 19 : 22, cw - 30)
        c.desc.setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(cw - 34)
          .setPosition(0, ty + (compact ? 14 : 18)).setFontSize(compact ? 13 : 15)
        c.stacks.setOrigin(0.5).setPosition(0, ch / 2 - (compact ? 40 : 48))
        c.keyHint.setOrigin(0.5).setPosition(0, ch / 2 - (compact ? 20 : 24))
        this.pips(c, def, taken, 0, ch / 2 - (compact ? 40 : 48), 'center')
        // a ruled line above the footer
        c.marks.lineStyle(1, 0x3a2616, 0.3)
        c.marks.lineBetween(-cw / 2 + 26, ch / 2 - (compact ? 56 : 66), cw / 2 - 26, ch / 2 - (compact ? 56 : 66))
      }
      c.stacks.setText(def.evergreen ? `Mastery · rank ${taken + 1}` : '')
    }
  }

  private placeSeal(c: Card, def: UpgradeDef, x: number, y: number, r: number) {
    c.seal.setTexture(sealTexture(this.scene, def.colour, true, 36))
      .setDisplaySize((36 + PAD) * 2 * (r / 36), (36 + PAD) * 2 * (r / 36))
      .setPosition(x, y)
    c.icon.setTexture(UPGRADE_ICON[def.id]).setDisplaySize(r * 1.2, r * 1.2).setPosition(x, y)
  }

  /** Owned ranks as a row of lozenges: filled for taken, the next one outlined in wax. */
  private pips(c: Card, def: UpgradeDef, taken: number, x: number, y: number, align: 'left' | 'center') {
    if (def.evergreen) return
    const n = def.maxStacks
    const step = 12
    const start = align === 'center' ? x - ((n - 1) * step) / 2 : x + 4
    const g = c.marks
    for (let i = 0; i < n; i++) {
      const px = start + i * step
      const s = 4
      const pts = [{ x: px, y: y - s }, { x: px + s, y }, { x: px, y: y + s }, { x: px - s, y }]
      if (i < taken) {
        g.fillStyle(0x3a2616, 0.85)
        g.fillPoints(pts, true)
      } else if (i === taken) {
        g.fillStyle(PAL.wax, 1)
        g.fillPoints(pts, true)
        g.lineStyle(1, 0x3a2616, 0.9)
        g.strokePoints(pts, true)
      } else {
        g.lineStyle(1, 0x3a2616, 0.4)
        g.strokePoints(pts, true)
      }
    }
  }

  private fit(t: Phaser.GameObjects.Text, size: number, maxW: number) {
    t.setFontSize(size)
    while (t.width > maxW && size > 11) { size--; t.setFontSize(size) }
  }
}
