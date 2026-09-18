import type { GameScene } from '../scenes/GameScene'
import { DEFAULT_QUALITY } from '../core/device'

const KEY = 'emberhold.save.v1'
const SETTINGS_KEY = 'emberhold.settings.v1'

export interface Settings {
  master: number
  sfx: number
  music: number
  muted: boolean
  quality: 0 | 1 | 2
  showDamage: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, sfx: 0.85, music: 0.3, muted: false, quality: DEFAULT_QUALITY, showDamage: true,
}

export interface SaveBlob {
  v: 1
  savedAt: number
  playtime: number
  res: ReturnType<GameScene['res']['toJSON']>
  player: { level: number; xp: number; hp: number; x: number; y: number }
  upgrades: [string, number][]
  buildings: ReturnType<GameScene['buildings']['toJSON']>
  workers: ReturnType<GameScene['workers']['toJSON']>
  army: ReturnType<GameScene['army']['toJSON']>
  waves: { wave: number; wavesCleared: number }
  quests: ReturnType<GameScene['quests']['toJSON']>
  zones: string[]
  camps: string[]
  abilities: ReturnType<GameScene['abilities']['toJSON']>
  combat: { kills: number; bossKills: number }
}

export class SaveManager {
  private timer = 0
  playtime = 0
  lastSavedAt = 0
  /** wall-clock seconds between the last save and this load */
  awaySeconds = 0

  constructor(private scene: GameScene) {}

  static loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (!raw) return { ...DEFAULT_SETTINGS }
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch { return { ...DEFAULT_SETTINGS } }
  }

  static saveSettings(s: Settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch { /* private mode */ }
  }

  static hasSave(): boolean {
    try { return !!localStorage.getItem(KEY) } catch { return false }
  }

  static peek(): { wave: number; level: number; savedAt: number } | null {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return null
      const b = JSON.parse(raw) as SaveBlob
      return { wave: b.waves?.wave ?? 0, level: b.player?.level ?? 1, savedAt: b.savedAt ?? 0 }
    } catch { return null }
  }

  static clear() {
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
  }

  update(dt: number) {
    this.playtime += dt
    this.timer -= dt
    if (this.timer <= 0) {
      this.timer = 10
      this.save()
    }
  }

  save() {
    const s = this.scene
    const blob: SaveBlob = {
      v: 1,
      savedAt: Date.now(),
      playtime: this.playtime,
      res: s.res.toJSON(),
      player: { level: s.player.level, xp: s.player.xp, hp: s.player.hp, x: s.player.x, y: s.player.y },
      upgrades: s.levels.toJSON() as [string, number][],
      buildings: s.buildings.toJSON(),
      workers: s.workers.toJSON(),
      army: s.army.toJSON(),
      waves: s.waves.toJSON(),
      quests: s.quests.toJSON(),
      zones: s.zones.toJSON(),
      camps: s.camps.toJSON(),
      abilities: s.abilities.toJSON(),
      combat: { kills: s.combat.kills, bossKills: s.combat.bossKills },
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(blob))
      this.lastSavedAt = Date.now()
    } catch { /* quota or private mode: play on without saving */ }
  }

  load(): boolean {
    let blob: SaveBlob
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return false
      blob = JSON.parse(raw) as SaveBlob
      if (blob.v !== 1) return false
    } catch { return false }

    const s = this.scene
    this.playtime = blob.playtime ?? 0
    this.awaySeconds = blob.savedAt ? Math.max(0, (Date.now() - blob.savedAt) / 1000) : 0
    s.zones.load(blob.zones as never)
    s.buildings.load(blob.buildings)
    s.res.load(blob.res)
    s.player.level = blob.player.level
    s.player.xp = blob.player.xp
    s.levels.load(blob.upgrades as never)
    s.player.refreshTier()
    s.player.syncStats()
    s.player.hp = Math.max(1, blob.player.hp)
    s.player.x = blob.player.x
    s.player.y = blob.player.y
    s.abilities.load(blob.abilities)
    s.abilities.refreshUnlocks()
    s.workers.load(blob.workers)
    s.army.load(blob.army)
    s.waves.load(blob.waves)
    s.quests.load(blob.quests)
    s.camps.load(blob.camps)
    s.combat.kills = blob.combat?.kills ?? 0
    s.combat.bossKills = blob.combat?.bossKills ?? 0
    s.buildings.recomputeBonuses()
    return true
  }
}
