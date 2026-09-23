import Phaser from 'phaser'
import { PAL, CSS } from '../config/palette'
import { screen, textStyle, type Voice } from './theme'
import { onPage, PlateButton, SkinPanel, vignetteTexture, type Tone } from './skin'

/**
 * Shared chrome for the modal panels: the dim, the parchment page, headings
 * and plate buttons.
 *
 * Every modal is a page out of the hold's chronicle: ink on parchment over a
 * darkened, vignetted world. Colours are passed in their HUD form (bone, gold,
 * vermilion) and turned into inks that hold up on paper, so a panel never has
 * to know which surface it sits on.
 */
export class Overlay {
  readonly root: Phaser.GameObjects.Container
  protected dim: Phaser.GameObjects.Rectangle
  protected vignette: Phaser.GameObjects.Image
  protected page: SkinPanel
  open = false

  constructor(protected scene: Phaser.Scene, depth = 1_100_000) {
    this.root = scene.add.container(0, 0).setDepth(depth).setVisible(false).setScrollFactor(0)
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x0c0704, 0.58).setOrigin(0, 0).setScrollFactor(0)
      // A dim that eats taps: nothing under a modal should answer a thumb.
      .setInteractive()
    this.vignette = scene.add.image(0, 0, vignetteTexture(scene)).setOrigin(0, 0).setScrollFactor(0)
    this.page = new SkinPanel(scene, 'page')
    this.root.add([this.dim, this.vignette, this.page.img])
    scene.scale.on('resize', () => { if (this.open) this.layout() })
  }

  protected get W() { return screen(this.scene).w }
  protected get H() { return screen(this.scene).h }

  /**
   * A landscape phone: barely 390px of height for a card that also has to hold
   * a heading and a row of buttons. Every panel reads this and goes flat and
   * wide — smaller type, tighter rows, more columns — rather than running off
   * the bottom of the screen where nothing can reach it.
   */
  protected get compact() { return this.H < 470 }

  /** Lay the dim over the whole screen and the page where it goes. */
  protected drawCard(x: number, y: number, w: number, h: number, accent: number = PAL.wax) {
    this.dim.setSize(this.W, this.H)
    this.vignette.setDisplaySize(this.W, this.H)
    this.page.setVisible(true).style({ accent }).place(x, y, w, h)
  }

  /** The dim alone, for a modal that floats its content without a page. */
  protected drawDim() {
    this.dim.setSize(this.W, this.H)
    this.vignette.setDisplaySize(this.W, this.H)
    this.page.setVisible(false)
  }

  /**
   * Text on the page. Bold and large is a heading and is set in the display
   * face; everything else is the reading face. Pass `voice` to choose.
   */
  protected text(size: number, colour: number, bold = false, originX = 0.5, originY = 0.5, voice?: Voice) {
    const v: Voice = voice ?? (bold && size >= 18 ? 'display' : 'ui')
    const t = this.scene.add.text(0, 0, '', textStyle({
      voice: v, size, colour: onPage(colour),
      weight: v === 'display' ? '800' : bold ? '800' : '500',
      align: originX === 0.5 ? 'center' : 'left',
    })).setOrigin(originX, originY).setScrollFactor(0)
    this.root.add(t)
    return t
  }

  /** Set a page text's colour from its HUD form. */
  protected ink(t: Phaser.GameObjects.Text, colour: number) {
    return t.setColor(CSS(onPage(colour)))
  }

  /**
   * Shrink a single line until it fits the card it sits in.
   *
   * A heading sized for a desktop card runs straight off both edges of the same
   * card on a portrait phone, where the width is pinned to the screen. Call it
   * after the text is set; it only ever makes type smaller.
   */
  protected fitText(t: Phaser.GameObjects.Text, size: number, maxW: number, min = 8) {
    t.setFontSize(size)
    while (t.width > maxW && size > min) {
      size -= 1
      t.setFontSize(size)
    }
    return t
  }

  /**
   * A graphics layer inside the card. Panels make theirs first so the rows and
   * bars they draw sit *under* the text that explains them.
   */
  protected gfx() {
    const g = this.scene.add.graphics().setScrollFactor(0)
    this.root.add(g)
    return g
  }

  protected button(label: string, onClick: () => void, tone: Tone = 'plain', size = 15, icon?: string) {
    const b = new PlateButton(this.scene, { label, onClick, tone, size, icon })
    b.setScrollFactor(0)
    this.root.add(b.objects())
    b.place(0, 0)
    return b
  }

  /**
   * A small inked rule with a lozenge in the middle, the way a chronicle
   * separates its heading from its body.
   */
  protected rule(g: Phaser.GameObjects.Graphics, cx: number, y: number, w: number, accent: number = PAL.wax) {
    const ink = 0x3a2616
    g.lineStyle(1, ink, 0.55)
    g.lineBetween(cx - w / 2, y, cx - 7, y)
    g.lineBetween(cx + 7, y, cx + w / 2, y)
    g.fillStyle(ink, 0.8)
    g.fillPoints([{ x: cx, y: y - 4.5 }, { x: cx + 4.5, y }, { x: cx, y: y + 4.5 }, { x: cx - 4.5, y }], true)
    g.fillStyle(accent, 1)
    g.fillPoints([{ x: cx, y: y - 2.6 }, { x: cx + 2.6, y }, { x: cx, y: y + 2.6 }, { x: cx - 2.6, y }], true)
  }

  show() {
    this.open = true
    this.root.setVisible(true)
    this.layout()
    // The page settles into place rather than blinking on.
    this.root.setAlpha(0)
    this.scene.tweens.killTweensOf(this.root)
    this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 140, ease: 'Sine.easeOut' })
  }

  hide() {
    this.open = false
    this.scene.tweens.killTweensOf(this.root)
    this.root.setVisible(false)
  }

  toggle() { this.open ? this.hide() : this.show() }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected layout() {}
}

