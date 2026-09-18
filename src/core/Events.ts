import Phaser from 'phaser'
import type { ResourceType } from './types'
import type { BuildingKey } from '../config/buildings'

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
  'wave:start': { wave: number }
  'wave:cleared': { wave: number }
  'camp:destroyed': { id: string }
  'zone:unlocked': { id: string }
  'quest:complete': { id: string }
  'boss:spawned': { name: string }
  'boss:killed': { name: string }
  'achievement': { id: string; title: string }
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
