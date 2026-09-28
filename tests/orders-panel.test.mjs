import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { ARMY_ICON, armyLook, ordersRows } = await loadTs('src/ui/ordersMath.ts')

test('a company gets a row once it has soldiers or its muster building stands', () => {
  const none = { infantry: false, archers: false, riders: false }
  assert.deepEqual(ordersRows({ infantry: 0, archers: 0, riders: 0 }, none), [])
  assert.deepEqual(ordersRows({ infantry: 3, archers: 0, riders: 0 }, none), ['infantry'])
  // a new range offers its orders before the first archer walks out
  assert.deepEqual(ordersRows({ infantry: 3, archers: 0, riders: 0 }, { ...none, archers: true }), ['infantry', 'archers'])
  // riders out of a fallen camp still answer
  assert.deepEqual(ordersRows({ infantry: 0, archers: 0, riders: 2 }, none), ['riders'])
})

test('the army button shows the shared order of the companies that are there, or mixed', () => {
  const o = { infantry: 'follow', archers: 'defend', riders: 'defend' }
  assert.equal(armyLook(o, ['infantry']), 'follow', 'an empty range at defend does not make it mixed')
  assert.equal(armyLook(o, ['infantry', 'archers']), 'mixed')
  assert.equal(armyLook({ infantry: 'hold', archers: 'hold', riders: 'hold' }), 'hold')
  assert.equal(armyLook(o, []), 'mixed', 'with no one there, all three count')
  for (const k of ['defend', 'follow', 'hold', 'mixed']) assert.match(ARMY_ICON[k], /^ico_/)
})
