import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { applyEvent, contractLine, dawnRng, isBoard, postContracts, rewardCoins, settleAtDawn } = await loadTs('src/systems/contracts.ts')
const { ContractManager } = await loadTs('src/systems/ContractManager.ts')
const { CONTRACTS, CULL } = await loadTs('src/config/contracts.ts')

const board = wave => postContracts(wave, dawnRng(wave))
const kill = key => ({ name: 'enemy:killed', key })
const open = (kind, need, extra = {}) => ({ id: `t-${kind}`, kind, need, have: 0, reward: { coins: 50 }, state: 'open', ...extra })

test('a dawn posts three distinct kinds, the same board for the same wave', () => {
  for (let wave = 1; wave <= 30; wave++) {
    const a = board(wave)
    assert.equal(a.length, CONTRACTS.perDawn)
    assert.equal(new Set(a.map(c => c.kind)).size, CONTRACTS.perDawn)
    assert.deepEqual(a, board(wave))
    for (const c of a) assert.ok(c.state === 'open' && c.have === 0 && c.need >= 1 && c.reward.coins > 0)
  }
  const boards = new Set(Array.from({ length: 20 }, (_, i) => board(i + 1).map(c => c.kind).sort().join()))
  assert.ok(boards.size > 1, 'the kinds change from one dawn to the next')
})

test('cull names a horde type that walks by that wave; haul names wood or stone', () => {
  for (let wave = 1; wave <= 30; wave++) {
    for (const c of board(wave)) {
      if (c.kind === 'cull') assert.ok(CULL.some(t => t.key === c.target && t.from <= wave), `${c.id} ${c.target}`)
      if (c.kind === 'haul') assert.ok(['wood', 'stone'].includes(c.target))
    }
  }
})

test('progress counts only what each kind is about', () => {
  let c = applyEvent({ ...open('cull', 3), target: 'swarm' }, kill('grunt'))
  assert.equal(c.have, 0)
  c = applyEvent(c, kill('swarm'))
  assert.equal(c.have, 1)

  let s = open('slaughter', 3)
  s = applyEvent(s, kill('camp'))
  s = applyEvent(s, kill('brazier'))
  assert.equal(s.have, 0, 'camps and braziers are structures, not walkers')
  s = applyEvent(applyEvent(s, kill('elite')), kill('grunt'))
  assert.equal(s.have, 2)

  let r = applyEvent(open('raise', 2), { name: 'building:built' })
  assert.equal(r.have, 1)
  r = applyEvent(r, { name: 'building:built' })
  assert.equal(r.state, 'done')

  assert.equal(applyEvent(open('muster', 2), { name: 'soldier:recruited' }).have, 1)

  const h = { ...open('haul', 50), target: 'stone' }
  assert.equal(applyEvent(h, { name: 'res:gained', type: 'wood', amount: 99 }).have, 0)
  let g = applyEvent(h, { name: 'res:gained', type: 'stone', amount: 30 })
  g = applyEvent(g, { name: 'res:gained', type: 'stone', amount: 25 })
  assert.equal(g.have, 50)
  assert.equal(g.state, 'done')
})

test('a met contract takes no more progress', () => {
  const met = applyEvent(open('muster', 1), { name: 'soldier:recruited' })
  assert.equal(met.state, 'done')
  assert.equal(applyEvent(met, { name: 'soldier:recruited' }), met)
})

test('hold fast fails on the first sacking, and pays at dawn only if it never failed', () => {
  const hold = open('hold', 1, { reward: { coins: 80 } })
  const failed = applyEvent(hold, { name: 'building:sacked' })
  assert.equal(failed.state, 'failed')
  assert.deepEqual(settleAtDawn([failed]).paid, [])
  const { paid } = settleAtDawn([hold])
  assert.equal(paid.length, 1)
  assert.equal(paid[0].state, 'done')
  assert.equal(paid[0].reward.coins, 80)
})

test('at dawn an unmet contract expires unpaid, and a met one lapses with its pay already banked', () => {
  const cull = { ...open('cull', 9), target: 'grunt', have: 4 }
  const met = { ...open('muster', 2), have: 2, state: 'done' }
  const { paid, expired } = settleAtDawn([cull, met])
  assert.deepEqual(paid, [])
  assert.equal(expired.length, 1)
  assert.equal(expired[0].state, 'expired')
  assert.equal(applyEvent(expired[0], kill('grunt')), expired[0], 'an expired contract takes no more')
})

test('rewards grow with the wave, and crystal comes only from the fifth wave on', () => {
  for (const kind of ['cull', 'slaughter', 'hold', 'raise', 'muster', 'haul']) {
    for (let w = 2; w <= 30; w++) assert.ok(rewardCoins(w, kind) >= rewardCoins(w - 1, kind), `${kind} at ${w}`)
  }
  assert.ok(rewardCoins(20, 'cull') > rewardCoins(2, 'cull'))
  for (let w = 1; w < CONTRACTS.crystal.from; w++) assert.ok(board(w).every(c => !c.reward.crystal))
  assert.ok(Array.from({ length: 10 }, (_, i) => board(i + CONTRACTS.crystal.from)).some(b => b.some(c => c.reward.crystal)))
})

test('a contract reads as its goal, its progress and its pay', () => {
  const c = { id: 'x', kind: 'cull', target: 'swarm', need: 25, have: 18, reward: { coins: 140 }, state: 'open' }
  assert.equal(contractLine(c), 'Cull 18/25 Chitters — 140 coins')
  // a haul names a resource, not a walker
  assert.equal(contractLine({ ...c, kind: 'haul', target: 'wood', need: 180, have: 0 }), 'Haul 0/180 wood — 140 coins')
})

test('a saved board passes the validator; an older save has none and loads an empty board', () => {
  const saved = JSON.parse(JSON.stringify(board(7)))
  assert.equal(isBoard(saved), true)
  assert.equal(isBoard([{ ...saved[0], kind: 'bribe' }]), false)
  assert.equal(isBoard(saved.concat(saved)), false, 'a board holds at most perDawn contracts')
  const older = Object.create(ContractManager.prototype)
  older.load(undefined)
  assert.deepEqual(older.toJSON(), [])
  const back = Object.create(ContractManager.prototype)
  back.load(saved)
  assert.deepEqual(back.toJSON(), saved)
})
