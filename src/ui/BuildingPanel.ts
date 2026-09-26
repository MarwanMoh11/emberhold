import Phaser from 'phaser'
import { PAL } from '../config/palette'
import type { Building } from '../entities/Building'
import { DPR } from '../core/device'
import { screen, setColour, textStyle } from './theme'
import { PlateButton, SkinBar } from './skin'
import { CostChips, DockSheet, StatLine, compactH, type DockBands, type DockRow, type DockTarget } from './dock'

/** `short`: the stores cannot cover what is left of this line (drawn red). */
export interface PanelRow { tex: string; have: number; need: number; short?: boolean }

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


/** Barracks has the longest roster. */
const MAX_CHIPS = 3
/** The header's primary action: UPGRADE, or the funding bar on a build site. */
const PRIMARY_W = 118

/** The Game scene, as far as the panel needs it. */
type Host = Phaser.Scene & { uiBands: DockBands; player: { x: number; y: number } }

/**
 * The card for the pad you are standing in, docked (S09b).
 *
 * Still not a build menu: it never lists things to place, it reports the state
 * of the one site you are physically inside. What it adds are the two choices
 * standing there cannot express on its own — which unit this muster line turns
 * out next, and whether the pad should come back down. The deposit itself
 * still happens by standing there.
 *
 * It used to float over the building in world space, and on a phone it hid the
 * building, the hero and the fight. It now draws into a `DockSheet` on the
 * HUD's scene: collapsed, the title and the one primary action (UPGRADE, or how
 * much of the site is funded); expanded, the costs, the unit chips, the hint
 * and the hold-to-demolish bar. `PanelView` is unchanged.
 */
export class BuildingPanel {
  private sheet: DockSheet | null = null
  private ui: Phaser.Scene | null = null
  private shown = false
  private current: Building | null = null

  private btn!: PlateButton
  private btnGlow!: Phaser.GameObjects.Image
  private fund!: SkinBar
  private fundText!: Phaser.GameObjects.Text
  private stat!: StatLine
  private costs!: CostChips
  private hint!: StatLine
  private chips: PlateButton[] = []
  private chipKeys: string[] = []
  private chipRow!: DockRow
  private raze!: SkinBar
  private razeText!: Phaser.GameObjects.Text
  private razeZone!: Phaser.GameObjects.Zone
  private razeRow!: DockRow
  private razeData: PanelView['demolish']

  constructor(private scene: Phaser.Scene, private on: PanelHandlers) {}

