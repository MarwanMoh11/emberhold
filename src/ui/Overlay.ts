import Phaser from 'phaser'
import { PAL, CSS } from '../config/palette'

export const FONT = 'Verdana, Geneva, sans-serif'

/** Shared chrome for the modal panels: dim, card, title, buttons. */
export class Overlay {
  readonly root: Phaser.GameObjects.Container
  protected dim: Phaser.GameObjects.Rectangle
  protected card: Phaser.GameObjects.Graphics
  open = false

  constructor(protected scene: Phaser.Scene, depth = 1_100_000) {
    this.root = scene.add.container(0, 0).setDepth(depth).setVisible(false).setScrollFactor(0)
    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x040810, 0.72).setOrigin(0, 0).setScrollFactor(0)
    this.card = scene.add.graphics().setScrollFactor(0)
    this.root.add([this.dim, this.card])
    scene.scale.on('resize', () => { if (this.open) this.layout() })
  }

  protected get W() { return this.scene.cameras.main.width }
  protected get H() { return this.scene.cameras.main.height }

  /**
   * A landscape phone: barely 390px of height for a card that also has to hold
   * a heading and a row of buttons. Every panel reads this and goes flat and
   * wide — smaller type, tighter rows, more columns — rather than running off
   * the bottom of the screen where nothing can reach it.
   */
  protected get compact() { return this.H < 470 }

  protected drawCard(x: number, y: number, w: number, h: number, accent = PAL.uiEdge) {
    this.dim.setSize(this.W, this.H)
    this.card.clear()
    this.card.fillStyle(PAL.uiPanel, 0.97)
    this.card.fillRoundedRect(x, y, w, h, 14)
    this.card.lineStyle(2, accent, 1)
    this.card.strokeRoundedRect(x, y, w, h, 14)
    this.card.fillStyle(accent, 0.9)
    this.card.fillRoundedRect(x + 16, y + 8, w - 32, 3, 2)
  }

  protected text(size: number, colour: number, bold = false, originX = 0.5, originY = 0.5) {
    const t = this.scene.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: `${size}px`, color: CSS(colour),
      fontStyle: bold ? 'bold' : 'normal', align: originX === 0.5 ? 'center' : 'left',
    }).setOrigin(originX, originY).setScrollFactor(0)
    this.root.add(t)
    return t
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

  protected button(label: string, onClick: () => void, colour = PAL.heroTrim, size = 14) {
    const g = this.scene.add.graphics().setScrollFactor(0)
    const t = this.scene.add.text(0, 0, label, {
      fontFamily: FONT, fontSize: `${size}px`, color: CSS(PAL.uiText), fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0)
    const zone = this.scene.add.zone(0, 0, 10, 10).setScrollFactor(0).setInteractive({ useHandCursor: true })
    let hover = false
    let enabled = true
    const redraw = (x: number, y: number, w: number, h: number) => {
      g.clear()
      g.fillStyle(hover && enabled ? PAL.uiEdge : PAL.uiBg, enabled ? 0.95 : 0.55)
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8)
      g.lineStyle(2, colour, enabled ? (hover ? 1 : 0.7) : 0.22)
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8)
      t.setColor(CSS(enabled ? PAL.uiText : PAL.uiDim))
    }
    zone.on('pointerover', () => { hover = true; api.place(api.x, api.y, api.w, api.h) })
    zone.on('pointerout', () => { hover = false; api.place(api.x, api.y, api.w, api.h) })
    zone.on('pointerdown', () => { if (enabled) onClick() })
    this.root.add([g, t, zone])
    const api = {
      x: 0, y: 0, w: 140, h: 40,
      place(x: number, y: number, w = 140, h = 40) {
        api.x = x; api.y = y; api.w = w; api.h = h
        redraw(x, y, w, h)
        t.setPosition(x, y)
        zone.setPosition(x, y).setSize(w, h)
      },
      setLabel(s: string) { t.setText(s) },
      setVisible(v: boolean) { g.setVisible(v); t.setVisible(v); zone.setSize(v ? api.w : 1, v ? api.h : 1) },
      /** A greyed button still draws, but swallows nothing: the tap does nothing. */
      setEnabled(v: boolean) { enabled = v; redraw(api.x, api.y, api.w, api.h) },
    }
    api.place(0, 0)
    return api
  }

  show() { this.open = true; this.root.setVisible(true); this.layout() }
  hide() { this.open = false; this.root.setVisible(false) }
  toggle() { this.open ? this.hide() : this.show() }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected layout() {}
}
