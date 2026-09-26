import type { GameScene } from '../scenes/GameScene'
import { DEFAULT_QUALITY } from '../core/device'
import { RESOURCE_ORDER } from '../core/types'
import { DAYNIGHT, XP } from '../config/balance'
import { BUILDINGS } from '../config/buildings'
import { CAMPS, PADS, POIS, REGION_BY_ID, WALL_LINES, WORLD } from '../config/world'
import { SOLDIERS, WORKERS } from '../config/units'
import { layWallLine } from '../world/wallLine'
import { UPGRADE_BY_ID } from '../config/upgrades'
import { QUESTS } from '../config/quests'
import { FogMemory } from '../core/FogMemory'
import { RELIC_BY_ID } from './Relics'
import { guardIds } from './CampManager'
import { GAME_VERSION } from '../config/version'

// v2 (the frontier) never reads, writes or deletes the v1 keys: see docs/world/design/07-save.md
const KEY = 'emberhold.save.v2'
const BACKUP_KEY = 'emberhold.save.backup.v2'
const SETTINGS_KEY = 'emberhold.settings.v1'
/**
 * The whole save, in its slot and as a portable file, is at most 64 KB
 * (design 07 §Limits). A blob over it is never written and never read.
 */
export const SAVE_LIMIT_BYTES = 64 * 1024
/** The title refuses a chosen file over this before it reads a byte. */
export const MAX_SAVE_FILE_BYTES = SAVE_LIMIT_BYTES
const FOG_MAX = FogMemory.maxEncodedLength(WORLD.width, WORLD.height)
/** `r:` runs in base64url digits, or `b:` the unpadded base64 bitset (S03). Nothing else. */
const FOG_FORM = /^(r:[A-Za-z0-9_-]*|b:[A-Za-z0-9+/]*)$/
const byteLength = (text: string) => new TextEncoder().encode(text).length

const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const count = (v: unknown, max: number): v is number =>
  finite(v) && Number.isInteger(v) && v >= 0 && v <= max
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string')
const inWorld = (x: unknown, y: unknown) => finite(x) && x >= 0 && x <= WORLD.width
  && finite(y) && y >= 0 && y <= WORLD.height
const resourceBag = (v: unknown) => record(v) && RESOURCE_ORDER.every(k =>
  finite(v[k]) && v[k] >= 0)

// ---- the ids the world knows today ---------------------------------------------
/**
 * Every pad a building record may name, with its key's top level: the
 * blueprint's pads, and each wall line's pieces `${line}.${k}` and gates as
 * `layWallLine` lays them today (S09b). A piece past a line's end is unknown.
 */
const padMax = new Map<string, number>([
  ...PADS.map(p => [p.id, BUILDINGS[p.key].levels.length] as const),
  ...WALL_LINES.flatMap(l => layWallLine(l).map(p => [p.id, BUILDINGS[p.key].levels.length] as const)),
])
/** `wall${i}` is the palisade before S09b: kept, and remapped onto the pieces on load. */
const legacyWall = (id: string) => /^wall\d{1,3}$/.test(id)
const knownPad = (id: string) => padMax.has(id) || legacyWall(id)
const maxLevelForPad = (id: string) => padMax.get(id) ?? (legacyWall(id) ? BUILDINGS.wall.levels.length : 0)
const campIds = new Set(CAMPS.map(c => c.id))
const bossKeys = new Set(CAMPS.flatMap(c => (c.boss ? [c.boss] : [])))
/** Camp guards (S10): `${campId}.boss` at a stronghold, `${campId}.brazier${k}` at the fortress. */
const guardKeys = new Set(CAMPS.flatMap(c => guardIds(c).map(g => `${c.id}.${g}`)))
/** Waystone ids (S11): an outpost's pad id, or a lone stone's POI id. */
const stoneIds = new Set([...PADS.filter(p => p.key === 'outpost').map(p => p.id),
  ...POIS.filter(p => p.kind === 'waystone').map(p => p.id)])
