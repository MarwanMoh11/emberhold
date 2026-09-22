import Phaser from 'phaser'
import { generateAllTextures } from '../art/Textures'
import { PAL, CSS } from '../config/palette'
import { MAX_SAVE_FILE_BYTES, SaveManager, type Settings } from '../systems/SaveManager'
import { GamepadInput } from '../core/GamepadInput'

const FONT = 'Verdana, Geneva, sans-serif'

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
  private selectedButton = 0
  private confirmingNew = false
  private restorePending: string | null = null
  private restoreButtonIndex = -1
  private notice = ''
  private noticeText?: Phaser.GameObjects.Text

  constructor() { super('Boot') }

  create() {
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
    const w = Math.round(this.scale.width)
    const h = Math.round(this.scale.height)
    if (w === this.lastW && h === this.lastH) return
    this.buildTitle()
  }

  private buildTitle() {
    const { width: W, height: H } = this.scale
    this.lastW = Math.round(W)
    this.lastH = Math.round(H)
    this.cameras.main.setBackgroundColor(CSS(PAL.uiBg))
    this.tweens.killAll()
    this.title?.destroy(true)
    this.titleButtons = []
    this.confirmingNew = false

    const root = this.add.container(0, 0)
    this.title = root

    // backdrop: a dim silhouette of the hold behind the title
    const bg = this.add.graphics()
    bg.fillStyle(0x0d1726, 1); bg.fillRect(0, 0, W, H)
    bg.fillStyle(0x16263a, 1)
    bg.fillEllipse(W / 2, H + 60, W * 1.6, H * 0.9)
    root.add(bg)

    const emberGlow = this.add.image(W / 2, H * 0.52, 'fx_glow_fire')
      .setBlendMode(Phaser.BlendModes.ADD).setScale(5).setAlpha(0.35)
    root.add(emberGlow)
    this.tweens.add({ targets: emberGlow, alpha: 0.5, scale: 5.6, duration: 2200, yoyo: true, repeat: -1 })

    const hall = this.add.image(W / 2, H * 0.66, 'bld_townHall_4').setScale(1.4).setTint(0x2e4258)
    const tower = this.add.image(W / 2 - 190, H * 0.68, 'bld_watchtower_4').setScale(1.1).setTint(0x243548)
    const tower2 = this.add.image(W / 2 + 190, H * 0.68, 'bld_watchtower_3').setScale(1.1).setTint(0x243548)
    root.add([tower, tower2, hall])

    const hero = this.add.image(W / 2, H * 0.72, 'hero3').setScale(2.6)
    root.add(hero)
    this.tweens.add({ targets: hero, y: H * 0.72 - 8, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    // The title block is laid out from measured heights, not fixed offsets.
    // A landscape phone is only ~390px tall, and the old hard-coded rhythm put
    // the tagline underneath the CONTINUE button there.
    const compact = H < 520
    const tiny = H < 360
    const titleSize = Math.max(34, Math.min(74, W * 0.11, H * 0.17))
    const title = this.add.text(W / 2, H * (compact ? 0.16 : 0.24), 'EMBERHOLD', {
      fontFamily: FONT, fontSize: `${titleSize}px`,
      color: CSS(PAL.gold), fontStyle: 'bold', stroke: '#1a0e06', strokeThickness: 8,
    }).setOrigin(0.5)
    const tagline = this.add.text(W / 2, title.y + titleSize * 0.72, 'Rebuild the frontier. Hold the night.', {
      fontFamily: FONT, fontSize: `${compact ? 12 : 15}px`, color: CSS(PAL.uiDim),
    }).setOrigin(0.5)
    root.add([title, tagline])
    this.tweens.add({ targets: title, scale: 1.03, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

    const existing = SaveManager.peek()
    const buttons: { label: string; sub?: string; fn: () => void; colour: number }[] = []

    if (existing) {
      buttons.push({
        label: 'CONTINUE',
        sub: `night ${existing.wave} · level ${existing.level}`,
        colour: PAL.good,
        fn: () => this.start(true),
      })
    }
    const newButtonIndex = buttons.length
    buttons.push({
      label: existing ? 'NEW GAME' : 'BEGIN',
      sub: existing ? 'wipes your settlement' : undefined,
      colour: existing ? PAL.danger : PAL.gold,
      fn: () => {
        if (existing && !this.confirmingNew) {
          this.confirmingNew = true
          this.titleButtons[newButtonIndex].setLabel('CONFIRM NEW GAME')
          this.time.delayedCall(3000, () => {
            this.confirmingNew = false
            this.titleButtons[newButtonIndex]?.setLabel('NEW GAME')
          })
          return
        }
        if (existing) SaveManager.clear()
        this.start(false)
      },
    })
    this.restoreButtonIndex = buttons.length
    buttons.push({
      label: this.restorePending ? 'CONFIRM RESTORE' : 'RESTORE FILE',
      sub: 'import a saved settlement',
      colour: PAL.heroTrim,
      fn: () => this.restoreFile(),
    })

    const btnH = tiny ? 38 : compact ? 44 : 52
    const btnW = Math.min(300, Math.max(210, W * 0.62))
    const btnStep = btnH + (tiny ? 8 : compact ? 14 : 18)
    let by = tagline.y + tagline.height / 2 + (tiny ? 12 : compact ? 20 : 32) + btnH / 2
    for (const b of buttons) {
      this.titleButtons.push(this.makeButton(root, W / 2, by, btnW, btnH, b.label, b.sub, b.colour, b.fn))
      by += btnStep
    }
    this.selectButton(Math.min(this.selectedButton, this.titleButtons.length - 1))

    const noticeY = Math.min(H - (tiny ? 68 : compact ? 55 : 70),
      by - btnStep + btnH / 2 + (tiny ? 6 : 10))
    this.noticeText = this.add.text(W / 2, noticeY, this.notice, {
      fontFamily: FONT, fontSize: `${compact ? 11 : 13}px`, color: CSS(PAL.uiText),
      align: 'center', wordWrap: { width: Math.min(W - 30, 600) },
    }).setOrigin(0.5, 0)
    root.add(this.noticeText)

    const help = this.add.text(W / 2, H - (tiny ? 10 : compact ? 18 : 26),
      tiny
        ? 'WASD / arrows move  ·  X dodge  ·  auto attack  ·  walk into build sites'
        : 'WASD / arrows or drag to move  ·  X to dodge  ·  you attack on your own  ·  walk into build sites to raise them',
      {
        fontFamily: FONT, fontSize: `${tiny ? 10 : 11}px`, color: CSS(PAL.uiDim), align: 'center',
        wordWrap: { width: Math.min(W - 24, 720) },
      },
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
    label: string, sub: string | undefined, colour: number, fn: () => void,
  ) {
    const g = this.add.graphics()
    let hover = false
    let selected = false
    const draw = () => {
      g.clear()
      g.fillStyle(hover || selected ? PAL.uiEdge : PAL.uiBg, 0.94)
      g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 10)
      g.lineStyle(2.5, colour, hover || selected ? 1 : 0.8)
      g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 10)
    }
    draw()
    const tight = h < 44
    const t = this.add.text(x, sub ? y - (tight ? 7 : 8) : y, label, {
      fontFamily: FONT, fontSize: `${tight ? 17 : 19}px`, color: CSS(PAL.uiText), fontStyle: 'bold',
    }).setOrigin(0.5)
    const s = sub
      ? this.add.text(x, y + (tight ? 10 : 13), sub, {
        fontFamily: FONT, fontSize: `${tight ? 9 : 11}px`, color: CSS(PAL.uiDim),
      }).setOrigin(0.5)
      : null
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true })
    zone.on('pointerover', () => { hover = true; draw() })
    zone.on('pointerout', () => { hover = false; draw() })
    zone.on('pointerdown', fn)
    root.add([g, t, zone])
    if (s) root.add(s)
    return {
      setSelected(v: boolean) { selected = v; draw() },
      setLabel(label: string) { t.setText(label) },
      activate: fn,
    }
  }

  private start(load: boolean) {
    this.scale.off('resize', this.onResize, this)
    this.scene.start('Game', { load, settings: this.settings })
  }
}
