import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const L = await loadTs('src/art/looks.ts')
const { REGIONS } = await loadTs('src/config/world/index.ts')

test('styles: every biome maps onto one of the five', () => {
  const styles = new Set(['timber', 'woodland', 'fen', 'stone', 'ash'])
  for (const r of REGIONS) assert.ok(styles.has(L.STYLE_BY_BIOME[r.biome]), `${r.id} (${r.biome})`)
  assert.equal(Object.keys(L.STYLE_BY_BIOME).length, 17)
  assert.deepEqual(new Set(Object.values(L.STYLE_BY_BIOME)), styles)
})

test('the hold core, military and defence keep one look; the base look is the boot texture', () => {
  for (const key of ['townHall', 'barracks', 'watchtower', 'wall', 'gate', 'watchPost', 'outpost']) {
    assert.equal(L.lookFor(key, 'x1', 'ash'), L.BASE_LOOK, key)
    assert.equal(L.variantTextureKey(key, 2, L.lookFor(key, 'x1', 'ash')), `bld_${key}_2`)
  }
  assert.equal(L.variantTextureKey('cottage', 1, L.lookFor('cottage', 'c', 'marsh')).startsWith('bld_cottage_1_fen'), true)
  assert.equal(L.isVariantKey('bld_cottage_2_stone1s'), true)
  for (const k of ['bld_wall_v_1', 'bld_wallpost_2', 'bld_gate_v_3', 'bld_townHall_5']) assert.equal(L.isVariantKey(k), false, k)
  assert.equal(L.lookFor('mill', 'm', 'forest', true).wheel, true)
  assert.equal(L.lookFor('cottage', 'm', 'highland').snow, true)
})

test('twelve cottages in one region: 3 roof tones, 4+ yard layouts, the same look for the same id', () => {
  const ids = Array.from({ length: 12 }, (_, i) => `dev.cottage.downs.${i}`)
  const looks = ids.map(id => L.lookFor('cottage', id, 'meadow'))
  const yards = ids.map(id => L.yardFor('cottage', id))
  assert.equal(new Set(looks.map(l => l.tone)).size, 3)
  assert.ok(new Set(yards.map(L.yardLayout)).size >= 4)
  for (const y of yards) assert.ok(y.props.length >= 1 && y.props.length <= 2 && new Set(y.props).size === y.props.length)
  ids.forEach((id, i) => {
    assert.deepEqual(L.lookFor('cottage', id, 'meadow'), looks[i])
    assert.deepEqual(L.yardFor('cottage', id), yards[i])
  })
  assert.equal(L.yardFor('barracks', 'b1'), null)
})
