import Phaser from 'phaser'
import { WORLD, CAMERA, PLAYER, PICKUP } from '../config/balance'
import { PAL } from '../config/palette'
import { ZONES } from '../config/map'
import { ABILITY_KEYS } from '../config/abilities'
import { clamp, dist, rr, short, srand } from '../core/math'
import { Bus } from '../core/Events'
import { Grid } from '../core/Grid'
import { RESOURCE_ORDER, type Targetable } from '../core/types'
import { paintTerrainRect } from '../world/Terrain'
import { TerrainChunks } from '../world/TerrainChunks'
import { Culler } from '../systems/Culler'

import { Player } from '../entities/Player'
import { ResourceManager } from '../systems/ResourceManager'
import { EffectsManager } from '../systems/EffectsManager'
import { AudioManager } from '../systems/AudioManager'
import { CombatSystem } from '../systems/CombatSystem'
import { EnemyManager } from '../systems/EnemyManager'
import { ProjectileManager } from '../systems/ProjectileManager'
import { PickupManager } from '../systems/PickupManager'
import { NodeManager } from '../systems/NodeManager'
import { BuildingManager } from '../systems/BuildingManager'
import { ArmyManager } from '../systems/ArmyManager'
import { WorkerManager } from '../systems/WorkerManager'
import { WaveManager } from '../systems/WaveManager'
import { ZoneManager } from '../systems/ZoneManager'
import { CampManager } from '../systems/CampManager'
import { AbilitySystem } from '../systems/AbilitySystem'
import { LevelSystem } from '../systems/LevelSystem'
import { QuestManager } from '../systems/QuestManager'
import { SaveManager, type Settings } from '../systems/SaveManager'
import { LightingManager } from '../systems/LightingManager'
import { DPR } from '../core/device'

export const DEPTH = {
  terrain: -100_000,
  zone: 480_000,
  fog: 500_000,
  /** the lightmap: everything below is lit, everything above is read */
  light: 740_000,
  labels: 780_000,
  bars: 760_000,
  fx: 800_000,
  night: 850_000,
  panel: 900_000,
}

export interface InputVector { x: number; y: number }

export class GameScene extends Phaser.Scene {
  bus!: Bus
  audio!: AudioManager
  terrain!: TerrainChunks
  /** Hides static world objects far outside the view; see Culler. */
  culler!: Culler
  fx!: EffectsManager
  res!: ResourceManager
  combat!: CombatSystem
  enemies!: EnemyManager
  projectiles!: ProjectileManager
  pickups!: PickupManager
  nodes!: NodeManager
  buildings!: BuildingManager
  army!: ArmyManager
  workers!: WorkerManager
  waves!: WaveManager
  zones!: ZoneManager
  camps!: CampManager
  abilities!: AbilitySystem
  levels!: LevelSystem
  quests!: QuestManager
  saves!: SaveManager
  lighting!: LightingManager

  player!: Player
  allyGrid = new Grid<Targetable>(72)
  now = 0
  paused = false
  coreLost = false
  settings!: Settings

  /** analogue move vector, written by the HUD joystick or the keyboard */
  moveInput: InputVector = { x: 0, y: 0 }

  /**
   * Screen-space strips the fixed HUD is currently covering, in CSS pixels.
   * The HUD writes them each frame and world-space cards (build sites, zone
   * banners) keep out of them, which is what stops the portrait layout from
   * stacking three panels on the same pixels.
   */
  uiBands = { top: 104, bottom: 104 }
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private objectiveArrow!: Phaser.GameObjects.Image
  private edgeMarkers: Phaser.GameObjects.Image[] = []
  private zoomTarget = CAMERA.baseZoom
  private harvestCd = 0
  private levelUpQueued = 0
  private finalBossPending = false
  private simTimes = new Float32Array(120)
  private frameTimes = new Float32Array(120)
  private perfCursor = 0
  private perfCount = 0
  private perfRefresh = 0
  private simP95 = 0
  private frameP95 = 0

  constructor() { super('Game') }

  create(data: { load?: boolean; settings: Settings }) {
    this.paused = false
    this.coreLost = false
    this.finalBossPending = false
    this.levelUpQueued = 0
    this.edgeMarkers.length = 0
    this.moveInput = { x: 0, y: 0 }
    this.perfCursor = this.perfCount = this.perfRefresh = 0
    this.simP95 = this.frameP95 = 0
    srand(Date.now() & 0xffff)
    this.settings = data.settings
    this.bus = new Bus()
    this.audio = new AudioManager()
    this.audio.unlock()
    this.applySettings(this.settings)

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height)
    this.physics?.world?.setBounds(0, 0, WORLD.width, WORLD.height)

