import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { useSavedArrivals } from '../client/src/viewmodels/useSavedArrivals.ts'
import { savedArrivalRecords, savedSplitSpaces } from '../client/src/models/parking/saved-arrivals.ts'
import { arrivalDuration, cardPosition, createArrivalCards } from '../client/src/models/parking/arrival.ts'
import type { AllocationState, FirstState, Status } from '../client/src/models/activity.ts'
import type { ActivityApi } from '../client/src/api/activity.ts'
const load = (stage: number) => JSON.parse(readFileSync(new URL(`../examples/workspace/checkpoints/${stage}/state.json`, import.meta.url), 'utf8'))
const first: FirstState = load(0), result: AllocationState = load(2)
function api(currentStage = 6) {
  const calls: string[] = []
  let status: Status = { version: 'dev', workspace: '/fictional', currentStage: currentStage as 6, activity: JSON.parse(readFileSync(new URL('../examples/workspace/activity.json', import.meta.url), 'utf8')) }
  return { calls, setStatus(value: Status) { status = value }, service: {
    async status() { calls.push('status'); return status },
    async stage(n: number) { calls.push(`stage:${n}`); return load(n) },
  } as ActivityApi }
}
test('saved results map directly to arrival records and accessible split geometry', () => {
  assert.deepEqual(savedSplitSpaces(first), ['14', '2', '3'])
  const records = savedArrivalRecords(first, result, 'motorcycle_a')
  assert.deepEqual(records.map(r => ({ household: r.household, spaceId: r.spaceId })), result.pools[0]!.assignments)
  const changed = structuredClone(result)
  changed.pools[0]!.assignments[0]!.spaceId = '151'
  assert.throws(() => savedArrivalRecords(first, changed, 'motorcycle_a'), /Unknown arrival/)
})
test('saved viewer reads only the selected completed round and rejects unavailable rounds', async () => {
  const mock = api(), vm = useSavedArrivals(mock.service)
  await vm.load('motorcycle_b')
  assert.deepEqual(mock.calls, ['status', 'stage:0', 'stage:2', 'status'])
  assert.equal(vm.poolId.value, 'motorcycle_b')
  assert.equal(vm.records.value.length, 2)
  vm.round.value = 2
  await vm.load()
  assert.equal(vm.poolId.value, 'motorcycle')
  assert.equal(vm.snapshot.value?.round, 2)
  const notReady = useSavedArrivals(api(0).service)
  await notReady.load()
  assert.match(notReady.error.value, /尚無第一輪/)
  assert.equal(notReady.snapshot.value, null)
})
test('full-size replay finishes every vehicle instead of truncating after thirty seconds', () => {
  const records = Array.from({ length: 150 }, (_, i) => ({ id: `test:${i}`, household: `999-${i + 1}`, spaceId: String(i + 1), stagingIndex: i }))
  const cards = createArrivalCards('motorcycle', records)
  const duration = arrivalDuration(cards)
  assert.ok(duration > 30)
  assert.ok(cards.every(c => cardPosition(c, duration).arrived))
  const positions = cards.map(c => c.route[0]!)
  assert.ok(Math.max(...positions.map(p => p[1])) - Math.min(...positions.map(p => p[1])) <= 85 * 0.045 + 1e-9)
})
test('a changing activity or failed refresh never leaves stale playable results', async () => {
  const mock = api(), vm = useSavedArrivals(mock.service)
  await vm.load()
  assert.ok(vm.snapshot.value)
  let reads = 0
  const original = mock.service.status
  mock.service.status = async () => {
    const value = await original()
    return ++reads === 2 ? { ...value, currentStage: 5 } : value
  }
  await vm.load()
  assert.equal(vm.snapshot.value, null)
  assert.equal(vm.records.value.length, 0)
  assert.match(vm.error.value, /進度.*改變/)
})
