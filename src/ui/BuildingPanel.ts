import Phaser from 'phaser'
import { PAL, CSS } from '../config/palette'
import { short as shortNum } from '../core/math'
import type { Building } from '../entities/Building'
import { wantsTouchTargets } from '../core/device'

interface Row {
  icon: Phaser.GameObjects.Image
  barBg: Phaser.GameObjects.Rectangle
  barFill: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
}

interface Chip {
  g: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  zone: Phaser.GameObjects.Zone
}

export interface PanelRow { tex: string; have: number; need: number }

/** One unit on a muster line. */
export interface PanelChip {
  key: string
  /** short name, plus how many are already in the field */
  label: string
  selected: boolean
  /** still behind a building level — shown so the upgrade explains itself */
  locked: boolean
  affordable: boolean
}

/** Everything the card draws for the pad the hero is standing in. */
export interface PanelView {
  title: string
  sub: string
  rows: PanelRow[]
  hint: string
  /** gold hint text turns red when it is a refusal rather than an invitation */
  hintBad?: boolean
  /** the UPGRADE button; absent when there is nothing to raise */
  upgrade?: { committed: boolean; affordable: boolean }
  /** who this building trains next; absent unless there is a real choice */
  chips?: PanelChip[]
  /** the hold-to-demolish bar, and how full the hold is so far (0..1) */
  demolish?: { salvage: string; hold: number }
}

export interface PanelHandlers {
  upgrade(b: Building): void
  pickUnit(b: Building, key: string): void
  /** pressed or released the demolish bar — the hold itself is timed by the caller */
  raze(b: Building, holding: boolean): void
}

const W = 268
const ROW_H = 20
/** Barracks has the longest roster. */
const MAX_CHIPS = 3

/**
 * The world-space card that appears over whatever pad you are standing in.
 *
 * Still not a build menu: it never lists things to place, it reports the state
 * of the one site you are physically inside. What it added are the two choices
 * standing there cannot express on its own — which unit this muster line turns
 * out next, and whether the pad should come back down. The deposit itself
 * still happens by standing there.
 */
export class BuildingPanel {
  private root: Phaser.GameObjects.Container
  private bg: Phaser.GameObjects.Graphics
  private title: Phaser.GameObjects.Text
  private sub: Phaser.GameObjects.Text
  private hint: Phaser.GameObjects.Text
  private rows: Row[] = []
  private shown = false

  private btnG: Phaser.GameObjects.Graphics
  private btnText: Phaser.GameObjects.Text
  private btnZone: Phaser.GameObjects.Zone
  private btnHover = false

  private chips: Chip[] = []
  private chipKeys: string[] = []

  private razeG: Phaser.GameObjects.Graphics
  private razeText: Phaser.GameObjects.Text
  private razeZone: Phaser.GameObjects.Zone

  private current: Building | null = null
  /** Height of the card as last drawn, for the hit test below. */
  private cardH = 0
  /** Counter-zoom applied to the card, so hit tests match what is drawn. */
  private cardScale = 1

  constructor(private scene: Phaser.Scene, private on: PanelHandlers) {
    this.root = scene.add.container(0, 0).setDepth(900_000).setVisible(false)
    this.bg = scene.add.graphics()
    this.title = scene.add.text(0, 0, '', {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '15px',
      color: CSS(PAL.uiText), fontStyle: 'bold',
    }).setOrigin(0.5, 0)
    this.sub = scene.add.text(0, 0, '', {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '11px',
      color: CSS(PAL.uiDim), align: 'center', wordWrap: { width: W - 26 },
    }).setOrigin(0.5, 0)
    this.hint = scene.add.text(0, 0, '', {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '11px',
      color: CSS(PAL.gold), align: 'center', wordWrap: { width: W - 26 },
    }).setOrigin(0.5, 0)
    this.root.add([this.bg, this.title, this.sub, this.hint])

    for (let i = 0; i < 4; i++) {
      const icon = scene.add.image(0, 0, 'res_coins').setScale(0.72).setVisible(false)
      const barBg = scene.add.rectangle(0, 0, W - 76, 9, PAL.uiBg, 0.9).setOrigin(0, 0.5).setVisible(false)
      const barFill = scene.add.rectangle(0, 0, 1, 9, PAL.gold, 1).setOrigin(0, 0.5).setVisible(false)
      const label = scene.add.text(0, 0, '', {
        fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '11px', color: CSS(PAL.uiText),
      }).setOrigin(1, 0.5).setVisible(false)
      this.root.add([barBg, barFill, icon, label])
      this.rows.push({ icon, barBg, barFill, label })
    }

    // The muster line. Tapping a chip only changes who the next recruit will
    // be — it spends nothing — so a mis-tap here costs a tap, not a treasury.
    for (let i = 0; i < MAX_CHIPS; i++) {
      const g = scene.add.graphics().setVisible(false)
      const label = scene.add.text(0, 0, '', {
        fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '11px',
        color: CSS(PAL.uiDim), fontStyle: 'bold',
      }).setOrigin(0.5).setVisible(false)
      const zone = scene.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => {
        const key = this.chipKeys[i]
        if (this.current && key) this.on.pickUnit(this.current, key)
      })
      this.root.add([g, label, zone])
      this.chips.push({ g, label, zone })
    }