    this.terrain = new TerrainChunks(this, paintTerrainRect, { width: WORLD.width, height: WORLD.height, depth: DEPTH.terrain })
    this.culler = new Culler()

    this.fx = new EffectsManager(this, DEPTH.fx)
    this.fx.quality = this.settings.quality
    this.fx.showDamage = this.settings.showDamage
    this.fx.reducedMotion = this.settings.reducedMotion
    this.res = new ResourceManager(this.bus)
    this.combat = new CombatSystem(this)
    this.nodes = new NodeManager(this)
    this.enemies = new EnemyManager(this, DEPTH.bars)
    this.projectiles = new ProjectileManager(this)
    this.pickups = new PickupManager(this)
    this.buildings = new BuildingManager(this)
    this.army = new ArmyManager(this)
    this.workers = new WorkerManager(this)
    this.zones = new ZoneManager(this, DEPTH.fog)
    this.camps = new CampManager(this)
    this.waves = new WaveManager(this)
    this.levels = new LevelSystem(this)
    this.quests = new QuestManager(this)
    this.saves = new SaveManager(this)
    this.lighting = new LightingManager(this, DEPTH.light)
    this.lighting.quality = this.settings.quality
    this.fx.lights = this.lighting
    this.bus.on('camp:destroyed', ({ id }) => {
      if (id === 'campAshgate') this.scheduleFinalBoss()
    })

    this.nodes.build()
    this.buildings.build()
    this.camps.build()

    this.player = new Player(this)
    this.abilities = new AbilitySystem(this)

    this.objectiveArrow = this.add.image(0, 0, 'fx_objective').setDepth(DEPTH.bars + 1).setVisible(false)
    for (let i = 0; i < 10; i++) {
      this.edgeMarkers.push(
        this.add.image(0, 0, 'fx_marker').setScrollFactor(0).setDepth(DEPTH.night + 1).setVisible(false),
      )
    }

    this.setupInput()

    const cam = this.cameras.main
    cam.startFollow(this.player.container, true, CAMERA.lerp, CAMERA.lerp)
    // Zoom is in device pixels per world unit: the canvas is DPR times the
    // CSS size, so the world zooms by the same factor to look the same size.
    cam.setZoom(CAMERA.baseZoom * DPR)

    if (data.load) {
      const ok = this.saves.load()
      if (!ok) this.seedNewGame()
      else this.grantIdleEarnings(this.saves.awaySeconds)
    } else {
      this.seedNewGame()
    }

    this.player.container.setPosition(this.player.x, this.player.y)
    cam.centerOn(this.player.x, this.player.y)
    // everything on screen at spawn is baked before the first frame; the rest streams in
    this.terrain.prime(cam)
    this.zones.update(0)
    if (this.camps.camps.some(c => c.spec.id === 'campAshgate' && c.destroyed)) {
      this.scheduleFinalBoss()
    }