/** POI ids (S14): every blueprint POI; only done ones are saved. */
const poiIds = new Set(POIS.map(p => p.id))

/**
 * Types and ranges, strictly: anything wrong here refuses the whole save
 * before a manager mutates live state. Ids are only checked for being
 * strings; whether the world still has them is `tolerate`'s job.
 */
function validShape(v: unknown): v is SaveBlobV2 {
  if (!record(v) || v.v !== 2 || !finite(v.savedAt) || v.savedAt < 0
    || !finite(v.playtime) || v.playtime < 0) return false
  if (v.meta !== undefined && (!record(v.meta) || typeof v.meta.version !== 'string'
    || v.meta.version.length > 64)) return false
  if (!record(v.player) || !count(v.player.level, 999) || v.player.level < 1
    || !finite(v.player.xp) || v.player.xp < 0 || !finite(v.player.hp)
    || !inWorld(v.player.x, v.player.y)) return false
  if (!record(v.res) || !resourceBag(v.res.carried) || !resourceBag(v.res.stored)
    || !resourceBag(v.res.totalGathered) || !strings(v.res.discovered)) return false
  if (!Array.isArray(v.buildings) || !v.buildings.every(b => record(b)
    && typeof b.padId === 'string' && count(b.level, 99) && finite(b.hp)
    // a pad the world still has keeps its key's level range; an unknown one is dropped later
    && (!knownPad(b.padId) || b.level <= maxLevelForPad(b.padId))
    && (b.peakWorkers === undefined || count(b.peakWorkers, 500))
    && (b.trains === undefined || typeof b.trains === 'string')
    && (b.progress === undefined || record(b.progress)
      && Object.values(b.progress).every(n => finite(n) && n >= 0)))) return false
  if (!Array.isArray(v.workers) || v.workers.length > 500 || !v.workers.every(w => record(w)
    && typeof w.key === 'string' && typeof w.homeId === 'string'
    && ((w.x === undefined && w.y === undefined) || inWorld(w.x, w.y))
    && (w.hp === undefined || finite(w.hp) && w.hp > 0 && w.hp <= 100000)
    && (w.carrying === undefined || finite(w.carrying) && w.carrying >= 0 && w.carrying <= 100000)
    && (w.carryType === undefined || w.carryType === null || typeof w.carryType === 'string')
    && (w.sheltered === undefined || typeof w.sheltered === 'boolean'))) return false
  if (!record(v.army) || !record(v.army.counts)
    || !Object.values(v.army.counts).every(n => count(n, 500))) return false
  if (v.army.totalRecruited !== undefined && (!finite(v.army.totalRecruited)
    || v.army.totalRecruited < 0 || v.army.totalRecruited > 1000000)) return false
  if (v.army.holding !== undefined && typeof v.army.holding !== 'boolean') return false
  if (v.army.units !== undefined && (!Array.isArray(v.army.units) || v.army.units.length > 500
    || !v.army.units.every(u => record(u) && typeof u.key === 'string' && inWorld(u.x, u.y)
      && finite(u.hp) && u.hp > 0 && u.hp <= 100000))) return false
  if (!record(v.waves) || !finite(v.waves.wave) || v.waves.wave < 0
    || !finite(v.waves.wavesCleared) || v.waves.wavesCleared < 0
    || (v.waves.phase !== undefined && !['day', 'warning', 'night'].includes(v.waves.phase as string))
    || (v.waves.phaseT !== undefined && (!finite(v.waves.phaseT)
      || v.waves.phaseT < -1
      || v.waves.phaseT > Math.max(DAYNIGHT.dayMax, DAYNIGHT.nightSeconds) + 1))) return false
  if (!record(v.quests) || !count(v.quests.index, QUESTS.length)
    || !strings(v.quests.done) || !strings(v.quests.achievements)) return false
  for (const key of ['kills', 'bossKills', 'campsCleared', 'zonesClaimed'] as const) {
    const n = v.quests[key]
    if (n !== undefined && !count(n, Number.MAX_SAFE_INTEGER)) return false
  }
  for (const key of ['victoryAt', 'victoryWave', 'victoryPlaytime'] as const) {
    const n = v.quests[key]
    if (n !== undefined && (!finite(n) || n < 0)) return false
  }
  if (v.coreLost !== undefined && typeof v.coreLost !== 'boolean') return false
  if (v.quests.defeatedBosses !== undefined && !strings(v.quests.defeatedBosses)) return false
  if (v.quests.finalBossHp !== undefined && (!finite(v.quests.finalBossHp)
    || v.quests.finalBossHp < 0 || v.quests.finalBossHp > 100000)) return false
  if (v.combat !== undefined) {
    if (!record(v.combat)) return false
    for (const key of ['kills', 'bossKills'] as const) {
      const n = v.combat[key]
      if (n !== undefined && !count(n, Number.MAX_SAFE_INTEGER)) return false
    }
  }
  if (!strings(v.regions) || !strings(v.camps)
    || !Array.isArray(v.upgrades) || !v.upgrades.every(u => Array.isArray(u)
      && typeof u[0] === 'string' && count(u[1], 10000))) return false
  if (v.exploredFog !== undefined && (typeof v.exploredFog !== 'string'
    || v.exploredFog.length > FOG_MAX || !FOG_FORM.test(v.exploredFog))) return false
  for (const key of ['campAwake', 'campGuards', 'waystones', 'pois', 'relics'] as const) {
    if (v[key] !== undefined && !strings(v[key])) return false
  }
  if (v.campHealth !== undefined && (!record(v.campHealth)
    || !Object.values(v.campHealth).every(hp => finite(hp) && hp > 0 && hp <= 100000))) return false
  if (!record(v.abilities) || !Array.isArray(v.abilities.slots)
    || !v.abilities.slots.every(s => record(s) && typeof s.key === 'string'
      && typeof s.unlocked === 'boolean')
    || typeof v.abilities.ultimate !== 'boolean') return false
  return true
}

