import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { useActivity } from '../client/src/viewmodels/useActivity.ts'
import { ApiError, createActivityApi } from '../client/src/api/activity.ts'
import type { ActivityApi } from '../client/src/api/activity.ts'
import type { CurrentStage, Stage, StageTypes, Status } from '../client/src/models/activity.ts'

const fixtures: Partial<StageTypes> = {}
for (let number = 0; number <= 6; number++) {
  Object.assign(fixtures, { [number]: JSON.parse(await readFile(new URL(`../examples/workspace/checkpoints/${number}/state.json`, import.meta.url), 'utf8')) })
}
function backend(initial: CurrentStage) {
  let stage = initial
  let failRefresh = false
  const calls: { round: number; button?: string }[] = []
  let dropResponse = false
  const status: Status = { currentStage: initial, version: 'dev', workspace: '/fake/annual', activity: { schemaVersion: 1, activityId: 'fake', activityYear: 116, mode: 'test', createdAt: '2026-10-26T00:00:00Z', createdByAppVersion: 'dev' } }
  const api: ActivityApi = {
    async status() { if (failRefresh) throw new Error('offline'); return { ...status, currentStage: stage } },
    async stage<K extends Stage>(n: K) { assert.ok(n <= stage); return structuredClone(fixtures[n]) as StageTypes[K] },
    async initialize(year, mode) { status.activity = { ...status.activity!, activityYear: year, mode } },
    async importRegistration() { stage = 0 },
    async importPayments() { stage = 3 },
    async review() { stage = 4 },
    async draw(round, button) {
      calls.push({ round, button })
      await new Promise(resolve => setTimeout(resolve, 10))
      stage = round === 1 ? 2 : 6
      if (dropResponse) throw new Error('connection lost after commit')
    },
  }
  return { api, calls, setDropResponse(value: boolean) { dropResponse = value }, setOffline(value: boolean) { failRefresh = value }, clearActivity() { status.activity = null } }
}

test('client restores every saved prefix without writes and limits phase navigation', async () => {
  for (let stage = -1; stage <= 6; stage++) {
    const fake = backend(stage as CurrentStage), vm = useActivity(fake.api)
    await vm.refresh()
    assert.equal(vm.currentStage.value, stage)
    assert.equal(fake.calls.length, 0)
    assert.equal(Object.keys(vm.checkpoints.value).length, stage + 1)
    vm.selectPhase('second')
    assert.equal(vm.selectedPhase.value === 'second', stage >= 4)
  }
})
test('client sends one timestamped draw, shows saved result, and preserves backend progress', async () => {
  const fake = backend(0), vm = useActivity(fake.api)
  await vm.refresh()
  await Promise.all([vm.runNext(), vm.runNext()])
  assert.equal(fake.calls.length, 1)
  assert.ok(fake.calls[0]!.button)
  assert.equal(fake.calls[0]!.button, vm.buttonPressedAt.value)
  assert.equal(vm.currentStage.value, 2)
  assert.equal(vm.selectedPhase.value, 'first')
  assert.ok(vm.poolResult.value)
  assert.equal(vm.currentPhase.value, 'payments')
  assert.equal(vm.canRunNext.value, false)
})
test('client resumes seed checkpoints without supplying a new click timestamp', async () => {
  for (const stage of [1, 5] as const) {
    const fake = backend(stage), vm = useActivity(fake.api)
    await vm.refresh(); await vm.runNext()
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0]!.button, undefined)
    assert.equal(fake.calls[0]!.round, stage === 1 ? 1 : 2)
  }
})
test('client reconciles a dropped write response with GETs instead of repeating the draw', async () => {
  const fake = backend(0), vm = useActivity(fake.api)
  fake.setDropResponse(true)
  await vm.refresh(); await vm.runNext()
  assert.equal(vm.currentStage.value, 2)
  assert.equal(fake.calls.length, 1)
  assert.equal(vm.outcomeUnknown.value, false)
  assert.match(vm.error.value, /connection lost/)
})
test('client blocks writes until an uncertain outcome can be refreshed', async () => {
  const fake = backend(0), vm = useActivity(fake.api)
  await vm.refresh()
  fake.setDropResponse(true); fake.setOffline(true)
  await vm.runNext(); await vm.runNext()
  assert.equal(fake.calls.length, 1)
  assert.equal(vm.outcomeUnknown.value, true)
  assert.equal(vm.canOperate.value, false)
  fake.setOffline(false)
  await vm.refresh()
  assert.equal(vm.currentStage.value, 2)
  assert.equal(vm.canOperate.value, true)
})
test('client requires an explicit activity year and defaults are never derived from the clock', async () => {
  const fake = backend(-1), vm = useActivity(fake.api)
  fake.clearActivity(); await vm.refresh()
  await vm.runNext()
  assert.equal(vm.currentStage.value, -1)
  await vm.initialize(0, 'test')
  assert.match(vm.error.value, /年度/)
  await vm.initialize(116, 'test')
  assert.equal(vm.requiresActivity.value, false)
  await vm.runNext()
  assert.equal(vm.currentStage.value, 0)
})
test('client HTTP adapter uses v1 and empty-body CSV commands, and retains structured errors', async () => {
  const requests: { url: string; init?: RequestInit }[] = []
  const api = createActivityApi(async (url, init) => {
    requests.push({ url: String(url), init })
    return new Response(JSON.stringify({ error: 'invalid row', issues: [{ fileName: 'A棟資料.csv', row: 2, column: '機車位', message: 'missing' }] }), { status: 400 })
  })
  await assert.rejects(api.importRegistration(), (error: unknown) => error instanceof ApiError && error.issues[0]?.row === 2)
  assert.equal(requests[0]!.url, '/api/v1/csv-imports/registration')
  assert.equal(requests[0]!.init?.method, 'POST')
  assert.equal(requests[0]!.init?.body, undefined)
})
