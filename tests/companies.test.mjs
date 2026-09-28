import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { COMPANIES, companyOf, nextOrder, assignFronts } = await loadTs('src/systems/companies.ts')

test('soldiers fall into companies by where they are mustered, and H steps defend → follow → hold', () => {
  assert.equal(companyOf('swordsman'), 'infantry')
  assert.equal(companyOf('spearman'), 'infantry')
  assert.equal(companyOf('guard'), 'infantry')
  assert.equal(companyOf('archer'), 'archers')
  assert.equal(companyOf('crossbow'), 'archers')
  assert.equal(companyOf('outrider'), 'riders')
  assert.equal(nextOrder('defend'), 'follow')
  assert.equal(nextOrder('follow'), 'hold')
  assert.equal(nextOrder('hold'), 'defend')
})

const sum = (split, c) => Object.values(split).reduce((n, r) => n + r[c], 0)
const heads = r => COMPANIES.reduce((n, c) => n + r[c], 0)

test('assignFronts splits each company over the fronts by share, and the counts add up', () => {
  const counts = { infantry: 10, archers: 6, riders: 3 }
  const fronts = [{ id: 'south', share: 0.49 }, { id: 'west', share: 0.21 }, { id: 'raid', share: 0.3 }]
  const split = assignFronts(counts, fronts)
  for (const c of COMPANIES) assert.equal(sum(split, c), counts[c], c)
  // heads follow the shares: 19 × (0.49, 0.21, 0.3) ≈ 9.3, 4, 5.7
  assert.deepEqual(fronts.map(f => heads(split[f.id])), [9, 4, 6])
  // each company spreads, not piles: the biggest front gets about half the infantry
  assert.ok(split.south.infantry >= 4 && split.south.infantry <= 6)
  // the same input, the same split
  assert.deepEqual(assignFronts(counts, fronts), split)
})

test('every front with a share gets someone once there are soldiers enough; a front without one gets none', () => {
  const fronts = [{ id: 'south', share: 0.7 }, { id: 'raid', share: 0.3 }, { id: 'shut', share: 0 }]
  const two = assignFronts({ infantry: 1, archers: 1, riders: 0 }, fronts)
  assert.equal(heads(two.south), 1)
  assert.equal(heads(two.raid), 1)
  assert.equal(heads(two.shut), 0)
  // one soldier: the bigger front
  const one = assignFronts({ infantry: 1, archers: 0, riders: 0 }, fronts)
  assert.equal(one.south.infantry, 1)
  // nobody, or no front: all zeros
  assert.equal(heads(assignFronts({ infantry: 0, archers: 0, riders: 0 }, fronts).south), 0)
  assert.deepEqual(assignFronts({ infantry: 3, archers: 0, riders: 0 }, []), {})
})
