import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { short as shortNum } from '../core/math'
import type { Building } from '../entities/Building'
import { DPR, wantsTouchTargets } from '../core/device'
import { screen, setColour, textStyle } from './theme'
import { PlateButton, SkinBar, SkinPanel } from './skin'

interface Row {
  icon: Phaser.GameObjects.Image
  bar: SkinBar
  label: Phaser.GameObjects.Text
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

const W = 272
const ROW_H = 22
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
 *
 * It is a lacquered callout pointing down at the building, the same chrome as
 * the HUD, so it reads as part of the interface rather than part of the world.
 */
export class BuildingPanel {
  private root: Phaser.GameObjects.Container
  private bg: SkinPanel
  private title: Phaser.GameObjects.Text
  private sub: Phaser.GameObjects.Text
  private hint: Phaser.GameObjects.Text
  private rows: Row[] = []
  private shown = false

  private btn: PlateButton
  private btnGlow: Phaser.GameObjects.Image

  private chips: PlateButton[] = []
  private chipKeys: string[] = []

  private raze: SkinBar
  private razeText: Phaser.GameObjects.Text
  private razeZone: Phaser.GameObjects.Zone

  private current: Building | null = null
  /** Height of the card as last drawn, for the hit test below. */
  private cardH = 0
  /** Counter-zoom applied to the card, so hit tests match what is drawn. */
  private cardScale = 1

  constructor(private scene: Phaser.Scene, private on: PanelHandlers) {
    this.root = scene.add.container(0, 0).setDepth(900_000).setVisible(false)
    this.bg = new SkinPanel(scene, 'callout')
    this.title = scene.add.text(0, 0, '', textStyle({ voice: 'display', size: 19, colour: PAL.bone, shadow: true }))
      .setOrigin(0.5, 0)
    this.sub = scene.add.text(0, 0, '', textStyle({ size: 13, weight: '500', colour: PAL.uiDim, align: 'center', wrap: W - 32 }))
      .setOrigin(0.5, 0)
    this.hint = scene.add.text(0, 0, '', textStyle({ size: 13, weight: '700', colour: PAL.gold, align: 'center', wrap: W - 32 }))
      .setOrigin(0.5, 0)
    this.root.add([this.bg.img, this.title, this.sub, this.hint])

    for (let i = 0; i < 4; i++) {
      const icon = scene.add.image(0, 0, 'res_coins').setVisible(false)
      const bar = new SkinBar(scene, PAL.gold)
      const label = scene.add.text(0, 0, '', textStyle({ size: 13, weight: '800', colour: PAL.uiText }))
        .setOrigin(1, 0.5).setVisible(false)
      this.root.add([...bar.objects(), icon, label])
      bar.setVisible(false)
      this.rows.push({ icon, bar, label })
    }

    // The muster line. Tapping a chip only changes who the next recruit will
    // be — it spends nothing — so a mis-tap here costs a tap, not a treasury.
    for (let i = 0; i < MAX_CHIPS; i++) {
      const chip = new PlateButton(scene, {
        label: '', tone: 'quiet', size: 13,
        onClick: () => {
          const key = this.chipKeys[i]
          if (this.current && key) this.on.pickUnit(this.current, key)
        },
      })
      this.root.add(chip.objects())
      chip.setVisible(false)
      this.chips.push(chip)
    }

    // Breathe when the cost is already banked: a soft gilt light behind the
    // button, rather than redrawing its border every frame.
    this.btnGlow = scene.add.image(0, 0, 'fx_glow_gold').setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
    this.btn = new PlateButton(scene, {
      label: 'Upgrade', tone: 'plain', size: 15, icon: 'ico_tower',
      onClick: () => { if (this.current) this.on.upgrade(this.current) },
    })
    this.root.add([this.btnGlow, ...this.btn.objects()])
    this.btn.setVisible(false)

    // Demolish. Every other control on this card is a tap; this one is a hold,
    // its target is exactly the bar with no slop around it, and letting go at
    // any point empties it. Losing a building you spent a night funding must
    // never be one stray thumb away.
    this.raze = new SkinBar(scene, 0xb03a22, { inset: 3 })
    this.razeText = scene.add.text(0, 0, '', textStyle({ voice: 'caps', size: 12, weight: '800', colour: PAL.danger, align: 'center' }))
      .setOrigin(0.5).setVisible(false).setLineSpacing(-1)
    this.razeZone = scene.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true })
    this.razeZone.on('pointerdown', () => { if (this.current) this.on.raze(this.current, true) })
    this.razeZone.on('pointerout', () => this.release())
    this.root.add([...this.raze.objects(), this.razeText, this.razeZone])
    this.raze.setVisible(false)

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
    this.btn.setVisible(false)
    this.razeZone.setSize(1, 1)
    for (const c of this.chips) c.setVisible(false)
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
    const appearing = !this.shown
    this.shown = true
    this.current = b
    this.root.setVisible(true)

    const fat = wantsTouchTargets(screen(this.scene).w)

    this.title.setText(v.title)
    this.sub.setText(v.sub)
    setColour(this.hint.setText(v.hint), v.hintBad ? PAL.danger : PAL.gold)

    const n = Math.min(v.rows.length, this.rows.length)
    let y = 12
    this.title.setPosition(0, y)
    y += Math.max(22, this.title.height) + 2
    this.sub.setPosition(0, y)
    y += Math.max(16, this.sub.height) + 8