/**
 * A blueprint edit must not break a save (design 07 §Tolerance): ids the
 * world no longer has are dropped, each list is kept once per id (so every
 * list is at most its blueprint count), and one warning names what went.
 */
function tolerate(v: SaveBlobV2, warn: boolean): SaveBlobV2 {
  const dropped: Record<string, string[]> = {}
  const keep = (field: string, list: readonly string[] | undefined, ok: (id: string) => boolean) => {
    if (!list) return undefined
    const seen = new Set<string>()
    return list.filter(id => {
      if (seen.has(id)) return false
      seen.add(id)
      if (!ok(id)) (dropped[field] ??= []).push(id)
      return ok(id)
    })
  }
  const seenPad = new Set<string>()
  const buildings = v.buildings.filter(b => {
    if (seenPad.has(b.padId)) return false
    seenPad.add(b.padId)
    if (!knownPad(b.padId)) (dropped.buildings ??= []).push(b.padId)
    return knownPad(b.padId)
  })
  const workers = v.workers.filter(w => {
    const ok = w.key in WORKERS && knownPad(w.homeId)
    if (!ok) (dropped.workers ??= []).push(`${w.key}@${w.homeId}`)
    return ok
  })
  const counts = Object.fromEntries(Object.entries(v.army.counts).filter(([k]) => {
    if (!(k in SOLDIERS)) (dropped.army ??= []).push(k)
    return k in SOLDIERS
  })) as SaveBlobV2['army']['counts']
  const units = v.army.units?.filter(u => {
    if (!(u.key in SOLDIERS)) (dropped.army ??= []).push(u.key)
    return u.key in SOLDIERS
  })
  // `delete` is true once per id: the first rank of each known upgrade stays
  const upgradeIds = new Set(keep('upgrades', v.upgrades.map(u => u[0]), id => UPGRADE_BY_ID.has(id as never)))
  const hurtIds = new Set(keep('campHealth', Object.keys(v.campHealth ?? {}), id => campIds.has(id) || bossKeys.has(id)))
  const out: SaveBlobV2 = {
    ...v,
    buildings,
    workers,
    army: { ...v.army, counts, ...(units ? { units } : {}) },
    upgrades: v.upgrades.filter(u => upgradeIds.delete(u[0])),
    regions: keep('regions', v.regions, id => REGION_BY_ID.has(id as never))!,
    camps: keep('camps', v.camps, id => campIds.has(id))!,
    campAwake: keep('campAwake', v.campAwake, id => campIds.has(id)),
    campGuards: keep('campGuards', v.campGuards, id => guardKeys.has(id)),
    campHealth: v.campHealth && Object.fromEntries(Object.entries(v.campHealth).filter(([id]) => hurtIds.has(id))),
    waystones: keep('waystones', v.waystones, id => stoneIds.has(id)),
    pois: keep('pois', v.pois, id => poiIds.has(id)),
    relics: keep('relics', v.relics, id => RELIC_BY_ID.has(id)),
  }
  if (warn && Object.keys(dropped).length) console.warn('[save] dropped ids the world no longer has', dropped)
  return out
}

