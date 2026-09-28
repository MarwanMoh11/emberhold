import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { Clusterer, dawnParts, edgePoint, packParts } = await loadTs('src/ui/threatMath.ts')

test('the horde clusters into the fullest few cells, neighbours merged', () => {
  const c = new Clusterer(600, 2)
  c.begin()
  // a front of 5 straddling a cell line at x = 600, a pair far east, a lone walker far south
  for (const x of [560, 580, 590, 610, 640]) c.add(x, 300)
  c.add(4000, 300); c.add(4020, 320)
  c.add(300, 5000)
  const top = c.finish()
  assert.equal(top.length, 2)
  assert.equal(top[0].n, 5, 'the straddling front is one cluster')
  assert.ok(Math.abs(top[0].x - 596) < 1)
  assert.equal(top[1].n, 2)
  // pooled: a second pass starts clean
  c.begin(); c.add(10, 10)
  assert.deepEqual(c.finish().map(k => k.n), [1])
})

test('a chevron stands where its bearing leaves the frame', () => {
  const out = { x: 0, y: 0 }
  edgePoint(400, 300, 0, 30, 100, 770, 570, out)
  assert.deepEqual(out, { x: 770, y: 300 })
  edgePoint(400, 300, -Math.PI / 2, 30, 100, 770, 570, out)
  assert.ok(Math.abs(out.x - 400) < 1e-6 && Math.abs(out.y - 100) < 1e-6, 'up stops under the top band')
})

test('the dawn card leaves out what did not happen, and wraps between parts', () => {
  const [head, tail] = dawnParts({ wave: 7, kills: 84, coins: 412, swept: { stone: 120, wood: 40, coins: 9 }, sacked: 2 })
  assert.deepEqual(head, ['Night 7 held', '84 slain', '+412 coins'])
  assert.deepEqual(tail, ['swept 120 stone, 40 wood', '2 sacked, mending'])
  assert.deepEqual(dawnParts({ wave: 1, kills: 0, coins: 0, swept: {}, sacked: 0 }), [['Night 1 held'], []])
  const len = s => s.length
  assert.deepEqual(packParts(head, len, 99), ['Night 7 held · 84 slain · +412 coins'])
  assert.deepEqual(packParts(head, len, 26), ['Night 7 held · 84 slain', '+412 coins'])
})
