import { CAMPS } from '../config/world'
import { PAL } from '../config/palette'
import type { Mod } from './Modifiers'
import type { GameScene } from '../scenes/GameScene'

export type RelicId = 'barrowCrown' | 'captainsHorn' | 'gallowsBell' | 'thornCrown' | 'heartOakSeed' | 'overseersLash' | 'wardensAegis'

export interface RelicDef {
  id: RelicId
  name: string
  /** where it is won, for the seal's tooltip while it is still missing */
  source: string
  effect: string
  mods: Mod[]
  /** the wax of its seal on the pause page */
  colour: number
  /** the relic POI that marks where its boss drops it (lit once held) */
  marker?: string
}

/** The seven relics (design 05 §Relics), in the order the pause page shows them. */
export const RELICS: RelicDef[] = [
  { id: 'barrowCrown', name: 'the Barrow Crown', source: 'the Barrow King, on the Downs', effect: '+15% pack size',
    mods: [{ stat: 'pack.size', mult: 1.15 }], colour: 0xc9962e },
  { id: 'captainsHorn', name: 'the Captain\'s Horn', source: 'the Captain\'s barrow, in Barrowmoor', effect: '+10% soldier damage',
    mods: [{ stat: 'soldier.damage', mult: 1.1 }], colour: 0x9a6a3a },
  { id: 'gallowsBell', name: 'the Gallows Bell', source: 'the Gallows Knight', effect: 'the army moves 15% faster; rally cooldown -20%',
    mods: [{ stat: 'army.speed', mult: 1.15 }, { stat: 'rally.cooldown', mult: 0.8 }], colour: 0x6a7686, marker: 'relicGallows' },
  { id: 'thornCrown', name: 'the Thorn Crown', source: 'the Thornmother', effect: 'hero shots pierce one more enemy',
    mods: [{ stat: 'hero.pierce', add: 1 }], colour: 0x5a7a34, marker: 'relicThorn' },
  { id: 'heartOakSeed', name: 'the Heart-Oak Seed', source: 'the Thornmother, at the Heart Oak', effect: '+25% wood from lumber camps',
    mods: [{ stat: 'wood.yield', mult: 1.25 }], colour: 0x8a9a3a },
  { id: 'overseersLash', name: 'the Overseer\'s Lash', source: 'the Seam Overseer', effect: 'workers move and gather 15% faster',
    mods: [{ stat: 'worker.speed', mult: 1.15 }, { stat: 'worker.gather', mult: 1.15 }], colour: 0x8a3a2a, marker: 'relicLash' },
  { id: 'wardensAegis', name: 'the Warden\'s Aegis', source: 'the Stairwarden', effect: '+10% tower range',
    mods: [{ stat: 'tower.range', mult: 1.1 }], colour: 0x3a6a9a, marker: 'relicAegis' },
]
export const RELIC_BY_ID = new Map<string, RelicDef>(RELICS.map(r => [r.id, r]))

/** What a stronghold's boss held: granted when its camp burns (`camp:burned`'s `boss`). */
export const BOSS_RELICS: Record<string, RelicId[]> = {
  gallowsKnight: ['gallowsBell'],
  thornmother: ['thornCrown', 'heartOakSeed'],
  seamOverseer: ['overseersLash'],
  stairwarden: ['wardensAegis'],
}

/** The two barrows whose guardian carries a relic. */
export const BARROW_RELICS: Record<string, RelicId> = { barrowKing: 'barrowCrown', barrowMoor3: 'captainsHorn' }

/**
 * The relics the hold has won (S15). Each registers its modifiers under its
 * own id, so a relic granted twice, or loaded twice, never stacks. Saved as
 * the list of held ids (`relics`).
 */
export class Relics {
  private held = new Set<RelicId>()
  private loading = false

  constructor(private readonly scene: GameScene) {
    scene.bus?.on('camp:burned', ({ boss }) => {
      for (const id of BOSS_RELICS[boss ?? ''] ?? []) this.grant(id)
    })
  }

  has(id: string): boolean { return this.held.has(id as RelicId) }

  /** Held relics, in `RELICS` order. */
  list(): RelicId[] { return RELICS.filter(r => this.held.has(r.id)).map(r => r.id) }

  /** Take a relic: its modifiers register and its marker lights. False when unknown or already held. */
  grant(id: string): boolean {
    const def = RELIC_BY_ID.get(id)
    if (!def || this.held.has(def.id)) return false
    const s = this.scene
    this.held.add(def.id)
    s.mods.add(def.id, ...def.mods)
    if (def.marker) s.pois?.relicHeld(def.marker, this.loading)
    if (this.loading) return true
    const p = s.player
    s.fx.ring(p.x, p.y - 20, 180, PAL.gold, 0.7)
    s.fx.popup(p.x, p.y - 120, `RELIC · ${def.name.toUpperCase()}`, PAL.gold, 20)
    s.fx.popup(p.x, p.y - 96, def.effect, PAL.bone, 13)
    s.audio.play('quest', 1.2)
    s.bus.emit('relic:granted', { id: def.id, name: def.name })
    return true
  }

  toJSON(): RelicId[] { return this.list() }

  /**
   * Apply a save's relics silently. A stronghold burned in a save written
   * before relics existed still hands over what its boss held.
   */
  load(ids: string[] = [], burnedCamps: string[] = []) {
    this.loading = true
    for (const id of ids) this.grant(id)
    for (const c of CAMPS) {
      if (c.boss && burnedCamps.includes(c.id)) for (const id of BOSS_RELICS[c.boss] ?? []) this.grant(id)
    }
    this.loading = false
  }
}
