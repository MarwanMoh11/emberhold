import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './load-ts.mjs'

const { WaveManager } = await loadTs('src/systems/WaveManager.ts')

test('a lost night retries the same wave after a rebuild day', () => {
  const waves = Object.create(WaveManager.prototype)
  waves.wave = 4
  waves.phase = 'night'
  waves.phaseT = 12
  waves.nightElapsed = 42
  waves.queue = [{ key: 'grunt' }]
  waves.queueHead = 0
  waves.remaining = 1
  waves.current = {}
  waves.bossName = 'Night boss'
  waves.recoverSettlement()
  assert.equal(waves.wave, 3)
  assert.equal(waves.phase, 'day')
  assert.equal(waves.phaseT, 46)
  assert.equal(waves.nightElapsed, 0)
  assert.equal(waves.remaining, 0)
  assert.deepEqual(waves.queue, [])
  assert.equal(waves.current, null)
  assert.equal(waves.bossName, null)
})

test('a daytime loss also grants a full rebuild day', () => {
  const waves = Object.create(WaveManager.prototype)
  waves.wave = 3
  waves.phase = 'day'
  waves.phaseT = 2
  waves.nightElapsed = 0
  waves.queue = []
  waves.queueHead = 0
  waves.remaining = 0
  waves.recoverSettlement()
  assert.equal(waves.wave, 3)
  assert.equal(waves.phaseT, 46)
})

test('loading an interrupted night also retries its wave', () => {
  const waves = Object.create(WaveManager.prototype)
  waves.load({ wave: 4, wavesCleared: 3, phase: 'night' })
  assert.equal(waves.wave, 3)
  assert.equal(waves.wavesCleared, 3)
  assert.equal(waves.phase, 'day')
  assert.equal(waves.phaseT, 8.01)
})

test('loading a saved settlement loss grants rebuilding time', () => {
  const waves = Object.create(WaveManager.prototype)
  waves.load({ wave: 4, wavesCleared: 3, phase: 'night' }, true)
  assert.equal(waves.wave, 3)
  assert.equal(waves.phase, 'day')
  assert.equal(waves.phaseT, 46)
})

test('loading during the day preserves the time left to prepare', () => {
  const waves = Object.create(WaveManager.prototype)
  waves.load({ wave: 4, wavesCleared: 4, phase: 'day', phaseT: 9.5 })
  assert.equal(waves.wave, 4)
  assert.equal(waves.phase, 'day')
  assert.equal(waves.phaseT, 9.5)
})

test('older daytime saves without a countdown still load', () => {
  const waves = Object.create(WaveManager.prototype)
  waves.load({ wave: 2, wavesCleared: 2, phase: 'day' })
  assert.equal(waves.wave, 2)
  assert.equal(waves.phaseT, 46)
})
