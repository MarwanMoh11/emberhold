import Phaser from 'phaser'
import { BUILDINGS, type BuildingDef, type BuildingKey } from '../config/buildings'
import type { PadSpec, RegionId } from '../config/world'
import { RESOURCE_ORDER, type ResourceBag, type ResourceType, type Targetable } from '../core/types'
import { nextId } from '../core/ids'
import { buildingTextureKey, pieceTextureKey, textureFoot } from '../art/buildings'
import { POST_LEN } from '../world/wallLine'

export type BuildState = 'empty' | 'raising' | 'done'

/**
 * What dresses a building beyond its base art (S13b C4, `BuildingLooks`): the
 * regional variant to show for a level, and the yard round it.
 */
export interface BuildingSkin {
  /** The built texture to show for `lvl` now: its look once baked, else the base. */
  texture(b: Building, lvl: number): string
  /** Stand or clear the yard props after the art changes. */
  dress(b: Building): void
}

export class Building implements Targetable {
  readonly id = nextId()
  readonly kind = 'building' as const

  def: BuildingDef
  key: BuildingKey
  padId: string
  region: RegionId
  requiresTownHall: number

  x: number
  y: number
  halfW: number
  halfH: number
  radius: number
  /** the solid box enemies steer round and allies are pushed out of: centred `boxDy` below y */
  boxDy: number
  boxHW: number
  boxHH: number
  /** a wall line's piece (S09b): its footprint follows the line, its art its direction */
  piece?: PadSpec['piece']

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

  constructor(scene: Phaser.Scene, spec: PadSpec, private skin?: BuildingSkin) {
    this.def = BUILDINGS[spec.key]
    this.key = spec.key
    this.padId = spec.id
    this.region = spec.region
    this.requiresTownHall = spec.requiresTownHall ?? 0
    this.x = spec.x
    this.y = spec.y
    this.piece = spec.piece
    this.halfW = this.def.w / 2
    this.halfH = this.def.h / 2
    this.boxDy = -this.halfH * 0.35
    this.boxHW = this.halfW
    this.boxHH = this.halfH * 0.7
    const pc = spec.piece
    if (pc) {
      // The box lies along the line and covers the piece's whole share of it,
      // 2 px over each end, so neighbours overlap. On a slant it is the
      // axis-aligned box round the turned rectangle.
      const along = pc.part === 'post' ? POST_LEN / 2 + 2 : spec.key === 'gate' ? pc.len / 2 : pc.len / 2 + 2
      const across = spec.key === 'gate' ? 12 : pc.part === 'post' ? POST_LEN / 2 + 2 : 10
      const ax = Math.abs(pc.ux), ay = Math.abs(pc.uy)
      this.halfW = ax * along + ay * across
      this.halfH = ay * along + ax * across
      this.boxDy = 0
      this.boxHW = this.halfW
      this.boxHH = this.halfH
    }
    this.radius = Math.max(this.halfW, this.halfH) * 0.82

    this.sprite = scene.add.image(spec.x, spec.y, this.blueprintKey(scene))
    this.sprite.setDepth(this.depth)
    this.seat(this.sprite)

    this.ghost = scene.add.image(spec.x, spec.y, this.texKey(scene, 1))
    this.seat(this.ghost)
    this.ghost.setDepth(this.depth - 0.5)
    this.ghost.setTint(0x8fd0ff).setAlpha(0.3)
  }

  /**
   * Draw order. Runs sort by y, a horizontal run's right neighbour over it
   * (its end face is hidden). Posts sit over the run ends on either side, so
   * a corner reads as one turned wall; a gate on a vertical line sits over
   * its upper jamb post.
   */
  get depth(): number {
    const pc = this.piece
    if (!pc) return this.y
    if (pc.part === 'post') return this.y + 33
    if (this.key === 'gate') return this.y + (pc.dir === 'v' ? 34 : 0)
    return pc.dir === 'h' ? this.y + this.x * 1e-4 : this.y
  }

  /** The built art for a level: a wall piece's turned or post variant when there is one. */
  texKey(scene: Phaser.Scene, lvl: number): string {
    const k = this.piece ? pieceTextureKey(this.key, lvl, this.piece) : null
    return k && scene.textures.exists(k) ? k : buildingTextureKey(this.key, lvl)
  }

  private blueprintKey(scene: Phaser.Scene): string {
    const k = this.piece ? pieceTextureKey(this.key, 0, this.piece) : null
    return k && scene.textures.exists(k) ? k : `blueprint_${this.key}`
  }

  /** Stand the image on the pad: its texture's foot line at y. */
  private seat(img: Phaser.GameObjects.Image) {
    img.setOrigin(0.5, 1 - textureFoot(img.texture.key) / img.height)
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
    const scene = this.sprite.scene
    const key = !built ? this.blueprintKey(scene) : this.skin && !this.piece ? this.skin.texture(this, this.level) : this.texKey(scene, this.level)
    this.sprite.setTexture(key)
    this.seat(this.sprite)
    this.sprite.setDepth(this.depth)
    this.sprite.clearTint().setAlpha(1)
    this.ghost.setVisible(!built)
    this.skin?.dress(this)
  }

  setFrameTexture() {
    // a turned wall piece has no frame of its own: it rises as its first level
    const turned = this.piece && this.texKey(this.sprite.scene, 1) !== buildingTextureKey(this.key, 1)
    this.sprite.setTexture(turned ? this.texKey(this.sprite.scene, Math.max(1, this.level + 1)) : `frame_${this.key}`)
    this.seat(this.sprite)
    this.ghost.setVisible(false)
  }

  /**
   * S14: walls and gates take `wall.hp` (the Shrine of the Mason). GameScene
   * points this at its Modifiers; the default leaves every hp as the def has it.
   */
  static hpMod: (key: BuildingKey, hp: number) => number = (_key, hp) => hp

  /** Max hp at `lvl` (default: this level), after `Building.hpMod`. */
  levelHp(lvl = this.level): number {
    return Building.hpMod(this.key, this.def.levels[lvl - 1].hp)
  }

  completeLevel() {
    this.level++
    this.progress = {}
    this.committed = false
    this.maxHp = this.levelHp()
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