    const barX = -W / 2 + 40
    const barW = W - 40 - 18 - 64
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i]
      if (i >= n) {
        r.icon.setVisible(false); r.bar.setVisible(false); r.label.setVisible(false)
        continue
      }
      const d = v.rows[i]
      const cy = y + ROW_H / 2
      // the interface's own copy of the pickup, painted at 3x for a sharp icon
      const tex = this.scene.textures.exists(`ui_${d.tex}`) ? `ui_${d.tex}` : d.tex
      r.icon.setVisible(true).setTexture(tex).setPosition(-W / 2 + 24, cy).setDisplaySize(20, 20)
      const p = d.need > 0 ? Math.min(1, d.have / d.need) : 1
      r.bar.setVisible(true).place(barX, cy - 5, barW, 10)
      r.bar.set(p, p >= 1 ? PAL.good : PAL.gold)
      setColour(r.label.setVisible(true).setPosition(W / 2 - 16, cy).setText(`${shortNum(d.have)}/${shortNum(d.need)}`),
        p >= 1 ? PAL.good : PAL.uiText)
      y += ROW_H
    }

    if (n > 0) y += 6
    y = this.layoutChips(v.chips ?? [], y, fat)

    this.hint.setPosition(0, y)
    y += Math.max(16, this.hint.height) + 8

    if (v.upgrade) {
      // A 30px-tall button is about 5mm on a phone — far under a thumb. Missing
      // it landed on the card background, which is not a control, so the move
      // stick popped up instead and the press looked like it did nothing.
      const bw = fat ? 204 : 156
      const bh = fat ? 46 : 34
      const by = y + bh / 2
      // Breathe when the cost is already banked. "I have the wood and nothing
      // is happening" is the single most confusing moment on a build site, and
      // a button that visibly wants pressing answers it without a tutorial.
      const ready = v.upgrade.affordable && !v.upgrade.committed
      this.btn.setVisible(true)
        .setTone(v.upgrade.committed ? 'good' : ready ? 'primary' : 'plain')
        .setLabel(v.upgrade.committed ? 'Upgrading' : 'Upgrade')
        .place(0, by, bw, bh)
      this.btnGlow.setVisible(ready).setPosition(0, by).setDisplaySize(bw * 1.5, bh * 2.6)
      if (ready) this.btnGlow.setAlpha(0.25 + Math.abs(Math.sin(this.scene.time.now * 0.004)) * 0.45)
      // Local coordinates: the zone is a child of `root`, so setting it to the
      // container's own world position offset it twice and left the tap target
      // far from the drawn button. The button simply never worked.
      // The tap target is deliberately larger than the drawn button: a near
      // miss should still press it rather than grab the movement stick.
      const slop = fat ? 22 : 6
      this.btn.zone.setSize(bw + slop * 2, bh + slop).setPosition(0, by)
      // Clear of the demolish bar below, so UPGRADE's generous target can
      // never overlap the one control that must be aimed at exactly.
      y += bh + slop / 2 + 8
    } else {
      this.btn.setVisible(false)
      this.btnGlow.setVisible(false)
    }

    y = this.layoutRaze(v.demolish, y, fat)

    const h = y + 8
    this.cardH = h
    this.bg.place(-W / 2, 0, W, h)

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
    // the card by DPR/zoom makes every number here mean CSS pixels, the same
    // units as the HUD bands it clears.
    const k = DPR / cam.zoom
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

    // the card rises into place the first time you step onto a pad
    if (appearing) {
      this.root.setAlpha(0)
      this.scene.tweens.killTweensOf(this.root)
      this.scene.tweens.add({ targets: this.root, alpha: 1, duration: 140, ease: 'Sine.easeOut' })
    }
  }

  /** A row of unit plates: who this muster line turns out next. */
  private layoutChips(chips: PanelChip[], y: number, fat: boolean): number {
    this.chipKeys = chips.map(c => c.key)
    const n = Math.min(chips.length, MAX_CHIPS)
    const inner = W - 28
    const gap = 6
    const cw = n > 0 ? (inner - gap * (n - 1)) / n : 0
    const ch = fat ? 38 : 30

    for (let i = 0; i < this.chips.length; i++) {
      const c = this.chips[i]
      if (i >= n) {
        c.setVisible(false)
        continue
      }
      const d = chips[i]
      const cx = -inner / 2 + i * (cw + gap) + cw / 2
      c.setVisible(true)
        .setTone(d.selected ? 'primary' : 'quiet')
        .setTextColour(d.selected ? undefined : d.locked ? 0x8a7a64 : d.affordable ? PAL.uiText : PAL.uiDim)
        .setLabel(d.label)
        .place(cx, y + ch / 2, cw, ch)
    }
    return n > 0 ? y + ch + 8 : y
  }

  /** Hold-to-demolish: a bar that fills while pressed, and does nothing until it is full. */
  private layoutRaze(d: PanelView['demolish'], y: number, fat: boolean): number {
    if (!d) {
      this.raze.setVisible(false)
      this.razeText.setVisible(false)
      this.razeZone.setSize(1, 1)
      return y
    }
    const bw = W - 48
    // Two lines inside the bar: what the hold does, and what it pays back.
    const bh = fat ? 42 : 36
    const by = y + bh / 2
    const holding = d.hold > 0

    this.raze.setVisible(true).place(-bw / 2, y, bw, bh)
    this.raze.set(Math.min(1, d.hold))
    this.razeText.setVisible(true)
      .setText(`${holding ? 'Keep holding…' : 'Hold to demolish'}\nsalvage  +${d.salvage}`)
      .setPosition(0, by).setFontSize(fat ? 13 : 12)
    setColour(this.razeText, holding ? PAL.uiText : PAL.danger)
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
