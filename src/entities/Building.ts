import Phaser from 'phaser'
import { BUILDINGS, type BuildingDef, type BuildingKey } from '../config/buildings'
import type { PadSpec, ZoneId } from '../config/map'
import { RESOURCE_ORDER, type ResourceBag, type ResourceType, type Targetable } from '../core/types'
import { nextId } from '../core/ids'
import { buildingTextureKey } from '../art/buildings'

export type BuildState = 'empty' | 'raising' | 'done'

export class Building implements Targetable {
  readonly id = nextId()
  readonly kind = 'building' as const

  def: BuildingDef
  key: BuildingKey
  padId: string
  zone: ZoneId
  requiresTownHall: number

  x: number
  y: number
  halfW: number
  halfH: number
  radius: number

  level = 0
  hp = 0
  maxHp = 0
  alive = false
  state: BuildState = 'empty'

  /** resources banked toward the next level */
  progress: ResourceBag = {}
  raiseT = 0
  raiseDur = 1.1

  towerCd = 0
  recruitCd = 0
  /** how long the hero has been standing in this pad */
  dwellT = 0
  depositT = 0
  /**
   * Raising an empty site is automatic — walking onto bare ground is intent
   * enough. Upgrading something that already exists is not: without this the
   * Command Hall quietly eats every coin you walk past it with.
   */
  committed = false
  flashT = 0
  damageT = 0

  /** ids of workers employed here */
  workers: number[] = []
  /**
   * The largest crew this site has ever held. Replacing a worker the horde
   * killed is a repair, not an expansion, so camps do that on their own; the
   * Warehouse is what automates hiring past this mark.
   */
  peakWorkers = 0

  sprite: Phaser.GameObjects.Image
  /** translucent preview of the finished structure, shown on empty pads */
  ghost: Phaser.GameObjects.Image
  visible = true

  constructor(scene: Phaser.Scene, spec: PadSpec) {
    this.def = BUILDINGS[spec.key]
    this.key = spec.key
    this.padId = spec.id
    this.zone = spec.zone
    this.requiresTownHall = spec.requiresTownHall ?? 0
    this.x = spec.x
    this.y = spec.y
    this.halfW = this.def.w / 2
    this.halfH = this.def.h / 2
    this.radius = Math.max(this.halfW, this.halfH) * 0.82

    this.sprite = scene.add.image(spec.x, spec.y, `blueprint_${spec.key}`)
    this.sprite.setOrigin(0.5, 1 - 16 / this.sprite.height)
    this.sprite.setDepth(spec.y)

    this.ghost = scene.add.image(spec.x, spec.y, buildingTextureKey(spec.key, 1))
    this.ghost.setOrigin(0.5, 1 - 16 / this.ghost.height)
    this.ghost.setDepth(spec.y - 0.5)
    this.ghost.setTint(0x8fd0ff).setAlpha(0.3)
  }

  get maxLevel() { return this.def.levels.length }
  get isMax() { return this.level >= this.maxLevel }
  get stats(): Record<string, number> { return this.level > 0 ? (this.def.levels[this.level - 1].stats ?? {}) : {} }
  get nextCost(): ResourceBag | null { return this.isMax ? null : this.def.levels[this.level].cost }

  /** How much of the next level's cost has been paid in. */
  remaining(): ResourceBag {
    const cost = this.nextCost
    if (!cost) return {}
    const out: ResourceBag = {}
    for (const k of RESOURCE_ORDER) {
      const need = cost[k] ?? 0
      if (need <= 0) continue
      const have = this.progress[k] ?? 0
      if (have < need) out[k] = need - have
    }
    return out
  }

  isFunded(): boolean {
    const cost = this.nextCost
    if (!cost) return false
    for (const k of RESOURCE_ORDER) {
      if ((this.progress[k] ?? 0) < (cost[k] ?? 0)) return false
    }
    return true
  }

  deposit(type: ResourceType, amount: number) {
    this.progress[type] = (this.progress[type] ?? 0) + amount
  }

  applyTexture() {
    const built = this.level > 0
    const key = built ? buildingTextureKey(this.key, this.level) : `blueprint_${this.key}`
    this.sprite.setTexture(key)
    this.sprite.setOrigin(0.5, 1 - 16 / this.sprite.height)
    this.sprite.setDepth(this.y)
    this.sprite.clearTint().setAlpha(1)
    this.ghost.setVisible(!built)
  }

  setFrameTexture() {
    this.sprite.setTexture(`frame_${this.key}`)
    this.sprite.setOrigin(0.5, 1 - 16 / this.sprite.height)
    this.ghost.setVisible(false)
  }

  completeLevel() {
    this.level++
    this.progress = {}
    this.committed = false
    this.maxHp = this.def.levels[this.level - 1].hp
    this.hp = this.maxHp
    this.alive = true
    this.state = 'done'
    this.applyTexture()
  }

  applyDamage(amount: number, _srcX: number, _srcY: number): boolean {
    if (!this.alive || this.level === 0) return false
    this.hp -= amount
    this.flashT = 0.08
    this.damageT = 6
    if (this.hp <= 0) {
      this.hp = 0
      this.alive = false
      return true
    }
    return false
  }

  repair(amount: number) {
    if (this.level === 0) return
    this.hp = Math.min(this.maxHp, this.hp + amount)
    if (this.hp >= this.maxHp) this.damageT = 0
    if (!this.alive && this.hp > 0) this.alive = true
  }

  toJSON() {
    return { padId: this.padId, level: this.level, hp: this.hp,
      progress: this.progress, peakWorkers: this.peakWorkers }
  }
}
