import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readWorkspace, validateState, type Stage0 } from '../tools/verify-draw/ts/checkpoints.mts'
const root = fileURLToPath(new URL('../', import.meta.url)), fixture = join(root, 'examples/workspace')
const exec = promisify(execFile)
const json = async (p: string) => JSON.parse(await readFile(p, 'utf8'))
const write = (p: string, x: unknown) => writeFile(p, JSON.stringify(x, null, 2) + '\n')
async function sandbox(t: any) {
  await mkdir(join(root, 'tmp'), { recursive: true })
  const dir = await mkdtemp(join(root, 'tmp/checkpoints-test-'))
  t.after(() => rm(dir, { recursive: true }))
  return dir
}
async function snapshot(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) for (const [name, data] of Object.entries(await snapshot(p))) files[entry.name + '/' + name] = data
    else files[entry.name] = await readFile(p, 'utf8')
  }
  return files
}

test('loads all seven stages, verifies BLS and allocations offline, and leaves source untouched', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Workspace read must be offline') })
  const before = await snapshot(fixture), workspace = await readWorkspace(fixture)
  assert.equal(workspace.currentStage, 6)
  assert.equal(workspace.stages.size, 7)
  for (const [stage, state] of workspace.stages) validateState(stage, state)
  assert.deepEqual(await snapshot(fixture), before)
})

test('each removed checkpoint suffix restores the last complete stage, ignoring stale progress and pending dirs', async t => {
  const dir = await sandbox(t), copy = join(dir, 'workspace'); await cp(fixture, copy, { recursive: true })
  const activity = await json(join(copy, 'activity.json')); activity.currentStage = 6
  await write(join(copy, 'activity.json'), activity)
  await cp(join(copy, 'checkpoints/1'), join(copy, 'checkpoints/1.pending'), { recursive: true })
  for (let n = 6; n >= 0; n--) {
    await rm(join(copy, 'checkpoints', String(n)), { recursive: true })
    assert.equal((await readWorkspace(copy)).currentStage, n - 1)
  }
  assert.ok(await readFile(join(copy, 'checkpoints/1.pending/info.json')))
  const empty = join(dir, 'empty'); await mkdir(empty)
  assert.equal((await readWorkspace(empty)).currentStage, -1)
})

test('missing middle stages, partial committed states and unknown versions fail instead of resetting', async t => {
  const dir = await sandbox(t)
  const cases = [
    async (p: string) => write(join(p, 'activity.json'), null),
    async (p: string) => rm(join(p, 'checkpoints/3'), { recursive: true }),
    async (p: string) => rm(join(p, 'checkpoints/6/state.json')),
    async (p: string) => mkdir(join(p, 'checkpoints/7')),
    async (p: string) => { const s = await json(join(p, 'checkpoints/0/state.json')); s.schemaVersion = 9; await write(join(p, 'checkpoints/0/state.json'), s) },
    async (p: string) => writeFile(join(p, 'checkpoints/0/state.json'), '{'),
    async (p: string) => { const s = await json(join(p, 'checkpoints/3/state.json')); s.payments[0].motorcycle = 'false'; await write(join(p, 'checkpoints/3/state.json'), s) },
  ]
  for (const [i, mutate] of cases.entries()) {
    const copy = join(dir, String(i)); await cp(fixture, copy, { recursive: true }); await mutate(copy)
    const before = await snapshot(copy)
    await assert.rejects(readWorkspace(copy))
    assert.deepEqual(await snapshot(copy), before)
  }
})

test('tampered seed, signed beacon, stream, allocation, review, or pool ordering is rejected', async t => {
  const dir = await sandbox(t)
  const mutations: [string, (x: any) => void][] = [
    ['1/state.json', x => { x.seed = '00'.repeat(32) }],
    ['1/state.json', x => { x.requestStartedAt = 'invalid' }],
    ['1/state.json', x => { x.buttonPressedAt = '2030-01-01T00:00:00Z' }],
    ['1/beacon.json', x => { x.signature = '00'.repeat(48) }],
    ['2/state.json', x => { x.streamHex = '00' + x.streamHex.slice(2) }],
    ['6/state.json', x => { x.pools[0].assignments[0].household = '999-99' }],
    ['4/state.json', x => { x.review[0].released = [] }],
    ['4/state.json', x => { x.spaceOrigins.pop() }],
    ['0/state.json', x => { x.pools[0].households.reverse() }],
    ['0/state.json', x => { x.accessible.splitSpaces = [] }],
  ]
  for (const [i, [file, mutate]] of mutations.entries()) {
    const copy = join(dir, String(i)); await cp(fixture, copy, { recursive: true })
    const path = join(copy, 'checkpoints', file), data = await json(path); mutate(data); await write(path, data)
    await assert.rejects(readWorkspace(copy), `accepted tampered ${file}`)
  }
})

