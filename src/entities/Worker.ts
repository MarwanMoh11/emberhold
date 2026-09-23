import Phaser from 'phaser'
import type { WorkerDef, WorkerKey } from '../config/units'
import type { Targetable } from '../core/types'
import type { ResourceType } from '../core/types'
import { nextId } from '../core/ids'
import { PathFollower } from '../world/PathFollower'
import type { PathTicket } from '../world/PathFind'
import type { ResourceNode } from '../systems/NodeManager'

export type WorkerState = 'seek' | 'travel' | 'gather' | 'carry' | 'deposit' | 'flee' | 'repair' | 'shelter'

export class Worker implements Targetable {
  active = false
  readonly id = nextId()
  readonly kind = 'worker' as const

  key: WorkerKey = 'lumberjack'
  def!: WorkerDef

  x = 0; y = 0
  vx = 0; vy = 0
  hp = 1; maxHp = 1
  radius = 11
  alive = false
  facing = 1

  state: WorkerState = 'seek'
  node: ResourceNode | null = null
  carrying = 0
  carryType: ResourceType = 'wood'
  gatherT = 0
  homeX = 0; homeY = 0
  homeId = ''
  fleeT = 0
  /** Ducked inside the camp while the horde is loose. Untargetable, still paid. */
  sheltered = false
  flashT = 0
  bobSeed = 0
  swingT = 0
  /** How long movement has been blocked by something solid. */
  stuckT = 0
  /** Remaining seconds of sidestepping around that obstacle. */
  detourT = 0
  detourSign = 1
  repairTarget: { x: number; y: number; hp: number; maxHp: number } | null = null
  /** S06 pathing: the path being walked, a search in flight, the destination it was for, and the next sight check */
  readonly follower = new PathFollower()
  pathTicket: PathTicket | null = null
  pathTx = -1e9; pathTy = -1e9
  losT = 0

  sprite!: Phaser.GameObjects.Image
  load!: Phaser.GameObjects.Image

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'wrk_lumberjack').setVisible(false)
    this.load = scene.add.image(0, 0, 'res_wood').setVisible(false).setScale(0.6)
  }

  spawn(def: WorkerDef, x: number, y: number, homeId: string, homeX: number, homeY: number, carryType: ResourceType) {
    this.def = def
    this.key = def.key
    this.x = x; this.y = y
    this.vx = this.vy = 0
    this.maxHp = def.hp
    this.hp = this.maxHp
    this.alive = true
    this.active = true
    this.state = 'seek'
    this.node = null
    this.carrying = 0
    this.carryType = carryType
    this.gatherT = 0
    this.homeId = homeId
    this.homeX = homeX; this.homeY = homeY
    this.fleeT = 0
    this.sheltered = false
    this.flashT = 0
    this.bobSeed = Math.random() * 10
    this.swingT = 0
    this.stuckT = 0
    this.detourT = 0
    this.detourSign = this.id % 2 === 0 ? 1 : -1
    this.follower.clear()
    this.pathTicket = null
    this.pathTx = this.pathTy = -1e9
    this.losT = 0

    this.sprite.setTexture(`wrk_${def.key}`)
    this.sprite.setOrigin(0.5, 1 - 8 / this.sprite.height)
    this.sprite.setVisible(true).setActive(true).setPosition(x, y).setDepth(y)
      .setAlpha(1).setScale(0.45).clearTint().setFlipX(false)
    this.load.setTexture(`res_${carryType}`).setVisible(false)
  }

  applyDamage(amount: number, _srcX: number, _srcY: number): boolean {
    if (!this.alive) return false
    this.hp -= amount
    this.flashT = 0.09
    this.fleeT = 3.5
    if (this.hp <= 0) { this.alive = false; return true }
    return false
  }

  release() {
    this.active = false
    this.alive = false
    this.sheltered = false
    this.node = null
    this.sprite.setVisible(false).setActive(false)
    this.load.setVisible(false)
  }
}
