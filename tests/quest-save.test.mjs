import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { QuestManager } = await loadTs('src/systems/QuestManager.ts')

test('legacy quest counters recover from the saved world and stay numeric', () => {
  const quests = Object.create(QuestManager.prototype)
  quests.scene = {
    combat: { kills: 80, bossKills: 2 },
    camps: { destroyedCount: 3 },
    zones: { unlockedCount: 4 },
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