  /**
   * Build the sheet on the HUD's scene the first time it is wanted, and again
   * after that scene restarts (a new run relaunches it). Before the HUD is up
   * there is nothing to draw on, and the card simply waits a frame.
   */
  private ensure(): boolean {
    if (this.sheet && !this.sheet.dead) return true
    const ui = this.scene.scene.get('UI')
    if (!ui || !ui.sys.isActive()) return false
    this.ui = ui
    const sheet = this.sheet = new DockSheet(ui, (this.scene as Host).uiBands)

    // Breathe when the cost is already banked: a soft gilt light behind the
    // button, rather than redrawing its border every frame.
    this.btnGlow = ui.add.image(0, 0, 'fx_glow_gold').setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
    this.btn = new PlateButton(ui, {
      label: 'Upgrade', tone: 'plain', size: 'compact', icon: 'ico_tower',
      onClick: () => { if (this.current) this.on.upgrade(this.current) },
    })
    this.btn.setVisible(false)
    this.fund = new SkinBar(ui, PAL.gold)
    this.fund.setVisible(false)
    this.fundText = ui.add.text(0, 0, '', textStyle({ voice: 'caps', size: 12, weight: '800', colour: PAL.uiText }))
      .setOrigin(0.5, 1).setVisible(false)
    sheet.add([this.btnGlow, ...this.btn.objects(), ...this.fund.objects(), this.fundText])

    this.stat = new StatLine(ui, { weight: '600' })
    this.costs = new CostChips(ui)
    this.hint = new StatLine(ui, { colour: PAL.gold })
    sheet.add([...this.stat.objects(), ...this.costs.objects(), ...this.hint.objects()])

    // The muster line. Tapping a chip only changes who the next recruit will
    // be — it spends nothing — so a mis-tap here costs a tap, not a treasury.
    this.chips = []
    for (let i = 0; i < MAX_CHIPS; i++) {
      const chip = new PlateButton(ui, {
        label: '', tone: 'quiet', size: 'compact',
        onClick: () => {
          const key = this.chipKeys[i]
          if (this.current && key) this.on.pickUnit(this.current, key)
        },
      })
      chip.setVisible(false)
      sheet.add(chip.objects())
      this.chips.push(chip)
    }
    this.chipRow = {
      measure: () => (this.chipKeys.length ? compactH(screen(ui).w) : 0),
      place: (x, y, w) => {
        const n = Math.min(this.chipKeys.length, MAX_CHIPS)
        const gap = 6
        const cw = (w - gap * (n - 1)) / n
        const ch = compactH(screen(ui).w)
        for (let i = 0; i < n; i++) this.chips[i].place(Math.round(x + i * (cw + gap) + cw / 2), y + ch / 2, Math.floor(cw), ch)
      },
      setVisible: v => { for (let i = 0; i < this.chips.length; i++) this.chips[i].setVisible(v && i < this.chipKeys.length) },
      objects: () => [],
    }

    // Demolish. Every other control on this card is a tap; this one is a hold,
    // its target is exactly the bar with no slop around it, and letting go at
    // any point empties it. Losing a building you spent a night funding must
    // never be one stray thumb away.
    this.raze = new SkinBar(ui, 0xb03a22, { inset: 3 })
    this.raze.setVisible(false)
    this.razeText = ui.add.text(0, 0, '', textStyle({ voice: 'caps', size: 12, weight: '800', colour: PAL.danger, align: 'center' }))
      .setOrigin(0.5).setVisible(false).setLineSpacing(-1)
    this.razeZone = ui.add.zone(0, 0, 1, 1).setInteractive({ useHandCursor: true })
    this.razeZone.on('pointerdown', () => { if (this.current) this.on.raze(this.current, true) })
    this.razeZone.on('pointerout', () => this.release())
    sheet.add([...this.raze.objects(), this.razeText, this.razeZone])
    this.razeRow = {
      measure: () => (this.razeData ? Math.max(38, compactH(screen(ui).w)) : 0),
      place: (x, y, w) => {
        const d = this.razeData
        if (!d) return
        const bh = Math.max(38, compactH(screen(ui).w))
        const holding = d.hold > 0
        this.raze.place(x, y, w, bh)
        this.raze.set(Math.min(1, d.hold))
        // Two lines inside the bar: what the hold does, and what it pays back.
        this.razeText.setText(`${holding ? 'Keep holding…' : 'Hold to demolish'}\nsalvage  +${d.salvage}`)
          .setPosition(x + w / 2, y + bh / 2)
        setColour(this.razeText, holding ? PAL.uiText : PAL.danger)
        // No slop, unlike UPGRADE: this is the one control where a near miss
        // must miss, so the zone is exactly the bar and not a pixel more.
        this.razeZone.setPosition(x + w / 2, y + bh / 2).setSize(w, bh)
      },
      setVisible: v => {
        this.raze.setVisible(v)
        this.razeText.setVisible(v)
        if (!v) this.razeZone.setSize(1, 1)
      },
      objects: () => [],
    }

    // A finger that slides off the bar, or lifts outside the canvas entirely,
    // still has to count as letting go.
    ui.input.on('pointerup', this.release, this)
    ui.input.on('pointerupoutside', this.release, this)
    return true
  }

  private release() {
    if (this.current) this.on.raze(this.current, false)
  }

  hide() {
    if (!this.shown) return
    this.release()
    this.shown = false
    this.current = null
    if (this.sheet && !this.sheet.dead) {
      this.btn.setVisible(false)
      this.btnGlow.setVisible(false)
      this.fund.setVisible(false)
      this.fundText.setVisible(false)
      this.razeZone.setSize(1, 1)
      for (const c of this.chips) c.setVisible(false)
      this.sheet.hide()
    }
  }

  get isShown() { return this.shown }

  /**
   * Does this world point land on the sheet? The movement stick asks before it
   * claims a touch (the HUD scene's own hit test catches the sheet too).
   */
  containsWorldPoint(x: number, y: number) {
    if (!this.shown || !this.sheet) return false
    const cam = this.scene.cameras.main
    const k = cam.zoom / DPR
    return this.sheet.contains((x - cam.worldView.x) * k, (y - cam.worldView.y) * k)
  }

