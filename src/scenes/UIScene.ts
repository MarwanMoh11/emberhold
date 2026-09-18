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
import { DebugPanel } from '../ui/DebugPanel'
import { Overlay } from '../ui/Overlay'
import { PAL } from '../config/palette'
import type { GameScene } from './GameScene'

class CoreLostOverlay extends Overlay {
  private heading!: Phaser.GameObjects.Text
  private body!: Phaser.GameObjects.Text
  private btn: ReturnType<Overlay['button']>

  constructor(scene: Phaser.Scene, onRestart: () => void) {
    super(scene, 1_180_000)
    this.heading = this.text(30, PAL.danger, true)
    this.body = this.text(13, PAL.uiDim)
    this.btn = this.button('RALLY AND REBUILD', onRestart, PAL.gold)
  }

  protected layout() {
    const w = Math.min(420, this.W - 40)
    const h = 220
    const x = this.W / 2 - w / 2
    const y = this.H / 2 - h / 2
    this.drawCard(x, y, w, h, PAL.danger)
    this.heading.setText('SETTLEMENT OVERRUN').setPosition(this.W / 2, y + 60)
    this.body.setText(
      'The Command Hall has fallen, but Emberhold still stands.\nYour buildings, troops and stores are untouched.',
    ).setPosition(this.W / 2, y + 108)
    this.btn.place(this.W / 2, y + h - 52, w - 120, 42)
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
  private pendingUpgrades = 0
  private stickWasActive = false

  constructor() { super('UI') }

  create(data: { game: GameScene }) {
    this.gs = data.game
    this.hud = new HUD(this, this.gs)
    // After the HUD: the minimap lays itself out from the bands the HUD writes.
    this.minimap = new Minimap(this, this.gs)
    this.joystick = new Joystick(this)
    this.levelUp = new LevelUpOverlay(this, this.gs)
    this.pause = new PauseMenu(this, this.gs)
    this.debug = new DebugPanel(this, this.gs)
    this.coreLost = new CoreLostOverlay(this, () => this.restartWave())
    this.questLog = new QuestLog(this, this.gs)
    this.deeds = new AchievementsPanel(this, this.gs)
    this.summary = new RunSummary(this, this.gs)
    this.respec = new RespecOverlay(this, this.gs)

    const ge = this.gs.events
    ge.on('offerUpgrades', () => { this.pendingUpgrades++ })
    ge.on('togglePause', () => this.togglePause())
    ge.on('toggleDebug', () => this.toggleDebug())
    ge.on('coreLost', () => this.showCoreLost())
    this.gs.bus.on('campaign:complete', () => this.celebrateVictory())

    this.events.on('togglePause', () => this.togglePause())
    this.events.on('toggleStats', () => { this.hud.showStats = !this.hud.showStats })
    this.events.on('upgradeChosen', () => this.resumeGame())
    this.events.on('openScreen', (n: ScreenName) => this.openScreen(n))
    this.events.on('closeScreen', () => this.closeScreen())
    this.events.on('respecDone', () => this.afterRespec())

    this.input.keyboard?.on('keydown-ESC', () => this.togglePause())
    this.input.keyboard?.on('keydown-F2', () => this.toggleDebug())
    this.input.keyboard?.on('keydown-P', () => this.togglePause())

    this.hud.hint('MOVE WITH WASD  ·  YOU ATTACK AUTOMATICALLY  ·  RUN OVER COINS')
    this.time.delayedCall(9000, () => this.hud.hint('STAND ON A BUILD SITE TO POUR YOUR PACK INTO IT'))
  }

  /** The pause menu's sub-screens, which open over it and return to it. */
  private screens(): Overlay[] {
    return [this.questLog, this.deeds, this.summary, this.respec]
  }

  private anyModalOpen() {
    return this.levelUp.open || this.pause.open || this.coreLost.open
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
   * Twenty quests of tutorial and campaign used to end in a floating toast.
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
    this.gs.paused = true
    this.scene.pause('Game')
  }

  private resumeGame() {
    if (this.anyModalOpen()) return
    this.gs.paused = false
    this.scene.resume('Game')
  }

  togglePause() {
    if (this.levelUp.open || this.coreLost.open) return
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
    g.enemies.killAll()
    g.waves.skipToDay()
    g.player.respawn(hall.x, hall.y + 90)
    g.fx.ring(hall.x, hall.y, 420, PAL.gold, 0.9)
    this.coreLost.hide()
    this.resumeGame()
  }

  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000)

    // Only write while the stick is actually held, and clear once on release.
    // Zeroing every frame would make movement depend on scene update order.
    if (this.joystick.active) {
      this.gs.moveInput.x = this.joystick.value.x
      this.gs.moveInput.y = this.joystick.value.y
      this.stickWasActive = true
    } else if (this.stickWasActive) {
      this.stickWasActive = false
      this.gs.moveInput.x = 0
      this.gs.moveInput.y = 0
    }
    const modal = this.anyModalOpen()
    this.joystick.enabled = !modal
    // A modal owns the screen: the HUD's own buttons stop answering taps that
    // land beside the card rather than on it.
    this.hud.blocked = modal
    this.minimap.blocked = modal

    this.hud.update(dt)
    this.minimap.update(dt)
    this.debug.update()

    if (this.pendingUpgrades > 0 && !this.anyModalOpen()) {
      this.pendingUpgrades--
      if (this.levelUp.offer()) this.pauseGame()
    }
  }
}
