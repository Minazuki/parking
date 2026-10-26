import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope } from 'vue'
import { readFileSync } from 'node:fs'
import { useLiveShow } from '../client/src/viewmodels/useLiveShow.ts'
import { resultCsv } from '../client/src/models/result-csv.ts'
import type { ActivityApi } from '../client/src/api/activity.ts'
const stages = Object.fromEntries(Array.from({ length: 7 }, (_, n) => [n, JSON.parse(readFileSync(new URL(`../examples/workspace/checkpoints/${n}/state.json`, import.meta.url), 'utf8'))]))
const activityFixture = JSON.parse(readFileSync(new URL('../examples/workspace/activity.json', import.meta.url), 'utf8'))
function backend(initial = -1) {
  let current = initial, activity = initial < 0 ? null : activityFixture
  const calls: string[] = []
  const service = {
    async status() { return { version: 'dev', workspace: '/fictional', currentStage: current, activity } },
    async stage(n: number) { return stages[n] },
    async initialize() { calls.push('initialize'); activity = activityFixture },
    async importRegistration() { calls.push('registration'); current = 0 },
    async importPayments() { calls.push('payments'); current = 3 },
    async review() { calls.push('review'); current = 4 },
    async draw(round: number) { calls.push(`draw:${round}`); current = round === 1 ? 2 : 6 },
  } as ActivityApi
  return { service, calls, get current() { return current } }
}
test('one first-round start imports and draws once, automatically finishes every pool and stops before payment import', async () => {
  const scope = effectScope(), mock = backend()
  const vm = scope.run(() => useLiveShow(mock.service))!
  await vm.start(1)
  assert.equal(vm.step.value, 'households')
  const visited = new Set<string>()
  for (let i = 0; i < 30 && vm.step.value !== 'finished'; i++) {
    visited.add(vm.pool.value!.id)
    await vm.advance()
  }
  assert.equal(vm.step.value, 'finished')
  assert.equal(visited.size, 4)
  assert.deepEqual(mock.calls, ['initialize', 'registration', 'draw:1'])
  assert.equal(mock.current, 2)
  scope.stop()
})
test('offline review is independent, draws no seed, and second-round start consumes only the prepared pools', async () => {
  const scope = effectScope(), mock = backend(2)
  const vm = scope.run(() => useLiveShow(mock.service))!
  await vm.start(2)
  assert.equal(vm.step.value, 'error')
  assert.deepEqual(mock.calls, [])
  await vm.reviewPayments()
  assert.equal(vm.step.value, 'review')
  assert.deepEqual(mock.calls, ['payments', 'review'])
  assert.equal(mock.current, 4)
  await vm.start(2)
  for (let i = 0; i < 25 && vm.step.value !== 'finished'; i++) await vm.advance()
  assert.equal(vm.step.value, 'finished')
  assert.deepEqual(mock.calls, ['payments', 'review', 'draw:2'])
  scope.stop()
})
test('resuming a saved seed draws with that seed and replaying a complete round never redraws', async () => {
  const scope = effectScope(), mock = backend(1)
  const vm = scope.run(() => useLiveShow(mock.service))!
  await vm.start(1); await vm.advance(); await vm.advance()
  assert.deepEqual(mock.calls, ['draw:1'])
  for (let i = 0; i < 30 && vm.step.value !== 'finished'; i++) await vm.advance()
  await vm.start(1); await vm.advance(); await vm.advance()
  assert.deepEqual(mock.calls, ['draw:1'])
  scope.stop()
})
test('CSV export includes saved assignments, BOM, CRLF and a reproducible result hash', async () => {
  const input = { activity: activityFixture, first: stages[0], result: stages[2], seed: stages[1], round: 1 as const }
  const csv = await resultCsv(input), again = await resultCsv(input)
  assert.deepEqual(csv, again)
  assert.ok(csv.text.startsWith('\uFEFF'))
  assert.ok(csv.text.includes('"999-3","配位","127"'))
  assert.ok(csv.text.endsWith('\r\n'))
  assert.match(csv.fileName, /round33382601_[a-f0-9]{8}\.csv$/)
  const changed = structuredClone(input); changed.result.pools[0].assignments[0].spaceId = '128'
  assert.notEqual((await resultCsv(changed)).fileName, csv.fileName)
})
test('import errors stop before any draw or automatic continuation', async () => {
  const scope = effectScope(), mock = backend()
  mock.service.importRegistration = async () => { throw new Error('CSV invalid') }
  const vm = scope.run(() => useLiveShow(mock.service))!
  await vm.start(1)
  assert.equal(vm.step.value, 'error')
  assert.deepEqual(mock.calls, ['initialize'])
  assert.equal(mock.current, -1)
  scope.stop()
})
test('automatic result pages include every household with no page larger than six rows', async () => {
  const scope = effectScope(), mock = backend(2)
  const originalStage = mock.service.stage
  mock.service.stage = async (n: any) => {
    const value = structuredClone(await originalStage(n))
    if (n === 2) value.pools[0].assignments = Array.from({ length: 20 }, (_, i) => ({ household: `999-${i + 1}`, spaceId: String(86 + i) }))
    return value
  }
  const vm = scope.run(() => useLiveShow(mock.service))!
  await vm.start(1)
  await vm.advance(); await vm.advance(); await vm.advance(); await vm.advance()
  assert.equal(vm.step.value, 'results')
  assert.equal(vm.resultPages.value, 4)
  const combined = Array.from({ length: vm.resultPages.value }, (_, i) => vm.resultRows.value.slice(i * vm.resultPageSize, (i + 1) * vm.resultPageSize)).flat()
  assert.equal(combined.length, 20)
  assert.equal(new Set(combined.map(r => r.household)).size, 20)
  assert.deepEqual(mock.calls, [])
  scope.stop()
})
test('leaving while preparing cancels later automatic writes after the in-flight read completes', async () => {
  const scope = effectScope(), mock = backend()
  const original = mock.service.status
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  mock.service.status = async () => { await pending; return original() }
  const vm = scope.run(() => useLiveShow(mock.service))!
  const started = vm.start(1)
  scope.stop(); release(); await started
  assert.deepEqual(mock.calls, [])
  assert.equal(mock.current, -1)
})