  show(b: Building, v: PanelView) {
    if (!this.ensure()) return
    const sheet = this.sheet!
    const ui = this.ui!
    this.shown = true
    this.current = b

    // What the camera frames beside the sheet: the hero and the building's body.
    const p = (this.scene as Host).player
    sheet.focus = { x: (p.x + b.x) / 2, y: (p.y + b.y - b.def.h * 0.5) / 2 }

    const locked = !!v.hintBad && !v.upgrade && b.level === 0
    const name = v.title.split('  ·  ')[0]
    const level = locked ? v.hint
      : b.level === 0 ? 'Build site'
        : b.isMax ? `Level ${b.level} · fully upgraded` : `Level ${b.level} → ${b.level + 1}`

    // The primary action: UPGRADE on a standing building, the funding on a site.
    const funding = b.level === 0 && !locked && v.rows.length > 0
    const primaryW = v.upgrade || funding ? PRIMARY_W : 0

    this.stat.set(v.sub, b.level === 0 ? PAL.uiDim : PAL.uiText)
    this.costs.set(v.rows)
    this.hint.set(locked ? '' : v.hint, v.hintBad ? PAL.danger : PAL.gold)
    this.chipKeys = (v.chips ?? []).slice(0, MAX_CHIPS).map(c => c.key)
    ;(v.chips ?? []).slice(0, MAX_CHIPS).forEach((d, i) => {
      this.chips[i]
        .setTone(d.selected ? 'primary' : 'quiet')
        .setTextColour(d.selected ? undefined : d.locked ? 0x8a7a64 : d.affordable ? PAL.uiText : PAL.uiDim)
        .setLabel(d.label)
    })
    for (let i = this.chipKeys.length; i < this.chips.length; i++) this.chips[i].setVisible(false)
    this.razeData = v.demolish
    if (!v.demolish) { this.raze.setVisible(false); this.razeText.setVisible(false); this.razeZone.setSize(1, 1) }

    const rows: DockRow[] = []
    if (v.sub) rows.push(this.stat)
    if (v.rows.length) rows.push(this.costs)
    if (this.chipKeys.length) rows.push(this.chipRow)
    if (!locked && v.hint) rows.push(this.hint)
    if (v.demolish) rows.push(this.razeRow)
    // rows left out this frame must not linger from the last one
    for (const r of [this.stat, this.costs, this.chipRow, this.hint, this.razeRow]) if (!rows.includes(r)) r.setVisible(false)

    sheet.layout({ title: name, level, levelColour: locked ? PAL.danger : undefined, primaryW }, rows)
    const slot = sheet.primary
    const cx = slot.x + slot.w / 2, cy = slot.y + slot.h / 2

    if (v.upgrade) {
      // Breathe when the cost is already banked. "I have the wood and nothing
      // is happening" is the single most confusing moment on a build site, and
      // a button that visibly wants pressing answers it without a tutorial.
      const ready = v.upgrade.affordable && !v.upgrade.committed
      this.btn.setVisible(true)
        .setTone(v.upgrade.committed ? 'good' : ready ? 'primary' : 'plain')
        .setLabel(v.upgrade.committed ? 'Upgrading' : 'Upgrade')
        .place(cx, cy, slot.w, slot.h)
      this.btnGlow.setVisible(ready).setPosition(cx, cy).setDisplaySize(slot.w * 1.4, slot.h * 2.2)
      if (ready) this.btnGlow.setAlpha(0.25 + Math.abs(Math.sin(ui.time.now * 0.004)) * 0.45)
    } else {
      this.btn.setVisible(false)
      this.btnGlow.setVisible(false)
    }

    if (funding) {
      let have = 0, need = 0
      for (const r of v.rows) { have += Math.min(r.have, r.need); need += r.need }
      const f = need > 0 ? have / need : 1
      this.fund.setVisible(true).place(slot.x, cy + 2, slot.w, 10)
      this.fund.set(f, f >= 1 ? PAL.good : PAL.gold)
      this.fundText.setVisible(true).setText(`Funded ${Math.floor(f * 100)}%`).setPosition(cx, cy - 1)
    } else {
      this.fund.setVisible(false)
      this.fundText.setVisible(false)
    }
  }

  /** For the harness: the sheet, its tappable targets and the fonts it draws. */
  inspect(): { rect: { x: number; y: number; w: number; h: number }; collapsed: boolean; side: string; targets: DockTarget[]; fonts: number[] } | null {
    const s = this.sheet
    if (!this.shown || !s || s.dead) return null
    const t: DockTarget[] = [...s.targets()]
    const zoneOf = (name: string, z: Phaser.GameObjects.Zone) => {
      if (z.width > 1) t.push({ name, x: z.x - z.width / 2, y: z.y - z.height / 2, w: z.width, h: z.height })
    }
    if (this.btn.label.visible) zoneOf('upgrade', this.btn.zone)
    this.chips.forEach((c, i) => { if (c.label.visible) zoneOf(`unit:${this.chipKeys[i]}`, c.zone) })
    if (this.raze.well.img.visible) zoneOf('demolish', this.razeZone)
    return { rect: { ...s.rect }, collapsed: s.collapsed, side: s.side, targets: t, fonts: s.fonts() }
  }

  /** The sheet's chevron, for the harness. */
  toggle() { this.sheet?.toggle() }

  destroy() {
    this.ui?.input?.off('pointerup', this.release, this)
    this.ui?.input?.off('pointerupoutside', this.release, this)
    this.sheet?.destroy()
    this.sheet = null
  }
}
