import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { RESOURCE_ORDER, type ResourceType } from '../core/types'
import { ABILITIES, ABILITY_KEYS, ABILITY_SLOTS } from '../config/abilities'
import { PLAYER, POI } from '../config/balance'
import { POIS, REGION_BY_ID } from '../config/world'
import { CAMP_BANNERS } from '../config/quests'
import { clamp, short } from '../core/math'
import { DPR, IS_TOUCH, safeAreaInsets, wantsTouchTargets } from '../core/device'
import { ABILITY_ICON } from '../art/icons'
import type { GameScene } from '../scenes/GameScene'
import { fitWidth, screen, setColour, textStyle, titleCase } from './theme'
import { medalTexture, ON_PAGE, PlateButton, sealTexture, SkinBar, SkinPanel, vignetteTexture } from './skin'

/**
 * The objective needs at least this much room between the vitals and the
 * right-hand column; with less, it tucks in under the vitals instead.
 */
const OBJ_MIN = 220

/** Height of the vitals pill, top left. The minimap clears it by this number. */
export const HERO_PLATE_H = 44

const D = {
  panel: 1_000_000,
  bar: 1_000_002,
  seal: 1_000_003,
  text: 1_000_005,
  toast: 1_000_011,
  death: 1_000_012,
}

interface ResRow {
  icon: Phaser.GameObjects.Image
  text: Phaser.GameObjects.Text
  rate: Phaser.GameObjects.Text
  type: ResourceType
  last: number
  pulse: number
}

interface AbilityBtn {
  index: number
  seal: Phaser.GameObjects.Image
  icon: Phaser.GameObjects.Image
  sweep: Phaser.GameObjects.Graphics
  count: Phaser.GameObjects.Text
  key: Phaser.GameObjects.Text
  zone: Phaser.GameObjects.Zone
  x: number
  y: number
  r: number
  wasReady: boolean
  sweeping: boolean
}

/** Keyboard names as they read on a keycap: Space, not SPACE. */
const keyName = (k: string) => (k.length > 1 ? k.charAt(0) + k.slice(1).toLowerCase() : k)

/**
 * Fixed HUD. Everything is positioned from the four corners in `layout()` so
 * the same code serves a phone in landscape and a desktop window.
 *
 * It is kept to the corners and kept quiet: smoked glass, no ornament, small
 * type. Vitals top left; the day and the objective top centre; three icon
 * buttons and the stores top right; the abilities under the right thumb.
 * The middle of the screen belongs to the fight, and news only passes
 * through it.
 */
export class HUD {
  private heroPanel: SkinPanel
  private medal: Phaser.GameObjects.Image
  private lvlText: Phaser.GameObjects.Text
  private hpBar: SkinBar
  private hpText: Phaser.GameObjects.Text
  private xpBar: SkinBar

  private objPanel: SkinPanel
  private objTitle: Phaser.GameObjects.Text
  private objHint: Phaser.GameObjects.Text
  private objBar: SkinBar
  private phaseIcon: Phaser.GameObjects.Image
  private phaseText: Phaser.GameObjects.Text

  private bossPanel: SkinPanel
  private bossText: Phaser.GameObjects.Text
  private bossBar: SkinBar

  private resPanel: SkinPanel
  private popIcon: Phaser.GameObjects.Image
  private popText: Phaser.GameObjects.Text
  private packIcon: Phaser.GameObjects.Image
  private carryText: Phaser.GameObjects.Text
  private packBar: SkinBar
  private outputText: Phaser.GameObjects.Text

  private hintPanel: SkinPanel
  private hintText: Phaser.GameObjects.Text
  private toastBand: SkinPanel
  private toastText: Phaser.GameObjects.Text
  /** The line under the headline: a claimed region's blurb. */
  private toastSub: Phaser.GameObjects.Text
  private toastDur = 3.2
  private comboText: Phaser.GameObjects.Text
  private statsText: Phaser.GameObjects.Text
  private lowHp: Phaser.GameObjects.Image

  private deathPanel: SkinPanel
  private deathTitle: Phaser.GameObjects.Text
  private deathHint: Phaser.GameObjects.Text

  private rows: ResRow[] = []
  private buttons: AbilityBtn[] = []
  private ultBtn!: AbilityBtn
  private dodgeBtn!: AbilityBtn
  private pauseBtn: PlateButton
  private mapBtn: PlateButton
  private holdBtn: PlateButton

  private W = 0
  private H = 0
  /** Padding with the device's safe-area insets already folded in. */
  private padT = 16
  private padL = 16
  private padR = 16
  /** Top of the stores, under the icon buttons. */
  private resTop = 0
  /** Bottom of the right-hand column, for news that must clear it on a narrow screen. */
  private rightBottom = 0
  private toastT = 0
  private toastQueue: [string, string, number][] = []
  /** S14: a lore stone's line, on a card low on the view */
  private lorePanel: SkinPanel
  private loreTitle: Phaser.GameObjects.Text
  private loreText: Phaser.GameObjects.Text
  private loreT = 0
  private hintT = 0
  private lastCarryHint = -9999
  private flashCarry = 0
  private lastCombo = 0
  private hintSig = ''

