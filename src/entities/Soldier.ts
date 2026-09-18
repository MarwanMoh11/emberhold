import Phaser from 'phaser'
import type { SoldierDef, SoldierKey } from '../config/units'
import type { Targetable } from '../core/types'
import { nextId } from '../core/ids'

export type SoldierState = 'form' | 'engage' | 'hold' | 'dead'

export class Soldier implements Targetable {
  active = false
  readonly id = nextId()
  readonly kind = 'soldier' as const

  key: SoldierKey = 'swordsman'
  def!: SoldierDef

  x = 0; y = 0
  vx = 0; vy = 0
  hp = 1; maxHp = 1
  radius = 13
  alive = false
  facing = 1

  attackCd = 0
  target: Enemy_ | null = null
  targetLockT = 0
  state: SoldierState = 'form'
  slot = 0
  flashT = 0
  bobSeed = 0
  spawnT = 0

  sprite!: Phaser.GameObjects.Image

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'sol_swordsman').setVisible(false)
  }

  spawn(def: SoldierDef, x: number, y: number, slot: number, hpMult: number) {
    this.def = def
    this.key = def.key
    this.x = x; this.y = y
    this.vx = this.vy = 0
    this.maxHp = Math.round(def.hp * hpMult)
    this.hp = this.maxHp
    this.radius = def.radius
    this.alive = true
    this.active = true
    this.state = 'form'
    this.slot = slot
    this.attackCd = Math.random() * 0.4
    this.target = null
    this.targetLockT = 0
    this.flashT = 0
    this.bobSeed = Math.random() * 10
    this.spawnT = 0.3

    this.sprite.setTexture(`sol_${def.key}`)
    this.sprite.setOrigin(0.5, 1 - 8 / this.sprite.height)
    this.sprite.setVisible(true).setActive(true).setPosition(x, y).setDepth(y)
      .setAlpha(1).setScale(0.4).clearTint().setFlipX(false)
  }

  applyDamage(amount: number, _srcX: number, _srcY: number): boolean {
    if (!this.alive) return false
    this.hp -= amount
    this.flashT = 0.09
    if (this.hp <= 0) { this.alive = false; return true }
    return false
  }

  release() {
    this.active = false
    this.alive = false
    this.target = null
    this.sprite.setVisible(false).setActive(false)
  }
}

/** Forward declaration to avoid a circular import with Enemy. */
type Enemy_ = Targetable & { def?: unknown }
