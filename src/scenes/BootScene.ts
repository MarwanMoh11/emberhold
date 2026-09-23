import Phaser from 'phaser'
import { generateAllTextures } from '../art/Textures'
import { PAL, CSS } from '../config/palette'
import { MAX_SAVE_FILE_BYTES, SaveManager, type Settings } from '../systems/SaveManager'
import { GamepadInput } from '../core/GamepadInput'
import { IS_TOUCH } from '../core/device'
import { cssCamera, screen, textStyle } from '../ui/theme'
import { giltHeading, PlateButton, type Tone } from '../ui/skin'
import { DUSK, paintTitleBackdrop } from '../ui/titleArt'

/**
 * Drop the HTML splash once there is a real frame behind it. Baking a few
 * hundred textures takes a beat on a phone, and an unexplained black screen
 * reads as a broken link.
 */
function dismissSplash() {
  const el = document.getElementById('boot')
  if (!el) return
  // A slow boot can trip the watchdog in main.ts and put the failure message
  // up moments before the title lands. Getting here is the proof it was wrong.
  el.classList.remove('failed')
  el.classList.add('gone')
  setTimeout(() => el.remove(), 400)
}


/**
 * Builds every texture procedurally, then shows the title. Nothing is fetched
 * over the network, so the game is playable the instant the page loads.
 */
export class BootScene extends Phaser.Scene {
  private settings!: Settings
  private title?: Phaser.GameObjects.Container
  private lastW = 0
  private lastH = 0
  private pad = new GamepadInput()
  private titleButtons: { setSelected(v: boolean): void; setLabel(s: string): void; activate(): void }[] = []
  private plates: PlateButton[] = []
  private selectedButton = 0
  private confirmingNew = false
  private restorePending: string | null = null
  private restoreButtonIndex = -1
  private notice = ''
  private noticeText?: Phaser.GameObjects.Text

  constructor() { super('Boot') }

