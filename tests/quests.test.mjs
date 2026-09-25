import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { QUESTS, ACTS, actOf, ACHIEVEMENTS } = await loadTs('src/config/quests.ts')
const { goalAnchors, HALL_ANCHOR } = await loadTs('src/systems/questAnchors.ts')
const W = await loadTs('src/config/world/index.ts')
const { BUILDINGS } = await loadTs('src/config/buildings.ts')

const LIVE_ONLY = new Set(['workers', 'collect', 'kill', 'survive', 'level'])
const VILLAGE = new Set(['cottage', 'granary', 'mill', 'market', 'chapel', 'watchPost', 'docks'])

test('every quest aims at passable ground (Campaign 2.0, all acts)', () => {
  const r = W.raster()
  const off = []
  for (const q of QUESTS) {
    const pts = goalAnchors(q.goal)
    if (LIVE_ONLY.has(q.goal.type)) continue
    assert.ok(pts.length > 0, `${q.id} (${q.goal.type}) has nowhere to point`)
    for (const p of [...pts, HALL_ANCHOR]) {
      const i = r.cell(p.x, p.y)
      if (i < 0 || !r.passable(i)) off.push(`${q.id}:${p.id}@${Math.round(p.x)},${Math.round(p.y)}`)
    }
  }
  assert.deepEqual(off, [])
})

test('the chain: design 06 plus a village quest in every act, banners on a1…e1', () => {
  const ids = QUESTS.map(q => q.id)
  assert.equal(new Set(ids).size, ids.length, 'ids are unique')
  assert.ok(QUESTS.length >= 46, `${QUESTS.length} quests`)
  // acts run in order, each opening on its x1
  let last = 0
  for (const q of QUESTS) {
    const a = actOf(q)
    assert.ok(a >= last && a >= 1 && a <= ACTS.length, `${q.id} is out of act order`)
    if (a > last) assert.equal(q.id, `${'abcde'[a - 1]}1`)
    last = a
  }
  assert.equal(last, ACTS.length)
  for (let a = 1; a <= ACTS.length; a++) {
    const village = QUESTS.some(q => actOf(q) === a
      && ((q.goal.type === 'build' && VILLAGE.has(q.goal.building)) || q.goal.type === 'settle'))
    assert.ok(village, `act ${a} builds nothing of the village`)
  }
  // every name a goal uses exists
  const regions = new Set(W.REGIONS.map(x => x.id))
  const camps = new Set(W.CAMPS.map(x => x.id))
  const pois = new Set(W.POIS.map(x => x.id))
  const lines = new Set(W.WALL_LINES.map(x => x.id))
  for (const { id, goal: g } of QUESTS) {
    if ('region' in g && g.region) assert.ok(regions.has(g.region), `${id}: region ${g.region}`)
    if (g.type === 'burn') assert.ok(camps.has(g.camp), `${id}: camp ${g.camp}`)
    if (g.type === 'reach') assert.ok(pois.has(g.poi), `${id}: poi ${g.poi}`)
    if (g.type === 'line') assert.ok(lines.has(g.line), `${id}: line ${g.line}`)
    if (g.type === 'build' || g.type === 'upgrade') assert.ok(BUILDINGS[g.building], `${id}: ${g.building}`)
  }
  assert.equal(QUESTS.at(-1).goal.key, 'cinderRegent', 'the Regent ends it')
  for (const d of ['Heartwood', 'Slagbreaker', 'Loremaster', 'Pilgrim', 'Reliquary', 'Surveyor', 'Wayfarer']) {
    assert.ok(ACHIEVEMENTS.some(a => a.title === d), `deed ${d}`)
  }
})

test('new goals read the world, and the act banner plays on entering an act', async () => {
  const { QuestManager } = await loadTs('src/systems/QuestManager.ts')
  const emitted = []
  const pads = ['bridgehead.0', 'bridgehead.1', 'gateBridge'].map(id => ({ padId: id, key: 'wall', level: 1, alive: true, region: 'hold' }))
  const scene = {
    bus: { on() {}, emit: (k, p) => emitted.push([k, p]) },
    regions: { claimed: id => id === 'hold' || id === 'downs', claimedCount: 2 },
    camps: { isBurned: id => id === 'campDiggers', guardsDown: new Set(['campGallows.boss']) },
    buildings: { linePads: () => pads, buildings: [
      { key: 'cottage', region: 'ashgate', level: 1, alive: true, padId: 'cottageA1' },
      { key: 'market', region: 'ashgate', level: 1, alive: true, padId: 'marketA' },
      { key: 'wall', region: 'ashgate', level: 1, alive: true, padId: 'x.1' },
    ] },
    pois: { count: () => 1, state: id => (id === 'survHollow' ? 'done' : 'seen') },
    relics: { list: () => ['gallowsBell'] },
  }
  const qm = Object.create(QuestManager.prototype)
  qm.scene = scene
  qm.defeatedBosses = new Set()
  qm.travels = 0
  const got = id => { const q = QUESTS.find(x => x.id === id); return qm.progress(q) }
  assert.deepEqual(got('a9'), { have: 1, need: 1 }, 'claim downs')
  assert.deepEqual(got('a10'), { have: 1, need: 1 }, 'burn the Diggers')
  assert.deepEqual(got('b1'), { have: 0, need: 1 }, 'hollow unclaimed')
  assert.deepEqual(got('b3'), { have: 1, need: 1 }, 'reach the cellar')
  assert.deepEqual(got('b5'), { have: 0, need: 1 }, 'no journey yet')
  assert.deepEqual(got('a14'), { have: 3, need: 3 }, 'the bridgehead stands')
  assert.deepEqual(got('c6'), { have: 1, need: 1 }, 'the knight\'s guard slot is down')
  assert.deepEqual(got('c7'), { have: 1, need: 2 }, 'one relic of two')
  assert.equal(got('e2').have, 2, 'settle counts the village, not the wall')

  qm.announcedAct = 1
  qm.announce(QUESTS.find(x => x.id === 'a14'))
  qm.announce(QUESTS.find(x => x.id === 'b1'))
  qm.announce(QUESTS.find(x => x.id === 'b2'))
  assert.deepEqual(emitted.map(([k, p]) => `${k}:${p.roman}`), ['act:begun:II'])
})
