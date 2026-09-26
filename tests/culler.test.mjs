import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { Culler } = await loadTs('src/systems/Culler.ts')

const cam = (scrollX, scrollY, zoom = 1) => ({ id: 1, scrollX, scrollY, width: 800, height: 600, zoom })
const obj = () => ({ cameraFilter: 0, visible: true })
const hidden = o => (o.cameraFilter & 1) !== 0

test('objects beyond the view and its margin are culled, and come back', () => {
  const c = new Culler()
  const near = obj(), edge = obj(), far = obj()
  c.add(near, 400, 300, 20)
  c.add(edge, 800 + 256 + 30, 300, 40) // its disc reaches into the margin
  c.add(far, 3000, 2500, 40)
  c.update(cam(0, 0), 0)
  assert.deepEqual([hidden(near), hidden(edge), hidden(far)], [false, false, true])
  assert.deepEqual(c.stats(), { total: 3, shown: 2, movers: 0 })

  c.update(cam(2600, 2200), 1)
  assert.deepEqual([hidden(near), hidden(edge), hidden(far)], [true, true, false])
  assert.deepEqual(c.stats(), { total: 3, shown: 1, movers: 0 })
})

test('the culler never touches visible, so the game keeps its own', () => {
  const c = new Culler()
  const rock = obj()
  c.add(rock, 3000, 3000, 20)
  c.update(cam(0, 0), 0)
  rock.visible = false // felled while off screen
  c.update(cam(2700, 2700), 1)
  assert.equal(hidden(rock), false)
  assert.equal(rock.visible, false)
})

test('a still camera re-culls on the interval; a moved one at once', () => {
  const c = new Culler()
  const o = obj()
  c.add(o, 1500, 300, 10)
  c.update(cam(0, 0), 0)
  assert.equal(hidden(o), true)
  c.update(cam(60, 0), 10) // under the move step and the interval: skipped
  assert.deepEqual(c.stats().shown, 0)
  c.update(cam(500, 0), 20) // moved: re-culled
  assert.equal(hidden(o), false)
  c.update(cam(500, 0, 0.25), 30) // zoomed out: re-culled
  assert.equal(hidden(o), false)
})

test('zooming out widens the view', () => {
  const c = new Culler()
  const o = obj()
  c.add(o, 1400, 300, 10)
  c.update(cam(0, 0), 0)
  assert.equal(hidden(o), true)
  c.update(cam(0, 0, 0.5), 1) // 1600 px wide around x = 400, plus the margin
  assert.equal(hidden(o), false)
})

test('remove gives a hidden object back to the camera', () => {
  const c = new Culler()
  const o = obj()
  c.add(o, 5000, 5000, 10)
  c.update(cam(0, 0), 0)
  assert.equal(hidden(o), true)
  c.remove(o)
  assert.equal(hidden(o), false)
  assert.deepEqual(c.stats(), { total: 0, shown: 0, movers: 0 })
})

test('movers are culled every frame from where they stand, and come back when they walk in', () => {
  const c = new Culler()
  const unit = { cameraFilter: 0, x: 400, y: 300 }
  c.addMover(unit)
  c.update(cam(0, 0), 0)
  assert.equal(hidden(unit), false)
  unit.x = 800 + 128 + 10 // just past the mover margin
  c.update(cam(0, 0), 1) // a still camera, well inside the interval: movers still re-cull
  assert.equal(hidden(unit), true)
  unit.x = 700
  c.update(cam(0, 0), 2)
  assert.equal(hidden(unit), false)
  assert.equal(c.stats().movers, 1)
})
