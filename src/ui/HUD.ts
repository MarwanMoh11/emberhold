import Phaser from 'phaser'
import { PAL, CSS } from '../config/palette'
import { RESOURCE_ORDER, type ResourceType } from '../core/types'
import { ABILITIES, ABILITY_KEYS, ABILITY_SLOTS } from '../config/abilities'
import { clamp, short } from '../core/math'
import { safeAreaInsets, wantsTouchTargets } from '../core/device'
import type { GameScene } from '../scenes/GameScene'

const FONT = 'Verdana, Geneva, sans-serif'

/** Below this width the HUD stacks instead of spreading across three columns. */
const NARROW = 520

interface ResRow {
  icon: Phaser.GameObjects.Image
  text: Phaser.GameObjects.Text
  rate: Phaser.GameObjects.Text
  type: ResourceType
}

interface AbilityBtn {
  index: number
  ring: Phaser.GameObjects.Graphics
  glyph: Phaser.GameObjects.Text
  key: Phaser.GameObjects.Text
  zone: Phaser.GameObjects.Zone
  x: number
  y: number
  r: number
}

/** A labelled rectangular control: pause, army stance. */
interface Chip {
  label: Phaser.GameObjects.Text
  key: Phaser.GameObjects.Text
  zone: Phaser.GameObjects.Zone
  hover: boolean
  x: number
  y: number
  w: number
  h: number
}

/**
 * Fixed HUD. Everything is positioned from the four corners in `layout()` so
 * the same code serves a phone in landscape and a desktop window.
 */
export class HUD {
  private g: Phaser.GameObjects.Graphics
  private gTop: Phaser.GameObjects.Graphics

  private hpText!: Phaser.GameObjects.Text
  private lvlText!: Phaser.GameObjects.Text
  private objTitle!: Phaser.GameObjects.Text
  private objHint!: Phaser.GameObjects.Text
  private phaseText!: Phaser.GameObjects.Text
  private bossText!: Phaser.GameObjects.Text
  private popText!: Phaser.GameObjects.Text
  private carryText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private toastText!: Phaser.GameObjects.Text
  private statsText!: Phaser.GameObjects.Text
  private hintText!: Phaser.GameObjects.Text

  private rows: ResRow[] = []
  private buttons: AbilityBtn[] = []
  private ultBtn!: AbilityBtn
  private pauseChip!: Chip
  private holdChip!: Chip
  /** Bottom of the top-left cluster: health bar plus the two chips under it. */
  private leftStackH = 46

  private W = 0
  private H = 0
  /** Padding with the device's safe-area insets already folded in. */
  private padT = 16
  private padL = 16
  private padR = 16
  private toastT = 0
  private hintT = 0
  private lastCarryHint = -9999
  private flashCarry = 0

  showStats = false
  /** True while a modal owns the screen: every HUD tap target goes dead. */
  blocked = false