    this.btnG = scene.add.graphics()
    this.btnText = scene.add.text(0, 0, 'UPGRADE', {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '13px',
      color: CSS(PAL.uiText), fontStyle: 'bold',
    }).setOrigin(0.5)
    this.btnZone = scene.add.zone(0, 0, 10, 10).setInteractive({ useHandCursor: true })
    this.btnZone.on('pointerover', () => { this.btnHover = true })
    this.btnZone.on('pointerout', () => { this.btnHover = false })
    this.btnZone.on('pointerdown', () => { if (this.current) this.on.upgrade(this.current) })
    this.root.add([this.btnG, this.btnText, this.btnZone])

    // Demolish. Every other control on this card is a tap; this one is a hold,
    // its target is exactly the bar with no slop around it, and letting go at
    // any point empties it. Losing a building you spent a night funding must
    // never be one stray thumb away.
    this.razeG = scene.add.graphics().setVisible(false)
    this.razeText = scene.add.text(0, 0, '', {
      fontFamily: 'Verdana, Geneva, sans-serif', fontSize: '10px',
      color: CSS(PAL.danger), fontStyle: 'bold', align: 'center',
    }).setOrigin(0.5).setVisible(false)
    this.razeZone = scene.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true })
    this.razeZone.on('pointerdown', () => { if (this.current) this.on.raze(this.current, true) })
    this.razeZone.on('pointerout', () => this.release())
    this.root.add([this.razeG, this.razeText, this.razeZone])

    // A finger that slides off the bar, or lifts outside the canvas entirely,
    // still has to count as letting go.
    scene.input.on('pointerup', this.release, this)
    scene.input.on('pointerupoutside', this.release, this)
  }

  private release() {
    if (this.current) this.on.raze(this.current, false)
  }

  hide() {
    if (!this.shown) return
    this.release()
    this.shown = false
    this.current = null
    this.btnZone.setSize(1, 1)
    this.razeZone.setSize(1, 1)
    for (const c of this.chips) c.zone.setSize(1, 1)
    this.root.setVisible(false)
  }

  get isShown() { return this.shown }

  /**
   * Does this world point land on the card? The movement stick asks before it
   * claims a touch: a thumb that misses UPGRADE should do nothing, not walk
   * the hero off the pad and cancel the upgrade it was reaching for.
   */
  containsWorldPoint(x: number, y: number) {
    if (!this.shown) return false
    const k = this.cardScale
    return x >= this.root.x - (W / 2) * k && x <= this.root.x + (W / 2) * k
      && y >= this.root.y && y <= this.root.y + this.cardH * k
  }

  show(b: Building, v: PanelView) {
    this.shown = true
    this.current = b
    this.root.setVisible(true)

    const fat = wantsTouchTargets(this.scene.scale.width)

    this.title.setText(v.title)
    this.sub.setText(v.sub)
    this.hint.setText(v.hint).setColor(CSS(v.hintBad ? PAL.danger : PAL.gold))

    const n = Math.min(v.rows.length, this.rows.length)
    let y = 26
    this.title.setPosition(0, 8)
    this.sub.setPosition(0, y)
    y += Math.max(14, this.sub.height) + 6

    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i]
      if (i >= n) {
        r.icon.setVisible(false); r.barBg.setVisible(false)
        r.barFill.setVisible(false); r.label.setVisible(false)
        continue
      }
      const d = v.rows[i]
      const cy = y + ROW_H / 2
      const barX = -W / 2 + 34
      const barW = W - 76 - 34
      r.icon.setVisible(true).setTexture(d.tex).setPosition(-W / 2 + 20, cy)
      r.barBg.setVisible(true).setPosition(barX, cy).setSize(barW, 9)
      const p = d.need > 0 ? Math.min(1, d.have / d.need) : 1
      r.barFill.setVisible(true).setPosition(barX, cy).setSize(Math.max(1, barW * p), 9)
      r.barFill.setFillStyle(p >= 1 ? PAL.good : PAL.gold, 1)
      r.label.setVisible(true).setPosition(W / 2 - 12, cy)
        .setText(`${shortNum(d.have)}/${shortNum(d.need)}`)
        .setColor(p >= 1 ? CSS(PAL.good) : CSS(PAL.uiText))
      y += ROW_H
    }

    if (n > 0) y += 4
    y = this.layoutChips(v.chips ?? [], y, fat)

    this.hint.setPosition(0, y)
    y += Math.max(14, this.hint.height) + 6

    if (v.upgrade) {
      // A 30px-tall button is about 5mm on a phone — far under a thumb. Missing
      // it landed on the card background, which is not a control, so the move
      // stick popped up instead and the press looked like it did nothing.
      const bw = fat ? 200 : 148
      const bh = fat ? 46 : 30
      const by = y + bh / 2
      // Breathe when the cost is already banked. "I have the wood and nothing
      // is happening" is the single most confusing moment on a build site, and
      // a button that visibly wants pressing answers it without a tutorial.
      const ready = v.upgrade.affordable && !v.upgrade.committed
      const pulse = ready ? 0.55 + Math.abs(Math.sin(this.scene.time.now * 0.004)) * 0.45 : 1
      this.btnG.clear()
      this.btnG.fillStyle(v.upgrade.committed ? PAL.good : this.btnHover ? PAL.uiEdge : PAL.uiPanel, 1)
      this.btnG.fillRoundedRect(-bw / 2, y, bw, bh, 7)
      this.btnG.lineStyle(ready ? 3 : 2, v.upgrade.committed ? PAL.good : PAL.gold, ready ? pulse : 1)
      this.btnG.strokeRoundedRect(-bw / 2, y, bw, bh, 7)
      this.btnG.setVisible(true)
      this.btnText.setVisible(true).setText(v.upgrade.committed ? 'UPGRADING' : 'UPGRADE')
        .setPosition(0, by).setFontSize(fat ? 16 : 13)
      // Local coordinates: btnZone is a child of `root`, so setting it to the
      // container's own world position offset it twice and left the tap target
      // far from the drawn button. The button simply never worked.
      // The tap target is deliberately larger than the drawn button: a near
      // miss should still press it rather than grab the movement stick.
      const slop = fat ? 22 : 6
      this.btnZone.setSize(bw + slop * 2, bh + slop).setPosition(0, by)
      // Clear of the demolish bar below, so UPGRADE's generous target can
      // never overlap the one control that must be aimed at exactly.
      y += bh + slop / 2 + 8
    } else {
      this.btnG.clear().setVisible(false)
      this.btnText.setVisible(false)
      this.btnZone.setSize(1, 1)
    }

    y = this.layoutRaze(v.demolish, y, fat)

    const h = y + 6
    this.cardH = h

    this.bg.clear()
    this.bg.fillStyle(PAL.uiBg, 0.92)
    this.bg.fillRoundedRect(-W / 2, 0, W, h, 8)
    this.bg.lineStyle(2, PAL.uiEdge, 1)
    this.bg.strokeRoundedRect(-W / 2, 0, W, h, 8)
    this.bg.fillStyle(PAL.gold, 0.9)
    this.bg.fillRoundedRect(-W / 2 + 10, 3, W - 20, 2, 1)
    // little pointer down at the building
    this.bg.fillStyle(PAL.uiBg, 0.92)
    this.bg.fillTriangle(-8, h - 1, 8, h - 1, 0, h + 9)

    // Keep the card on screen. It normally floats above the structure, but a
    // pad near the top or bottom of the frame pushed half the card — UPGRADE
    // button included — off the edge. Clamp to the playfield *between* the
    // fixed HUD bands, not to the raw camera edges, or the card lands on top
    // of the objective banner and neither is readable.
    const cam = this.scene.cameras.main
    const view = cam.worldView

    // Everything above is laid out in world units, but the camera zooms — at
    // 0.72 on a phone a 46-unit button is only 33 real pixels, which is how a
    // "thumb-sized" target ended up thumb-sized in name only. Counter-scaling
    // the card by 1/zoom makes every number here mean screen pixels.
    const k = 1 / cam.zoom
    this.cardScale = k
    this.root.setScale(k)

    const bands = (this.scene as unknown as { uiBands: { top: number; bottom: number } }).uiBands
    const topBand = (bands?.top ?? 104) * k
    const bottomBand = (bands?.bottom ?? 104) * k
    const sideBand = (W / 2 + 10) * k
    const cardH = h * k
    const topY = b.y - b.def.h - 52 * k - cardH
    const minY = view.y + topBand
    const maxY = Math.max(minY, view.bottom - bottomBand - cardH)
    const minX = view.x + sideBand
    const x = Phaser.Math.Clamp(b.x, minX, Math.max(minX, view.right - sideBand))
    this.root.setPosition(Math.round(x), Math.round(Phaser.Math.Clamp(topY, minY, maxY)))
  }

  /** A row of unit buttons: who this muster line turns out next. */
  private layoutChips(chips: PanelChip[], y: number, fat: boolean): number {
    this.chipKeys = chips.map(c => c.key)
    const n = Math.min(chips.length, MAX_CHIPS)
    const inner = W - 24
    const gap = 5
    const cw = n > 0 ? (inner - gap * (n - 1)) / n : 0
    const ch = fat ? 36 : 26

    for (let i = 0; i < this.chips.length; i++) {
      const c = this.chips[i]
      if (i >= n) {
        c.g.clear().setVisible(false)
        c.label.setVisible(false)
        c.zone.setSize(1, 1)
        continue
      }
      const d = chips[i]
      const cx = -inner / 2 + i * (cw + gap) + cw / 2
      const cy = y + ch / 2
      const edge = d.selected ? PAL.gold : d.locked ? PAL.uiEdge : PAL.uiDim
      c.g.clear()
      c.g.fillStyle(d.selected ? PAL.uiEdge : PAL.uiBg, d.selected ? 1 : 0.85)
      c.g.fillRoundedRect(cx - cw / 2, y, cw, ch, 5)
      c.g.lineStyle(d.selected ? 2 : 1, edge, d.locked ? 0.5 : 1)
      c.g.strokeRoundedRect(cx - cw / 2, y, cw, ch, 5)
      c.g.setVisible(true)
      c.label.setVisible(true).setText(d.label).setPosition(cx, cy)
        .setFontSize(cw >= 84 ? (fat ? 12 : 11) : 10)
        .setColor(CSS(d.selected ? PAL.gold : d.locked ? PAL.uiEdge : d.affordable ? PAL.uiText : PAL.uiDim))
      c.zone.setSize(cw, ch).setPosition(cx, cy)
    }
    return n > 0 ? y + ch + 6 : y
  }

  /** Hold-to-demolish: a bar that fills while pressed, and does nothing until it is full. */
  private layoutRaze(d: PanelView['demolish'], y: number, fat: boolean): number {
    if (!d) {
      this.razeG.clear().setVisible(false)
      this.razeText.setVisible(false)
      this.razeZone.setSize(1, 1)
      return y
    }
    const bw = W - 44
    // Two lines inside the bar: what the hold does, and what it pays back.
    const bh = fat ? 42 : 34
    const by = y + bh / 2
    const holding = d.hold > 0

    this.razeG.clear()
    this.razeG.fillStyle(PAL.uiBg, 0.9)
    this.razeG.fillRoundedRect(-bw / 2, y, bw, bh, 5)
    if (holding) {
      this.razeG.fillStyle(PAL.danger, 0.5)
      this.razeG.fillRect(-bw / 2 + 2, y + 2, Math.max(1, (bw - 4) * Math.min(1, d.hold)), bh - 4)
    }
    this.razeG.lineStyle(holding ? 2 : 1, PAL.danger, holding ? 1 : 0.55)
    this.razeG.strokeRoundedRect(-bw / 2, y, bw, bh, 5)
    this.razeG.setVisible(true)

    this.razeText.setVisible(true)
      .setText(`${holding ? 'KEEP HOLDING…' : 'HOLD TO DEMOLISH'}\nsalvage  +${d.salvage}`)
      .setPosition(0, by).setFontSize(fat ? 11 : 10)
      .setColor(CSS(holding ? PAL.uiText : PAL.danger))
    // No slop, unlike UPGRADE: this is the one control where a near miss must
    // miss, so the zone is exactly the bar and not a pixel more.
    this.razeZone.setSize(bw, bh).setPosition(0, by)
    return y + bh + 6
  }

  destroy() {
    this.scene.input.off('pointerup', this.release, this)
    this.scene.input.off('pointerupoutside', this.release, this)
    this.root.destroy()
  }
}