  showStats = false
  /** True while a modal owns the screen: every HUD tap target goes dead. */
  blocked = false

  constructor(private ui: Phaser.Scene, private game: GameScene) {
    const t = (o: Parameters<typeof textStyle>[0], ox = 0.5, oy = 0.5) =>
      ui.add.text(0, 0, '', textStyle(o)).setOrigin(ox, oy).setScrollFactor(0).setDepth(D.text)
    const panel = (skin: 'hud' | 'page' | 'ribbon', depth = D.panel, alpha?: number) =>
      new SkinPanel(ui, skin, alpha === undefined ? {} : { alpha }).setScrollFactor(0).setDepth(depth)
    const bar = (colour: number, ghost = false) =>
      new SkinBar(ui, colour, { ghost, inset: 0 }).setScrollFactor(0).setDepth(D.bar)

    // ---- vitals ------------------------------------------------------------
    this.heroPanel = panel('hud', D.panel, 0.5)
    this.hpBar = bar(PAL.good, true)
    this.xpBar = bar(PAL.xp)
    this.medal = ui.add.image(0, 0, medalTexture(ui, 15)).setScrollFactor(0).setDepth(D.seal).setScale(1 / DPR)
    this.lvlText = t({ size: 14, weight: '800', colour: PAL.bone })
    this.hpText = t({ size: 10, weight: '800', colour: PAL.bone, stroke: 2 })

    // ---- the day and the objective ------------------------------------------
    this.objPanel = panel('hud', D.panel, 0.5)
    this.objTitle = t({ size: 15, weight: '800', colour: PAL.bone })
    this.objHint = t({ size: 12, weight: '600', colour: PAL.gold })
    this.objBar = bar(PAL.gold)
    this.phaseIcon = ui.add.image(0, 0, 'ico_sun').setScrollFactor(0).setDepth(D.text)
    this.phaseText = t({ voice: 'caps', size: 12, weight: '800', colour: PAL.uiDim }, 0, 0.5)

    this.bossPanel = panel('hud', D.panel, 0.6)
    this.bossBar = bar(PAL.danger, true)
    this.bossText = t({ voice: 'caps', size: 12, weight: '800', colour: PAL.danger })

    // ---- stores --------------------------------------------------------------
    this.resPanel = panel('hud', D.panel, 0.45)
    this.popIcon = ui.add.image(0, 0, 'ico_pop').setScrollFactor(0).setDepth(D.text).setDisplaySize(14, 14)
    this.popText = t({ size: 12, weight: '800', colour: PAL.uiText }, 0, 0.5)
    this.packIcon = ui.add.image(0, 0, 'ico_pack').setScrollFactor(0).setDepth(D.text).setDisplaySize(14, 14)
    this.carryText = t({ size: 12, weight: '800', colour: PAL.uiDim }, 1, 0.5)
    this.packBar = bar(PAL.gold)
    this.outputText = t({ voice: 'caps', size: 11, weight: '800', colour: PAL.good })

    for (const type of RESOURCE_ORDER) {
      const icon = ui.add.image(0, 0, `ui_res_${type}`).setScrollFactor(0)
        .setDepth(D.text).setVisible(false)
      const text = t({ size: 13, weight: '800', colour: PAL.uiText }, 0, 0.5).setVisible(false)
      const rate = t({ size: 10, weight: '700', colour: PAL.good }, 1, 0.5).setVisible(false)
      this.rows.push({ icon, text, rate, type, last: -1, pulse: 0 })
    }

    // ---- passing news -----------------------------------------------------------
    this.hintPanel = panel('hud', D.panel + 1, 0.66)
    this.hintText = t({ size: 13, weight: '600', colour: PAL.uiText, align: 'center' })
    this.toastBand = panel('ribbon', D.toast)
    this.toastText = t({ voice: 'display', size: 24, colour: PAL.bone, shadow: true }).setDepth(D.toast + 1)
    this.toastSub = t({ size: 14, weight: 'italic 500', colour: PAL.uiDim, align: 'center', wrap: 460 }, 0.5, 0).setDepth(D.toast + 1)
    this.lorePanel = panel('page', D.toast)
    this.loreTitle = t({ voice: 'caps', size: 12, weight: '800', colour: ON_PAGE.gilt }, 0.5, 0).setDepth(D.toast + 1)
    this.loreText = t({ size: 15, weight: 'italic 500', colour: ON_PAGE.text, align: 'center', wrap: 380 }, 0.5, 0).setDepth(D.toast + 1)
    this.lorePanel.setVisible(false)
    this.comboText = t({ size: 16, weight: '800', colour: PAL.gold, stroke: 4 })
    this.statsText = t({ size: 11, weight: '500', colour: PAL.uiDim, stroke: 3 }, 0, 1)
    this.lowHp = ui.add.image(0, 0, vignetteTexture(ui, 0x7a1408)).setOrigin(0, 0)
      .setScrollFactor(0).setDepth(D.panel - 1).setAlpha(0).setVisible(false)

    this.deathPanel = panel('page', D.death)
    this.deathTitle = t({ voice: 'display', size: 28, colour: ON_PAGE.danger }).setDepth(D.death + 1).setVisible(false)
    this.deathHint = t({ voice: 'caps', size: 13, weight: '800', colour: ON_PAGE.dim }).setDepth(D.death + 1).setVisible(false)
    this.deathPanel.setVisible(false)

    // One button per hotbar slot, unlocked or not. The button keeps its place
    // whether or not the ability behind it exists yet, so nothing ever shuffles.
    for (let i = 0; i < ABILITY_SLOTS.length; i++) this.buttons.push(this.makeButton(i))
    this.ultBtn = this.makeButton(-1)
    this.dodgeBtn = this.makeButton(-2)

    // A finger has no ESC, M or H. Without these, everything behind the pause
    // menu, the atlas and the army's standing order are unreachable on a phone.
    this.holdBtn = this.makeIconButton('ico_follow', () => this.game.toggleHold())
    this.mapBtn = this.makeIconButton('ico_map', () => this.ui.events.emit('toggleAtlas'))
    this.pauseBtn = this.makeIconButton('ico_pause', () => this.ui.events.emit('togglePause'))

    this.game.bus.on('achievement', p => this.toast(`Deed earned: ${p.title}`))
    this.game.bus.on('carry:full', () => {
      this.flashCarry = 0.5
      // The bar going red does not explain why loot stopped coming to you.
      if (this.game.time.now - this.lastCarryHint > 6000) {
        this.lastCarryHint = this.game.time.now
        this.hint('Pack full: empty it at the depot or an outpost')
      }
    })
    // the region banner: its name as the headline, its blurb beneath
    this.game.bus.on('region:claimed', ({ id }) => {
      const r = REGION_BY_ID.get(id)
      if (r) this.toast(r.name, r.blurb, 4.6)
    })
    // points of interest (S14): a lore stone's card; a headline for a shrine, survivors or a landmark
    this.game.bus.on('poi:lore', ({ name, text }) => this.lore(name, text))
    this.game.bus.on('poi:done', ({ id, kind }) => {
      const poi = POIS.find(p => p.id === id)
      if (!poi) return
      if (kind === 'shrine') this.toast(`${titleCase(poi.name)} restored`, poi.effect ?? '', 4.6)
      else if (kind === 'survivors') this.toast(titleCase(poi.name), poi.effect ?? '', 4.2)
      else if (kind === 'landmark') this.toast(titleCase(poi.name), '', 3.2)
    })
    this.game.bus.on('crossing:opened', ({ id }) => {
      if (id === 'calderaCauseway') this.toast('The fire on the causeway dies.', '', 4.6)
    })
    // Campaign 2.0 (S18): an act's banner, and the camps whose burning changes the nights
    this.game.bus.on('act:begun', ({ roman, name, blurb }) => this.toast(`Act ${roman} · ${name}`, blurb, 5.2))
    this.game.bus.on('camp:burned', ({ id }) => {
      const b = CAMP_BANNERS[id]
      if (b) this.toast(b[0], b[1], 4.6)
    })

    this.layout()
    ui.scale.on('resize', () => this.layout())
  }