  constructor(private ui: Phaser.Scene, private game: GameScene) {
    this.g = ui.add.graphics().setScrollFactor(0).setDepth(1_000_000)
    this.gTop = ui.add.graphics().setScrollFactor(0).setDepth(1_000_004)

    const t = (size: number, colour: number, bold = false) =>
      ui.add.text(0, 0, '', {
        fontFamily: FONT, fontSize: `${size}px`, color: CSS(colour),
        fontStyle: bold ? 'bold' : 'normal', stroke: '#050a12', strokeThickness: 3,
      }).setScrollFactor(0).setDepth(1_000_005)

    this.hpText = t(12, PAL.uiText, true)
    this.lvlText = t(13, PAL.gold, true)
    this.objTitle = t(15, PAL.uiText, true).setOrigin(0.5, 0)
    this.objHint = t(12, PAL.gold).setOrigin(0.5, 0)
    this.phaseText = t(13, PAL.uiText, true).setOrigin(0.5, 0)
    this.bossText = t(14, PAL.danger, true).setOrigin(0.5, 0)
    this.popText = t(12, PAL.uiText, true).setOrigin(1, 0)
    this.carryText = t(12, PAL.uiText, true).setOrigin(1, 0)
    this.comboText = t(22, PAL.gold, true).setOrigin(0.5, 0.5)
    this.toastText = t(16, PAL.gold, true).setOrigin(0.5, 0)
    this.statsText = t(10, PAL.uiDim).setOrigin(0, 1)
    this.hintText = t(13, PAL.uiText, true).setOrigin(0.5, 1)

    for (const type of RESOURCE_ORDER) {
      const icon = ui.add.image(0, 0, `res_${type}`).setScrollFactor(0)
        .setDepth(1_000_005).setScale(0.8).setVisible(false)
      const text = t(13, PAL.uiText, true).setOrigin(0, 0.5).setVisible(false)
      const rate = t(10, PAL.good).setOrigin(1, 0.5).setVisible(false)
      this.rows.push({ icon, text, rate, type })
    }

    // One button per hotbar slot, unlocked or not. The button keeps its place
    // whether or not the ability behind it exists yet, so nothing ever shuffles.
    for (let i = 0; i < ABILITY_SLOTS.length; i++) this.buttons.push(this.makeButton(i))
    this.ultBtn = this.makeButton(-1)

    // A finger has no ESC and no H. Without these two, everything behind the
    // pause menu — every volume, the quality switch, SAVE NOW, RESET PROGRESS —
    // and the army's standing order are unreachable on a phone.
    this.pauseChip = this.makeChip('ESC', () => this.ui.events.emit('togglePause'))
    this.holdChip = this.makeChip('H', () => this.game.toggleHold())

    this.game.bus.on('achievement', p => this.toast(`ACHIEVEMENT — ${p.title}`))
    this.game.bus.on('carry:full', () => {
      this.flashCarry = 0.5
      // The bar going red does not explain why loot stopped coming to you.
      if (this.game.time.now - this.lastCarryHint > 6000) {
        this.lastCarryHint = this.game.time.now
        this.hint('PACK FULL — DUMP AT THE DEPOT')
      }
    })
    this.game.bus.on('zone:unlocked', () => this.toast('NEW TERRITORY CLAIMED'))

    this.layout()
    ui.scale.on('resize', () => this.layout())
  }

