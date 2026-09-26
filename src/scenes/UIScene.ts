import Phaser from 'phaser'
import { HUD } from '../ui/HUD'
import { Minimap } from '../ui/Minimap'
import { Joystick } from '../ui/Joystick'
import { LevelUpOverlay } from '../ui/LevelUpOverlay'
import { PauseMenu, type ScreenName } from '../ui/PauseMenu'
import { QuestLog } from '../ui/QuestLog'
import { AchievementsPanel } from '../ui/AchievementsPanel'
import { RunSummary } from '../ui/RunSummary'
import { RespecOverlay } from '../ui/RespecOverlay'
import { Atlas, TravelChip } from '../ui/Atlas'
import { DebugPanel } from '../ui/DebugPanel'
import { Overlay } from '../ui/Overlay'
import { PAL } from '../config/palette'
import type { GameScene } from './GameScene'
import { GamepadInput, type PadFrame } from '../core/GamepadInput'
import { IS_TOUCH } from '../core/device'
import { cssCamera } from '../ui/theme'

class CoreLostOverlay extends Overlay {
  private marks!: Phaser.GameObjects.Graphics
  private heading!: Phaser.GameObjects.Text
  private body!: Phaser.GameObjects.Text
  private btn: ReturnType<Overlay['button']>

  constructor(scene: Phaser.Scene, onRestart: () => void) {
    super(scene, 1_180_000)
    this.marks = this.gfx()
    this.heading = this.text(34, PAL.danger, true)
    this.body = this.text(14, PAL.uiDim)
    this.body.setFontStyle('italic 500').setLineSpacing(3)
    this.btn = this.button('Rally and rebuild', onRestart, 'primary', 17)
  }

  protected layout() {
    const w = Math.min(440, this.W - 32)
    const h = 236
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    this.drawCard(x, y, w, h, PAL.wax)
    this.heading.setText('Settlement Overrun').setPosition(this.W / 2, y + 52)
    this.fitText(this.heading, 34, w - 48)
    this.marks.clear()
    this.rule(this.marks, this.W / 2, y + 82, Math.min(220, w - 80))
    this.body.setText(
      'The Command Hall has fallen. Rally the survivors,\nrepair the hall, and face this night again.',
    ).setPosition(this.W / 2, y + 122)
    this.fitText(this.body, 14, w - 44)
    this.btn.place(this.W / 2, y + h - 46, Math.min(280, w - 80), 44)
  }
}

export class UIScene extends Phaser.Scene {
  private gs!: GameScene
  private hud!: HUD
  private minimap!: Minimap
  private joystick!: Joystick
  private levelUp!: LevelUpOverlay
  private pause!: PauseMenu
  private debug!: DebugPanel
  private coreLost!: CoreLostOverlay
  private questLog!: QuestLog
  private deeds!: AchievementsPanel
  private summary!: RunSummary
  private respec!: RespecOverlay
  /** the full-screen map (S12): travel between waystones happens here */
  atlas!: Atlas
  /** the plate that offers the atlas while the hero stands on a lit stone (replaced S11's list) */
  travel!: TravelChip
  private pendingUpgrades = 0
  private stickWasActive = false
  private padWasActive = false
  private padConnected = false
  private pad = new GamepadInput()

  constructor() { super('UI') }

