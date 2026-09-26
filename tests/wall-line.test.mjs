import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const W = await loadTs('src/config/world/index.ts')
const BP = await loadTs('src/config/world/blueprint.ts')
const { NavGrid } = await loadTs('src/world/NavGrid.ts')
const { layWallLine, capDiscs, legacyRingPads, GATE_W, WALL_CAP_R } = await loadTs('src/world/wallLine.ts')

const R = W.raster()
const lines = BP.WALLS.map(line => ({ line, pieces: layWallLine(line) }))

/** Every piece of every line registered on one real NavGrid, as if all were built. */
const nav = new NavGrid(R, { hall: W.HALL })
for (const { pieces } of lines) {
  for (const p of pieces) if (p.key === 'wall' && p.cap) nav.setBlockerDiscs(p.id, capDiscs(p.cap), WALL_CAP_R, true)
}

/** A cell sits under a gate when its centre is inside the gate's box: its width along the line, a half-diagonal across. */
function underGate(gates, i) {
  const [cx, cy] = R.xy(i)
  return gates.some(g => {
    const dx = cx - g.x, dy = cy - g.y
    return Math.abs(dx * g.ux + dy * g.uy) <= GATE_W / 2 && Math.abs(-dx * g.uy + dy * g.ux) <= 24
  })
}

/** Points every `every` px along the line's polyline (closed for a ring). */
function samples(line, every = 4) {
  const pts = line.ring ? [...line.pts, line.pts[0]] : line.pts
  const out = []
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / every))
    for (let k = 0; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n])
  }
  return out
}

for (const { line, pieces } of lines) {
  test(`${line.id}: neighbouring pieces are never more than a step apart`, () => {
    const seq = line.ring ? [...pieces, pieces[0]] : pieces
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = seq[i], b = seq[i + 1]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      assert.ok(d <= line.step + 0.5, `${a.id} → ${b.id} is ${d.toFixed(1)} px (step ${line.step})`)
    }
  })

  test(`${line.id}: a post on every vertex, two on every gate, ids by line`, () => {
    const posts = pieces.filter(p => p.part === 'post')
    const gates = pieces.filter(p => p.key === 'gate')
    const nV = line.pts.length
    for (const [vx, vy] of line.pts.slice(0, nV)) {
      const post = posts.some(p => Math.hypot(p.x - vx, p.y - vy) < 1)
      const gate = gates.some(g => Math.hypot(g.x - vx, g.y - vy) < GATE_W / 2)
      assert.ok(post || gate, `vertex (${vx}, ${vy}) has no post`)
    }
    assert.deepEqual(gates.map(g => g.id).sort(), line.gates.map(g => g.id).sort())
    for (const g of gates) {
      const jambs = posts.filter(p => Math.hypot(p.x - g.x, p.y - g.y) <= GATE_W / 2 + 0.5)
      assert.equal(jambs.length, 2, `${g.id} has ${jambs.length} jamb posts`)
    }
    const ids = pieces.filter(p => p.key === 'wall').map(p => p.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const id of ids) assert.match(id, new RegExp(`^${line.id}\\.\\d+$`))
  })

  test(`${line.id}: every cell the line crosses is walled, under a gate, or not ground`, () => {
    const gates = pieces.filter(p => p.key === 'gate')
    const leaks = []
    for (const [x, y] of samples(line)) {
      const i = R.cell(x, y)
      if (i < 0 || nav.blocked(i) || !nav.passable(i) || underGate(gates, i)) continue
      leaks.push([Math.round(x), Math.round(y)])
    }
    assert.deepEqual(leaks, [])
  })

  test(`${line.id}: every gate keeps an open cell, so the horde still has its door`, () => {
    for (const g of pieces.filter(p => p.key === 'gate')) {
      const open = []
      for (let k = -GATE_W / 2; k <= GATE_W / 2; k += 4) {
        const i = R.cell(g.x + g.ux * k, g.y + g.uy * k)
        if (nav.passable(i) && !nav.blocked(i)) open.push(i)
      }
      assert.ok(open.length > 0, `${g.id} is walled shut`)
    }
  })
}

test('the palisade sealed by its walls still lets the hall field in through a gate', () => {
  const f = nav.field('hall')
  for (const [x, y] of [[5120, 2300], [6000, 3150], [5120, 4000], [4200, 3150]]) {
    let i = R.cell(x, y), walls = 0
    for (let guard = 0; guard < 10000; guard++) {
      const j = f.nextCell(i)
      if (j < 0) break
      if (nav.blocked(j)) walls++
      i = j
    }
    assert.equal(walls, 0, `from (${x}, ${y}) the field goes through ${walls} walled cells`)
  }
})

test('every old wall id has a new piece within reach', () => {
  const palisade = BP.WALLS.find(w => w.id === 'palisade')
  const pieces = layWallLine(palisade).filter(p => p.key === 'wall')
  const old = legacyRingPads(palisade)
  assert.ok(old.length > 60)
  for (const o of old) {
    const d = Math.min(...pieces.map(p => Math.hypot(p.x - o.x, p.y - o.y)))
    assert.ok(d <= 40, `${o.id} is ${d.toFixed(1)} px from any piece`)
  }
})
