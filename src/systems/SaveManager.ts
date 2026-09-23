import type { GameScene } from '../scenes/GameScene'
import { DEFAULT_QUALITY } from '../core/device'
import { RESOURCE_ORDER } from '../core/types'
import { DAYNIGHT, XP } from '../config/balance'
import { BUILDINGS } from '../config/buildings'
import { CAMPS, PADS, REGION_BY_ID, WALL_RING, WORLD } from '../config/world'
import { SOLDIERS, WORKERS } from '../config/units'
import { UPGRADE_BY_ID } from '../config/upgrades'
import { QUESTS } from '../config/quests'
import { FogMemory } from '../core/FogMemory'

// v2 (the frontier) never reads, writes or deletes the v1 keys: see docs/world/design/07-save.md
const KEY = 'emberhold.save.v2'
const BACKUP_KEY = 'emberhold.save.backup.v2'
const SETTINGS_KEY = 'emberhold.settings.v1'
export const MAX_SAVE_FILE_BYTES = 1_000_000

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const resourceBag = (v: unknown) => record(v) && RESOURCE_ORDER.every(k =>
  finite(v[k]) && v[k] >= 0)
const padMax = new Map(PADS.map(p => [p.id, BUILDINGS[p.key].levels.length]))
const maxLevelForPad = (id: string) => padMax.get(id)
  ?? (/^wall\d+$/.test(id) ? BUILDINGS.wall.levels.length
    : WALL_RING.gates.some(g => g.id === id) ? BUILDINGS.gate.levels.length : 0)

/** Reject a torn or incompatible save before any manager mutates live state. */
function validSave(v: unknown): v is SaveBlob {
  if (!record(v) || v.v !== 2 || !finite(v.savedAt) || !finite(v.playtime)) return false
  if (!record(v.player) || !finite(v.player.level) || v.player.level < 1
    || !finite(v.player.xp) || v.player.xp < 0 || !finite(v.player.hp)
    || !finite(v.player.x) || v.player.x < 0 || v.player.x > WORLD.width
    || !finite(v.player.y) || v.player.y < 0 || v.player.y > WORLD.height) return false
  if (!record(v.res) || !resourceBag(v.res.carried) || !resourceBag(v.res.stored)
    || !resourceBag(v.res.totalGathered) || !Array.isArray(v.res.discovered)
    || !v.res.discovered.every(k => typeof k === 'string')) return false
  if (!Array.isArray(v.buildings) || !v.buildings.every(b => record(b)
    && typeof b.padId === 'string' && finite(b.level) && b.level >= 0
    && b.level <= maxLevelForPad(b.padId) && finite(b.hp)
    && (b.peakWorkers === undefined || finite(b.peakWorkers)
      && Number.isInteger(b.peakWorkers) && b.peakWorkers >= 0 && b.peakWorkers <= 500))) return false
  if (!Array.isArray(v.workers) || v.workers.length > 500 || !v.workers.every(w => record(w)
    && typeof w.key === 'string' && w.key in WORKERS
    && typeof w.homeId === 'string'
    && ((w.x === undefined && w.y === undefined)
      || finite(w.x) && w.x >= 0 && w.x <= WORLD.width
        && finite(w.y) && w.y >= 0 && w.y <= WORLD.height)
    && (w.hp === undefined || finite(w.hp) && w.hp > 0 && w.hp <= 100000)
    && (w.carrying === undefined || finite(w.carrying) && w.carrying >= 0 && w.carrying <= 100000)
    && (w.sheltered === undefined || typeof w.sheltered === 'boolean'))) return false
  if (!record(v.army) || !record(v.army.counts) || !Object.values(v.army.counts).every(n =>
    finite(n) && Number.isInteger(n) && n >= 0 && n <= 500)
    || !Object.keys(v.army.counts).every(k => k in SOLDIERS)) return false
  if (v.army.totalRecruited !== undefined && (!finite(v.army.totalRecruited)
    || v.army.totalRecruited < 0 || v.army.totalRecruited > 1000000)) return false
  if (v.army.holding !== undefined && typeof v.army.holding !== 'boolean') return false
  if (v.army.units !== undefined && (!Array.isArray(v.army.units) || v.army.units.length > 500
    || !v.army.units.every(u => record(u) && typeof u.key === 'string' && u.key in SOLDIERS
      && finite(u.x) && u.x >= 0 && u.x <= WORLD.width
      && finite(u.y) && u.y >= 0 && u.y <= WORLD.height
      && finite(u.hp) && u.hp > 0 && u.hp <= 100000))) return false
  if (!record(v.waves) || !finite(v.waves.wave) || v.waves.wave < 0
    || !finite(v.waves.wavesCleared) || v.waves.wavesCleared < 0
    || (v.waves.phase !== undefined && !['day', 'warning', 'night'].includes(v.waves.phase as string))
    || (v.waves.phaseT !== undefined && (!finite(v.waves.phaseT)
      || v.waves.phaseT < -1
      || v.waves.phaseT > Math.max(DAYNIGHT.daySeconds, DAYNIGHT.nightSeconds) + 1))) return false
  if (!record(v.quests) || !finite(v.quests.index) || !Number.isInteger(v.quests.index)
    || v.quests.index < 0 || v.quests.index > QUESTS.length
    || !Array.isArray(v.quests.done) || !v.quests.done.every(id => typeof id === 'string')
    || !Array.isArray(v.quests.achievements)
    || !v.quests.achievements.every(id => typeof id === 'string')) return false
  for (const key of ['kills', 'bossKills', 'campsCleared', 'zonesClaimed'] as const) {
    const n = v.quests[key]
    if (n !== undefined && (!finite(n) || !Number.isInteger(n) || n < 0)) return false
  }
  if (v.coreLost !== undefined && typeof v.coreLost !== 'boolean') return false
  if (v.quests.defeatedBosses !== undefined && (!Array.isArray(v.quests.defeatedBosses)
    || !v.quests.defeatedBosses.every(k => typeof k === 'string'))) return false
  if (v.quests.finalBossHp !== undefined && (!finite(v.quests.finalBossHp)
    || v.quests.finalBossHp < 0 || v.quests.finalBossHp > 100000)) return false
  if (v.combat !== undefined) {
    if (!record(v.combat)) return false
    for (const key of ['kills', 'bossKills'] as const) {
      const n = v.combat[key]
      if (n !== undefined && (!finite(n) || !Number.isInteger(n) || n < 0)) return false
    }
  }
  if (!Array.isArray(v.regions) || !v.regions.every(z => typeof z === 'string' && REGION_BY_ID.has(z as never))
    || !Array.isArray(v.camps) || !v.camps.every(c => typeof c === 'string')
    || !Array.isArray(v.upgrades) || !v.upgrades.every(u => Array.isArray(u)
      && typeof u[0] === 'string' && UPGRADE_BY_ID.has(u[0] as never)
      && finite(u[1]) && Number.isInteger(u[1]) && u[1] >= 0 && u[1] <= 10000)) return false
  if (v.exploredFog !== undefined && (typeof v.exploredFog !== 'string' || v.exploredFog.length > FogMemory.maxEncodedLength(WORLD.width, WORLD.height))) return false
  if (v.campHealth !== undefined && (!record(v.campHealth)
    || !Object.entries(v.campHealth).every(([id, hp]) => CAMPS.some(c => c.id === id)
      && finite(hp) && hp > 0 && hp <= 100000))) return false
  if (!record(v.abilities) || !Array.isArray(v.abilities.slots)
    || !v.abilities.slots.every(s => record(s) && typeof s.key === 'string'
      && typeof s.unlocked === 'boolean')
    || typeof v.abilities.ultimate !== 'boolean') return false
  return true
}

