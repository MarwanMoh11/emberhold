import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { SaveManager, MAX_SAVE_FILE_BYTES, SAVE_LIMIT_BYTES, parseSave } = await loadTs('src/systems/SaveManager.ts')
const { GAME_VERSION } = await loadTs('src/config/version.ts')
const { PADS, WALL_LINES, WORLD } = await loadTs('src/config/world/index.ts')
const { layWallLine } = await loadTs('src/world/wallLine.ts')
const { BUILDINGS } = await loadTs('src/config/buildings.ts')
const { WORKER_FOR } = await loadTs('src/config/units.ts')
const { FogMemory } = await loadTs('src/core/FogMemory.ts')

const bag = () => ({ coins: 0, wood: 0, food: 0, stone: 0, metal: 0, crystal: 0 })
const fixture = (wave, level) => JSON.stringify({
  v: 2, savedAt: 1_790_000_000_000, playtime: 400,
  res: { carried: bag(), stored: bag(), totalGathered: bag(), discovered: [] },
  player: { level, xp: 0, hp: 200, x: 1700, y: 1400 },
  upgrades: [], buildings: [], workers: [], army: { counts: {} },
  waves: { wave, wavesCleared: wave, phase: 'day', phaseT: 20 },
  quests: { index: 0, done: [], achievements: [] },
  regions: ['hold'], camps: [], abilities: { slots: [], ultimate: false },
  combat: { kills: 0, bossKills: 0 },
})

function storage() {
  const data = new Map()
  globalThis.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }
  return data
}

/** Anything at all: every property is another one and every call returns one. For the parts of a scene a test ignores. */
const any = () => new Proxy(function () {}, { get: () => any(), apply: () => any(), set: () => true })
/** An object that answers for everything it does not define. */
const loose = (o = {}) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : any()), set: (t, k, v) => { t[k] = v; return true } })
/** Swallow the tolerance warnings a test provokes on purpose; return what was warned. */
const quietly = fn => {
  const warned = [], warn = console.warn
  console.warn = (...a) => warned.push(a)
  try { return [fn(), warned] } finally { console.warn = warn }
}

/** A scene whose managers hand `save()` exactly these parts of a blob. */
const sceneFrom = f => loose({
  res: { toJSON: () => f.res }, player: { ...f.player }, levels: { toJSON: () => f.upgrades },
  buildings: { toJSON: () => f.buildings }, workers: { toJSON: () => f.workers }, army: { toJSON: () => f.army },
  waves: { ...f.waves, toJSON: () => f.waves }, quests: { toJSON: () => f.quests }, abilities: { toJSON: () => f.abilities },
  combat: { ...f.combat }, coreLost: f.coreLost ?? false,
  regions: { toJSON: () => f.regions, fogJSON: () => f.exploredFog },
  camps: { toJSON: () => f.camps, awakeJSON: () => f.campAwake, healthJSON: () => f.campHealth, guardsJSON: () => f.campGuards },
  waystones: { toJSON: () => f.waystones }, pois: { toJSON: () => f.pois }, relics: { toJSON: () => f.relics },
})

/** A scene that records what `load()` hands each manager. */
function capture() {
  const got = {}
  const mgr = (name, extra = {}) => loose({ load: (...a) => { got[name] = a.length > 1 ? a : a[0] }, ...extra })
  const scene = loose({
    player: loose(), combat: {},
    regions: mgr('regions', { loadFog: f => { got.exploredFog = f } }),
    camps: mgr('camps', { loadHealth: h => { got.campHealth = h } }),
    pois: mgr('pois'), relics: mgr('relics'), buildings: mgr('buildings'), res: mgr('res'), levels: mgr('upgrades'),
    abilities: mgr('abilities'), workers: mgr('workers'), army: mgr('army'), waves: mgr('waves'),
    waystones: mgr('waystones'), quests: mgr('quests'),
  })
  return { got, scene }
}