  create() {
    cssCamera(this)
    this.settings = SaveManager.loadSettings()
    generateAllTextures(this)
    this.buildTitle()
    dismissSplash()
    // Rebuild the title layout on resize. Deliberately NOT scene.restart():
    // restarting re-queues the input list every frame the scale manager
    // refreshes, which leaves every button permanently unclickable.
    this.scale.on('resize', this.onResize, this)
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this))
    this.input.keyboard?.on('keydown-UP', () => this.selectButton(this.selectedButton - 1))
    this.input.keyboard?.on('keydown-DOWN', () => this.selectButton(this.selectedButton + 1))
    this.input.keyboard?.on('keydown-ENTER', () => this.titleButtons[this.selectedButton]?.activate())
  }

  update() {
    const pad = this.pad.read()
    if (pad.pressed.has(12)) this.selectButton(this.selectedButton - 1)
    if (pad.pressed.has(13)) this.selectButton(this.selectedButton + 1)
    if (pad.pressed.has(0) || pad.pressed.has(9)) this.titleButtons[this.selectedButton]?.activate()
  }

  private selectButton(index: number) {
    this.selectedButton = Math.max(0, Math.min(this.titleButtons.length - 1, index))
    this.titleButtons.forEach((b, i) => b.setSelected(i === this.selectedButton))
  }

  private onResize() {
    const w = Math.round(screen(this).w)
    const h = Math.round(screen(this).h)
    if (w === this.lastW && h === this.lastH) return
    this.buildTitle()
  }

  private buildTitle() {
    const { w: W, h: H } = screen(this)
    this.lastW = Math.round(W)
    this.lastH = Math.round(H)
    this.cameras.main.setBackgroundColor(CSS(DUSK.zenith))
    this.tweens.killAll()
    for (const p of this.plates) p.destroy()
    this.plates = []
    this.title?.destroy(true)
    this.titleButtons = []
    this.confirmingNew = false

    const root = this.add.container(0, 0)
    this.title = root

    // ---- the frontier at dusk -------------------------------------------------
    const back = paintTitleBackdrop(this, W, H)
    root.add(this.add.image(0, 0, back.key).setOrigin(0, 0).setScale(back.scale))

    // The hold stands on the mound as a silhouette against the ember sky, lit
    // from inside. Tinted to the near ground so it belongs to the painting.
    const groundY = H * 0.86
    // scaled by the shorter of height and a width allowance, so a phone held
    // upright gets a keep that fits across it rather than one twice its width
    const s = Math.min(1.5, Math.max(0.7, Math.min(H, W * 1.25) / 560))
    const emberGlow = this.add.image(W / 2, groundY - 70 * s, 'fx_glow_fire')
      .setBlendMode(Phaser.BlendModes.ADD).setScale(5.5 * s).setAlpha(0.3)
    root.add(emberGlow)
    this.tweens.add({ targets: emberGlow, alpha: 0.45, scale: 6.2 * s, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    const shade = 0x2a1c20
    const tower = this.add.image(W / 2 - 190 * s, groundY + 6 * s, 'bld_watchtower_4').setOrigin(0.5, 0.92).setScale(1.05 * s).setTint(shade)
    const tower2 = this.add.image(W / 2 + 190 * s, groundY + 6 * s, 'bld_watchtower_3').setOrigin(0.5, 0.92).setScale(1.05 * s).setTint(shade)
    const hall = this.add.image(W / 2, groundY - 4 * s, 'bld_townHall_4').setOrigin(0.5, 0.9).setScale(1.3 * s).setTint(0x33222a)
    root.add([tower, tower2, hall])
    // windows: a warm wash over the hall's lower half, breathing like a hearth
    const hearth = this.add.image(W / 2, groundY - 40 * s, 'fx_glow_fire').setBlendMode(Phaser.BlendModes.ADD)
      .setScale(2.4 * s, 1.2 * s).setAlpha(0.5)
    root.add(hearth)
    this.tweens.add({ targets: hearth, alpha: 0.7, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    const hero = this.add.image(W / 2, groundY + 18 * s, 'hero3').setOrigin(0.5, 0.95).setScale(2.2 * s)
    root.add(hero)
    this.tweens.add({ targets: hero, y: hero.y - 5 * s, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    // embers drifting up off the hold
    const embers = this.add.particles(0, 0, 'fx_dot', {
      x: { min: W / 2 - 260 * s, max: W / 2 + 260 * s },
      y: { min: groundY - 60 * s, max: groundY + 10 },
      lifespan: { min: 2600, max: 5200 },
      speedY: { min: -46, max: -18 },
      speedX: { min: -14, max: 14 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xff9840, 0xffc86a, 0xff6a2e],
      blendMode: 'ADD',
      frequency: 140,
      quantity: 1,
    })
    embers.fastForward(4000)
    root.add(embers)

    // ---- the title ------------------------------------------------------------
    // The title block is laid out from measured heights, not fixed offsets.
    // A landscape phone is only ~390px tall, and the old hard-coded rhythm put
    // the tagline underneath the CONTINUE button there.
    const compact = H < 520
    const tiny = H < 360
    const titleSize = Math.round(Math.max(40, Math.min(96, W * 0.13, H * 0.19)))
    const glowPad = Math.round(titleSize / 4)
    const title = this.add.text(W / 2, H * (compact ? 0.15 : 0.2), 'Emberhold', {
      ...textStyle({ voice: 'display', size: titleSize, weight: '800', stroke: Math.round(titleSize / 11) }),
      // room for the glow, or the text's own canvas clips it into a box
      padding: { x: glowPad, y: glowPad },
    }).setOrigin(0.5)
    title.setShadow(0, Math.round(titleSize / 16), 'rgba(255,120,40,0.45)', Math.round(titleSize / 5), true, true)
    giltHeading(title, 0xa0621a, 0xfff0b0)
    const tagline = this.add.text(W / 2, title.y + titleSize * 0.62, 'Rebuild the frontier. Hold the night.',
      textStyle({ size: compact ? 14 : 17, weight: 'italic 500', colour: 0xe9d6b2, shadow: true }))
      .setOrigin(0.5)
    // a gilt rule with a lozenge under the tagline
    const rule = this.add.graphics()
    const ry = tagline.y + tagline.height / 2 + (compact ? 7 : 11)
    const rw = Math.min(260, W * 0.5)
    rule.lineStyle(1, PAL.gilt, 0.7)
    rule.lineBetween(W / 2 - rw / 2, ry, W / 2 - 8, ry)
    rule.lineBetween(W / 2 + 8, ry, W / 2 + rw / 2, ry)
    rule.fillStyle(PAL.gilt, 1)
    rule.fillPoints([{ x: W / 2, y: ry - 4 }, { x: W / 2 + 4, y: ry }, { x: W / 2, y: ry + 4 }, { x: W / 2 - 4, y: ry }], true)
    root.add([title, tagline, rule])
    title.setAlpha(0).setY(title.y - 10)
    this.tweens.add({ targets: title, alpha: 1, y: title.y + 10, duration: 900, ease: 'Sine.easeOut' })

    const existing = SaveManager.peek()
    const buttons: { label: string; sub?: string; fn: () => void; tone: Tone }[] = []

    if (existing) {
      buttons.push({
        label: 'Continue',
        sub: `Night ${existing.wave}  ·  level ${existing.level}`,
        tone: 'primary',
        fn: () => this.start(true),
      })
    }
    const newButtonIndex = buttons.length
    buttons.push({
      label: existing ? 'New game' : 'Begin',
      sub: existing ? 'Wipes your settlement' : undefined,
      tone: existing ? 'plain' : 'primary',
      fn: () => {
        if (existing && !this.confirmingNew) {
          this.confirmingNew = true
          this.titleButtons[newButtonIndex].setLabel('Confirm new game')
          this.time.delayedCall(3000, () => {
            this.confirmingNew = false
            this.titleButtons[newButtonIndex]?.setLabel('New game')
          })
          return
        }
        if (existing) SaveManager.clear()
        this.start(false)
      },
    })
    this.restoreButtonIndex = buttons.length
    buttons.push({
      label: this.restorePending ? 'Confirm restore' : 'Restore file',
      sub: 'Import a saved settlement',
      tone: 'quiet',
      fn: () => this.restoreFile(),
    })

    const btnH = tiny ? 40 : compact ? 46 : 56
    const btnW = Math.min(300, Math.max(220, W * 0.62))
    const btnStep = btnH + (tiny ? 8 : compact ? 12 : 16)
    let by = ry + (tiny ? 14 : compact ? 22 : 34) + btnH / 2
    for (const b of buttons) {
      this.titleButtons.push(this.makeButton(root, W / 2, by, btnW, btnH, b.label, b.sub, b.tone, b.fn))
      by += btnStep
    }
    this.selectButton(Math.min(this.selectedButton, this.titleButtons.length - 1))

    // Fit the hold into the ground left below the buttons, so the plates never
    // sit on top of it: a landscape phone gets a smaller keep, not a hidden one.
    const below = groundY - (by - btnStep + btnH / 2) - 14
    const fit = (img: Phaser.GameObjects.Image, want: number) => {
      const tall = img.height * img.originY
      img.setScale(Math.max(0.5 * s, Math.min(want, below / tall)))
    }
    fit(hall, 1.3 * s)
    fit(tower, 1.05 * s)
    fit(tower2, 1.05 * s)
    const spread = Math.min(W / 2 - tower.displayWidth * 0.3, Math.max(150 * s, hall.displayWidth * 0.62 + 50 * s))
    tower.x = W / 2 - spread
    tower2.x = W / 2 + spread
    // the hero keeps watch beside the gate rather than in front of it, and
    // stands a little over half the keep's height
    hero.setScale(Math.max(1.2 * s, Math.min(2.2 * s, (hall.displayHeight * 0.62) / hero.height)))
    hero.x = W / 2 - Math.max(40, hall.displayWidth * 0.42)

    const noticeY = Math.min(H - (tiny ? 68 : compact ? 55 : 70),
      by - btnStep + btnH / 2 + (tiny ? 6 : 10))
    this.noticeText = this.add.text(W / 2, noticeY, this.notice, textStyle({
      voice: 'caps', size: compact ? 12 : 14, weight: '800', colour: PAL.bone, stroke: 4,
      align: 'center', wrap: Math.min(W - 30, 600),
    })).setOrigin(0.5, 0)
    root.add(this.noticeText)

    const help = this.add.text(W / 2, H - (tiny ? 10 : compact ? 16 : 24),
      IS_TOUCH
        ? 'Drag to move  ·  you attack on your own  ·  walk into build sites to raise them'
        : tiny
          ? 'WASD move  ·  X dodge  ·  auto attack  ·  walk into build sites'
          : 'WASD or arrows to move  ·  X to dodge  ·  you attack on your own  ·  walk into build sites to raise them',
      textStyle({
        voice: 'caps', size: tiny ? 11 : 12, weight: '700', colour: 0xc9b48e, stroke: 3,
        align: 'center', wrap: Math.min(W - 24, 760),
      }),
    ).setOrigin(0.5, tiny ? 1 : compact ? 0.9 : 0.5)
    root.add(help)
  }

  private showNotice(message: string) {
    this.notice = message
    this.noticeText?.setText(message)
  }

  private restoreFile() {
    if (this.restorePending) {
      const info = SaveManager.inspectImport(this.restorePending)
      if (!info || !SaveManager.importText(this.restorePending)) {
        this.showNotice('RESTORE FAILED · Your current progress is still here.')
        return
      }
      this.restorePending = null
      this.selectedButton = 0
      this.notice = `RESTORED · NIGHT ${info.wave} · LEVEL ${info.level}`
      this.buildTitle()
      return
    }

    const chooser = document.createElement('input')
    chooser.type = 'file'
    chooser.accept = '.json,application/json'
    chooser.style.display = 'none'
    document.body.appendChild(chooser)
    chooser.addEventListener('cancel', () => chooser.remove(), { once: true })
    chooser.addEventListener('change', async () => {
      const file = chooser.files?.[0]
      chooser.remove()
      if (!file || !this.title?.active) return
      if (file.size > MAX_SAVE_FILE_BYTES) {
        this.showNotice('SAVE FILE TOO LARGE · Your current progress is still here.')
        return
      }
      try {
        const text = await file.text()
        if (!this.title?.active) return
        const info = SaveManager.inspectImport(text)
        if (!info) {
          this.showNotice('SAVE FILE INVALID · Your current progress is still here.')
          return
        }
        const current = SaveManager.peek()
        this.restorePending = text
        this.showNotice(current
          ? `REPLACE NIGHT ${current.wave} · LEVEL ${current.level} WITH NIGHT ${info.wave} · LEVEL ${info.level}?`
          : `RESTORE NIGHT ${info.wave} · LEVEL ${info.level}?`)
        this.titleButtons[this.restoreButtonIndex]?.setLabel('CONFIRM RESTORE')
        this.time.delayedCall(12000, () => {
          if (this.restorePending !== text) return
          this.restorePending = null
          this.titleButtons[this.restoreButtonIndex]?.setLabel('RESTORE FILE')
          this.showNotice('RESTORE CANCELLED · Choose the file again to retry.')
        })
      } catch {
        this.showNotice('COULD NOT READ SAVE FILE · Your current progress is still here.')
      }
    }, { once: true })
    chooser.click()
  }

  private makeButton(
    root: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number,
    label: string, sub: string | undefined, tone: Tone, fn: () => void,
  ) {
    const b = new PlateButton(this, { label, sub, tone, onClick: fn, size: h < 44 ? 16 : 19 })
    this.plates.push(b)
    const box = this.add.container(0, 0, b.objects())
    root.add(box)
    b.place(x, y, w, h)
    // they rise in after the title
    box.setAlpha(0).setY(8)
    this.tweens.add({ targets: box, alpha: 1, y: 0, duration: 420, delay: 300 + this.titleButtons.length * 90, ease: 'Sine.easeOut' })
    return {
      setSelected(v: boolean) { b.setSelected(v) },
      setLabel(s: string) { b.setLabel(s) },
      activate: fn,
    }
  }

  private start(load: boolean) {
    this.scale.off('resize', this.onResize, this)
    this.scene.start('Game', { load, settings: this.settings })
  }
}