/**
 * Reject a torn, oversized or incompatible save; forgive ids the world has
 * since lost. `warn` names the dropped ids (on a load or an import, not on the
 * quiet checks the title and the autosave make).
 */
export function parseSave(text: string, warn = false): SaveBlobV2 | null {
  if (typeof text !== 'string' || text.length > SAVE_LIMIT_BYTES || byteLength(text) > SAVE_LIMIT_BYTES) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return validShape(parsed) ? tolerate(parsed, warn) : null
  } catch { return null }
}

/** hp as whole points, never rounding a living worker or soldier down to none */
const wholeHp = (n: number) => Math.max(1, Math.ceil(n))

/**
 * The blob as written (design 07 §Limits): places to whole pixels, hp to whole
 * points, and a field left out wherever its loader already defaults it (no
 * progress, no peak, no trade, nothing carried, not sheltered) or never reads
 * it (what a worker carries is its home's resource). A frontier
 * with every pad built and every worker hired then fits in 64 KB.
 */
function compact(b: SaveBlobV2): SaveBlobV2 {
  const buildings = b.buildings.map(({ progress, peakWorkers, trains, ...d }) => ({
    ...d, hp: Math.ceil(d.hp),
    ...(progress && Object.keys(progress).length ? { progress } : {}),
    ...(peakWorkers ? { peakWorkers } : {}),
    ...(trains ? { trains } : {}),
  }))
  const workers = b.workers.map(w => ({
    key: w.key, homeId: w.homeId,
    ...(Number.isFinite(w.x) && Number.isFinite(w.y) ? { x: Math.round(w.x), y: Math.round(w.y) } : {}),
    ...(Number.isFinite(w.hp) ? { hp: wholeHp(w.hp) } : {}),
    // the load restores what is carried; its type follows from the home, so it is not written
    ...(w.carrying > 0 ? { carrying: Math.round(w.carrying * 100) / 100 } : {}),
    ...(w.sheltered ? { sheltered: true } : {}),
  }))
  const units = b.army.units?.map(u => ({ key: u.key, x: Math.round(u.x), y: Math.round(u.y), hp: wholeHp(u.hp) }))
  return {
    ...b,
    buildings: buildings as SaveBlobV2['buildings'],
    workers: workers as SaveBlobV2['workers'],
    army: { ...b.army, ...(units ? { units } : {}) },
  }
}

/**
 * Past the limit even compact (more than any run has built): workers and
 * soldiers give up their places and walk out from home, as older saves did.
 * Nothing the world keeps is lost; only where people stood.
 */
function lean(b: SaveBlobV2): SaveBlobV2 {
  const { units: _placed, ...army } = b.army
  return {
    ...b,
    workers: b.workers.map(w => ({ key: w.key, homeId: w.homeId })) as SaveBlobV2['workers'],
    army: army as SaveBlobV2['army'],
  }
}