    this.scene.launch('UI', { game: this })
    const saveWhenHidden = () => this.saves.save()
    window.addEventListener('pagehide', saveWhenHidden)
    const saveOnVisibility = () => { if (document.hidden) saveWhenHidden() }
    document.addEventListener('visibilitychange', saveOnVisibility)
    this.events.on('shutdown', () => {
      window.removeEventListener('pagehide', saveWhenHidden)
      document.removeEventListener('visibilitychange', saveOnVisibility)
      this.bus.destroy()
    })
  }

  /** The opening 15 seconds should never be empty: coins and a fight nearby. */
  private seedNewGame() {
    this.res.stored.coins = 0
    const cx = WORLD.centerX, cy = WORLD.centerY
    for (let i = 0; i < 26; i++) {
      const a = rr(0, Math.PI * 2)
      const r = rr(90, 300)
      this.pickups.drop('coins', 5, cx + Math.cos(a) * r, cy + Math.sin(a) * r + 90)
    }
    for (let i = 0; i < 5; i++) {
      this.pickups.drop('wood', 5, cx + rr(-220, 220), cy + rr(-260, -120))
    }
    for (let i = 0; i < 6; i++) {
      const a = rr(0, Math.PI * 2)
      this.enemies.spawn('grunt', cx + Math.cos(a) * rr(380, 520), cy + Math.sin(a) * rr(380, 520))
    }
    this.fx.popup(cx, cy - 150, 'EMBERHOLD', PAL.gold, 34)
  }

  /** Ashgate's ruler remains in the world until defeated, including after reload. */
  private scheduleFinalBoss() {
    if (this.finalBossPending || this.quests.finalBossDefeated) return
    if (this.enemies.list.some(e => e.active && e.alive && e.key === 'cinderRegent')) return
    this.finalBossPending = true
    this.time.delayedCall(1600, () => {
      this.finalBossPending = false
      if (this.quests.finalBossDefeated) return
      // The HUD has one boss bar. Let a night boss finish before the finale enters.
      if (this.paused || (this.enemies.bossRef?.alive && this.enemies.bossRef.key !== 'cinderRegent')) {
        this.scheduleFinalBoss()
        return
      }
      const fortress = this.camps.camps.find(c => c.spec.id === 'campAshgate')
      if (!fortress?.destroyed) return
      const e = this.enemies.spawn('cinderRegent', fortress.spec.x, fortress.spec.y - 70)
      if (!e) { this.scheduleFinalBoss(); return }
      if (this.quests.finalBossHp > 0) e.hp = Math.min(e.maxHp, this.quests.finalBossHp)
      this.fx.ring(e.x, e.y, 320, PAL.danger, 1.1)
      this.fx.flash(0xff5b2d, 0.25)
      this.fx.popup(e.x, e.y - 170, 'THE CINDER REGENT RISES', PAL.danger, 28)
      this.audio.play('bossRoar', 0.9)
    })
  }

  /** The Ashgate fight is independent of the nightly wave and survives a loss. */
  resumeFinalBoss() {
    if (this.camps.camps.some(c => c.spec.id === 'campAshgate' && c.destroyed)) {
      this.scheduleFinalBoss()
    }
  }

  applySettings(s: Settings) {
    this.settings = s
    this.audio.volume = s.master
    this.audio.sfxVolume = s.sfx
    this.audio.musicVolume = s.music
    this.audio.muted = s.muted
    this.audio.applyVolumes()
    if (this.lighting) this.lighting.quality = s.quality
    if (this.fx) {
      this.fx.quality = s.quality
      this.fx.showDamage = s.showDamage
      this.fx.reducedMotion = s.reducedMotion
    }
    SaveManager.saveSettings(s)
  }

  // ---- input -----------------------------------------------------------
  private setupInput() {
    const kb = this.input.keyboard
    if (!kb) return
    this.keys = kb.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,Q,E,R,F,G,H,X,ONE,TWO,THREE,FOUR,SHIFT',
    ) as Record<string, Phaser.Input.Keyboard.Key>

    // One binding per hotbar slot, straight off the config, so a slot can never
    // exist without a key again.
    ABILITY_KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.abilities.castSlot(i)))
    kb.on('keydown-R', () => this.abilities.castUltimate())
    kb.on('keydown-H', () => this.toggleHold())
    kb.on('keydown-X', () => this.tryDodge())
    kb.on('keydown', () => this.audio.unlock())
    // UI owns pause and debug hotkeys. Registering them in both active scenes
    // toggles twice on a single press, so the pause menu never opens in play.

    this.input.on('pointerdown', () => this.audio.unlock())
  }

  toggleHold() {
    this.army.holding = !this.army.holding
    this.fx.popup(this.player.x, this.player.y - 70,
      this.army.holding ? 'ARMY HOLDS THE HOLD' : 'ARMY FOLLOWS YOU',
      this.army.holding ? PAL.heroTrim : PAL.gold, 18)
    this.audio.play('ui')
  }

  tryDodge() {
    const kb = this.readKeyboard()
    const moving = this.moveInput.x !== 0 || this.moveInput.y !== 0
    this.player.dodge(moving ? this.moveInput.x : kb.x, moving ? this.moveInput.y : kb.y)
  }

  private readKeyboard(): InputVector {
    if (!this.keys) return { x: 0, y: 0 }
    let x = 0, y = 0
    if (this.keys.A?.isDown || this.keys.LEFT?.isDown) x -= 1
    if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) x += 1
    if (this.keys.W?.isDown || this.keys.UP?.isDown) y -= 1
    if (this.keys.S?.isDown || this.keys.DOWN?.isDown) y += 1
    return { x, y }
  }

  // ---- hooks used by systems -------------------------------------------
  get popUsed() { return this.army.popUsed + this.workers.popUsed }
  get popCap() { return this.buildings.bonus.pop }

  applyBuildingBonuses() {
    if (!this.player) return
    // storage / carry caps live on the resource manager; damage bonuses are read
    // live at attack time, so this only needs to re-sync derived hero numbers.
    this.player.syncStats()
  }

  onLevelUp(level: number) {
    this.levelUpQueued++
    this.abilities.refreshUnlocks()
    this.fx.popup(this.player.x, this.player.y - 96, `LEVEL ${level}`, PAL.gold, 30)
    this.fx.ring(this.player.x, this.player.y, 220, PAL.gold, 0.6)
    this.audio.play('levelup')
    this.player.heal(this.player.maxHp * 0.15)
  }

  onCoreLost() {
    this.coreLost = true
    this.fx.flash(0x8a1020, 0.5)
    this.fx.popup(this.player.x, this.player.y - 130, 'SETTLEMENT OVERRUN', PAL.danger, 32)
    this.events.emit('coreLost')
  }

  openChest(x: number, y: number) {
    const tier = 1 + this.waves.wave * 0.5
    const table: [typeof RESOURCE_ORDER[number], number][] = [
      ['coins', Math.round(120 * tier)],
      ['wood', Math.round(60 * tier)],
      ['stone', Math.round(40 * tier)],
    ]
    if (this.waves.wave >= 5) table.push(['metal', Math.round(18 * tier)])
    this.fx.explosion(x, y, 110, PAL.gold)
    this.audio.play('quest', 1.1)
    for (const [k, v] of table) {
      const n = Math.min(10, Math.max(2, Math.round(v / 30)))
      for (let i = 0; i < n; i++) this.pickups.drop(k, Math.ceil(v / n), x, y, 1.5)
    }
    this.fx.popup(x, y - 50, 'SUPPLY CACHE', PAL.gold, 22)
  }

  /**
   * Catch-up for time spent away.
   *
   * Deliberately *not* linear. A flat "rate x hours away" handed out more in
   * one overnight gap than a long session ever earns, which turns the whole
   * settlement into a thing you check rather than play. Instead the credited
   * window decays toward IDLE_SOFT_CAP, so a night away and a week away pay
   * almost the same: a warm welcome back that can never be the better strategy.
   */
  private grantIdleEarnings(seconds: number) {
    if (seconds < 90) return
    const SOFT_CAP = 3600      // the window can approach one hour, never pass it
    const IDLE_RATE = 0.4      // ...and pays at 40% of what a watched crew does
    const effective = SOFT_CAP * (1 - Math.exp(-seconds / SOFT_CAP))
    const income = this.workers.incomePerSecond()
    const parts: string[] = []
    let any = false
    for (const k of RESOURCE_ORDER) {
      const perSec = income[k] ?? 0
      if (perSec <= 0) continue
      const amount = Math.floor(perSec * effective * IDLE_RATE)
      if (amount <= 0) continue
      this.res.addStored(k, amount, false)
      parts.push(`+${short(amount)} ${k}`)
      any = true
    }
    if (!any) return
    const h = Math.floor(seconds / 3600)
    const m = Math.round((seconds % 3600) / 60)
    const away = h > 0 ? `${h}h ${m}m away` : `${Math.max(1, m)}m away`
    this.time.delayedCall(700, () => {
      this.fx.popup(this.player.x, this.player.y - 150, 'WHILE YOU WERE AWAY', PAL.gold, 26)
      this.fx.popup(this.player.x, this.player.y - 116, away, PAL.uiDim, 15)
      this.fx.popup(this.player.x, this.player.y - 86, parts.join('   '), PAL.good, 18)
      this.fx.coinBurst(this.player.x, this.player.y - 30, 16)
      this.audio.play('quest', 0.9)
    })
  }

  /**
   * Next locked territory the objective arrow should point at.
   *
   * Aims at the claim ring rather than the authored banner anchor, so the
   * arrow and the trigger agree on where the spot is, and prefers a zone you
   * can actually pay for — it used to send you at a 900-coin border while you
   * were holding forty.
   */
  zonesNextTarget(): { x: number; y: number; hint?: string } | null {
    let unaffordable: { x: number; y: number; hint?: string } | null = null
    let gatedHall = 0
    for (const z of ZONES) {
      if (z.startsUnlocked || this.zones.isUnlocked(z.id)) continue
      if (this.buildings.townHallLevel < z.requiresTownHall) {
        if (!gatedHall || z.requiresTownHall < gatedHall) gatedHall = z.requiresTownHall
        continue
      }
      const c = this.zones.claimPoint(z.id)
      if (!c) continue
      if (this.zones.canUnlockId(z.id)) return { x: c.x, y: c.y, hint: `Claim ${z.name}` }
      if (!unaffordable) {
        const price = RESOURCE_ORDER.filter(k => z.cost[k])
          .map(k => `${short(z.cost[k] ?? 0)} ${k}`).join(', ')
        unaffordable = { x: c.x, y: c.y, hint: `Save for ${z.name} — ${price}` }
      }
    }
    if (unaffordable) return unaffordable
    // Every border left needs a bigger hall. "Claim a new territory" with no
    // arrow and no reason was the same dead end the build goals had.
    if (gatedHall) {
      const hall = this.buildings.buildings.find(b => b.key === 'townHall')
      if (hall) return { x: hall.x, y: hall.y, hint: `Command Hall Lv.${gatedHall} first` }
    }
    return null
  }

  // ---- hero attack ------------------------------------------------------
  private tryAttack() {
    const p = this.player
    if (!p.canAttack()) return
    const target = this.enemies.grid.nearest(p.x, p.y, p.stats.range, e => e.alive)
    if (!target) return

    p.noteAttack()
    const baseAng = Math.atan2(target.y - (p.y - 16), target.x - p.x)
    if (Math.abs(Math.cos(baseAng)) > 0.15) p.facing = Math.cos(baseAng) > 0 ? 1 : -1

    const shots = Math.max(1, Math.round(p.stats.multishot))
    const spread = shots > 1 ? 0.2 : 0
    const bonus = 1 + this.buildings.bonus.heroDmg
    for (let i = 0; i < shots; i++) {
      const off = shots > 1 ? (i - (shots - 1) / 2) * spread : 0
      const crit = this.combat.rollCrit()
      const dmg = p.damage * bonus * (crit ? p.stats.critMult : 1)
      this.projectiles.fire(p.x, p.y - 16, baseAng + off, {
        tex: 'proj_wave', tint: p.level >= 11 ? PAL.gold : PAL.heroTrim,
        damage: dmg, crit, knockback: p.stats.knockback, pierce: p.stats.pierce,
        splash: p.stats.splash, speed: p.stats.projectileSpeed, faction: 'ally', fromPlayer: true,
        scale: 1 + p.stats.splash / 120,
      })
    }
    this.fx.slash(p.x + Math.cos(baseAng) * 22, p.y - 16 + Math.sin(baseAng) * 12, baseAng, 0.85, PAL.heroTrim)
    this.audio.playVaried('shoot', 0.5)
  }

  /** Walking into a tree or rock chips it — the hero can always gather by hand. */
  private tryHarvest(dt: number) {
    this.harvestCd -= dt
    if (this.harvestCd > 0) return
    const p = this.player
    const node = this.nodes.nearestInRange(p.x, p.y, 44)
    if (!node) return
    this.harvestCd = 0.32
    const got = this.nodes.strike(node, Math.max(12, p.stats.damage * 0.6))
    const amount = Math.max(1, Math.round(got * p.stats.greed))
    for (let i = 0; i < Math.min(4, amount); i++) {
      this.pickups.drop(node.resource, Math.ceil(amount / Math.min(4, amount)), node.x, node.y - 10, 0.8)
    }
    this.fx.slash(node.x, node.y - 16, rr(-0.4, 0.4), 0.7, 0xffffff)
    this.audio.playVaried(node.resource === 'wood' ? 'wood' : 'stone', 0.4)
  }

  // ---- camera -----------------------------------------------------------
  private updateCamera(dt: number) {
    const cam = this.cameras.main
    const crowd = this.enemies.walkerCount
    const want = crowd > CAMERA.zoomOutAt
      ? Math.max(CAMERA.minZoom, CAMERA.baseZoom - (crowd - CAMERA.zoomOutAt) / 420)
      : CAMERA.baseZoom
    const fit = Math.min(1.25, Math.max(0.72, Math.min(cam.width / DPR / 900, cam.height / DPR / 560)))
    this.zoomTarget = want * fit * DPR
    cam.setZoom(cam.zoom + (this.zoomTarget - cam.zoom) * Math.min(1, dt * 1.4))

    // look ahead in the direction of travel
    const p = this.player
    cam.setFollowOffset(
      -clamp(p.vx * CAMERA.lookAhead, -110, 110),
      -clamp(p.vy * CAMERA.lookAhead, -110, 110),
    )
  }

  private updateObjectiveArrow() {
    const v = this.quests.view()
    const p = this.player
    if (!v || v.targetX === undefined || v.targetY === undefined || !p.alive) {
      this.objectiveArrow.setVisible(false)
      return
    }
    const d = dist(p.x, p.y, v.targetX, v.targetY)
    if (d < 120) { this.objectiveArrow.setVisible(false); return }
    const ang = Math.atan2(v.targetY - p.y, v.targetX - p.x)
    const r = 72 + Math.sin(this.now * 0.005) * 6
    this.objectiveArrow
      .setVisible(true)
      .setPosition(p.x + Math.cos(ang) * r, p.y - 16 + Math.sin(ang) * r)
      // fx_objective is baked tip-DOWN (unlike fx_marker, which is tip-up), so
      // it already points at +90°. Adding another 90° sent it the opposite way.
      .setRotation(ang - Math.PI / 2)
      .setAlpha(0.9)
  }

  /** Edge markers for threats you cannot see. */
  private updateEdgeMarkers() {
    const cam = this.cameras.main
    const view = cam.worldView
    let i = 0
    const consider: { x: number; y: number; tint: number; scale: number }[] = []

    const boss = this.enemies.bossRef
    if (boss?.alive && !Phaser.Geom.Rectangle.Contains(view, boss.x, boss.y)) {
      consider.push({ x: boss.x, y: boss.y, tint: PAL.danger, scale: 1.5 })
    }
    const hall = this.buildings.townHall
    if (hall.damageT > 0 && !Phaser.Geom.Rectangle.Contains(view, hall.x, hall.y)) {
      consider.push({ x: hall.x, y: hall.y, tint: PAL.gold, scale: 1.3 })
    }
    if (this.waves.isNight) {
      for (const g of this.waves.nextGates()) {
        if (!Phaser.Geom.Rectangle.Contains(view, g.x, g.y)) {
          consider.push({ x: g.x, y: g.y, tint: PAL.danger, scale: 1 })
        }
      }
    }

    // A scroll-factor-0 image still scales about the camera centre by its zoom,
    // so the offset from the centre is divided back out: the marker lands
    // `pad` CSS pixels in from the edge whatever the zoom or DPR.
    const cx = cam.width / 2, cy = cam.height / 2
    const pad = 38 * DPR
    const z = cam.zoom
    for (const c of consider) {
      if (i >= this.edgeMarkers.length) break
      const m = this.edgeMarkers[i++]
      const ang = Math.atan2(c.y - (view.y + view.height / 2), c.x - (view.x + view.width / 2))
      const rx = cx - pad, ry = cy - pad
      const t = Math.min(Math.abs(rx / Math.cos(ang)), Math.abs(ry / Math.sin(ang)))
      m.setVisible(true)
        .setPosition(cx + (Math.cos(ang) * t) / z, cy + (Math.sin(ang) * t) / z)
        .setRotation(ang + Math.PI / 2)
        .setTint(c.tint).setScale(c.scale)
        .setAlpha(0.6 + Math.sin(this.now * 0.008) * 0.3)
    }
    for (; i < this.edgeMarkers.length; i++) this.edgeMarkers[i].setVisible(false)
  }

  // ---- main loop --------------------------------------------------------
  update(time: number, delta: number) {
    this.now = time
    this.terrain.update(this.cameras.main)
    this.culler.update(this.cameras.main)
    if (this.paused) return
    const simStart = performance.now()
    const dt = Math.min(0.05, delta / 1000)

    const kb = this.readKeyboard()
    const mv = {
      x: this.moveInput.x !== 0 || this.moveInput.y !== 0 ? this.moveInput.x : kb.x,
      y: this.moveInput.x !== 0 || this.moveInput.y !== 0 ? this.moveInput.y : kb.y,
    }

    this.allyGrid.clear()

    this.player.update(dt, mv.x, mv.y)
    if (this.player.alive) {
      this.allyGrid.insert(this.player)
      this.tryAttack()
      this.tryHarvest(dt)
    } else if (this.player.deadTimer <= 0) {
      const hall = this.buildings.townHall
      this.player.respawn(hall.x, hall.y + 90)
      // small penalty: drop part of what you were carrying
      for (const k of RESOURCE_ORDER) {
        const lost = Math.floor(this.res.carried[k] * 0.35)
        if (lost > 0) {
          this.res.carried[k] -= lost
          this.pickups.drop(k, lost, hall.x + rr(-60, 60), hall.y + rr(60, 110))
        }
      }
      this.res.bumpChanged()
    }

    this.nodes.update(dt)
    this.buildings.update(dt)
    this.workers.update(dt)
    this.army.update(dt)
    this.enemies.update(dt)
    this.camps.update(dt)
    this.projectiles.update(dt)
    this.pickups.update(dt)
    this.abilities.update(dt)
    this.waves.update(dt)
    this.zones.update(dt)
    this.quests.update()
    this.res.tickRates(dt)
    this.fx.update(dt)
    this.lighting.update(dt)
    this.saves.update(dt)
    this.audio.updateMusic(dt, Math.max(this.waves.tension, this.enemies.bossRef?.alive ? 1 : 0))

    this.updateCamera(dt)
    this.updateObjectiveArrow()
    this.updateEdgeMarkers()

    if (this.levelUpQueued > 0 && !this.paused) {
      this.levelUpQueued--
      this.events.emit('offerUpgrades')
    }
    this.recordFrameCost(performance.now() - simStart, delta)
  }

  /** Rolling 95th percentile separates slow simulation from slow presentation. */
  private recordFrameCost(simMs: number, frameMs: number) {
    this.simTimes[this.perfCursor] = simMs
    this.frameTimes[this.perfCursor] = frameMs
    this.perfCursor = (this.perfCursor + 1) % this.simTimes.length
    this.perfCount = Math.min(this.simTimes.length, this.perfCount + 1)
    if (++this.perfRefresh < 30) return
    this.perfRefresh = 0
    const p95 = (source: Float32Array) => {
      const sorted = Array.from(source.subarray(0, this.perfCount)).sort((a, b) => a - b)
      return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
    }
    this.simP95 = p95(this.simTimes)
    this.frameP95 = p95(this.frameTimes)
  }

  // ---- debug helpers ----------------------------------------------------
  debugGiveResources(amount: number) {
    for (const k of RESOURCE_ORDER) this.res.forceStored(k, amount)
    this.fx.popup(this.player.x, this.player.y - 60, `+${amount} everything`, PAL.gold, 18)
  }

  debugSpawn(count: number) {
    const keys = ['grunt', 'runner', 'brute', 'archer', 'shield', 'bomber', 'swarm'] as const
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rr(-0.3, 0.3)
      const r = rr(340, 620)
      this.enemies.spawn(
        keys[i % keys.length],
        clamp(this.player.x + Math.cos(a) * r, 40, WORLD.width - 40),
        clamp(this.player.y + Math.sin(a) * r, 40, WORLD.height - 40),
      )
    }
  }

  /** Short route to the encounter for combat and layout testing. */
  debugSpawnFinalBoss() {
    if (this.enemies.list.some(e => e.active && e.alive && e.key === 'cinderRegent')) return
    const x = clamp(this.player.x + 280, 40, WORLD.width - 40)
    const e = this.enemies.spawn('cinderRegent', x, this.player.y)
    if (e) {
      this.fx.ring(e.x, e.y, 320, PAL.danger, 1.1)
      this.audio.play('bossRoar', 0.9)
    }
  }

  debugLevel(n: number) {
    for (let i = 0; i < n; i++) this.player.addXp(this.player.xpToNext)
  }

  get stats() {
    return {
      fps: Math.round(this.game.loop.actualFps),
      simP95: this.simP95,
      frameP95: this.frameP95,
      enemies: this.enemies.walkerCount,
      soldiers: this.army.count,
      workers: this.workers.count,
      pickups: this.pickups.activeCount,
      projectiles: this.projectiles.activeCount,
      chunks: this.terrain.stats(),
      cull: this.culler.stats(),
      maxPickups: PICKUP.maxActive,
      respawn: PLAYER.respawnSeconds,
    }
  }
}