function parseSave(text: string): SaveBlob | null {
  if (text.length > MAX_SAVE_FILE_BYTES) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return validSave(parsed) ? parsed : null
  } catch { return null }
}

function readSave(key: string): SaveBlob | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? parseSave(raw) : null
  } catch { return null }
}

export interface Settings {
  master: number
  sfx: number
  music: number
  muted: boolean
  quality: 0 | 1 | 2
  showDamage: boolean
  reducedMotion: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8, sfx: 0.85, music: 0.3, muted: false, quality: DEFAULT_QUALITY, showDamage: true,
  reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
}

export interface SaveBlob {
  v: 2
  savedAt: number
  playtime: number
  res: ReturnType<GameScene['res']['toJSON']>
  player: { level: number; xp: number; hp: number; x: number; y: number }
  upgrades: [string, number][]
  buildings: ReturnType<GameScene['buildings']['toJSON']>
  workers: ReturnType<GameScene['workers']['toJSON']>
  army: ReturnType<GameScene['army']['toJSON']>
  waves: ReturnType<GameScene['waves']['toJSON']>
  quests: ReturnType<GameScene['quests']['toJSON']>
  regions: string[]
  exploredFog?: string
  camps: string[]
  campHealth?: Record<string, number>
  abilities: ReturnType<GameScene['abilities']['toJSON']>
  combat: { kills: number; bossKills: number }
  coreLost?: boolean
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
      const v: unknown = JSON.parse(raw)
      if (!record(v)) return { ...DEFAULT_SETTINGS }
      const volume = (key: 'master' | 'sfx' | 'music') =>
        finite(v[key]) ? Math.max(0, Math.min(1, v[key])) : DEFAULT_SETTINGS[key]
      return {
        master: volume('master'), sfx: volume('sfx'), music: volume('music'),
        muted: typeof v.muted === 'boolean' ? v.muted : DEFAULT_SETTINGS.muted,
        quality: v.quality === 0 || v.quality === 1 || v.quality === 2
          ? v.quality : DEFAULT_SETTINGS.quality,
        showDamage: typeof v.showDamage === 'boolean' ? v.showDamage : DEFAULT_SETTINGS.showDamage,
        reducedMotion: typeof v.reducedMotion === 'boolean' ? v.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
      }
    } catch { return { ...DEFAULT_SETTINGS } }
  }

  static saveSettings(s: Settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch { /* private mode */ }
  }

  static hasSave(): boolean { return !!(readSave(KEY) ?? readSave(BACKUP_KEY)) }

  static peek(): { wave: number; level: number; savedAt: number } | null {
    const b = readSave(KEY) ?? readSave(BACKUP_KEY)
    return b ? { wave: b.waves.wave, level: b.player.level, savedAt: b.savedAt } : null
  }

  /** Validate a chosen file before the title asks for final confirmation. */
  static inspectImport(text: string): { wave: number; level: number; savedAt: number } | null {
    const b = parseSave(text)
    return b ? { wave: b.waves.wave, level: b.player.level, savedAt: b.savedAt } : null
  }

  /** Keep the old primary as a fallback; never replace it with an invalid file. */
  static importText(text: string): boolean {
    if (!parseSave(text)) return false
    try {
      const previous = localStorage.getItem(KEY)
      if (previous && parseSave(previous)) localStorage.setItem(BACKUP_KEY, previous)
      localStorage.setItem(KEY, text)
      return true
    } catch { return false }
  }

  static clear() {
    try { localStorage.removeItem(KEY); localStorage.removeItem(BACKUP_KEY) } catch { /* ignore */ }
  }

  update(dt: number) {
    this.playtime += dt
    this.timer -= dt
    if (this.timer <= 0) {
      this.timer = 10
      this.save()
    }
  }

  save(): boolean {
    const s = this.scene
    const blob: SaveBlob = {
      v: 2,
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
      regions: s.zones.toJSON(),
      exploredFog: s.zones.fogJSON(),
      camps: s.camps.toJSON(),
      campHealth: s.camps.healthJSON(),
      abilities: s.abilities.toJSON(),
      combat: { kills: s.combat.kills, bossKills: s.combat.bossKills },
      coreLost: s.coreLost,
    }
    try {
      const previous = localStorage.getItem(KEY)
      if (previous && readSave(KEY)) {
        try { localStorage.setItem(BACKUP_KEY, previous) } catch { /* keep current slot writable */ }
      }
      localStorage.setItem(KEY, JSON.stringify(blob))
      this.lastSavedAt = Date.now()
      return true
    } catch { return false }
  }

  /** Save the live world, then offer a portable JSON copy to the browser. */
  download(): boolean {
    if (!this.save()) return false
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw || !parseSave(raw)) return false
      const date = new Date().toISOString().slice(0, 10)
      const name = `emberhold-night-${this.scene.waves.wave}-${date}.json`
      const url = URL.createObjectURL(new Blob([raw], {
        type: 'application/json',
      }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 5000)
      return true
    } catch { return false }
  }

  load(): boolean {
    const blob = readSave(KEY) ?? readSave(BACKUP_KEY)
    if (!blob) return false

    const s = this.scene
    this.playtime = blob.playtime ?? 0
    this.lastSavedAt = blob.savedAt
    this.awaySeconds = blob.savedAt ? Math.max(0, (Date.now() - blob.savedAt) / 1000) : 0
    s.zones.load(blob.regions as never)
    if (blob.exploredFog) s.zones.loadFog(blob.exploredFog)
    s.buildings.load(blob.buildings)
    s.res.load(blob.res)
    s.player.level = blob.player.level
    s.player.xp = blob.player.xp
    s.player.xpToNext = XP.toNext(s.player.level)
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
    const coreLost = blob.coreLost ?? blob.buildings.some(b => b.padId === 'hall' && b.level === 0)
    s.waves.load(blob.waves, coreLost)
    s.camps.load(blob.camps)
    if (blob.campHealth) s.camps.loadHealth(blob.campHealth)
    s.coreLost = coreLost
    s.combat.kills = blob.combat?.kills ?? 0
    s.combat.bossKills = blob.combat?.bossKills ?? 0
    s.quests.load(blob.quests)
    s.buildings.recomputeBonuses()
    return true
  }
}