test('schema validates without silently coercing or dropping fields', async () => {
  const original = await json(join(fixture, 'checkpoints/3/state.json'))
  const bad = structuredClone(original); bad.payments[0].motorcycle = 0
  assert.throws(() => validateState(3, bad))
  assert.equal(bad.payments[0].motorcycle, 0)
  const extra = structuredClone(original); extra.upstreamHash = 'unused'
  assert.throws(() => validateState(3, extra))
  const extraSeed = await json(join(fixture, 'checkpoints/1/state.json')); extraSeed.input = {}
  assert.throws(() => validateState(1, extraSeed))
})

test('accessible A assignment removes the household, splits unused spaces and transfers one slot', async t => {
  const dir = await sandbox(t), copy = join(dir, 'workspace'); await cp(fixture, copy, { recursive: true })
  for (let n = 1; n <= 6; n++) await rm(join(copy, 'checkpoints', String(n)), { recursive: true })
  const state = await json(join(copy, 'checkpoints/0/state.json')) as Stage0
  state.accessible = { assignments: [{ order: 1, household: '999-2', spaceId: '14' }], splitSpaces: ['2', '2-1', '3', '3-1'], transferredSpaces: ['86'] }
  state.pools[0].households.shift(); state.pools[0].candidates.shift()
  state.pools[1].candidates = state.pools[1].candidates.filter(c => c.type !== 'space' || !['14', '14-1'].includes(c.spaceId))
  state.pools[1].candidates.push({ type: 'space', spaceId: '86' })
  await write(join(copy, 'checkpoints/0/state.json'), state)
  assert.equal((await readWorkspace(copy)).currentStage, 0)
})

test('shell verifies both rounds directly from checkpoints and refuses to write inside workspace', async t => {
  const dir = await sandbox(t), script = join(root, 'tools/verify-draw.sh')
  const before = await snapshot(fixture)
  for (const round of [1, 2]) {
    const output = join(dir, `round ${round}`)
    await exec('bash', [script, '--workspace', fixture, '--draw-round', String(round), '--output', output], { maxBuffer: 1024 * 1024 })
    const result = await json(join(output, 'comparison.json'))
    assert.equal(result.matches, true); assert.equal(result.expectedMatches, true)
  }
  const inside = join(fixture, 'must-not-exist')
  await assert.rejects(exec('bash', [script, '--workspace', fixture, '--draw-round', '1', '--output', inside]))
  await assert.rejects(exec('bash', [script, '--workspace', fixture, '--draw-round', '2', '--input', fixture, '--output', join(dir, 'bad-mode')]))
  assert.deepEqual(await snapshot(fixture), before)
})

test('all-skipped saved allocation still requires valid saved seed evidence', async t => {
  const { drawRound } = await import('../client/src/domain/draw.mts')
  const dir = await sandbox(t), copy = join(dir, 'workspace'); await cp(fixture, copy, { recursive: true })
  for (let n = 3; n <= 6; n++) await rm(join(copy, 'checkpoints', String(n)), { recursive: true })
  const state = await json(join(copy, 'checkpoints/0/state.json'))
  for (const rows of Object.values(state.registrations) as any[]) for (const row of rows) { row.motorcycle = 0; row.bicycleLarge = 0; row.bicycleSmall = 0 }
  for (const pool of state.pools) pool.households = []
  await write(join(copy, 'checkpoints/0/state.json'), state)
  const seed = await json(join(copy, 'checkpoints/1/state.json'))
  const result = drawRound(seed.seed, { schemaVersion: 1, drawRound: 1, pools: state.pools })
  await write(join(copy, 'checkpoints/2/state.json'), result)
  assert.equal((await readWorkspace(copy)).currentStage, 2)
  assert.equal(result.status, 'skipped'); assert.equal(result.streamHex, '')
  await rm(join(copy, 'checkpoints/1/beacon.json'))
  await assert.rejects(readWorkspace(copy))
})