function readSave(key: string, warn = false): SaveBlobV2 | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? parseSave(raw, warn) : null
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

/**
 * Save v2, the one schema (S19). Every field, its owner and its rule are in
 * design 07 §Schema and the CONTRACTS save-fields table; a session that adds
 * persistent state adds it here, to `validShape`, `tolerate` if it holds ids,
 * `load`, both tables and the portability test, in the same commit.
 */
export interface SaveBlobV2 {
  /** the schema: 2 is the frontier. Not the game's version, which is `meta.version` */
  v: 2
  /** which build wrote it: `GAME_VERSION` ('Beta 1'). Optional so older v2 saves load */
  meta?: { version: string }
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
  /** Camps awake and standing (S08). Burned ones are in `camps`; the rest sleep. */
  campAwake?: string[]
  campHealth?: Record<string, number>
  /** Camp guards fallen (S10): `${campId}.boss` or `${campId}.brazier${k}`. */
  campGuards?: string[]
  /** Waystones lit (S11): outpost pad ids, `wsHall`, `wsIsle`. */
  waystones?: string[]
  /** POIs done (S14): caches opened, lore read, shrines restored, survivors joined, landmarks reached. */
  pois?: string[]
  /** Relics held (S15), ids from `RELICS`. */
  relics?: string[]
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
    const b = parseSave(text, true)
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
    const blob: SaveBlobV2 = {
      v: 2,
      meta: { version: GAME_VERSION },
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
      regions: s.regions.toJSON(),
      exploredFog: s.regions.fogJSON(),
      camps: s.camps.toJSON(),
      campAwake: s.camps.awakeJSON(),
      campHealth: s.camps.healthJSON(),
      campGuards: s.camps.guardsJSON(),
      waystones: s.waystones.toJSON(),
      pois: s.pois.toJSON(),
      relics: s.relics.toJSON(),
      abilities: s.abilities.toJSON(),
      combat: { kills: s.combat.kills, bossKills: s.combat.bossKills },
      coreLost: s.coreLost,
    }
    let text = JSON.stringify(compact(blob))
    if (byteLength(text) > SAVE_LIMIT_BYTES) text = JSON.stringify(lean(compact(blob)))
    if (byteLength(text) > SAVE_LIMIT_BYTES) {
      // never write what could not be read back; the last good slot stays
      console.warn(`[save] ${byteLength(text)} bytes is over the ${SAVE_LIMIT_BYTES} limit; not saved`)
      return false
    }
    try {
      const previous = localStorage.getItem(KEY)
      if (previous && readSave(KEY)) {
        try { localStorage.setItem(BACKUP_KEY, previous) } catch { /* keep current slot writable */ }
      }
      localStorage.setItem(KEY, text)
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
    const blob = readSave(KEY, true) ?? readSave(BACKUP_KEY, true)
    if (!blob) return false

    const s = this.scene
    this.playtime = blob.playtime ?? 0
    this.lastSavedAt = blob.savedAt
    this.awaySeconds = blob.savedAt ? Math.max(0, (Date.now() - blob.savedAt) / 1000) : 0
    s.regions.load(blob.regions as never)
    if (blob.exploredFog) s.regions.loadFog(blob.exploredFog)
    // before the buildings: a restored Shrine of the Mason sets wall hp as they load
    s.pois.load(blob.pois)
    // a stronghold burned before relics existed still hands over its boss's
    s.relics.load(blob.relics, blob.camps)
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
    // a damaged camp was awake, whether or not the save says so
    s.camps.load(blob.camps, [...blob.campAwake ?? [], ...Object.keys(blob.campHealth ?? {})], blob.campGuards)
    if (blob.campHealth) s.camps.loadHealth(blob.campHealth)
    s.waystones.load(blob.waystones)
    s.coreLost = coreLost
    s.combat.kills = blob.combat?.kills ?? 0
    s.combat.bossKills = blob.combat?.bossKills ?? 0
    s.quests.load(blob.quests)
    s.buildings.recomputeBonuses()
    return true
  }
}