  create(data: { game: GameScene }) {
    cssCamera(this)
    this.gs = data.game
    this.stickWasActive = false
    this.padWasActive = false
    this.padConnected = false
    this.pad = new GamepadInput()
    // A save may have been written while a boon card or respec was pending.
    // Set this here, after UI exists, so no offer event is lost at scene launch.
    this.pendingUpgrades = Math.max(0, this.gs.player.level - 1 - this.gs.levels.pickCount)
    this.hud = new HUD(this, this.gs)
    // After the HUD: the minimap lays itself out from the bands the HUD writes.
    this.minimap = new Minimap(this, this.gs, () => this.toggleAtlas())
    this.joystick = new Joystick(this)
    this.levelUp = new LevelUpOverlay(this, this.gs)
    this.pause = new PauseMenu(this, this.gs)
    this.debug = new DebugPanel(this, this.gs)
    this.coreLost = new CoreLostOverlay(this, () => this.restartWave())
    this.questLog = new QuestLog(this, this.gs)
    this.deeds = new AchievementsPanel(this, this.gs)
    this.summary = new RunSummary(this, this.gs)
    this.respec = new RespecOverlay(this, this.gs)
    this.atlas = new Atlas(this, this.gs, this.minimap.memory, () => this.resumeGame())
    this.travel = new TravelChip(this, this.gs, () => this.openAtlas())

    const ge = this.gs.events
    ge.on('offerUpgrades', () => { this.pendingUpgrades++ })
    ge.on('togglePause', () => this.togglePause())
    ge.on('toggleDebug', () => this.toggleDebug())
    ge.on('coreLost', () => this.showCoreLost())
    this.gs.bus.on('campaign:complete', () => this.celebrateVictory())

    this.events.on('togglePause', () => this.togglePause())
    this.events.on('toggleAtlas', () => this.toggleAtlas())
    this.events.on('toggleStats', () => { this.hud.showStats = !this.hud.showStats })
    this.events.on('upgradeChosen', () => this.resumeGame())
    this.events.on('openScreen', (n: ScreenName) => this.openScreen(n))
    this.events.on('closeScreen', () => this.closeScreen())
    this.events.on('respecDone', () => this.afterRespec())

    this.input.keyboard?.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard?.on('keydown-F2', () => this.toggleDebug())
    this.input.keyboard?.on('keydown-P', () => this.togglePause())
    this.input.keyboard?.on('keydown-M', () => this.toggleAtlas())
    this.input.keyboard?.on('keydown-ENTER', () => { if (this.atlas.open) this.atlas.confirm() })
    this.input.keyboard?.on('keydown', () => this.gs.audio.unlock())

    this.hud.hint(IS_TOUCH
      ? 'Drag to move  ·  you attack on your own'
      : 'WASD to move  ·  you attack on your own')
    this.time.delayedCall(6000, () => this.hud.hint('Walk over loot, then stand on a build site to spend it'))
    if (!IS_TOUCH) this.time.delayedCall(12500, () => this.hud.hint('M map  ·  H army  ·  Esc pause'))

    const pauseWhenHidden = () => {
      if (document.hidden && !this.anyModalOpen()) this.togglePause()
    }
    document.addEventListener('visibilitychange', pauseWhenHidden)
    this.events.once('shutdown', () => document.removeEventListener('visibilitychange', pauseWhenHidden))
    if (this.gs.coreLost) this.showCoreLost()
  }

  /** The pause menu's sub-screens, which open over it and return to it. */
  private screens(): Overlay[] {
    return [this.questLog, this.deeds, this.summary, this.respec]
  }

  private anyModalOpen() {
    return this.levelUp.open || this.pause.open || this.coreLost.open || this.atlas.open
      || this.screens().some(s => s.open)
  }

  private openScreen(name: ScreenName) {
    this.pause.hide()
    for (const s of this.screens()) s.hide()
    if (name === 'quests') this.questLog.show()
    else if (name === 'deeds') this.deeds.show()
    else if (name === 'respec') this.respec.show()
    else this.summary.showSummary()
  }

  /**
   * Back out of a sub-screen. Everything opened from the pause menu goes back
   * to it; the victory card is the one that arrived on its own, so it hands the
   * game straight back instead — finishing the campaign is a milestone, and a
   * milestone that dumps you in a menu is a game over wearing a hat.
   */
  private closeScreen() {
    const wasVictory = this.summary.open && this.summary.victory
    for (const s of this.screens()) s.hide()
    if (wasVictory) this.resumeGame()
    else this.pause.show()
  }

  /**
   * The campaign used to end in a floating toast.
   * The fanfare goes off in the world first, while the game is still running,
   * and the card lands once it has played.
   */
  private celebrateVictory() {
    const g = this.gs
    g.fx.flash(PAL.gold, 0.35)
    g.fx.ring(g.player.x, g.player.y, 520, PAL.gold, 0.9)
    g.fx.coinBurst(g.player.x, g.player.y - 20, 24)
    g.audio.play('quest', 0.85)
    this.time.delayedCall(1600, () => {
      if (this.coreLost.open) return
      this.pause.hide()
      for (const s of this.screens()) s.hide()
      this.summary.showVictory()
      this.pauseGame()
      g.audio.play('levelup')
    })
  }

  /**
   * The picks were handed back as pending level-ups, so every card closes and
   * the choices start immediately rather than behind two menus.
   */
  private afterRespec() {
    for (const s of this.screens()) s.hide()
    this.pause.hide()
    if (this.pendingUpgrades <= 0) this.resumeGame()
  }

  private pauseGame() {
    this.gs.saves.save()
    this.gs.paused = true
    this.scene.pause('Game')
  }

  private resumeGame() {
    if (this.anyModalOpen()) return
    this.gs.paused = false
    this.scene.resume('Game')
  }

  /** Open the atlas over a paused game (no save: it is a look, not a stop). */
  openAtlas() {
    if (this.atlas.open || this.anyModalOpen()) return
    if (this.debug.open) this.debug.hide()
    this.atlas.show()
    this.gs.audio.play('ui')
    this.gs.paused = true
    this.scene.pause('Game')
  }

  toggleAtlas() {
    if (this.atlas.open) this.atlas.close()
    else this.openAtlas()
  }