/** Every field of SaveBlobV2, with real ids and values already in their written (compact) form. */
const FULL = {
  ...JSON.parse(fixture(9, 12)),
  res: { carried: { ...bag(), wood: 4 }, stored: { ...bag(), coins: 820, stone: 40 }, totalGathered: { ...bag(), coins: 5000 }, discovered: ['wood', 'stone'] },
  player: { level: 12, xp: 340, hp: 180, x: 5120, y: 4600 },
  upgrades: [['rapidFire', 2], ['magnet', 1]],
  buildings: [
    { padId: 'hall', level: 3, hp: 3400, peakWorkers: 0 },
    { padId: 'lumber1', level: 2, hp: 600, progress: { wood: 30 }, peakWorkers: 3 },
    { padId: 'palisade.3', level: 1, hp: 500 },
    { padId: 'gateN', level: 1, hp: 700 },
  ].map(({ peakWorkers, ...b }) => (peakWorkers ? { ...b, peakWorkers } : b)),
  workers: [
    { key: 'lumberjack', homeId: 'lumber1', x: 5000, y: 4500, hp: 40, carrying: 2.5 },
    { key: 'lumberjack', homeId: 'lumber1', x: 5010, y: 4510, hp: 38, sheltered: true },
  ],
  army: { counts: { swordsman: 1, archer: 1 }, units: [{ key: 'swordsman', x: 5100, y: 4620, hp: 90 }, { key: 'archer', x: 5140, y: 4620, hp: 60 }], totalRecruited: 3, holding: true },
  waves: { wave: 9, wavesCleared: 9, phase: 'night', phaseT: 12 },
  quests: { index: 3, done: ['a1', 'a2', 'a3'], achievements: ['firstBlood'], kills: 80, bossKills: 1, campsCleared: 2, zonesClaimed: 3, defeatedBosses: ['gallowsKnight'], finalBossHp: 0 },
  regions: ['hold', 'downs', 'ferrow'],
  exploredFog: 'r:AbC-_9',
  camps: ['campScarp', 'campGallows'],
  campAwake: ['campFerrow'],
  campHealth: { campRotwood: 500, thornmother: 1200 },
  campGuards: ['campGallows.boss'],
  waystones: ['wsHall', 'wsIsle'],
  pois: ['shrineHarvest'],
  relics: ['gallowsBell'],
  abilities: { slots: [{ key: 'dash', unlocked: true }], ultimate: false },
  combat: { kills: 80, bossKills: 1 },
  coreLost: false,
}

test('a valid portable save replaces progress only on import and retains the previous slot', () => {
  const data = storage()
  const oldSave = fixture(4, 7)
  const file = fixture(2, 3)
  data.set('emberhold.save.v2', oldSave)
  assert.deepEqual(SaveManager.inspectImport(file), {
    wave: 2, level: 3, savedAt: 1_790_000_000_000,
  })
  assert.equal(data.get('emberhold.save.v2'), oldSave)
  assert.equal(SaveManager.importText(file), true)
  assert.equal(data.get('emberhold.save.v2'), file)
  assert.equal(data.get('emberhold.save.backup.v2'), oldSave)
})

test('an invalid or oversized file leaves both local saves untouched', () => {
  const data = storage()
  const oldSave = fixture(4, 7)
  data.set('emberhold.save.v2', oldSave)
  data.set('emberhold.save.backup.v2', fixture(3, 6))
  const invalid = fixture(2, 3).replace('"x":1700', '"x":-1')
  // well-formed and valid in every field, but past the 64 KB limit
  const oversized = JSON.stringify({ ...JSON.parse(fixture(2, 3)), res: { ...JSON.parse(fixture(2, 3)).res, discovered: Array(Math.ceil(SAVE_LIMIT_BYTES / 6)).fill('wood') } })
  assert.equal(SAVE_LIMIT_BYTES, 64 * 1024)
  assert.ok(oversized.length > SAVE_LIMIT_BYTES)
  for (const file of [invalid, '{broken', ' '.repeat(MAX_SAVE_FILE_BYTES + 1), oversized]) {
    assert.equal(SaveManager.inspectImport(file), null)
    assert.equal(SaveManager.importText(file), false)
  }
  assert.equal(data.get('emberhold.save.v2'), oldSave)
  assert.equal(SaveManager.peek().wave, 4)
  assert.equal(JSON.parse(data.get('emberhold.save.backup.v2')).waves.wave, 3)
})

test('a storage failure during backup aborts the import before replacing progress', () => {
  const data = storage()
  const oldSave = fixture(4, 7)
  data.set('emberhold.save.v2', oldSave)
  globalThis.localStorage.setItem = key => {
    if (key === 'emberhold.save.backup.v2') throw new Error('quota exceeded')
  }
  assert.equal(SaveManager.importText(fixture(2, 3)), false)
  assert.equal(data.get('emberhold.save.v2'), oldSave)
})

test('the frontier never reads, writes or deletes a v1 save (v1 was let go, 2026-09-25)', () => {
  const data = storage()
  const v1 = JSON.stringify({ ...JSON.parse(fixture(4, 7)), v: 1, zones: ['hold'], regions: undefined })
  data.set('emberhold.save.v1', v1)
  data.set('emberhold.save.backup.v1', v1)
  assert.equal(SaveManager.hasSave(), false)
  assert.equal(SaveManager.peek(), null)
  assert.equal(new SaveManager(capture().scene).load(), false, 'a v1 save alone starts a fresh run')
  assert.equal(SaveManager.importText(v1), false, 'a v1-shaped file is refused')
  assert.equal(new SaveManager(sceneFrom(FULL)).save(), true)
  assert.equal(SaveManager.importText(fixture(2, 3)), true)
  SaveManager.clear()
  assert.equal(data.get('emberhold.save.v1'), v1)
  assert.equal(data.get('emberhold.save.backup.v1'), v1)
  assert.deepEqual([...data.keys()].sort(), ['emberhold.save.backup.v1', 'emberhold.save.v1'])
})

