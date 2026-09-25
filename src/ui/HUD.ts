import Phaser from 'phaser'
import { PAL } from '../config/palette'
import { RESOURCE_ORDER, type ResourceType } from '../core/types'
import { ABILITIES, ABILITY_KEYS, ABILITY_SLOTS } from '../config/abilities'
import { PLAYER, POI } from '../config/balance'
import { POIS, REGION_BY_ID } from '../config/world'
import { clamp, short } from '../core/math'
import { DPR, IS_TOUCH, safeAreaInsets, wantsTouchTargets } from '../core/device'
import { ABILITY_ICON } from '../art/icons'
import type { GameScene } from '../scenes/GameScene'
import { fitWidth, screen, setColour, textStyle, titleCase } from './theme'
import { medalTexture, ON_PAGE, PlateButton, sealTexture, SkinBar, SkinPanel, vignetteTexture } from './skin'

/**
 * The objective needs at least this much room between the hero plate and the
 * resources; with less, it drops to its own row underneath them instead.
 */
const OBJ_MIN = 236

/** Height of the hero plate, top left. The minimap clears it by this number. */
export const HERO_PLATE_H = 54

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

/** Keyboard names as they read in small caps: Space, not SPACE. */
const keyName = (k: string) => (k.length > 1 ? k.charAt(0) + k.slice(1).toLowerCase() : k)

