import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { QuestManager } = await loadTs('src/systems/QuestManager.ts')

test('legacy quest counters recover from the saved world and stay numeric', () => {
  const quests = Object.create(QuestManager.prototype)
  quests.scene = {
    combat: { kills: 80, bossKills: 2 },
    camps: { destroyedCount: 3 },
    regions: { claimedCount: 4 },
    waves: { wave: 5 },
    saves: { playtime: 100 },
  }
  quests.load({
    index: 10, done: [], achievements: [], defeatedBosses: [], finalBossHp: 0,
    victoryAt: 0, victoryWave: 0, victoryPlaytime: 0,
  })
  assert.deepEqual(quests.stats, {
    kills: 80, bossKills: 2, campsCleared: 3, zonesClaimed: 3,
  })
  quests.kills++
  assert.equal(quests.stats.kills, 81)
})

test('Campaign 2.0 ids: a new save round-trips; an old chain walks the new one silently', async () => {
  const { QUESTS } = await loadTs('src/config/quests.ts')
  const emitted = []
  const scene = {
    bus: { emit: (k) => emitted.push(k) },
    combat: { kills: 0, bossKills: 0 },
    camps: { destroyedCount: 0 },
    regions: { claimedCount: 1 },
    waves: { wave: 0, wavesCleared: 0 },
    saves: { playtime: 0 },
    res: { totalGathered: { coins: 90 } },
    buildings: { countBuilt: k => (k === 'lumberCamp' || k === 'farm' ? 1 : 0) },
    workers: { count: 2 },
  }
  const fresh = () => { const q = Object.create(QuestManager.prototype); q.scene = scene; return q }
  const base = { achievements: [], defeatedBosses: [], finalBossHp: 0, victoryAt: 0, victoryWave: 0, victoryPlaytime: 0 }

  const now = fresh()
  now.load({ ...base, index: 3, done: ['a1', 'a2', 'a3'] })
  assert.equal(now.current.id, 'a4')
  assert.deepEqual(now.toJSON.call({ ...now, scene: { camps: { camps: [] }, enemies: { list: [] } } }).done, ['a1', 'a2', 'a3'])

  const old = fresh()
  old.load({ ...base, index: 12, done: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12'] })
  assert.equal(old.index, 0)
  old.fastForward()
  // coins, the lumber camp, two workers and the farm are there; night 1 is not
  assert.equal(old.current.id, 'a5')
  assert.deepEqual([...old.done], ['a1', 'a2', 'a3', 'a4'])
  assert.deepEqual(emitted, [], 'no rewards, no banners')
  assert.ok(old.index < QUESTS.length)
})