test('every save field round-trips, and the save names the build that wrote it', () => {
  const data = storage()
  assert.equal(GAME_VERSION, 'Beta 1')
  assert.equal(new SaveManager(sceneFrom(FULL)).save(), true)
  const blob = JSON.parse(data.get('emberhold.save.v2'))
  assert.deepEqual(blob.meta, { version: GAME_VERSION })
  const { meta, savedAt, playtime, ...written } = blob
  const { savedAt: _s, playtime: _p, ...expected } = FULL
  assert.deepEqual(written, expected, 'written exactly as given (already compact)')

  const { got, scene } = capture()
  assert.equal(new SaveManager(scene).load(), true)
  assert.deepEqual(got.res, FULL.res)
  assert.deepEqual(got.upgrades, FULL.upgrades)
  assert.deepEqual(got.buildings, FULL.buildings)
  assert.deepEqual(got.workers, FULL.workers)
  assert.deepEqual(got.army, FULL.army)
  assert.deepEqual(got.waves, [FULL.waves, false])
  assert.deepEqual(got.quests, FULL.quests)
  assert.deepEqual(got.regions, FULL.regions)
  assert.equal(got.exploredFog, FULL.exploredFog)
  assert.deepEqual(got.camps, [FULL.camps, [...FULL.campAwake, ...Object.keys(FULL.campHealth)], FULL.campGuards])
  assert.deepEqual(got.campHealth, FULL.campHealth)
  assert.deepEqual(got.waystones, FULL.waystones)
  assert.deepEqual(got.pois, FULL.pois)
  assert.deepEqual(got.relics, [FULL.relics, FULL.camps])
  assert.deepEqual(got.abilities, FULL.abilities)
  assert.deepEqual({ level: scene.player.level, xp: scene.player.xp, hp: scene.player.hp, x: scene.player.x, y: scene.player.y }, FULL.player)
  assert.deepEqual({ ...scene.combat }, FULL.combat)
})

test('a blueprint edit does not break a save: unknown ids are dropped, types stay strict', () => {
  storage()
  const edited = {
    ...FULL,
    // a pad the blueprint no longer has, a piece past its line's end, a pad that moved (ids are the keys)
    buildings: [...FULL.buildings, { padId: 'farmNowhere', level: 2, hp: 300 }, { padId: 'palisade.999', level: 1, hp: 500 }],
    workers: [...FULL.workers, { key: 'farmer', homeId: 'farmNowhere', x: 100, y: 100, hp: 30 }],
    regions: ['hold', 'atlantis', 'downs', 'downs'],
    camps: ['campScarp', 'campNowhere'],
    campAwake: ['campFerrow', 'campNowhere'],
    campGuards: ['campGallows.boss', 'campNowhere.boss', 'campGallows.brazier9'],
    campHealth: { campRotwood: 500, campNowhere: 100 },
    waystones: ['wsHall', 'farm2'],
    pois: ['shrineHarvest', 'shrineNowhere'],
    relics: ['gallowsBell', 'theHolyGrail'],
    upgrades: [['rapidFire', 2], ['timeTravel', 3]],
    army: { ...FULL.army, counts: { ...FULL.army.counts, dragon: 2 } },
  }
  const [b, warned] = quietly(() => parseSave(JSON.stringify(edited), true))
  assert.ok(b, 'the save still loads')
  assert.deepEqual(b.buildings.map(x => x.padId), ['hall', 'lumber1', 'palisade.3', 'gateN'])
  assert.equal(b.workers.length, 2)
  assert.deepEqual(b.regions, ['hold', 'downs'])
  assert.deepEqual(b.camps, ['campScarp'])
  assert.deepEqual(b.campAwake, ['campFerrow'])
  assert.deepEqual(b.campGuards, ['campGallows.boss'])
  assert.deepEqual(b.campHealth, { campRotwood: 500 })
  assert.deepEqual(b.waystones, ['wsHall'])
  assert.deepEqual(b.pois, ['shrineHarvest'])
  assert.deepEqual(b.relics, ['gallowsBell'])
  assert.deepEqual(b.upgrades, [['rapidFire', 2]])
  assert.deepEqual(b.army.counts, FULL.army.counts)
  assert.equal(warned.length, 1, 'one warning names what went')
  assert.ok(JSON.stringify(warned[0]).includes('farmNowhere'))

  const bad = patch => SaveManager.inspectImport(JSON.stringify({ ...FULL, ...patch }))
  assert.equal(bad({ regions: 'hold' }), null)
  assert.equal(bad({ pois: [7] }), null)
  assert.equal(bad({ relics: [null] }), null)
  assert.equal(bad({ campHealth: { campRotwood: -1 } }), null)
  assert.equal(bad({ buildings: [{ padId: 'hall', level: 99, hp: 1 }] }), null, 'a known pad keeps its level range')
  assert.equal(bad({ exploredFog: 'x'.repeat(40) }), null, 'the v1 fog form is gone')
  assert.equal(bad({ exploredFog: 'b:' + 'A'.repeat(FogMemory.maxEncodedLength(WORLD.width, WORLD.height)) }), null)
  assert.equal(bad({ meta: { version: 2 } }), null)
})