  private makeButton(index: number): AbilityBtn {
    const ui = this.ui
    const seal = ui.add.image(0, 0, '__WHITE').setScrollFactor(0).setDepth(D.seal).setVisible(false)
    const icon = ui.add.image(0, 0, 'ico_dodge').setScrollFactor(0).setDepth(D.seal + 1).setVisible(false)
    const sweep = ui.add.graphics().setScrollFactor(0).setDepth(D.seal + 2)
    const count = ui.add.text(0, 0, '', textStyle({ size: 18, weight: '800', colour: PAL.bone, stroke: 4 }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(D.seal + 3).setVisible(false)
    // a small keycap sitting on the bottom of the ring
    const key = ui.add.text(0, 0, '', textStyle({ voice: 'caps', size: 10, weight: '800', colour: PAL.uiDim }))
      .setOrigin(0.5).setScrollFactor(0).setDepth(D.seal + 3)
      .setBackgroundColor('rgba(16,13,11,0.88)').setPadding(4, 0, 4, 1)
    const zone = ui.add.zone(0, 0, 10, 10).setScrollFactor(0).setInteractive({ useHandCursor: true })
    const btn: AbilityBtn = {
      index, seal, icon, sweep, count, key, zone, x: 0, y: 0, r: 30, wasReady: true, sweeping: false,
    }
    zone.on('pointerdown', () => {
      if (this.blocked) return
      // the disc gives under the thumb
      ui.tweens.add({ targets: [seal, icon], scale: '*=0.9', duration: 60, yoyo: true })
      if (index === -2) this.game.tryDodge()
      else if (index < 0) this.game.abilities.castUltimate()
      else this.game.abilities.castSlot(index)
    })
    return btn
  }

  private makeIconButton(icon: string, onTap: () => void) {
    return new PlateButton(this.ui, { label: '', icon, onClick: onTap, tone: 'quiet' })
      .setScrollFactor(0).setDepth(D.text)
  }

  /** Width of the health bar. */
  private get barW() { return this.W < 460 ? 108 : this.W < 900 ? 136 : 168 }
  private get plateW() { return 8 + 30 + 9 + this.barW + 11 }
  private get resW() { return this.W < 720 ? 132 : 150 }
  private get btnS() { return wantsTouchTargets(this.W) ? 44 : 34 }
  /** The icon buttons' row, right to left: pause, map, army. */
  private get btnRowW() { return this.btnS * 3 + 6 * 2 }

  /**
   * The headline. News that lands while one is up waits its turn (an act's
   * banner and the causeway's, say, come in the same frame), up to three.
   */
  toast(msg: string, sub = '', secs = 3.2) {
    if (this.toastT > 0.6) {
      if (this.toastQueue.length < 3) this.toastQueue.push([msg, sub, secs])
      return
    }
    this.toastText.setText(msg)
    this.toastSub.setText(sub)
    this.toastT = this.toastDur = secs
    this.toastBand.setAlpha(0)
    this.toastText.setAlpha(0)
    this.toastSub.setAlpha(0)
  }

  /** A lore stone's line on a card (S14). */
  lore(name: string, text: string) {
    this.loreTitle.setText(name.toUpperCase())
    this.loreText.setText(`“${text}”`)
    this.loreT = POI.loreShow
  }

  hint(msg: string) {
    this.hintText.setText(msg)
    this.hintT = 4.5
  }

  layout() {
    const view = screen(this.ui)
    this.W = view.w
    this.H = view.h
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

    // ---- vitals ------------------------------------------------------------
    const mr = 15
    this.heroPanel.place(padL, padT, this.plateW, HERO_PLATE_H)
    const mx = padL + 8 + mr
    const my = padT + HERO_PLATE_H / 2
    this.medal.setPosition(mx, my)
    this.lvlText.setPosition(mx, my)
    const bx = mx + mr + 9
    this.hpBar.place(bx, padT + 11, this.barW, 13)
    this.hpText.setPosition(bx + this.barW / 2, padT + 17.5)
    this.xpBar.place(bx, padT + 29, this.barW, 4)

    // ---- icon buttons, top right ---------------------------------------------
    const s = this.btnS
    let x = this.W - padR - s / 2
    for (const b of [this.pauseBtn, this.mapBtn, this.holdBtn]) {
      b.place(x, padT + s / 2, s, s)
      x -= s + 6
    }
    this.resTop = padT + s + 8

    this.lowHp.setDisplaySize(this.W, this.H)
    this.statsText.setPosition(padL + 4, this.H - padB - 2)

    // ---- ability hotbar, bottom right, thumb reachable -------------------------
    // Six discs (five slots plus the larger ultimate) do not fit across a
    // phone in portrait at the size a desktop uses, so solve the radius and the
    // gap from the width actually on offer. Widest gap that still allows the
    // biggest radius.
    const n = this.buttons.length
    const rWant = small ? 25 : 26
    const gapWant = small ? 10 : 12
    // Below this a thumb misses; better to crowd the bar than to shrink past it.
    const rFloor = wantsTouchTargets(this.W) ? 20 : 15
    const right = this.W - padR - 4
    const avail = right - padL
    let r = 0
    let gap = gapWant
    for (let tryGap = gapWant; tryGap >= 6; tryGap -= 2) {
      // span = ultimate (2r + 8) + gap + n buttons (2r) + n - 1 gaps
      const fits = Math.min(rWant, Math.floor((avail - 8 - n * tryGap) / (2 * n + 2)))
      if (fits > r) { r = fits; gap = tryGap }
      if (r >= rWant) break
    }
    r = Math.max(rFloor, r)

    const ultR = r + 4
    // room under each disc for its keycap
    const keyRoom = IS_TOUCH ? 4 : 8
    const baseY = this.H - padB - ultR - keyRoom
    const dodgeY = baseY - ultR - r - 14
    this.game.uiBands.bottom = this.H - (dodgeY - r - 8)
    let hx = right - ultR
    this.setButton(this.ultBtn, hx, baseY, ultR)
    this.setButton(this.dodgeBtn, hx, dodgeY, r)
    hx -= ultR + gap + r
    for (const b of this.buttons) {
      this.setButton(b, hx, baseY, r)
      hx -= r * 2 + gap
    }

    // the tutorial line floats above the hotbar
    this.hintText.setWordWrapWidth(Math.min(520, this.W - padL - padR - 40)).setFontSize(small ? 12 : 13)
    this.hintSig = ''
  }

  /** The lowest the floating lines may sit: above the hotbar band, or above a docked bottom sheet. */
  private floorY() {
    const bands = this.game.uiBands
    const d = bands.dock
    return Math.min(this.H - bands.bottom, d && d.side === 'bottom' ? d.y - 8 : Infinity)
  }

  private setButton(b: AbilityBtn, x: number, y: number, r: number) {
    b.x = x; b.y = y; b.r = r
    b.zone.setPosition(x, y).setSize(r * 2, r * 2)
    b.key.setPosition(x, y + r - 1).setVisible(!IS_TOUCH)
    b.count.setPosition(x, y).setFontSize(Math.round(r * 0.62))
    b.wasReady = true
  }

  update(dt: number) {
    const g = this.game
    const p = g.player
    const { padT, padL, padR } = this

    // Every HUD tap target goes dead behind a modal, so a thumb aimed at the
    // pause menu cannot fire an ability or flip the army through the dim.
    const live = !this.blocked

    // ---- vitals ----------------------------------------------------------
    const hp = clamp(p.hp / p.maxHp, 0, 1)
    const shielded = p.respawnShieldT > 0
    this.hpBar.set(hp, shielded ? PAL.heroTrim : hp > 0.5 ? PAL.good : hp > 0.25 ? PAL.gold : PAL.danger)
    this.hpBar.tick(dt)
    this.hpText.setText(`${Math.ceil(Math.max(0, p.hp))} / ${Math.round(p.maxHp)}`)
    this.xpBar.set(clamp(p.xp / p.xpToNext, 0, 1))
    this.lvlText.setText(`${p.level}`)

    // Low health reads at the edge of your eye, not in a number: the frame
    // bleeds red and breathes faster the closer it gets.
    const danger = p.alive && hp < 0.3 && !this.blocked
    this.lowHp.setVisible(danger)
    if (danger) {
      const speed = 0.004 + (0.3 - hp) * 0.02
      this.lowHp.setAlpha((0.35 + Math.sin(g.now * speed) * 0.2) * (1 - hp / 0.3 * 0.5))
    }

    // ---- icon buttons: the army's order shows as the lit button ------------------
    const holding = g.army.holding
    this.holdBtn.setIcon(holding ? 'ico_hold' : 'ico_follow')
      .setTone(holding ? 'primary' : 'quiet')
      .setLive(live)
    this.mapBtn.setLive(live)
    this.pauseBtn.setLive(live)

    // ---- stores ------------------------------------------------------------
    const resRows = RESOURCE_ORDER.filter(t => g.res.discovered.has(t))
    const bonus = g.buildings.bonus.prod > 0
    const rowPitch = 21
    const resW = this.resW
    const resPanelH = 40 + resRows.length * rowPitch + (bonus ? 16 : 0)
    const rx = this.W - padR - resW
    const ry = this.resTop
    this.rightBottom = ry + resPanelH
    this.resPanel.place(rx, ry, resW, resPanelH)
    this.popIcon.setPosition(rx + 16, ry + 14)
    setColour(this.popText.setText(`${g.popUsed}/${g.popCap}`), g.popUsed >= g.popCap ? PAL.danger : PAL.uiText)
      .setPosition(rx + 27, ry + 14)
    const carried = g.res.carriedTotal
    const full = carried >= g.res.carryCapacity
    this.flashCarry = Math.max(0, this.flashCarry - dt)
    const packWarn = full || this.flashCarry > 0
    setColour(this.carryText.setText(`${short(carried)}/${short(g.res.carryCapacity)}`), packWarn ? PAL.danger : PAL.uiDim)
      .setPosition(rx + resW - 10, ry + 14)
    this.packIcon.setPosition(rx + resW - 10 - this.carryText.width - 11, ry + 14)
    this.packBar.place(rx + 10, ry + 25, resW - 20, 3)
    this.packBar.set(clamp(carried / g.res.carryCapacity, 0, 1), packWarn ? PAL.danger : PAL.gold)

    let i = 0
    for (const row of this.rows) {
      const visible = g.res.discovered.has(row.type)
      row.icon.setVisible(visible)
      row.text.setVisible(visible)
      row.rate.setVisible(visible)
      if (!visible) continue
      const y = ry + 44 + i * rowPitch
      row.icon.setPosition(rx + 17, y).setDisplaySize(17, 17)
      const stored = g.res.stored[row.type]
      // a count that grows gives a small gilt jump, so income is felt, not read
      if (row.last >= 0 && stored > row.last) row.pulse = 0.3
      row.last = stored
      row.pulse = Math.max(0, row.pulse - dt)
      setColour(row.text.setPosition(rx + 31, y).setText(short(stored)), row.pulse > 0 ? PAL.gold : PAL.uiText)
        .setScale(1 + row.pulse * 0.3)
      // One slot on the right: what is on your back, in gold, while you carry
      // any; otherwise the income rate, the number that makes automation feel
      // worth buying.
      const held = g.res.carried[row.type]
      const r = g.res.rate[row.type]
      row.rate.setPosition(rx + resW - 10, y + 1)
      if (held > 0) setColour(row.rate.setText(`+${short(held)}`), PAL.gold)
      else setColour(row.rate.setText(r >= 0.05 ? `+${r >= 10 ? Math.round(r) : r.toFixed(1)}/s` : ''), PAL.good)
      i++
    }
    this.outputText.setVisible(bonus)
    if (bonus) {
      this.outputText.setText(`Output +${Math.round(g.buildings.bonus.prod * 100)}%`)
        .setPosition(rx + resW / 2, ry + resPanelH - 12)
    }

    // ---- the day and the objective ---------------------------------------
    // Centred between the vitals and the right-hand column, as wide as the
    // gap allows. Where there is no gap it tucks in under the vitals, which
    // on a phone held upright is empty ground.
    const q = g.quests.view()
    const leftEdge = padL + this.plateW + 10
    const rightEdge = this.W - padR - Math.max(resW, this.btnRowW) - 10
    const room = 2 * Math.min(this.W / 2 - leftEdge, rightEdge - this.W / 2)
    const narrow = room < OBJ_MIN
    const objW = narrow ? Math.max(160, this.W - padR - resW - 10 - padL) : Math.min(320, room)
    const objX = narrow ? padL : this.W / 2 - objW / 2
    const objY = narrow ? padT + HERO_PLATE_H + 8 : padT
    const objH = q ? 64 : 26
    const cx = objX + objW / 2
    this.objPanel.place(objX, objY, objW, objH)
    if (q) {
      this.objTitle.setText(q.title).setPosition(cx, objY + 31)
      this.fit(this.objTitle, 15, objW - 24)
      this.objHint.setText(`${q.hint}${q.need > 1 ? `  ·  ${short(q.have)}/${short(q.need)}` : ''}`).setPosition(cx, objY + 47)
      this.fit(this.objHint, 12, objW - 24)
      this.objBar.place(objX + 14, objY + objH - 6, objW - 28, 2)
      this.objBar.set(q.need > 0 ? clamp(q.have / q.need, 0, 1) : 1)
    }
    this.objTitle.setVisible(!!q)
    this.objHint.setVisible(!!q)
    this.objBar.setVisible(!!q)
    // tell world-space cards how much of the screen we are covering
    g.uiBands.top = objY + objH + 8
    g.uiBands.left = narrow ? objY + objH : padT + HERO_PLATE_H

    const w = g.waves
    const mins = Math.floor(w.timeLeft / 60)
    const secs = Math.floor(w.timeLeft % 60)
    const clock = `${mins}:${secs.toString().padStart(2, '0')}`
    if (w.phase === 'night') {
      setColour(this.phaseText.setText(`Night ${w.wave}  ·  ${w.enemiesRemaining} ${w.marching ? 'marching' : 'left'}`), PAL.danger)
      this.phaseIcon.setTexture('ico_moon')
    } else if (w.phase === 'warning') {
      const flash = Math.sin(this.game.now * 0.02) > 0
      const shout = w.bannerText === w.bannerText.toUpperCase()
      const words = shout ? w.bannerText.charAt(0) + w.bannerText.slice(1).toLowerCase() : w.bannerText
      setColour(this.phaseText.setText(`${words}  ${Math.ceil(w.timeLeft)}`), flash ? PAL.danger : PAL.gold)
      this.phaseIcon.setTexture('ico_moon')
    } else {
      setColour(this.phaseText.setText(`Day ${w.wave + 1}  ·  night in ${clock}`), PAL.uiDim)
      this.phaseIcon.setTexture('ico_sun')
    }
    this.fit(this.phaseText, 12, objW - 44)
    const phaseY = objY + 13
    const iconS = 14
    const phaseW = iconS + 5 + this.phaseText.width
    this.phaseIcon.setDisplaySize(iconS, iconS).setPosition(cx - phaseW / 2 + iconS / 2, phaseY)
    this.phaseText.setPosition(cx - phaseW / 2 + iconS + 5, phaseY)

    // ---- boss bar --------------------------------------------------------
    const boss = g.enemies.bossRef
    const bossUp = !!boss?.alive
    this.bossPanel.setVisible(bossUp)
    this.bossBar.setVisible(bossUp)
    this.bossText.setVisible(bossUp)
    if (boss && bossUp) {
      const by = objY + objH + 6
      this.bossPanel.place(objX, by, objW, 36)
      this.bossBar.place(objX + 12, by + 22, objW - 24, 6)
      this.bossBar.set(clamp(boss.hp / boss.maxHp, 0, 1))
      this.bossBar.tick(dt)
      this.bossText.setText(`${titleCase(boss.def.name)}  ·  ${short(Math.ceil(boss.hp))}`).setPosition(cx, by + 12)
      this.fit(this.bossText, 12, objW - 24)
      g.uiBands.top = by + 36 + 8
      if (narrow) g.uiBands.left = by + 36
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
        this.hideButton(btn)
        continue
      }
      const def = ABILITIES[slot.key]
      this.drawButton(btn, ABILITY_ICON[slot.key], def.colour, slot.cd, g.abilities.cooldownOf(slot.key), false)
      btn.key.setText(keyName(ABILITY_KEYS[b] ?? ''))
      btn.zone.setSize(live ? btn.r * 2 : 1, live ? btn.r * 2 : 1)
    }
    if (g.abilities.ultimate.unlocked) {
      const def = ABILITIES[g.abilities.ultimate.key]
      this.drawButton(this.ultBtn, ABILITY_ICON[g.abilities.ultimate.key], def.colour,
        g.abilities.ultimate.cd, g.abilities.cooldownOf(g.abilities.ultimate.key), true)
      this.ultBtn.key.setText('R')
      this.ultBtn.zone.setSize(live ? this.ultBtn.r * 2 : 1, live ? this.ultBtn.r * 2 : 1)
    } else {
      this.hideButton(this.ultBtn)
    }
    this.drawButton(this.dodgeBtn, 'ico_dodge', PAL.heroTrim, p.dodgeCd, PLAYER.dodgeCooldown, false)
    this.dodgeBtn.key.setText('X')
    this.dodgeBtn.zone.setSize(live ? this.dodgeBtn.r * 2 : 1, live ? this.dodgeBtn.r * 2 : 1)

    // ---- the fallen hero ---------------------------------------------------
    // The world keeps fighting while the hero returns. Give the otherwise
    // empty camera a reason and an exact countdown, unless a modal owns it.
    const fallen = !p.alive && !this.blocked
    this.deathTitle.setVisible(fallen)
    this.deathHint.setVisible(fallen)
    this.deathPanel.setVisible(fallen)
    if (fallen) {
      const compactDeath = this.H < 520 || this.W < 520
      const ph = compactDeath ? 76 : 96
      const pw = Math.min(340, this.W - 32)
      const px = (this.W - pw) / 2
      const safeTop = g.uiBands.top + 8
      const safeBottom = this.H - g.uiBands.bottom - 8
      const py = safeBottom - safeTop >= ph
        ? clamp(this.H * 0.43, safeTop, safeBottom - ph)
        : (this.H - ph) / 2
      this.deathPanel.place(px, py, pw, ph)
      this.deathTitle.setFontSize(compactDeath ? 24 : 28)
        .setPosition(this.W / 2, py + (compactDeath ? 30 : 38)).setText('Hero Fallen')
      this.deathHint.setFontSize(compactDeath ? 12 : 13)
        .setPosition(this.W / 2, py + (compactDeath ? 56 : 68))
        .setText(`Returning to the hall in ${Math.max(1, Math.ceil(p.deadTimer))}`)
    }

    // ---- kill streak --------------------------------------------------------
    const combo = g.fx.combo
    if (combo >= 5) {
      if (combo !== this.lastCombo) {
        this.ui.tweens.killTweensOf(this.comboText)
        this.comboText.setScale(1.2)
        this.ui.tweens.add({ targets: this.comboText, scale: 1 + Math.min(0.3, combo / 250), duration: 160, ease: 'Back.easeOut' })
      }
      // Low and central, just above the hotbar band: the middle of the screen
      // belongs to the fight and to the build card that floats over it.
      const hintUp = this.hintPanel.img.visible ? 40 : 0
      this.comboText.setVisible(true).setText(`${combo} streak`).setAlpha(0.85)
        .setPosition(this.W / 2, this.floorY() - 18 - hintUp)
    } else {
      this.comboText.setVisible(false)
    }
    this.lastCombo = combo

    // ---- headline -------------------------------------------------------------
    // It fades in with the news across a band of shade and fades out when done.
    if (this.toastT > 0) {
      this.toastT -= dt
      const age = this.toastDur - this.toastT
      const a = Math.min(1, age / 0.25, this.toastT / 0.6)
      const rise = (1 - Math.min(1, age / 0.3)) * 8
      this.fit(this.toastText, 24, this.W - 48)
      const hasSub = !!this.toastSub.text
      if (hasSub) this.toastSub.setWordWrapWidth(Math.min(this.W - 48, 460), true)
      const th = 44 + (hasSub ? this.toastSub.height + 4 : 0)
      const wide = Math.max(this.toastText.width, hasSub ? this.toastSub.width : 0)
      const tw = Math.min(this.W, wide / 0.6 + 40)
      // below everything the top of the HUD is covering (the boss bar included)
      const clear = Math.max(g.uiBands.top, this.W < 600 ? this.rightBottom : 0) + 6
      const top = Math.max(this.H * 0.2 - th / 2, clear) + rise
      this.toastBand.setVisible(true).setAlpha(a).place(this.W / 2 - tw / 2, top, tw, th)
      this.toastText.setVisible(true).setAlpha(a).setPosition(this.W / 2, top + 22)
      if (hasSub) this.toastSub.setVisible(true).setAlpha(a).setPosition(this.W / 2, top + 40)
      else this.toastSub.setVisible(false)
    } else if (this.toastQueue.length) {
      const [msg, sub, secs] = this.toastQueue.shift()!
      this.toast(msg, sub, secs)
    } else {
      this.toastBand.setVisible(false)
      this.toastText.setVisible(false)
      this.toastSub.setVisible(false)
    }

    if (this.loreT > 0) {
      this.loreT -= dt
      const a = Math.min(1, (POI.loreShow - this.loreT) / 0.2, this.loreT / 0.5)
      const pw = Math.min(this.W - 32, 420)
      this.loreText.setWordWrapWidth(pw - 48, true)
      const ph = Math.ceil(this.loreText.height) + 54
      // low on the view, clear of the hero, the headline and the quest card
      const py = Math.max(g.uiBands.top + 8, this.floorY() - ph - 6)
      this.lorePanel.setVisible(true).setAlpha(a).place(this.W / 2 - pw / 2, py, pw, ph)
      this.loreTitle.setVisible(true).setAlpha(a).setPosition(this.W / 2, py + 16)
      this.loreText.setVisible(true).setAlpha(a).setPosition(this.W / 2, py + 36)
    } else if (this.loreTitle.visible) {
      this.lorePanel.setVisible(false)
      this.loreTitle.setVisible(false)
      this.loreText.setVisible(false)
    }

    if (this.hintT > 0 && !this.blocked) {
      this.hintT -= dt
      const a = Math.min(1, this.hintT, (4.5 - this.hintT) / 0.2)
      const hw = Math.ceil(this.hintText.width) + 32
      const hh = Math.ceil(this.hintText.height) + 14
      const hy = this.floorY() + 8 - hh
      const sig = `${hw}x${hh}@${hy}`
      if (sig !== this.hintSig) {
        this.hintSig = sig
        this.hintPanel.place(this.W / 2 - hw / 2, hy, hw, hh)
      }
      this.hintPanel.setVisible(true).setAlpha(a)
      this.hintText.setVisible(true).setAlpha(a).setPosition(this.W / 2, hy + hh / 2)
    } else {
      if (this.hintT > 0) this.hintT -= dt
      this.hintPanel.setVisible(false)
      this.hintText.setVisible(false)
    }

    if (this.showStats) {
      const s = g.stats
      this.statsText.setVisible(true).setText(
        `${s.fps} fps   sim p95 ${s.simP95.toFixed(1)} ms   frame p95 ${s.frameP95.toFixed(1)} ms\n` +
        `enemies ${s.enemies}   troops ${s.soldiers}   workers ${s.workers}   drops ${s.pickups}   shots ${s.projectiles}`,
      )
    } else this.statsText.setVisible(false)
  }

  private hideButton(b: AbilityBtn) {
    b.seal.setVisible(false)
    b.icon.setVisible(false)
    b.count.setVisible(false)
    b.key.setVisible(false)
    if (b.sweeping) { b.sweep.clear(); b.sweeping = false }
    b.zone.setSize(1, 1)
  }

  /**
   * A glass disc ringed in the ability's colour. Cooling down, the ring goes
   * grey and a shadow sweeps round it with the seconds left on top; the moment
   * it is ready the ring takes its colour back and gives a small jump, so a
   * ready skill is noticed out of the corner of the eye.
   */
  private drawButton(b: AbilityBtn, icon: string, colour: number, cd: number, cooldown: number, ult: boolean) {
    const ready = cd <= 0
    const key = sealTexture(this.ui, colour, ready, Math.round(b.r), ult)
    if (b.seal.texture.key !== key) b.seal.setTexture(key)
    b.seal.setVisible(true).setPosition(b.x, b.y)
    if (b.icon.texture.key !== icon) b.icon.setTexture(icon)
    const s = b.r * 1.15
    b.icon.setVisible(true).setPosition(b.x, b.y).setAlpha(ready ? 1 : 0.4)
    if (!this.ui.tweens.isTweening(b.icon)) {
      b.icon.setDisplaySize(s, s)
      b.seal.setScale(1 / DPR)
    }
    b.key.setVisible(!IS_TOUCH)
    if (!ready) {
      const fill = clamp(1 - cd / cooldown, 0, 1)
      b.sweep.clear()
      b.sweep.fillStyle(0x000000, 0.45)
      b.sweep.slice(b.x, b.y, b.r - 2, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * (1 - fill)), true)
      b.sweep.fillPath()
      b.sweeping = true
      b.count.setVisible(true).setText(cd >= 1 ? `${Math.ceil(cd)}` : '')
    } else {
      if (b.sweeping) { b.sweep.clear(); b.sweeping = false }
      b.count.setVisible(false)
      if (!b.wasReady) {
        const base = b.icon.scaleX
        this.ui.tweens.add({ targets: b.seal, scale: { from: 1.15 / DPR, to: 1 / DPR }, duration: 260, ease: 'Back.easeOut' })
        this.ui.tweens.add({ targets: b.icon, scaleX: { from: base * 1.15, to: base }, scaleY: { from: base * 1.15, to: base }, duration: 260, ease: 'Back.easeOut' })
      }
    }
    b.wasReady = ready
  }

  private fit(t: Phaser.GameObjects.Text, size: number, maxW: number) {
    fitWidth(t, size, maxW)
  }
}
