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
  assert.ok(csv.text.includes('"機車位","999-3","127",""'))
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
test('result page capacity is configurable and includes every household', async () => {
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
  vm.setPageCapacity('results', 9)
  assert.equal(vm.resultPages.value, 3)
  const combined = Array.from({ length: vm.resultPages.value }, (_, i) => vm.resultRows.value.slice(i * vm.resultPageSize.value, (i + 1) * vm.resultPageSize.value)).flat()
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

test('result pages show for three seconds then highlight each row for one second and wait two seconds', async () => {
  let now = 0
  const scope = effectScope(), mock = backend(2)
  const originalStage = mock.service.stage
  mock.service.stage = async (n: any) => {
    const value = structuredClone(await originalStage(n))
    if (n === 2) value.pools[0].assignments = Array.from({ length: 5 }, (_, i) => ({ household: `999-${i + 1}`, spaceId: String(86 + i) }))
    return value
  }
  const vm = scope.run(() => useLiveShow(mock.service, () => now))!
  await vm.start(1)
  await vm.advance(); await vm.advance(); await vm.advance(); await vm.advance()
  vm.setPageCapacity('results', 3)
  assert.equal(vm.duration.value, 15) // 3+3+2, then 3+2+2.
  for (const [time, page, highlight] of [[2.8,0,-1],[3,0,0],[4,0,1],[5,0,2],[6,0,-1],[7.8,0,-1],[8,1,-1],[11,1,0],[12,1,1],[13,1,-1],[14.8,1,-1]]) {
    now = time! * 1000; await vm.tick()
    assert.equal(vm.page.value, page)
    assert.equal(vm.highlightedResult.value, highlight)
  }
  now = 15000; await vm.tick()
  assert.equal(vm.step.value, 'households')
  scope.stop()
})

test('CSV exports exactly five columns with one motorcycle category and numeric waitlist ranks', async () => {
  const first = structuredClone(stages[0]), result = structuredClone(stages[6])
  first.accessible.assignments = [{ order: 1, household: '999-4', spaceId: '14' }]
  result.pools[0].assignments = [{ household: '999-2', spaceId: '86' }]
  result.pools[0].waitlist = [{ household: '997-2', rank: 1 }]
  result.pools[0].remainingSpaces = []
  const csv = await resultCsv({ activity: activityFixture, first, result, seed: stages[5], round: 2 })
  const lines = csv.text.slice(1).trim().split('\r\n')
  assert.equal(lines[0], '"輪次","車位類型","戶號","車位","候補"')
  for (const line of lines) assert.equal(line.split(',').length, 5)
  assert.ok(lines.includes('"2","機車位","999-2","86",""'))
  assert.ok(lines.includes('"2","機車位","997-2","","1"'))
  assert.ok(!csv.text.includes('A棟') && !csv.text.includes('B棟'))
  const firstCsv = await resultCsv({ activity: activityFixture, first, result: stages[2], seed: stages[1], round: 1 })
  assert.ok(firstCsv.text.includes('"1","機車位","999-4","14",""'))
})

test('only first-round motorcycle pools show excluded households and quick checks use saved totals', async () => {
  const scope = effectScope(), mock = backend(2)
  const vm = scope.run(() => useLiveShow(mock.service))!
  await vm.start(1)
  const firstPool = vm.quickCheck.value
  assert.equal(firstPool.spaces, 65)
  assert.equal(firstPool.assigned, 3)
  assert.equal(firstPool.remaining, 62)
  assert.equal(firstPool.valid, true)
  vm.poolIndex.value = 2
  assert.ok(vm.householdSlides.value.every(s => s.title === '參與住戶'))
  vm.poolIndex.value = 3
  assert.ok(vm.householdSlides.value.every(s => s.title === '參與住戶'))
  // Finish the first replay before starting the saved second round.
  vm.step.value = 'idle'
  const complete = backend(6)
  const second = scope.run(() => useLiveShow(complete.service))!
  await second.start(2)
  for (let i = 0; i < 3; i++) {
    second.poolIndex.value = i
    assert.ok(second.householdSlides.value.every(s => s.title === '參與住戶'))
    assert.equal(second.quickCheck.value.valid, true)
  }
  scope.stop()
})

test('activity year uses server startup defaults and preserves a saved year', async () => {
  for (const stage of [-1, 2]) {
    const scope = effectScope(), mock = backend(stage)
    const original = mock.service.status
    mock.service.status = async () => ({ ...await original(), defaultActivityYear: 117 })
    const vm = scope.run(() => useLiveShow(mock.service))!
    await vm.activity.refresh()
    assert.equal(vm.year.value, stage === -1 ? 117 : 116)
    vm.year.value = 118
    await vm.activity.refresh()
    assert.equal(vm.year.value, 118)
    scope.stop()
  }
})
test('changing playback speed continues from the current time without jumping', async () => {
  let now = 0
  const scope = effectScope(), mock = backend(2)
  const vm = scope.run(() => useLiveShow(mock.service, () => now))!
  await vm.start(1)
  now = 1000; await vm.tick()
  assert.equal(vm.elapsed.value, 1)
  vm.setSpeed(2)
  assert.equal(vm.elapsed.value, 1)
  now = 2000; await vm.tick()
  assert.equal(vm.elapsed.value, 3)
  vm.setSpeed(1)
  now = 3000; await vm.tick()
  assert.equal(vm.elapsed.value, 4)
  assert.equal(vm.step.value, 'households')
  scope.stop()
})