  togglePause() {
    if (this.levelUp.open || this.coreLost.open) return
    // ESC, P or Start over the atlas folds the map away first
    if (this.atlas.open) { this.atlas.close(); return }
    // ESC out of a sub-screen backs up one step rather than resuming the fight
    // with a card still on the glass.
    if (this.screens().some(s => s.open)) { this.closeScreen(); return }
    if (this.pause.open) {
      this.pause.hide()
      this.resumeGame()
    } else {
      this.pause.show()
      this.pauseGame()
      this.gs.audio.play('ui')
    }
  }

  toggleDebug() {
    if (this.anyModalOpen()) return
    this.debug.toggle()
    this.gs.audio.play('ui')
  }

  private showCoreLost() {
    this.coreLost.show()
    this.pauseGame()
  }

  private restartWave() {
    const g = this.gs
    const hall = g.buildings.townHall
    if (hall.level === 0) {
      hall.completeLevel()
    }
    hall.hp = hall.maxHp * 0.6
    hall.alive = true
    hall.applyTexture()
    const regent = g.enemies.list.find(e => e.active && e.alive && e.key === 'cinderRegent')
    if (regent) g.quests.finalBossHp = regent.hp
    g.enemies.clearWalkers()
    g.waves.recoverSettlement()
    g.coreLost = false
    g.player.respawn(hall.x, hall.y + 90)
    g.fx.ring(hall.x, hall.y, 420, PAL.gold, 0.9)
    this.coreLost.hide()
    this.resumeGame()
    g.resumeFinalBoss()
    g.saves.save()
  }

  private handleGamepad(pad: PadFrame) {
    if (pad.connected && !this.padConnected) {
      this.hud.hint('Controller ready  ·  left stick moves  ·  RB dodges  ·  Start pauses')
    }
    this.padConnected = pad.connected
    const b = pad.pressed
    if (b.size > 0) this.gs.audio.unlock()
    if (b.has(9)) { this.togglePause(); return }
    if (this.coreLost.open) {
      if (b.has(0)) this.restartWave()
      return
    }
    if (this.levelUp.open) {
      if (b.has(0)) this.levelUp.choose(0)
      else if (b.has(1)) this.levelUp.choose(1)
      else if (b.has(2)) this.levelUp.choose(2)
      return
    }
    if (this.screens().some(s => s.open)) {
      if (b.has(1)) this.closeScreen()
      return
    }
    if (this.atlas.open) {
      // B or Back folds it; the d-pad walks the lit stones; A travels
      if (b.has(1) || b.has(8)) this.atlas.close()
      else if (b.has(0)) this.atlas.confirm()
      else if (b.has(12) || b.has(14)) this.atlas.cycle(-1)
      else if (b.has(13) || b.has(15)) this.atlas.cycle(1)
      return
    }
    if (this.pause.open) {
      if (b.has(12)) this.pause.navigate('up')
      if (b.has(13)) this.pause.navigate('down')
      if (b.has(14)) this.pause.navigate('left')
      if (b.has(15)) this.pause.navigate('right')
      if (b.has(0)) this.pause.activateFocused()
      else if (b.has(1)) this.togglePause()
      return
    }
    for (let i = 0; i < 5; i++) if (b.has(i)) this.gs.abilities.castSlot(i)
    if (b.has(5)) this.gs.player.dodge(pad.x, pad.y)
    if (b.has(7)) this.gs.abilities.castUltimate()
    if (b.has(8)) this.openAtlas()
    if (b.has(10)) this.gs.toggleHold()
  }

  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000)

    const pad = this.pad.read()
    this.handleGamepad(pad)
    const modal = this.anyModalOpen()
    if (modal && this.debug.open) this.debug.hide()

    // Only write while the stick is actually held, and clear once on release.
    // Zeroing every frame would make movement depend on scene update order.
    if (this.joystick.active && !modal) {
      this.gs.moveInput.x = this.joystick.value.x
      this.gs.moveInput.y = this.joystick.value.y
      this.stickWasActive = true
      this.padWasActive = false
    } else if (pad.connected && !modal && Math.hypot(pad.x, pad.y) > 0.08) {
      this.gs.moveInput.x = pad.x
      this.gs.moveInput.y = pad.y
      this.padWasActive = true
      this.stickWasActive = false
    } else if (this.stickWasActive || this.padWasActive) {
      this.stickWasActive = false
      this.padWasActive = false
      this.gs.moveInput.x = 0
      this.gs.moveInput.y = 0
    }
    this.joystick.enabled = !modal
    // A modal owns the screen: the HUD's own buttons stop answering taps that
    // land beside the card rather than on it.
    this.hud.blocked = modal
    this.minimap.blocked = modal

    this.hud.update(dt)
    this.minimap.update(dt)
    this.atlas.update(dt)
    this.travel.update(modal)
    this.debug.update()

    if (this.pendingUpgrades > 0 && !this.anyModalOpen()) {
      this.pendingUpgrades--
      if (this.levelUp.offer()) this.pauseGame()
    }
  }
}
