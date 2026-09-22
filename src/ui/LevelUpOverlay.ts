import Phaser from 'phaser'
import { Overlay, FONT } from './Overlay'
import { PAL, CSS } from '../config/palette'
import type { UpgradeDef } from '../config/upgrades'
import type { GameScene } from '../scenes/GameScene'

interface Card {
  g: Phaser.GameObjects.Graphics
  title: Phaser.GameObjects.Text
  desc: Phaser.GameObjects.Text
  stacks: Phaser.GameObjects.Text
  keyHint: Phaser.GameObjects.Text
  zone: Phaser.GameObjects.Zone
  def: UpgradeDef | null
}

/** Three picks on level-up. Short, punchy, and it pauses the fight. */
export class LevelUpOverlay extends Overlay {
  private heading!: Phaser.GameObjects.Text
  private sub!: Phaser.GameObjects.Text
  private cards: Card[] = []
  private choices: UpgradeDef[] = []

  constructor(scene: Phaser.Scene, private game: GameScene) {
    super(scene, 1_200_000)
    this.heading = this.text(30, PAL.gold, true)
    this.sub = this.text(13, PAL.uiDim)

    for (let i = 0; i < 3; i++) {
      const g = scene.add.graphics().setScrollFactor(0)
      const title = scene.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '17px', color: CSS(PAL.uiText), fontStyle: 'bold', align: 'center',
      }).setOrigin(0.5).setScrollFactor(0)
      const desc = scene.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '12px', color: CSS(PAL.uiDim), align: 'center',
        wordWrap: { width: 170 },
      }).setOrigin(0.5, 0).setScrollFactor(0)
      const stacks = scene.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: '10px', color: CSS(PAL.uiDim),
      }).setOrigin(0.5).setScrollFactor(0)
      const keyHint = scene.add.text(0, 0, `${i + 1}`, {
        fontFamily: FONT, fontSize: '12px', color: CSS(PAL.gold), fontStyle: 'bold',
      }).setOrigin(0.5).setScrollFactor(0)
      const zone = scene.add.zone(0, 0, 10, 10).setScrollFactor(0).setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => this.choose(i))
      this.root.add([g, title, desc, stacks, keyHint, zone])
      this.cards.push({ g, title, desc, stacks, keyHint, zone, def: null })
    }

    scene.input.keyboard?.on('keydown-ONE', () => this.open && this.choose(0))
    scene.input.keyboard?.on('keydown-TWO', () => this.open && this.choose(1))
    scene.input.keyboard?.on('keydown-THREE', () => this.open && this.choose(2))
  }

  offer() {
    this.choices = this.game.levels.roll(3)
    if (!this.choices.length) return false
    this.show()
    return true
  }

  choose(i: number) {
    if (!this.open || i >= this.choices.length) return
    this.game.levels.apply(this.choices[i].id)
    this.hide()
    this.scene.events.emit('upgradeChosen')
  }

  protected layout() {
    const cw = Math.min(200, (this.W - 80) / 3)
    const ch = 200
    const gap = Math.min(20, (this.W - cw * 3 - 40) / 2)
    const totalW = cw * 3 + gap * 2
    const x0 = this.W / 2 - totalW / 2
    const y0 = this.H / 2 - ch / 2 + 20

    this.drawCard(this.W / 2 - totalW / 2 - 26, y0 - 96, totalW + 52, ch + 132, PAL.gold)
    this.heading.setText(`LEVEL ${this.game.player.level}`).setPosition(this.W / 2, y0 - 60)
    this.sub.setText('CHOOSE A BOON').setPosition(this.W / 2, y0 - 32)

    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i]
      const def = this.choices[i]
      c.def = def ?? null
      const visible = !!def
      c.g.setVisible(visible); c.title.setVisible(visible)
      c.desc.setVisible(visible); c.stacks.setVisible(visible); c.keyHint.setVisible(visible)
      c.zone.setSize(visible ? cw : 1, visible ? ch : 1)
      if (!def) continue

      const x = x0 + i * (cw + gap)
      c.g.clear()
      c.g.fillStyle(PAL.uiBg, 0.96)
      c.g.fillRoundedRect(x, y0, cw, ch, 10)
      c.g.lineStyle(2, def.colour, 1)
      c.g.strokeRoundedRect(x, y0, cw, ch, 10)
      c.g.fillStyle(def.colour, 0.16)
      c.g.fillRoundedRect(x, y0, cw, 62, 10)
      c.g.fillStyle(def.colour, 1)
      c.g.fillCircle(x + cw / 2, y0 + 34, 14)
      c.g.fillStyle(PAL.uiBg, 1)
      c.g.fillCircle(x + cw / 2, y0 + 34, 8)

      c.title.setPosition(x + cw / 2, y0 + 82).setText(def.name)
      c.desc.setPosition(x + cw / 2, y0 + 104).setText(def.desc)
      c.desc.setWordWrapWidth(cw - 24)
      const taken = this.game.levels.stacks(def.id)
      c.stacks.setPosition(x + cw / 2, y0 + ch - 28)
        .setText(def.evergreen ? `MASTERY · RANK ${taken + 1}`
          : taken > 0 ? `owned ${taken}/${def.maxStacks}` : `${def.maxStacks} max`)
      c.keyHint.setPosition(x + cw / 2, y0 + ch - 12).setText(`press ${i + 1}`)
      c.zone.setPosition(x + cw / 2, y0 + ch / 2)
    }
  }
}