  private makeButton(index: number): AbilityBtn {
    const ring = this.ui.add.graphics().setScrollFactor(0).setDepth(1_000_002)
    const glyph = this.ui.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '22px', color: CSS(PAL.uiText), fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1_000_005)
    const key = this.ui.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '10px', color: CSS(PAL.uiDim),
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1_000_005)
    const zone = this.ui.add.zone(0, 0, 10, 10).setScrollFactor(0).setInteractive({ useHandCursor: true })
    zone.on('pointerdown', () => {
      if (index < 0) this.game.abilities.castUltimate()
      else this.game.abilities.castSlot(index)
    })
    return { index, ring, glyph, key, zone, x: 0, y: 0, r: 30 }
  }

  private makeChip(keyLabel: string, onTap: () => void): Chip {
    const label = this.ui.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '11px', color: CSS(PAL.uiText), fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1_000_005)
    const key = this.ui.add.text(0, 0, keyLabel, {
      fontFamily: FONT, fontSize: '9px', color: CSS(PAL.uiDim),
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1_000_005)
    const zone = this.ui.add.zone(0, 0, 10, 10).setScrollFactor(0).setInteractive({ useHandCursor: true })
    const chip: Chip = { label, key, zone, hover: false, x: 0, y: 0, w: 10, h: 10 }
    zone.on('pointerover', () => { chip.hover = true })
    zone.on('pointerout', () => { chip.hover = false })
    zone.on('pointerdown', onTap)
    return chip
  }

  /**
   * One rectangle decides where the chip is drawn *and* where it can be
   * pressed, so the two can never drift apart — which is how tap targets in
   * this HUD have gone wrong before.
   */
  private placeChip(c: Chip, x: number, y: number, w: number, h: number) {
    c.x = x; c.y = y; c.w = w; c.h = h
    c.zone.setPosition(x + w / 2, y + h / 2).setSize(w, h)
    // Label over key hint, the same way the hotbar buttons read.
    c.label.setPosition(x + w / 2, y + h / 2 - 6)
    c.key.setPosition(x + w / 2, y + h - 11)
  }

  private drawChip(c: Chip, text: string, colour: number, live: boolean) {
    const g = this.g
    g.fillStyle(PAL.uiBg, c.hover ? 0.95 : 0.8)
    g.fillRoundedRect(c.x, c.y, c.w, c.h, 8)
    g.lineStyle(1.5, PAL.uiEdge, c.hover ? 1 : 0.9)
    g.strokeRoundedRect(c.x, c.y, c.w, c.h, 8)
    c.label.setText(text).setColor(CSS(colour))
    c.zone.setSize(live ? c.w : 1, live ? c.h : 1)
  }

  /** Width of the health panel; the chips under it line up with its edges. */
  private get barW() { return this.W < 720 ? 168 : 224 }

  toast(msg: string) {
    this.toastText.setText(msg)
    this.toastT = 3
  }

  hint(msg: string) {
    this.hintText.setText(msg)
    this.hintT = 4
  }

  layout() {
    const cam = this.ui.cameras.main
    this.W = cam.width
    this.H = cam.height
    const small = this.W < 720
    const basePad = small ? 10 : 16
    // The notch eats the top corners and the home indicator eats the bottom
    // strip. Fold those insets into the padding so nothing important ends up
    // under iOS chrome, in either orientation.
    const sa = safeAreaInsets()
    const padT = this.padT = basePad + sa.top
    const padL = this.padL = basePad + sa.left
    const padR = this.padR = basePad + sa.right
    const padB = basePad + sa.bottom

    this.hpText.setPosition(padL + 10, padT + 5)
    this.lvlText.setPosition(padL + 10, padT + 28)

    this.objTitle.setPosition(this.W / 2, padT + 6)
    this.objHint.setPosition(this.W / 2, padT + 26)
    this.phaseText.setPosition(this.W / 2, padT + 48)
    this.bossText.setPosition(this.W / 2, padT + 76)
    this.toastText.setPosition(this.W / 2, this.H * 0.22)
    this.comboText.setPosition(this.W / 2, this.H * 0.3)
    this.hintText.setPosition(this.W / 2, this.H - padB - (small ? 86 : 108))
    this.hintText.setWordWrapWidth(this.W - padL - padR - 16).setAlign('center')
    this.hintText.setFontSize(small ? 11 : 13)

    const rx = this.W - padR - 8
    this.popText.setPosition(rx, padT + 4)
    this.carryText.setPosition(rx, padT + 22)
    for (let i = 0; i < this.rows.length; i++) {
      const y = padT + 48 + i * 20
      this.rows[i].icon.setPosition(this.W - padR - 92, y)
      this.rows[i].text.setPosition(this.W - padR - 80, y)
    }

    this.statsText.setPosition(padL + 4, this.H - padB - 2)

    // Pause and army stance, side by side under the health bar and lined up
    // with it. The bottom-right is spoken for by the hotbar and the top-right
    // by the resources, and here they are nowhere near a resting thumb.
    const chipH = wantsTouchTargets(this.W) ? 44 : 34
    // PAUSE is a short word and the stance is a long one, so the row is split
    // to suit rather than down the middle, and the labels always fit.
    const chipRow = this.barW + 20 - 6
    const pauseW = Math.floor(chipRow * 0.4)
    const chipY = padT + 46 + 6
    this.placeChip(this.pauseChip, padL, chipY, pauseW, chipH)
    this.placeChip(this.holdChip, padL + pauseW + 6, chipY, chipRow - pauseW, chipH)
    this.leftStackH = chipY + chipH - padT

    // ability hotbar bottom-right, thumb reachable.
    // Six circles — five slots plus the larger ultimate — do not fit across a
    // phone in portrait at the size a desktop uses, so solve the radius and the
    // gap from the width actually on offer instead of assuming a number that
    // only ever fitted four. Widest gap that still allows the biggest radius.
    const n = this.buttons.length
    const rWant = small ? 26 : 30
    const gapWant = small ? 12 : 16
    // Below this a thumb misses; better to crowd the bar than to shrink past it.
    const rFloor = wantsTouchTargets(this.W) ? 20 : 15
    const right = this.W - padR - 6
    const avail = right - padL
    let r = 0
    let gap = gapWant
    for (let tryGap = gapWant; tryGap >= 6; tryGap -= 2) {
      // span = ultimate (2r + 10) + gap + n buttons (2r) + n - 1 gaps
      const fits = Math.min(rWant, Math.floor((avail - 10 - n * tryGap) / (2 * n + 2)))
      if (fits > r) { r = fits; gap = tryGap }
      if (r >= rWant) break
    }
    r = Math.max(rFloor, r)

    const ultR = r + 5
    const baseY = this.H - padB - ultR - 6
    this.game.uiBands.bottom = this.H - (baseY - ultR - 8)
    let x = right - ultR
    this.ultBtn.x = x; this.ultBtn.y = baseY; this.ultBtn.r = ultR
    this.ultBtn.zone.setPosition(x, baseY).setSize(ultR * 2, ultR * 2)
    this.ultBtn.glyph.setPosition(x, baseY - 2).setFontSize(`${r}px`)
    this.ultBtn.key.setPosition(x, baseY + ultR + 2)
    x -= ultR + gap + r
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i]
      b.x = x; b.y = baseY; b.r = r
      b.zone.setPosition(x, baseY).setSize(r * 2, r * 2)
      b.glyph.setPosition(x, baseY - 2).setFontSize(`${r - 6}px`)
      b.key.setPosition(x, baseY + r + 2)
      x -= r * 2 + gap
    }
  }

  update(dt: number) {
    const g = this.game
    const p = g.player
    const { padT, padL, padR } = this
    this.g.clear()
    this.gTop.clear()

    // Every HUD tap target goes dead behind a modal, so a thumb aimed at the
    // pause menu cannot fire an ability or flip the army through the dim.
    const live = !this.blocked

    // ---- top-left: health, xp ------------------------------------------
    const barW = this.barW
    const hx = padL, hy = padT
    this.panel(this.g, hx, hy, barW + 20, 46)
    const hp = clamp(p.hp / p.maxHp, 0, 1)
    this.bar(this.gTop, hx + 10, hy + 20, barW, 10, hp,
      hp > 0.5 ? PAL.good : hp > 0.25 ? PAL.gold : PAL.danger)
    this.hpText.setText(`${Math.ceil(Math.max(0, p.hp))} / ${Math.round(p.maxHp)}`)
    const xp = clamp(p.xp / p.xpToNext, 0, 1)
    this.bar(this.gTop, hx + 10, hy + 34, barW, 5, xp, PAL.xp)
    this.lvlText.setText(`LV ${p.level}`).setPosition(hx + 10 + barW - 44, hy + 30)
    this.hpText.setPosition(hx + 10, hy + 4)

    // ---- top-left: pause + army stance -----------------------------------
    this.drawChip(this.pauseChip, 'PAUSE', PAL.uiText, live)
    const holding = g.army.holding
    this.drawChip(this.holdChip, holding ? 'HOLDING' : 'FOLLOWING',
      holding ? PAL.heroTrim : PAL.uiText, live)

    // ---- objective + phase ---------------------------------------------
    // Three panels do not fit across a phone in portrait, so below NARROW the
    // objective drops to its own full-width row under health and resources
    // instead of being drawn straight through both of them.
    const resRows = RESOURCE_ORDER.filter(t => g.res.discovered.has(t))
    const resPanelH = 44 + resRows.length * 20
    const narrow = this.W < NARROW
    const objW = narrow ? this.W - padL - padR : this.W < 720 ? 240 : 320
    const objX = narrow ? padL : this.W / 2 - objW / 2
    // Below NARROW the objective clears whichever top column is taller — the
    // health bar with the two chips under it, or the resource panel.
    const objY = narrow ? padT + Math.max(this.leftStackH, resPanelH) + 6 : padT
    const resW = narrow ? 138 : 158
    // tell world-space cards how much of the screen we are covering
    g.uiBands.top = objY + 66 + 8

    const q = g.quests.view()
    this.panel(this.g, objX, objY, objW, 66)
    this.objTitle.setPosition(objX + objW / 2, objY + 6)
    this.objHint.setPosition(objX + objW / 2, objY + 26)
    if (q) {
      this.objTitle.setText(q.title.toUpperCase())
      this.objHint.setText(`${q.hint}${q.need > 1 ? `   ${short(q.have)}/${short(q.need)}` : ''}`)
      this.bar(this.gTop, objX + 12, objY + 44, objW - 24, 4,
        q.need > 0 ? clamp(q.have / q.need, 0, 1) : 1, PAL.good)
    }

    const w = g.waves
    const mins = Math.floor(w.timeLeft / 60)
    const secs = Math.floor(w.timeLeft % 60)
    const clock = `${mins}:${secs.toString().padStart(2, '0')}`
    if (w.phase === 'night') {
      this.phaseText.setText(`NIGHT ${w.wave}   ·   ${w.enemiesRemaining} LEFT`).setColor(CSS(PAL.danger))
    } else if (w.phase === 'warning') {
      const flash = Math.sin(this.game.now * 0.02) > 0
      this.phaseText.setText(`${w.bannerText.toUpperCase()}   ${Math.ceil(w.timeLeft)}`)
        .setColor(flash ? CSS(PAL.danger) : CSS(PAL.gold))
    } else {
      this.phaseText.setText(`DAY ${w.wave + 1}   ·   NIGHT IN ${clock}`).setColor(CSS(PAL.uiDim))
    }
    this.phaseText.setPosition(objX + objW / 2, objY + 50)

    // ---- boss bar --------------------------------------------------------
    const boss = g.enemies.bossRef
    if (boss?.alive) {
      const bw = Math.min(460, this.W - 80)
      const bx = this.W / 2 - bw / 2
      const by = objY + 74
      this.panel(this.g, bx - 8, by - 4, bw + 16, 30)
      this.bar(this.gTop, bx, by + 12, bw, 12, clamp(boss.hp / boss.maxHp, 0, 1), PAL.danger)
      this.bossText.setText(`${boss.def.name}   ${short(Math.ceil(boss.hp))}`).setPosition(this.W / 2, by - 2)
      this.bossText.setVisible(true)
    } else {
      this.bossText.setVisible(false)
    }

    // ---- top-right: resources -------------------------------------------
    this.panel(this.g, this.W - padR - resW, padT, resW, resPanelH)
    this.popText.setText(
      `POP ${g.popUsed}/${g.popCap}${g.buildings.bonus.prod > 0 ? `   OUTPUT +${Math.round(g.buildings.bonus.prod * 100)}%` : ''}`,
    )
      .setColor(g.popUsed >= g.popCap ? CSS(PAL.danger) : CSS(PAL.uiText))
      .setFontSize(narrow ? 10 : 12)
    const carried = g.res.carriedTotal
    const full = carried >= g.res.carryCapacity
    this.flashCarry = Math.max(0, this.flashCarry - dt)
    this.carryText.setText(`PACK ${short(carried)} / ${short(g.res.carryCapacity)}`)
      .setColor(full || this.flashCarry > 0 ? CSS(PAL.danger) : CSS(PAL.uiDim))
      .setFontSize(narrow ? 10 : 12)
    this.bar(this.gTop, this.W - padR - resW + 10, padT + 40, resW - 20, 4,
      clamp(carried / g.res.carryCapacity, 0, 1), full ? PAL.danger : PAL.gold)

    let i = 0
    for (const row of this.rows) {
      const visible = g.res.discovered.has(row.type)
      row.icon.setVisible(visible)
      row.text.setVisible(visible)
      row.rate.setVisible(visible)
      if (!visible) continue
      const y = padT + 56 + i * 20
      row.icon.setPosition(this.W - padR - resW + 16, y)
      const held = g.res.carried[row.type]
      row.text.setPosition(this.W - padR - resW + 28, y)
        .setText(`${short(g.res.stored[row.type])}${held > 0 ? `  +${short(held)}` : ''}`)
        .setColor(held > 0 ? CSS(PAL.gold) : CSS(PAL.uiText))
      // income readout: the number that makes automation feel worth buying
      const r = g.res.rate[row.type]
      row.rate.setPosition(this.W - padR - 10, y)
        .setText(r >= 0.05 ? `+${r >= 10 ? Math.round(r) : r.toFixed(1)}/s` : '')
        .setColor(CSS(PAL.good))
      i++
    }

    // ---- abilities --------------------------------------------------------
    // Slot b is always the same ability. A locked one draws nothing at all, but
    // it keeps its place in the row, so the key under your finger today is the
    // key under your finger at level 9.
    const slots = g.abilities.slots
    for (let b = 0; b < this.buttons.length; b++) {
      const btn = this.buttons[b]
      const slot = slots[b]?.unlocked ? slots[b] : undefined
      if (!slot) {
        btn.ring.clear(); btn.glyph.setVisible(false); btn.key.setVisible(false)
        btn.zone.setSize(1, 1)
        continue
      }
      const def = ABILITIES[slot.key]
      const ready = slot.cd <= 0
      this.drawButton(btn, def.glyph, def.colour, ready ? 1 : 1 - slot.cd / def.cooldown, ready)
      btn.key.setVisible(true).setText(ABILITY_KEYS[b] ?? '')
      btn.zone.setSize(live ? btn.r * 2 : 1, live ? btn.r * 2 : 1)
    }
    if (g.abilities.ultimate.unlocked) {
      const def = ABILITIES[g.abilities.ultimate.key]
      const ready = g.abilities.ultimate.cd <= 0
      this.drawButton(this.ultBtn, def.glyph, def.colour,
        ready ? 1 : 1 - g.abilities.ultimate.cd / def.cooldown, ready, true)
      this.ultBtn.key.setVisible(true).setText('R')
      this.ultBtn.zone.setSize(live ? this.ultBtn.r * 2 : 1, live ? this.ultBtn.r * 2 : 1)
    } else {
      this.ultBtn.ring.clear()
      this.ultBtn.glyph.setVisible(false)
      this.ultBtn.key.setVisible(false)
      this.ultBtn.zone.setSize(1, 1)
    }

    // ---- misc ------------------------------------------------------------
    const combo = g.fx.combo
    if (combo >= 5) {
      this.comboText.setVisible(true).setText(`${combo} KILL STREAK`)
        .setAlpha(0.85).setScale(1 + Math.min(0.5, combo / 200))
    } else {
      this.comboText.setVisible(false)
    }

    if (this.toastT > 0) {
      this.toastT -= dt
      this.toastText.setVisible(true).setAlpha(Math.min(1, this.toastT))
    } else this.toastText.setVisible(false)

    if (this.hintT > 0) {
      this.hintT -= dt
      this.hintText.setVisible(true).setAlpha(Math.min(1, this.hintT))
    } else this.hintText.setVisible(false)

    if (this.showStats) {
      const s = g.stats
      this.statsText.setVisible(true).setText(
        `${s.fps} fps   enemies ${s.enemies}   troops ${s.soldiers}   workers ${s.workers}   drops ${s.pickups}   shots ${s.projectiles}`,
      )
    } else this.statsText.setVisible(false)
  }

  private drawButton(b: AbilityBtn, glyph: string, colour: number, fill: number, ready: boolean, ult = false) {
    const g = b.ring
    g.clear()
    g.fillStyle(PAL.uiBg, 0.82)
    g.fillCircle(b.x, b.y, b.r)
    g.lineStyle(ult ? 4 : 3, ready ? colour : PAL.uiEdge, ready ? 1 : 0.7)
    g.strokeCircle(b.x, b.y, b.r)
    if (fill < 1) {
      g.fillStyle(0x000000, 0.55)
      g.slice(b.x, b.y, b.r - 2, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * (1 - fill)), true)
      g.fillPath()
    } else if (ready) {
      g.lineStyle(2, colour, 0.35)
      g.strokeCircle(b.x, b.y, b.r + 4)
    }
    b.glyph.setVisible(true).setText(glyph)
      .setColor(ready ? CSS(colour) : CSS(PAL.uiDim))
      .setAlpha(ready ? 1 : 0.6)
  }

  private panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
    g.fillStyle(PAL.uiBg, 0.72)
    g.fillRoundedRect(x, y, w, h, 8)
    g.lineStyle(1.5, PAL.uiEdge, 0.9)
    g.strokeRoundedRect(x, y, w, h, 8)
  }

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, p: number, colour: number) {
    g.fillStyle(0x050a12, 0.85)
    g.fillRoundedRect(x - 1, y - 1, w + 2, h + 2, h / 2 + 1)
    g.fillStyle(colour, 1)
    g.fillRoundedRect(x, y, Math.max(h, w * p), h, h / 2)
    g.fillStyle(0xffffff, 0.22)
    g.fillRoundedRect(x, y, Math.max(h, w * p), h * 0.45, h / 3)
  }
}
