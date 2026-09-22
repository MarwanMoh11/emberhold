import Phaser from 'phaser'
import { PLAYER, HERO_TIERS, XP, WORLD } from '../config/balance'
import { PAL } from '../config/palette'
import type { PlayerStats } from '../config/upgrades'
import { clamp, dist } from '../core/math'
import { nextId } from '../core/ids'
import { CarryStack } from './CarryStack'
import type { Targetable } from '../core/types'
import type { GameScene } from '../scenes/GameScene'

export function freshStats(): PlayerStats {
  return {
    maxHp: PLAYER.maxHp, damage: PLAYER.damage, attackRate: PLAYER.attackRate,
    range: PLAYER.range, moveSpeed: PLAYER.moveSpeed, critChance: PLAYER.critChance,
    critMult: PLAYER.critMult, armor: PLAYER.armor, pickupRadius: PLAYER.pickupRadius,
    carryCapacity: PLAYER.carryCapacity, lifesteal: PLAYER.lifesteal, knockback: PLAYER.knockback,
    multishot: PLAYER.multishot, pierce: PLAYER.pierce, regen: PLAYER.regen, splash: 0,
    greed: 1, troopDamage: 1, projectileSpeed: PLAYER.projectileSpeed,
  }
}

export class Player implements Targetable {
  readonly id = nextId()
  readonly kind = 'player' as const

  x = WORLD.centerX
  y = WORLD.centerY + 340
  vx = 0
  vy = 0
  radius = 15
  alive = true

  hp: number
  maxHp: number
  stats: PlayerStats = freshStats()

  level = 1
  xp = 0
  xpToNext = XP.toNext(1)

  facing = 1
  moving = false
  attackCd = 0
  private bob = 0
  private flashUntil = 0
  private hurtCd = 0
  dodgeCd = 0
  private dodgeTime = 0
  private dodgeX = 0
  private dodgeY = 0
  private dodgeTrail = 0

  invincible = false
  deadTimer = 0
  respawnShieldT = 0

  /** temporary multipliers from Rally etc. */
  buffDamage = 1
  buffRate = 1

  readonly container: Phaser.GameObjects.Container
  readonly sprite: Phaser.GameObjects.Image
  private shadow: Phaser.GameObjects.Image
  private aura: Phaser.GameObjects.Image
  private carryStack: CarryStack
  private tier = 0

