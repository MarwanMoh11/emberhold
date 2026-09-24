import Phaser from 'phaser'
import type { ResourceType } from './types'
import type { BuildingKey } from '../config/buildings'
import type { RegionId } from '../config/world'
import type { Pt } from '../config/world/blueprint'

export interface GameEvents {
  'res:gained': { type: ResourceType; amount: number }
  'res:changed': void
  'carry:full': void
  'enemy:killed': { key: string; x: number; y: number; boss: boolean }
  'player:levelup': { level: number }
  'player:died': void
  'building:built': { key: BuildingKey; level: number }
  'soldier:recruited': { key: string }
  'worker:hired': { key: string }
  /** `warningSeconds` before dusk (S09): tonight's approach ids and their routes from the spawn point to the hall. */
  'night:warning': { approaches: string[]; routes: Pt[][] }
  'wave:start': { wave: number }
  'wave:cleared': { wave: number }
  /** A camp burned (S10: with its tier, and a stronghold's boss key for S15's relic drop). */
  'camp:burned': { id: string; tier?: 'warcamp' | 'stronghold' | 'fortress'; boss?: string }
  /** A sealed crossing opened (S10: the Regent's Causeway, when Ashgate burns). */
  'crossing:opened': { id: string }
  /** A sleeping camp woke: its region was claimed or the hero came within `WAKE_RADIUS` (S08). */
  'camp:woke': { id: string }
  'region:claimed': { id: RegionId }
  'quest:complete': { id: string }
  'boss:spawned': { name: string }
  'boss:killed': { name: string }
  'achievement': { id: string; title: string }
  /** The last quest in the chain just landed. Not an ending — a milestone. */
  'campaign:complete': { wave: number }
}

/** Thin typed wrapper so systems can talk without importing each other. */
export class Bus {
  private ee = new Phaser.Events.EventEmitter()

  on<K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void, ctx?: unknown) {
    this.ee.on(k as string, fn, ctx)
  }
  off<K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void, ctx?: unknown) {
    this.ee.off(k as string, fn, ctx)
  }
  emit<K extends keyof GameEvents>(k: K, p: GameEvents[K]) {
    this.ee.emit(k as string, p)
  }
  destroy() { this.ee.removeAllListeners() }
}
