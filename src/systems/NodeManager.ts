import Phaser from 'phaser'
import { NODE_CLUSTERS, NODE_DEFS, type RegionId } from '../config/world'
import type { ResourceType } from '../core/types'
import { Grid } from '../core/Grid'
import { rnd, rr, srand, ri } from '../core/math'
import { PERF } from '../config/balance'
import type { GameScene } from '../scenes/GameScene'

export interface ResourceNode {
  id: number
  type: 'tree' | 'rock' | 'ore' | 'crystal' | 'crop'
  resource: ResourceType
  x: number
  y: number
  hp: number
  maxHp: number
  yield: number
  respawnIn: number
  alive: boolean
  region: RegionId
  radius: number
  sprite: Phaser.GameObjects.Image
  /** claimed by a worker so several don't pile onto one tree */
  claimedBy: number
  shakeT: number
}

const CROP_DEF = { resource: 'food' as const, hp: 45, yield: 6, respawn: 6, radius: 16 }

/**
 * Harvestable world objects. Both the hero (by walking into them) and workers
 * (by their gather loop) pull from these, so the world visibly depletes and
 * regrows instead of resources appearing from nowhere.
 */
export class NodeManager {
  nodes: ResourceNode[] = []
  grid = new Grid<ResourceNode>(PERF.gridCell * 2)
  private nextNodeId = 1

  constructor(private scene: GameScene) {}

  build() {
    srand(20260917)
    for (const c of NODE_CLUSTERS) {
      for (let i = 0; i < c.count; i++) {
        const a = rnd() * Math.PI * 2
        const r = Math.sqrt(rnd()) * c.radius
        this.add(c.type, c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.78, c.region)
      }
    }
  }

  add(type: ResourceNode['type'], x: number, y: number, region: RegionId): ResourceNode {
    const d = type === 'crop' ? CROP_DEF : NODE_DEFS[type]
    const tex = type === 'tree' ? `tree${ri(0, 2)}`
      : type === 'rock' ? `rock${ri(0, 1)}`
      : type === 'ore' ? 'ore0'
      : type === 'crystal' ? 'crystal0'
      : 'crop'
    const sprite = this.scene.add.image(x, y, tex)
    sprite.setOrigin(0.5, 1 - 8 / sprite.height)
    sprite.setDepth(y)
    // regrowth tweens scale from 0.3 to 1, so the full size bounds it
    this.scene.culler.add(sprite, x, y - sprite.height / 2, Math.max(sprite.width, sprite.height))
    const node: ResourceNode = {
      id: this.nextNodeId++, type, resource: d.resource, x, y,
      hp: d.hp, maxHp: d.hp, yield: d.yield, respawnIn: 0, alive: true,
      region, radius: d.radius, sprite, claimedBy: 0, shakeT: 0,
    }
    this.nodes.push(node)
    return node
  }

  /** Farm fields: crops laid out around the farm so farmers have work on site. */
  addField(x: number, y: number, region: RegionId, count = 6) {
    const made: ResourceNode[] = []
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      made.push(this.add('crop', x + Math.cos(a) * 62, y + Math.sin(a) * 44 + 12, region))
    }
    return made
  }

  /** Hero or worker takes a swing. Returns the amount harvested. */
  strike(node: ResourceNode, power: number): number {
    if (!node.alive) return 0
    node.hp -= power
    node.shakeT = 0.16
    const d = node.type === 'crop' ? CROP_DEF : NODE_DEFS[node.type]
    const amount = node.yield
    if (node.hp <= 0) {
      node.alive = false
      node.respawnIn = d.respawn
      node.claimedBy = 0
      this.scene.fx.deathBurst(node.x, node.y - 16, node.type === 'tree' ? 0x4a8f45 : 0x9aa4ad, 1.2)
      if (node.type === 'tree') {
        node.sprite.setTexture('stump')
        node.sprite.setOrigin(0.5, 1 - 8 / node.sprite.height)
      } else {
        node.sprite.setVisible(false)
      }
      return Math.round(amount * 1.6)
    }
    return amount
  }

  update(dt: number) {
    this.grid.clear()
    for (const n of this.nodes) {
      if (!n.alive) {
        n.respawnIn -= dt
        if (n.respawnIn <= 0) {
          n.alive = true
          n.hp = n.maxHp
          if (n.type === 'tree') {
            n.sprite.setTexture(`tree${n.id % 3}`)
            n.sprite.setOrigin(0.5, 1 - 8 / n.sprite.height)
            n.sprite.setScale(0.3)
            this.scene.tweens.add({ targets: n.sprite, scale: 1, duration: 420, ease: 'Back.easeOut' })
          } else {
            n.sprite.setVisible(true).setScale(0.3)
            this.scene.tweens.add({ targets: n.sprite, scale: 1, duration: 380, ease: 'Back.easeOut' })
          }
        }
        continue
      }
      this.grid.insert(n)
      if (n.shakeT > 0) {
        n.shakeT -= dt
        n.sprite.x = n.x + rr(-2.5, 2.5)
        n.sprite.rotation = rr(-0.06, 0.06)
        if (n.shakeT <= 0) { n.sprite.x = n.x; n.sprite.rotation = 0 }
      }
    }
  }

  /** Nearest harvestable node of a given resource, ignoring locked zones. */
  findFor(resource: ResourceType, x: number, y: number, radius: number, claimer: number): ResourceNode | null {
    return this.grid.nearest(x, y, radius, n =>
      n.alive && n.resource === resource &&
      (n.claimedBy === 0 || n.claimedBy === claimer) &&
      this.scene.zones.isUnlocked(n.region))
  }

  /**
   * Live nodes of a resource within `radius` (straight line) in claimed
   * regions, nearest first. With a `claimer`, only nodes free or already its
   * own; with null, any (crews share rather than stand idle).
   */
  candidates(resource: ResourceType, x: number, y: number, radius: number, claimer: number | null): ResourceNode[] {
    const out = this.grid.query(x, y, radius, []).filter(n =>
      n.resource === resource &&
      (claimer === null || n.claimedBy === 0 || n.claimedBy === claimer) &&
      this.scene.zones.isUnlocked(n.region))
    return out.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
  }

  /** Hero auto-harvest: anything the player brushes against. */
  nearestInRange(x: number, y: number, radius: number): ResourceNode | null {
    return this.grid.nearest(x, y, radius, n => n.alive && this.scene.zones.isUnlocked(n.region))
  }

  countAlive(type: ResourceNode['type']) {
    let c = 0
    for (const n of this.nodes) if (n.alive && n.type === type) c++
    return c
  }
}