/**
 * Fixed HUD. Everything is positioned from the four corners in `layout()` so
 * the same code serves a phone in landscape and a desktop window.
 *
 * Everything that sits over the world is walnut lacquer with a gilt rule, and
 * dark on purpose: the painting stays the brightest thing on screen, and the
 * few colours the HUD does use — health, the gilt of reward, the vermilion of
 * danger — are the only colour on the chrome, so they are what the eye finds.
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
  private toastRibbon: SkinPanel
  private toastText: Phaser.GameObjects.Text
  /** The line under the ribbon: a claimed region's blurb. */
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
  private pauseChip!: PlateButton
  private holdChip!: PlateButton
  /** Bottom of the top-left cluster: health plate plus the two chips under it. */
  private leftStackH = HERO_PLATE_H

  private W = 0
  private H = 0
  /** Padding with the device's safe-area insets already folded in. */
  private padT = 16
  private padL = 16
  private padR = 16
  private toastT = 0
  /** S14: a lore stone's line, on a parchment page under the ribbon */
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
    const panel = (skin: 'hud' | 'page' | 'ribbon', depth = D.panel) =>
      new SkinPanel(ui, skin).setScrollFactor(0).setDepth(depth)
    const bar = (colour: number, ghost = false) =>
      new SkinBar(ui, colour, { ghost }).setScrollFactor(0).setDepth(D.bar)

    // ---- hero plate --------------------------------------------------------
    this.heroPanel = panel('hud')
    this.hpBar = bar(PAL.good, true)
    this.xpBar = bar(PAL.xp)
    this.medal = ui.add.image(0, 0, medalTexture(ui, 22)).setScrollFactor(0).setDepth(D.seal).setScale(1 / DPR)
    this.lvlText = t({ voice: 'display', size: 20, colour: PAL.bone, stroke: 3 })
    this.hpText = t({ size: 12, weight: '800', colour: PAL.uiText, stroke: 3 })

    // ---- objective -----------------------------------------------------------
    this.objPanel = panel('hud')
    this.objTitle = t({ voice: 'display', size: 20, colour: PAL.bone, shadow: true }, 0.5, 0)
    this.objHint = t({ size: 13, weight: '700', colour: PAL.gold }, 0.5, 0)
    this.objBar = bar(PAL.good)
    this.phaseIcon = ui.add.image(0, 0, 'ico_sun').setScrollFactor(0).setDepth(D.text)
    this.phaseText = t({ voice: 'caps', size: 13, weight: '800', colour: PAL.uiDim }, 0, 0.5)

    this.bossPanel = panel('hud')
    this.bossBar = bar(PAL.danger, true)
    this.bossText = t({ voice: 'display', size: 17, colour: PAL.danger, stroke: 3 }, 0.5, 0.5)

    // ---- resources -------------------------------------------------------------
    this.resPanel = panel('hud')
    this.popIcon = ui.add.image(0, 0, 'ico_pop').setScrollFactor(0).setDepth(D.text).setDisplaySize(16, 16)
    this.popText = t({ size: 13, weight: '800', colour: PAL.uiText }, 0, 0.5)
    this.packIcon = ui.add.image(0, 0, 'ico_pack').setScrollFactor(0).setDepth(D.text).setDisplaySize(16, 16)
    this.carryText = t({ size: 13, weight: '800', colour: PAL.uiDim }, 1, 0.5)
    this.packBar = bar(PAL.gold)
    this.outputText = t({ voice: 'caps', size: 11, weight: '800', colour: PAL.good }, 0.5, 0.5)

    for (const type of RESOURCE_ORDER) {
      const icon = ui.add.image(0, 0, `ui_res_${type}`).setScrollFactor(0)
        .setDepth(D.text).setVisible(false)
      const text = t({ size: 15, weight: '800', colour: PAL.uiText }, 0, 0.5).setVisible(false)
      const rate = t({ size: 11, weight: '700', colour: PAL.good }, 1, 0.5).setVisible(false)
      this.rows.push({ icon, text, rate, type, last: -1, pulse: 0 })
    }

    // ---- floating messages ---------------------------------------------------
    this.hintPanel = panel('hud', D.panel + 1)
    this.hintText = t({ voice: 'caps', size: 14, weight: '800', colour: PAL.uiText, align: 'center' }, 0.5, 0.5)
    this.toastRibbon = panel('ribbon', D.toast)
    this.toastText = t({ voice: 'display', size: 22, colour: PAL.bone, shadow: true }).setDepth(D.toast + 1)
    this.toastSub = t({ size: 15, weight: 'italic 500', colour: PAL.bone, stroke: 4, align: 'center', wrap: 460 }, 0.5, 0).setDepth(D.toast + 1)
    this.lorePanel = panel('page', D.toast)
    this.loreTitle = t({ voice: 'caps', size: 13, weight: '800', colour: ON_PAGE.gilt }, 0.5, 0).setDepth(D.toast + 1)
    this.loreText = t({ size: 16, weight: 'italic 600', colour: ON_PAGE.text, align: 'center', wrap: 380 }, 0.5, 0).setDepth(D.toast + 1)
    this.lorePanel.setVisible(false)
    this.comboText = t({ voice: 'display', size: 26, colour: PAL.gold, stroke: 5 })
    this.statsText = t({ size: 11, weight: '500', colour: PAL.uiDim, stroke: 3 }, 0, 1)
    this.lowHp = ui.add.image(0, 0, vignetteTexture(ui, 0x7a1408)).setOrigin(0, 0)
      .setScrollFactor(0).setDepth(D.panel - 1).setAlpha(0).setVisible(false)

    this.deathPanel = panel('page', D.death)
    this.deathTitle = t({ voice: 'display', size: 28, colour: ON_PAGE.danger }).setDepth(D.death + 1).setVisible(false)
    this.deathHint = t({ voice: 'caps', size: 14, weight: '800', colour: ON_PAGE.dim }).setDepth(D.death + 1).setVisible(false)
    this.deathPanel.setVisible(false)

    // One button per hotbar slot, unlocked or not. The button keeps its place
    // whether or not the ability behind it exists yet, so nothing ever shuffles.
    for (let i = 0; i < ABILITY_SLOTS.length; i++) this.buttons.push(this.makeButton(i))
    this.ultBtn = this.makeButton(-1)
    this.dodgeBtn = this.makeButton(-2)

    // A finger has no ESC and no H. Without these two, everything behind the
    // pause menu — every volume, the quality switch, SAVE NOW, RESET PROGRESS —
    // and the army's standing order are unreachable on a phone.
    this.pauseChip = this.makeChip('Pause', 'ico_pause', 'Esc', () => this.ui.events.emit('togglePause'))
    this.holdChip = this.makeChip('Following', 'ico_follow', 'H', () => this.game.toggleHold())

    this.game.bus.on('achievement', p => this.toast(`Deed earned: ${p.title}`))
    this.game.bus.on('carry:full', () => {
      this.flashCarry = 0.5
      // The bar going red does not explain why loot stopped coming to you.
      if (this.game.time.now - this.lastCarryHint > 6000) {
        this.lastCarryHint = this.game.time.now
        this.hint('Pack full — empty it at the depot or an outpost')
      }
    })
    // the region banner: its name on the ribbon, its blurb beneath
    this.game.bus.on('region:claimed', ({ id }) => {
      const r = REGION_BY_ID.get(id)
      if (r) this.toast(r.name, r.blurb, 4.6)
    })
    // points of interest (S14): a lore stone's page; a ribbon for a shrine, survivors or a landmark
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
    const key = ui.add.text(0, 0, '', textStyle({ voice: 'caps', size: 11, weight: '800', colour: PAL.uiDim, stroke: 3 }))
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(D.text)
    const zone = ui.add.zone(0, 0, 10, 10).setScrollFactor(0).setInteractive({ useHandCursor: true })
    const btn: AbilityBtn = {
      index, seal, icon, sweep, count, key, zone, x: 0, y: 0, r: 30, wasReady: true, sweeping: false,
    }
    zone.on('pointerdown', () => {
      if (this.blocked) return
      // the seal gives under the thumb
      ui.tweens.add({ targets: [seal, icon], scale: '*=0.9', duration: 60, yoyo: true })
      if (index === -2) this.game.tryDodge()
      else if (index < 0) this.game.abilities.castUltimate()
      else this.game.abilities.castSlot(index)
    })
    return btn
  }

  private makeChip(label: string, icon: string, keyHint: string, onTap: () => void) {
    const b = new PlateButton(this.ui, {
      label, icon, keyHint: IS_TOUCH ? undefined : keyHint, onClick: onTap, tone: 'quiet', size: 13,
    })
    return b.setScrollFactor(0).setDepth(D.text)
  }

  /** Width of the health bar; the chips under the plate line up with its edges. */
  private get barW() { return this.W < 460 ? 118 : this.W < 900 ? 150 : 196 }
  private get medalR() { return this.W < 720 ? 20 : 22 }
  private get plateW() { return this.medalR * 2 + 16 + this.barW + 12 }

  toast(msg: string, sub = '', secs = 3.2) {
    this.toastText.setText(msg)
    this.toastSub.setText(sub)
    this.toastT = this.toastDur = secs
    this.toastRibbon.setAlpha(0)
    this.toastText.setAlpha(0)
    this.toastSub.setAlpha(0)
  }

  /** A lore stone's line on a parchment page (S14). */
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

    // ---- hero plate ----------------------------------------------------------
    const mr = this.medalR
    const plateW = this.plateW
    this.heroPanel.place(padL, padT, plateW, HERO_PLATE_H)
    const mx = padL + 8 + mr
    const my = padT + HERO_PLATE_H / 2
    this.medal.setTexture(medalTexture(this.ui, mr)).setPosition(mx, my)
    this.lvlText.setPosition(mx, my - 1).setFontSize(mr > 20 ? 21 : 19)
    const bx = mx + mr + 8
    this.hpBar.place(bx, padT + 12, this.barW, 16)
    this.hpText.setPosition(bx + this.barW / 2, padT + 20)
    this.xpBar.place(bx, padT + 34, this.barW, 8)

    this.toastText.setPosition(this.W / 2, this.H * 0.2)
    this.lowHp.setDisplaySize(this.W, this.H)
    this.statsText.setPosition(padL + 4, this.H - padB - 2)

    // Pause and army stance, side by side under the hero plate and lined up
    // with it. The bottom-right is spoken for by the hotbar and the top-right
    // by the resources, and here they are nowhere near a resting thumb.
    const chipH = wantsTouchTargets(this.W) ? 44 : 34
    // PAUSE is a short word and the stance is a long one, so the row is split
    // to suit rather than down the middle, and the labels always fit.
    const pauseW = Math.floor(plateW * 0.4)
    const chipY = padT + HERO_PLATE_H + 6
    this.pauseChip.place(padL + pauseW / 2, chipY + chipH / 2, pauseW, chipH)
    const holdW = plateW - pauseW - 6
    this.holdChip.place(padL + pauseW + 6 + holdW / 2, chipY + chipH / 2, holdW, chipH)
    this.leftStackH = chipY + chipH - padT

    // ---- ability hotbar, bottom right, thumb reachable -------------------------
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
    // room under each seal for its key name
    const keyRoom = IS_TOUCH ? 4 : 16
    const baseY = this.H - padB - ultR - keyRoom
    const dodgeY = baseY - ultR * 2 - 18
    this.game.uiBands.bottom = this.H - (dodgeY - r - 8)
    let x = right - ultR
    this.setButton(this.ultBtn, x, baseY, ultR)
    this.setButton(this.dodgeBtn, x, dodgeY, r)
    x -= ultR + gap + r
    for (const b of this.buttons) {
      this.setButton(b, x, baseY, r)
      x -= r * 2 + gap
    }

    // the tutorial line floats above the hotbar
    this.hintText.setWordWrapWidth(Math.min(560, this.W - padL - padR - 40)).setFontSize(small ? 12 : 14)
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
    b.key.setPosition(x, y + r + 3).setVisible(!IS_TOUCH)
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

    // ---- top-left: health, xp ------------------------------------------
    const hp = clamp(p.hp / p.maxHp, 0, 1)
    const shielded = p.respawnShieldT > 0
    this.hpBar.set(hp, shielded ? PAL.heroTrim : hp > 0.5 ? PAL.good : hp > 0.25 ? PAL.gold : PAL.danger)
    this.hpBar.tick(dt)
    this.hpText.setText(`${Math.ceil(Math.max(0, p.hp))} / ${Math.round(p.maxHp)}${shielded ? '  shielded' : ''}`)
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

    // ---- top-left: pause + army stance -----------------------------------
    const holding = g.army.holding
    this.holdChip.setLabel(holding ? 'Holding' : 'Following')
      .setIcon(holding ? 'ico_hold' : 'ico_follow')
      .setTone(holding ? 'primary' : 'quiet')
      .setLive(live)
    this.pauseChip.setLive(live)

    // ---- objective + phase ---------------------------------------------
    // Three panels do not fit across a phone in portrait, so below NARROW the
    // objective drops to its own full-width row under health and resources
    // instead of being drawn straight through both of them.
    const resRows = RESOURCE_ORDER.filter(t => g.res.discovered.has(t))
    const bonus = g.buildings.bonus.prod > 0
    const rowPitch = 23
    const resPanelH = 50 + resRows.length * rowPitch + (bonus ? 16 : 0)
    const resW = this.W < 720 ? 140 : 164
    // Centred between the two top columns, as wide as the gap allows. The old
    // fixed widths ran the objective straight through the health panel on any
    // window between a phone and a laptop.
    const leftEdge = padL + this.plateW + 10
    const rightEdge = this.W - padR - resW - 10
    const room = 2 * Math.min(this.W / 2 - leftEdge, rightEdge - this.W / 2)
    const narrow = room < OBJ_MIN
    const objW = narrow ? this.W - padL - padR : Math.min(340, room)
    const objX = narrow ? padL : this.W / 2 - objW / 2
    // Below NARROW the objective clears whichever top column is taller — the
    // hero plate with the two chips under it, or the resource panel.
    const objY = narrow ? padT + Math.max(this.leftStackH, resPanelH) + 6 : padT
    const objH = 78
    // tell world-space cards how much of the screen we are covering
    g.uiBands.top = objY + objH + 8

    const q = g.quests.view()
    this.objPanel.place(objX, objY, objW, objH)
    this.objTitle.setPosition(objX + objW / 2, objY + 7)
    this.objHint.setPosition(objX + objW / 2, objY + 31)
    this.objBar.place(objX + 16, objY + 51, objW - 32, 6)
    if (q) {
      this.objTitle.setText(q.title)
      this.fit(this.objTitle, 20, objW - 24)
      this.objHint.setText(`${q.hint}${q.need > 1 ? `   ${short(q.have)}/${short(q.need)}` : ''}`)
      this.fit(this.objHint, 13, objW - 24)
      this.objBar.set(q.need > 0 ? clamp(q.have / q.need, 0, 1) : 1)
    }
    this.objTitle.setVisible(!!q)
    this.objHint.setVisible(!!q)
    this.objBar.setVisible(!!q)

    const w = g.waves
    const mins = Math.floor(w.timeLeft / 60)
    const secs = Math.floor(w.timeLeft % 60)
    const clock = `${mins}:${secs.toString().padStart(2, '0')}`
    if (w.phase === 'night') {
      setColour(this.phaseText.setText(`Night ${w.wave}   ·   ${w.enemiesRemaining} ${w.marching ? 'marching' : 'left'}`), PAL.danger)
      this.phaseIcon.setTexture('ico_moon')
    } else if (w.phase === 'warning') {
      const flash = Math.sin(this.game.now * 0.02) > 0
      const shout = w.bannerText === w.bannerText.toUpperCase()
      const words = shout ? w.bannerText.charAt(0) + w.bannerText.slice(1).toLowerCase() : w.bannerText
      setColour(this.phaseText.setText(`${words}   ${Math.ceil(w.timeLeft)}`), flash ? PAL.danger : PAL.gold)
      this.phaseIcon.setTexture('ico_moon')
    } else {
      setColour(this.phaseText.setText(`Day ${w.wave + 1}   ·   night in ${clock}`), PAL.uiDim)
      this.phaseIcon.setTexture('ico_sun')
    }
    this.fit(this.phaseText, 13, objW - 48)
    const phaseY = objY + objH - 13
    const iconS = 17
    const phaseW = iconS + 6 + this.phaseText.width
    this.phaseIcon.setDisplaySize(iconS, iconS).setPosition(objX + objW / 2 - phaseW / 2 + iconS / 2, phaseY)
    this.phaseText.setPosition(objX + objW / 2 - phaseW / 2 + iconS + 6, phaseY)

    // ---- boss bar --------------------------------------------------------
    const boss = g.enemies.bossRef
    const bossUp = !!boss?.alive
    this.bossPanel.setVisible(bossUp)
    this.bossBar.setVisible(bossUp)
    this.bossText.setVisible(bossUp)
    if (boss && bossUp) {
      // the width of the objective above it, so it clears both top columns
      const bw = objW - 24
      const bx = objX + 12
      const by = objY + objH + 6
      this.bossPanel.place(bx - 12, by, bw + 24, 44)
      this.bossBar.place(bx, by + 24, bw, 12)
      this.bossBar.set(clamp(boss.hp / boss.maxHp, 0, 1))
      this.bossBar.tick(dt)
      this.bossText.setText(`${titleCase(boss.def.name)}   ${short(Math.ceil(boss.hp))}`).setPosition(objX + objW / 2, by + 12)
      this.fit(this.bossText, 17, bw)
      g.uiBands.top = by + 44 + 8
    }

    // ---- top-right: resources -------------------------------------------
    const rx = this.W - padR - resW
    this.resPanel.place(rx, padT, resW, resPanelH)
    this.popIcon.setPosition(rx + 18, padT + 17)
    setColour(this.popText.setText(`${g.popUsed}/${g.popCap}`), g.popUsed >= g.popCap ? PAL.danger : PAL.uiText)
      .setPosition(rx + 30, padT + 17)
    const carried = g.res.carriedTotal
    const full = carried >= g.res.carryCapacity
    this.flashCarry = Math.max(0, this.flashCarry - dt)
    setColour(this.carryText.setText(`${short(carried)}/${short(g.res.carryCapacity)}`), full || this.flashCarry > 0 ? PAL.danger : PAL.uiDim)
      .setPosition(rx + resW - 13, padT + 17)
    this.packIcon.setPosition(rx + resW - 17 - this.carryText.width - 10, padT + 17)
    this.packBar.place(rx + 12, padT + 30, resW - 24, 6)
    this.packBar.set(clamp(carried / g.res.carryCapacity, 0, 1), full || this.flashCarry > 0 ? PAL.danger : PAL.gold)

    let i = 0
    for (const row of this.rows) {
      const visible = g.res.discovered.has(row.type)
      row.icon.setVisible(visible)
      row.text.setVisible(visible)
      row.rate.setVisible(visible)
      if (!visible) continue
      const y = padT + 52 + i * rowPitch
      row.icon.setPosition(rx + 20, y).setDisplaySize(20, 20)
      const stored = g.res.stored[row.type]
      // a count that grows gives a small gilt jump, so income is felt, not read
      if (row.last >= 0 && stored > row.last) row.pulse = 0.3
      row.last = stored
      row.pulse = Math.max(0, row.pulse - dt)
      const held = g.res.carried[row.type]
      setColour(row.text.setPosition(rx + 36, y).setText(`${short(stored)}${held > 0 ? `  +${short(held)}` : ''}`),
        held > 0 || row.pulse > 0 ? PAL.gold : PAL.uiText)
        .setScale(1 + row.pulse * 0.35)
      // income readout: the number that makes automation feel worth buying
      const r = g.res.rate[row.type]
      row.rate.setPosition(rx + resW - 12, y + 1)
        .setText(r >= 0.05 ? `+${r >= 10 ? Math.round(r) : r.toFixed(1)}/s` : '')
      i++
    }
    this.outputText.setVisible(bonus)
    if (bonus) {
      this.outputText.setText(`Output +${Math.round(g.buildings.bonus.prod * 100)}%`)
        .setPosition(rx + resW / 2, padT + resPanelH - 13)
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
      this.drawButton(btn, ABILITY_ICON[slot.key], def.colour, slot.cd, def.cooldown, false)
      btn.key.setText(keyName(ABILITY_KEYS[b] ?? ''))
      btn.zone.setSize(live ? btn.r * 2 : 1, live ? btn.r * 2 : 1)
    }
    if (g.abilities.ultimate.unlocked) {
      const def = ABILITIES[g.abilities.ultimate.key]
      this.drawButton(this.ultBtn, ABILITY_ICON[g.abilities.ultimate.key], def.colour,
        g.abilities.ultimate.cd, def.cooldown, true)
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
      const ph = compactDeath ? 76 : 100
      const pw = Math.min(380, this.W - 32)
      const px = (this.W - pw) / 2
      const safeTop = g.uiBands.top + 8
      const safeBottom = this.H - g.uiBands.bottom - 8
      const py = safeBottom - safeTop >= ph
        ? clamp(this.H * 0.43, safeTop, safeBottom - ph)
        : (this.H - ph) / 2
      this.deathPanel.place(px, py, pw, ph)
      this.deathTitle.setFontSize(compactDeath ? 24 : 30)
        .setPosition(this.W / 2, py + (compactDeath ? 29 : 38)).setText('Hero Fallen')
      this.deathHint.setFontSize(compactDeath ? 12 : 14)
        .setPosition(this.W / 2, py + (compactDeath ? 55 : 70))
        .setText(`Returning to the hall in ${Math.max(1, Math.ceil(p.deadTimer))}`)
    }

    // ---- misc ------------------------------------------------------------
    const combo = g.fx.combo
    if (combo >= 5) {
      if (combo !== this.lastCombo) {
        this.ui.tweens.killTweensOf(this.comboText)
        this.comboText.setScale(1.25)
        this.ui.tweens.add({ targets: this.comboText, scale: 1 + Math.min(0.4, combo / 200), duration: 160, ease: 'Back.easeOut' })
      }
      // Low and central, just above the hotbar band: the middle of the screen
      // belongs to the fight and to the build card that floats over it.
      const hintUp = this.hintPanel.img.visible ? 40 : 0
      this.comboText.setVisible(true).setText(`${combo} Kill Streak`).setAlpha(0.92)
        .setPosition(this.W / 2, this.floorY() - 22 - hintUp)
    } else {
      this.comboText.setVisible(false)
    }
    this.lastCombo = combo

    // A ribbon unfurls with the news and lifts away when it is done.
    if (this.toastT > 0) {
      this.toastT -= dt
      const age = this.toastDur - this.toastT
      const a = Math.min(1, age / 0.18, this.toastT / 0.5)
      const drop = (1 - Math.min(1, age / 0.25)) * -14
      const tw = Math.min(this.W - 24, this.toastText.width + 90)
      const th = 46
      // below everything the top of the HUD is covering — the boss bar included
      const ty = Math.max(this.H * 0.2, g.uiBands.top + th / 2 + 6) + drop
      this.toastRibbon.setVisible(true).setAlpha(a).place(this.W / 2 - tw / 2, ty - th / 2, tw, th)
      this.fit(this.toastText, 22, tw - 70)
      this.toastText.setVisible(true).setAlpha(a).setPosition(this.W / 2, ty - 1)
      if (this.toastSub.text) {
        this.toastSub.setWordWrapWidth(Math.min(this.W - 32, 460), true)
        this.toastSub.setVisible(true).setAlpha(a).setPosition(this.W / 2, ty + th / 2 + 6)
      } else this.toastSub.setVisible(false)
    } else {
      this.toastRibbon.setVisible(false)
      this.toastText.setVisible(false)
      this.toastSub.setVisible(false)
    }

    if (this.loreT > 0) {
      this.loreT -= dt
      const a = Math.min(1, (POI.loreShow - this.loreT) / 0.2, this.loreT / 0.5)
      const pw = Math.min(this.W - 32, 440)
      this.loreText.setWordWrapWidth(pw - 48, true)
      const ph = Math.ceil(this.loreText.height) + 58
      const py = Math.max(this.H * 0.2 + 44, g.uiBands.top + 56)
      this.lorePanel.setVisible(true).setAlpha(a).place(this.W / 2 - pw / 2, py, pw, ph)
      this.loreTitle.setVisible(true).setAlpha(a).setPosition(this.W / 2, py + 16)
      this.loreText.setVisible(true).setAlpha(a).setPosition(this.W / 2, py + 38)
    } else if (this.loreTitle.visible) {
      this.lorePanel.setVisible(false)
      this.loreTitle.setVisible(false)
      this.loreText.setVisible(false)
    }

    if (this.hintT > 0 && !this.blocked) {
      this.hintT -= dt
      const a = Math.min(1, this.hintT, (4.5 - this.hintT) / 0.2)
      const hw = Math.ceil(this.hintText.width) + 36
      const hh = Math.ceil(this.hintText.height) + 16
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
   * A wax seal stamped with the ability's glyph. Cooling down, the wax goes
   * dull and a shadow sweeps round it with the seconds left on top; the moment
   * it is ready the seal takes its colour back and gives a small jump, so a
   * ready skill is noticed out of the corner of the eye.
   */
  private drawButton(b: AbilityBtn, icon: string, colour: number, cd: number, cooldown: number, ult: boolean) {
    const ready = cd <= 0
    const key = sealTexture(this.ui, colour, ready, Math.round(b.r), ult)
    if (b.seal.texture.key !== key) b.seal.setTexture(key)
    b.seal.setVisible(true).setPosition(b.x, b.y)
    if (b.icon.texture.key !== icon) b.icon.setTexture(icon)
    const s = b.r * 1.3
    b.icon.setVisible(true).setPosition(b.x, b.y).setAlpha(ready ? 1 : 0.5)
    if (!this.ui.tweens.isTweening(b.icon)) {
      b.icon.setDisplaySize(s, s)
      b.seal.setScale(1 / DPR)
    }
    b.key.setVisible(!IS_TOUCH)
    if (!ready) {
      const fill = clamp(1 - cd / cooldown, 0, 1)
      b.sweep.clear()
      b.sweep.fillStyle(0x0c0704, 0.55)
      b.sweep.slice(b.x, b.y, b.r - 3, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(-90 + 360 * (1 - fill)), true)
      b.sweep.fillPath()
      b.sweeping = true
      b.count.setVisible(true).setText(cd >= 10 ? `${Math.ceil(cd)}` : cd >= 1 ? `${Math.ceil(cd)}` : '')
    } else {
      if (b.sweeping) { b.sweep.clear(); b.sweeping = false }
      b.count.setVisible(false)
      if (!b.wasReady) {
        const base = b.icon.scaleX
        this.ui.tweens.add({ targets: b.seal, scale: { from: 1.18 / DPR, to: 1 / DPR }, duration: 260, ease: 'Back.easeOut' })
        this.ui.tweens.add({ targets: b.icon, scaleX: { from: base * 1.18, to: base }, scaleY: { from: base * 1.18, to: base }, duration: 260, ease: 'Back.easeOut' })
      }
    }
    b.wasReady = ready
  }

  private fit(t: Phaser.GameObjects.Text, size: number, maxW: number) {
    fitWidth(t, size, maxW)
  }
}
