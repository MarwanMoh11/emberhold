import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { titheOf } = await loadTs('src/systems/village.ts')
const { TITHE, VILLAGE } = await loadTs('src/config/balance.ts')

const b = (key, level, o = {}) => ({ key, level, workers: new Array(o.crew ?? 0), stats: { pop: o.pop }, sacked: o.sacked })
const hall = lvl => b('townHall', lvl, { pop: 4 })

test('tithe: the hall levies by level, and grows with crews and homes', () => {
  assert.equal(titheOf([hall(1)]), TITHE.hall[0])
  assert.ok(titheOf([hall(3)]) > titheOf([hall(2)]))
  const crews = [hall(1), b('lumberCamp', 1, { crew: 2 }), b('farm', 1, { crew: 1 })]
  assert.equal(+titheOf(crews).toFixed(6), +(TITHE.hall[0] + 3 * TITHE.perWorker).toFixed(6))
  const homes = [hall(1), b('cottage', 1, { pop: 2 }), b('house', 1, { pop: 6 })]
  assert.equal(+titheOf(homes).toFixed(6), +(TITHE.hall[0] + 8 * TITHE.perHome).toFixed(6))
  // cottages pay up to their population cap, no further
  const many = [hall(1), ...Array.from({ length: 200 }, () => b('cottage', 1, { pop: 3 }))]
  assert.equal(+titheOf(many).toFixed(6), +(TITHE.hall[0] + VILLAGE.cottagePopMax * TITHE.perHome).toFixed(6))
})

test('tithe: a sacked building, an unbuilt pad and a fallen hall pay nothing', () => {
  const base = [hall(2), b('lumberCamp', 1, { crew: 2 }), b('cottage', 2, { pop: 3 })]
  const sacked = [hall(2), b('lumberCamp', 1, { crew: 2, sacked: true }), b('cottage', 2, { pop: 3, sacked: true })]
  assert.equal(titheOf(sacked), TITHE.hall[1])
  assert.ok(titheOf(base) > titheOf(sacked))
  assert.equal(titheOf([hall(2), b('farm', 0, { crew: 3 })]), TITHE.hall[1])
  assert.equal(titheOf([hall(0), b('lumberCamp', 1, { crew: 2 })]), 0)
})
