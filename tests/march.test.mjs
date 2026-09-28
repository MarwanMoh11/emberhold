import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { Approaches, FRONT_STAGGER, POST_BACK, frontPost, frontStagger, inHold } = await loadTs('src/systems/Approaches.ts')
const { NavGrid } = await loadTs('src/world/NavGrid.ts')
const { raster, HALL, REGION_BY_ID } = await loadTs('src/config/world/index.ts')
const { HOLD } = await loadTs('src/config/balance.ts')

test('the hold is the hold region or within the assault radius of the hall', () => {
  assert.ok(inHold(HALL.x, HALL.y))
  assert.ok(inHold(HALL.x + HOLD.assaultRadius - 10, HALL.y))
  assert.ok(!inHold(HALL.x + 4000, HALL.y + 4000))
  assert.ok(!inHold(-100, -100), 'off the map is not the hold')
})

test('a post stands POST_BACK px of route outside where the route enters the hold', () => {
  // a straight route along x, 32 px a point; the hold starts at x = 640
  const route = Array.from({ length: 40 }, (_, i) => [i * 32, 0])
  const post = frontPost(route, x => x >= 640)
  assert.equal(post.x, 640 - Math.ceil(POST_BACK / 32) * 32)
  assert.equal(post.y, 0)
  // never entering it: the last point before the hall; empty: no post
  assert.deepEqual(frontPost(route, () => false), { x: 38 * 32, y: 0 })
  assert.equal(frontPost([], () => true), null)
  // already inside at the spawn: the spawn itself
  assert.deepEqual(frontPost(route, () => true), { x: 0, y: 0 })
})

test("the south road's post is on its route, just outside the hold", () => {
  const r = raster()
  const nav = new NavGrid(r, { hall: HALL })
  const idx = REGION_BY_ID.get('hold').index
  const mask = new Uint8Array(r.N)
  for (let i = 0; i < r.N; i++) if (r.region[i] === idx) mask[i] = 1
  const a = new Approaches({ nav, claimMask: () => mask, claimed: id => id === 'hold', campState: () => 'asleep' })
  const route = a.marchRoute('south')
  const post = frontPost(route, inHold)
  assert.ok(!inHold(post.x, post.y), 'the post is outside the hold')
  assert.ok(route.some(p => p[0] === post.x && p[1] === post.y), 'the post is a route point')
  const d = Math.hypot(post.x - HALL.x, post.y - HALL.y)
  assert.ok(d > HOLD.assaultRadius && d < HOLD.assaultRadius + POST_BACK + 400, `post ${Math.round(d)} px from the hall`)
})

test('fronts arrive one after another; the raid goes with the first', () => {
  const plan = { fronts: ['south', 'west'] }
  assert.equal(frontStagger(plan, 'south'), 0)
  assert.equal(frontStagger(plan, 'west'), FRONT_STAGGER)
  assert.equal(frontStagger(plan, 'someRaid'), 0)
})
