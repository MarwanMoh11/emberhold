import Phaser from 'phaser'
import type { EnemyDef, EnemyKey } from '../config/enemies'
import type { Targetable } from '../core/types'
import { nextId } from '../core/ids'
import type { FieldTarget } from '../world/NavGrid'

export type EnemyState = 'move' | 'attack' | 'stun' | 'dead'

/**
 * Plain data + one Image. No physics body: movement, separation and hit
 * detection all run through the spatial grid, which is what keeps several
 * hundred of these cheap.
 */
/** The camp a patrol belongs to (S10). */
import type { PathTicket } from '../world/PathFind'
export interface CampHome { id: string; x: number; y: number; leash: number; siege: number }

export class Enemy implements Targetable {
  active = false
  readonly id = nextId()
  readonly kind = 'enemy' as const

  key: EnemyKey = 'grunt'
  def!: EnemyDef

  x = 0; y = 0
  vx = 0; vy = 0
  kx = 0; ky = 0            // knockback velocity
  hp = 1; maxHp = 1
  radius = 12
  alive = false

  damage = 1
  speed = 60
  range = 30
  attackRate = 1
  attackCd = 0
  facing = 1

  state: EnemyState = 'move'
  stunT = 0
  target: Targetable | null = null
  retargetIn = 0
  /** true = smashes walls, false = tries to flow toward a gate */
  sapper = false
  /** the straight line to the target is clear of water, cliffs and walls; else follow the hall's flow field (S05) */
  los = false

  flashT = 0
  burnT = 0
  burnDps = 0
  slowT = 0

  auraDamage = 1
  auraSpeed = 1
  auraT = 0

  bossPhase = 0
  bossTimer = 0
  telegraphT = 0
  chargeT = 0
  bossAttack: 'slam' | 'charge' | 'shockwave' | 'cinderVolley' | 'cinderNova' | null = null
  chargeVX = 0
  chargeVY = 0
  chargeHits = new Set<number>()
  bossAimX = 0
  bossAimY = 0

  spawnT = 0
  bobSeed = 0
  /** true when this one belongs to the current night's wave */
  fromWave = false
  /**
   * On a night march (S09): MARCH_SPEED, following `route`, deaf to aggro.
   * Cleared by a hit or by the first claimed cell.
   */
  marching = false
  /** the approach it came by, for the arrival log; null for camp patrols and ring spawns */
  approach: string | null = null
  /** fields to follow in order (each via crossing, then the hall) until claimed ground; null after */
  route: FieldTarget[] | null = null
  /** index into `route` */
  leg = 0
  /** a camp patrol's (or guard's) camp: it roams within `leash` and besieges within `siege` (S10); null otherwise */
  home: CampHome | null = null
  /** heading back to `home` after straying past the leash */
  returning = false
  /** where an idle patrol is strolling to, and how long before it picks another spot */
  wanderX = 0; wanderY = 0; wanderT = 0
  /** a camp's guard (its boss or a brazier): a failed night's sweep leaves it standing */
  guard = false
  /** takes no damage (a stronghold while its boss lives, the fortress while a brazier burns) */
  shielded = false
  /** a patrol's path round what blocks its straight line (S06's queue), where it was aimed, and the next waypoint */
  path: PathTicket | null = null
  pathX = 0; pathY = 0; pathI = 0

  sprite!: Phaser.GameObjects.Image

  constructor(scene: Phaser.Scene) {
    this.sprite = scene.add.image(0, 0, 'enm_grunt').setVisible(false)
  }

  spawn(def: EnemyDef, x: number, y: number, hpMult: number, dmgMult: number) {
    this.def = def
    this.key = def.key
    this.x = x; this.y = y
    this.vx = this.vy = this.kx = this.ky = 0
    this.maxHp = Math.round(def.hp * hpMult)
    this.hp = this.maxHp
    this.radius = def.radius
    this.damage = def.damage * dmgMult
    this.speed = def.speed
    this.range = def.range
    this.attackRate = def.attackRate
    this.attackCd = Math.random() * 0.6
    this.alive = true
    this.active = true
    this.state = 'move'
    this.stunT = 0
    this.target = null
    this.los = false
    this.retargetIn = Math.random() * 0.3
    this.sapper = def.prefers === 'structures' || Math.random() < 0.42
    this.flashT = 0
    this.burnT = 0
    this.slowT = 0
    this.auraDamage = 1
    this.auraSpeed = 1
    this.auraT = 0
    this.bossPhase = 0
    this.bossTimer = def.boss ? 4 : 0
    this.telegraphT = 0
    this.chargeT = 0
    this.bossAttack = null
    this.chargeVX = this.chargeVY = 0
    this.chargeHits.clear()
    this.bossAimX = this.bossAimY = 0
    this.spawnT = 0.35
    this.bobSeed = Math.random() * 10
    this.fromWave = false
    this.marching = false
    this.approach = null
    this.route = null
    this.leg = 0
    this.home = null
    this.returning = false
    this.wanderT = 0
    this.guard = false
    this.shielded = false
    this.path = null

    const tex = `enm_${def.key}`
    this.sprite.setTexture(tex)
    this.sprite.setOrigin(0.5, 1 - 8 / this.sprite.height)
    this.sprite.setVisible(true).setActive(true)
    this.sprite.setPosition(x, y).setDepth(y).setAlpha(1).setScale(0.4).clearTint()
    this.sprite.setFlipX(false)
    this.sprite.rotation = 0
  }

  applyDamage(amount: number, srcX: number, srcY: number, knockback = 0): boolean {
    if (!this.alive || this.shielded) return false
    this.marching = false
    this.hp -= amount
    this.flashT = 0.09
    if (knockback > 0) {
      const resist = 1 - (this.def.knockbackResist ?? 0)
      if (resist > 0.01) {
        const dx = this.x - srcX, dy = this.y - srcY
        const d = Math.max(1, Math.hypot(dx, dy))
        this.kx += (dx / d) * knockback * resist
        this.ky += (dy / d) * knockback * resist
      }
    }
    if (this.hp <= 0) { this.alive = false; return true }
    return false
  }

  stun(seconds: number) {
    if (this.def.boss) seconds *= 0.25
    this.stunT = Math.max(this.stunT, seconds)
    this.state = 'stun'
  }

  burn(dps: number, seconds: number) {
    this.burnDps = Math.max(this.burnDps, dps)
    this.burnT = Math.max(this.burnT, seconds)
  }

  release() {
    this.active = false
    this.alive = false
    this.target = null
    this.sprite.setVisible(false).setActive(false)
  }
}