  constructor(private scene: GameScene) {
    this.maxHp = this.stats.maxHp
    this.hp = this.maxHp

    this.container = scene.add.container(this.x, this.y)
    this.shadow = scene.add.image(0, 2, 'shadow').setScale(0.82)
    this.aura = scene.add.image(0, -6, 'fx_glow_blue')
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.2).setScale(0.9).setVisible(false)
    this.sprite = scene.add.image(0, 0, 'hero0')
    this.sprite.setOrigin(0.5, 1 - 8 / this.sprite.height)
    this.container.add([this.shadow, this.aura, this.sprite])
    this.carryStack = new CarryStack(scene, this.container)
    this.container.setDepth(0)
  }

  get tierIndex() {
    let t = 0
    for (let i = 0; i < HERO_TIERS.length; i++) if (this.level >= HERO_TIERS[i]) t = i
    return t
  }

  refreshTier() {
    const t = this.tierIndex
    if (t === this.tier) return
    this.tier = t
    this.sprite.setTexture(`hero${t}`)
    this.sprite.setOrigin(0.5, 1 - 8 / this.sprite.height)
    this.aura.setVisible(t >= 2)
    this.aura.setAlpha(t >= 3 ? 0.32 : 0.2)
    this.aura.setTint(t >= 3 ? PAL.gold : PAL.heroTrim)
    this.scene.fx.ring(this.x, this.y - 14, 90, PAL.gold, 0.5)
  }

  /** Re-apply derived numbers after an upgrade pick or building bonus. */
  syncStats() {
    const gain = this.stats.maxHp - this.maxHp
    this.maxHp = this.stats.maxHp
    if (gain > 0) this.hp = Math.min(this.maxHp, this.hp + gain)
    this.scene.res.setHeroCarryMult(this.stats.carryCapacity / PLAYER.carryCapacity)
  }

  addXp(amount: number) {
    if (!this.alive) return
    this.xp += amount
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext
      this.level++
      this.xpToNext = XP.toNext(this.level)
      this.scene.onLevelUp(this.level)
      this.refreshTier()
    }
  }

  heal(amount: number) {
    if (!this.alive) return
    const before = this.hp
    this.hp = Math.min(this.maxHp, this.hp + amount)
    const healed = Math.round(this.hp - before)
    if (healed > 0) this.scene.fx.damage(this.x, this.y - 40, healed, false, '#5ce08a')
  }

  applyDamage(amount: number, srcX: number, srcY: number, knockback = 0): boolean {
    if (!this.alive || this.invincible || this.dodgeTime > 0 || this.respawnShieldT > 0) return false
    const dmg = Math.max(1, amount - this.stats.armor)
    this.hp -= dmg
    this.flashUntil = this.scene.now + 120
    if (knockback > 0) {
      const d = Math.max(1, dist(srcX, srcY, this.x, this.y))
      this.vx += ((this.x - srcX) / d) * knockback
      this.vy += ((this.y - srcY) / d) * knockback
    }
    if (this.hurtCd <= 0) {
      this.scene.audio.playVaried('playerHurt', 0.8)
      this.hurtCd = 0.25
      this.scene.fx.shake(0.006, 0.12)
    }
    if (this.hp <= 0) { this.die(); return true }
    return false
  }

  private die() {
    this.alive = false
    this.hp = 0
    this.deadTimer = PLAYER.respawnSeconds
    this.respawnShieldT = 0
    this.container.setVisible(false)
    this.scene.fx.deathBurst(this.x, this.y - 12, PAL.heroBody, 2)
    this.scene.fx.shake(0.02, 0.4)
    this.scene.audio.play('boom', 0.7)
    this.scene.bus.emit('player:died', undefined)
  }

  respawn(x: number, y: number) {
    this.alive = true
    this.hp = this.maxHp
    this.x = x; this.y = y
    this.vx = this.vy = 0
    this.dodgeTime = 0
    this.respawnShieldT = PLAYER.respawnShieldSeconds
    this.container.setVisible(true).setPosition(x, y)
    this.scene.fx.ring(x, y, 140, PAL.heroTrim, 0.6)
  }

  update(dt: number, inputX: number, inputY: number) {
    this.hurtCd -= dt
    this.dodgeCd = Math.max(0, this.dodgeCd - dt)
    if (!this.alive) {
      this.deadTimer -= dt
      return
    }
    this.respawnShieldT = Math.max(0, this.respawnShieldT - dt)

    if (this.stats.regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.stats.regen * dt)
    }

    const len = Math.hypot(inputX, inputY)
    const speed = this.stats.moveSpeed
    if (this.dodgeTime > 0) {
      this.dodgeTime = Math.max(0, this.dodgeTime - dt)
      this.vx = this.dodgeX * PLAYER.dodgeSpeed
      this.vy = this.dodgeY * PLAYER.dodgeSpeed
      this.moving = true
      this.dodgeTrail -= dt
      if (this.dodgeTrail <= 0) {
        this.dodgeTrail = 0.06
        this.scene.fx.dust(this.x, this.y, 2)
      }
    } else if (len > 0.08) {
      const nx = inputX / len, ny = inputY / len
      const m = Math.min(1, len)
      this.vx += (nx * speed * m - this.vx) * Math.min(1, dt * 16)
      this.vy += (ny * speed * m - this.vy) * Math.min(1, dt * 16)
      this.moving = true
      if (Math.abs(nx) > 0.12) this.facing = nx > 0 ? 1 : -1
    } else {
      this.vx -= this.vx * Math.min(1, dt * 12)
      this.vy -= this.vy * Math.min(1, dt * 12)
      this.moving = Math.hypot(this.vx, this.vy) > 24
    }

    this.x = clamp(this.x + this.vx * dt, 24, WORLD.width - 24)
    this.y = clamp(this.y + this.vy * dt, 24, WORLD.height - 24)

    // push out of solid buildings
    this.scene.buildings.resolveCollision(this)

    this.bob += dt * (this.moving ? 13 : 4)
    const bobY = this.moving ? Math.abs(Math.sin(this.bob)) * -3.2 : Math.sin(this.bob * 0.6) * -0.8
    this.sprite.y = bobY
    this.sprite.setFlipX(this.facing < 0)
    this.sprite.rotation = this.moving ? Math.sin(this.bob * 0.5) * 0.035 * this.facing : 0
    this.sprite.setAlpha(this.dodgeTime > 0 ? 0.7 : 1)
    const shielded = this.respawnShieldT > 0
    this.aura.setVisible(this.tier >= 2 || shielded)
      .setTint(shielded ? PAL.heroTrim : this.tier >= 3 ? PAL.gold : PAL.heroTrim)
      .setAlpha(shielded
        ? this.scene.settings.reducedMotion ? 0.52 : 0.42 + Math.sin(this.scene.now * 0.018) * 0.1
        : this.tier >= 3 ? 0.32 : 0.2)
      .setScale(shielded ? 1.2 : 0.9)

    this.sprite.setTintFill(0xffffff)
    if (this.scene.now < this.flashUntil) this.sprite.setTintFill(0xffffff)
    else this.sprite.clearTint()

    this.container.setPosition(Math.round(this.x), Math.round(this.y))
    this.container.setDepth(this.y)
    this.carryStack.update(this.scene.res, dt, this.moving, this.facing)

    this.attackCd -= dt
  }

  dodge(inputX: number, inputY: number): boolean {
    if (!this.alive || this.dodgeCd > 0 || this.dodgeTime > 0) return false
    const len = Math.hypot(inputX, inputY)
    this.dodgeX = len > 0.08 ? inputX / len : this.facing
    this.dodgeY = len > 0.08 ? inputY / len : 0
    this.dodgeTime = PLAYER.dodgeSeconds
    this.dodgeCd = PLAYER.dodgeCooldown
    this.dodgeTrail = 0
    this.facing = this.dodgeX >= 0 ? 1 : -1
    this.scene.fx.ring(this.x, this.y - 12, 70, PAL.heroTrim, 0.18)
    this.scene.audio.play('ability', 1.5, 0.55)
    return true
  }

  canAttack() { return this.alive && this.attackCd <= 0 }

  noteAttack() {
    this.attackCd = 1 / Math.max(0.05, this.stats.attackRate * this.buffRate)
  }

  get damage() { return this.stats.damage * this.buffDamage }

  toJSON() {
    return { level: this.level, xp: this.xp, stats: this.stats, hp: this.hp, x: this.x, y: this.y }
  }
}
