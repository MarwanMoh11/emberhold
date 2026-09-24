import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { SaveManager, MAX_SAVE_FILE_BYTES } = await loadTs('src/systems/SaveManager.ts')

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
  for (const file of [invalid, '{broken', ' '.repeat(MAX_SAVE_FILE_BYTES + 1)]) {
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

test('the frontier never reads, writes or deletes a v1 save', () => {
  const data = storage()
  const v1 = JSON.stringify({ ...JSON.parse(fixture(4, 7)), v: 1, zones: ['hold'], regions: undefined })
  data.set('emberhold.save.v1', v1)
  data.set('emberhold.save.backup.v1', v1)
  assert.equal(SaveManager.hasSave(), false)
  assert.equal(SaveManager.importText(v1), false, 'a v1-shaped file is refused')
  assert.equal(SaveManager.importText(fixture(2, 3)), true)
  SaveManager.clear()
  assert.equal(data.get('emberhold.save.v1'), v1)
  assert.equal(data.get('emberhold.save.backup.v1'), v1)
  assert.equal(data.has('emberhold.save.v2'), false)
})

/** Anything at all: every property is another one and every call returns one. For the parts of a scene a test ignores. */
const any = () => new Proxy(function () {}, { get: () => any(), apply: () => any(), set: () => true })
/** An object that answers for everything it does not define. */
const loose = (o = {}) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : any()), set: (t, k, v) => { t[k] = v; return true } })

test('claimed regions and awake camps round-trip through the save', () => {
  const data = storage()
  const f = JSON.parse(fixture(4, 7))
  const scene = loose({
    res: { toJSON: () => f.res }, player: { ...f.player }, levels: { toJSON: () => [] },
    buildings: { toJSON: () => [] }, workers: { toJSON: () => [] }, army: { toJSON: () => f.army },
    waves: { toJSON: () => f.waves }, quests: { toJSON: () => f.quests }, abilities: { toJSON: () => f.abilities },
    combat: { kills: 0, bossKills: 0 },
    regions: { toJSON: () => ['hold', 'downs', 'ferrow'], fogJSON: () => undefined },
    camps: { toJSON: () => ['campScarp'], awakeJSON: () => ['campFerrow'], healthJSON: () => ({ campRotwood: 500 }), guardsJSON: () => ['campGallows.boss'] },
  })
  assert.equal(new SaveManager(scene).save(), true)
  const blob = JSON.parse(data.get('emberhold.save.v2'))
  assert.deepEqual(blob.regions, ['hold', 'downs', 'ferrow'])
  assert.deepEqual(blob.campAwake, ['campFerrow'])

  const got = {}
  const into = loose({
    player: loose(), combat: {},
    regions: loose({ load: ids => { got.regions = ids } }),
    camps: loose({ load: (burned, awake, guards) => { got.burned = burned; got.awake = awake; got.guards = guards } }),
  })
  assert.equal(new SaveManager(into).load(), true)
  assert.deepEqual(got.regions, ['hold', 'downs', 'ferrow'])
  assert.deepEqual(got.burned, ['campScarp'])
  assert.deepEqual(got.awake, ['campFerrow', 'campRotwood']) // a damaged camp was awake
  assert.deepEqual(got.guards, ['campGallows.boss'])
})

test('a save naming an unknown region or camp is refused', () => {
  storage()
  const ok = { ...JSON.parse(fixture(2, 3)), regions: ['hold', 'ferrow'], campAwake: ['campFerrow'] }
  assert.ok(SaveManager.inspectImport(JSON.stringify(ok)))
  assert.equal(SaveManager.inspectImport(JSON.stringify({ ...ok, regions: ['hold', 'atlantis'] })), null)
  assert.equal(SaveManager.inspectImport(JSON.stringify({ ...ok, campAwake: ['campNowhere'] })), null)
  assert.equal(SaveManager.inspectImport(JSON.stringify({ ...ok, campAwake: 'campFerrow' })), null)
  assert.ok(SaveManager.inspectImport(JSON.stringify({ ...ok, campGuards: ['campAshgate.brazier1'] })))
  assert.equal(SaveManager.inspectImport(JSON.stringify({ ...ok, campGuards: ['campNowhere.boss'] })), null)
})