test('a frontier with every pad built and every worker hired fits in 64 KB', () => {
  const data = storage()
  const f = n => n + 0.123456789
  const pads = [...PADS, ...WALL_LINES.flatMap(l => layWallLine(l))]
  const buildings = pads.map((p, i) => ({ padId: p.id, level: BUILDINGS[p.key].levels.length, hp: f(900 + i), progress: {}, peakWorkers: WORKER_FOR[p.key] ? 7 : 0 }))
  const workers = pads.flatMap(p => (WORKER_FOR[p.key] ? Array.from({ length: 7 }, (_, k) => ({
    key: WORKER_FOR[p.key], homeId: p.id, x: f(p.x + k), y: f(p.y), hp: f(40), carrying: f(2), carryType: 'wood', sheltered: false,
  })) : []))
  const units = Array.from({ length: 150 }, (_, k) => ({ key: 'swordsman', x: f(5000 + k), y: f(4600), hp: f(80) }))
  const full = { ...FULL, buildings, workers, army: { counts: { swordsman: 150 }, units, totalRecruited: 150, holding: false },
    exploredFog: 'b:' + 'A'.repeat(FogMemory.maxEncodedLength(WORLD.width, WORLD.height) - 2) }
  assert.ok(JSON.stringify(full).length > SAVE_LIMIT_BYTES, 'raw, it would not fit')
  assert.equal(new SaveManager(sceneFrom(full)).save(), true)
  const text = data.get('emberhold.save.v2')
  assert.ok(text.length <= SAVE_LIMIT_BYTES, `${text.length}`)
  const b = parseSave(text)
  assert.equal(b.workers.length, workers.length)
  assert.equal(b.workers[0].x, Math.round(workers[0].x), 'compact keeps where people stood')

  // past anything a run builds: people give up their places, the world is kept
  const crowd = { ...full, workers: Array.from({ length: 500 }, (_, k) => workers[k % workers.length]),
    army: { ...full.army, units: Array.from({ length: 500 }, () => units[0]) } }
  assert.equal(new SaveManager(sceneFrom(crowd)).save(), true)
  const lean = parseSave(data.get('emberhold.save.v2'))
  assert.equal(lean.buildings.length, pads.length)
  assert.equal(lean.workers.length, 500)
  assert.equal(lean.workers[0].x, undefined)
  assert.equal(lean.army.units, undefined)
})

test('the portable download imports back to the same world', async () => {
  const data = storage()
  let file, name
  const saved = { URL: { ...globalThis.URL }, document: globalThis.document, window: globalThis.window }
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL
  URL.createObjectURL = b => { file = b; return 'blob:test' }
  URL.revokeObjectURL = () => {}
  globalThis.document = { createElement: () => ({ style: {}, click() { name = this.download }, remove() {} }), body: { appendChild() {} } }
  globalThis.window = { setTimeout: () => 0 }
  try {
    assert.equal(new SaveManager(sceneFrom(FULL)).download(), true)
  } finally {
    URL.createObjectURL = create; URL.revokeObjectURL = revoke
    globalThis.document = saved.document; globalThis.window = saved.window
  }
  assert.match(name, /^emberhold-night-9-\d{4}-\d{2}-\d{2}\.json$/)
  const text = await file.text()
  assert.equal(text, data.get('emberhold.save.v2'))

  data.clear()
  assert.deepEqual(SaveManager.inspectImport(text), { wave: 9, level: 12, savedAt: JSON.parse(text).savedAt })
  assert.equal(SaveManager.importText(text), true)
  const { got, scene } = capture()
  assert.equal(new SaveManager(scene).load(), true)
  assert.deepEqual(got.buildings, FULL.buildings)
  assert.deepEqual(got.workers, FULL.workers)
  assert.deepEqual(got.relics, [FULL.relics, FULL.camps])
  assert.equal(JSON.parse(data.get('emberhold.save.v2')).meta.version, GAME_VERSION)
})
