import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chacha20 } from '@noble/ciphers/chacha.js'
import { drawRound, type Prepared } from '../client/src/domain/draw.mts'
const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'))
const save = (path: string, value: unknown) => writeFile(path, JSON.stringify(value))
const publicSeed = '7010277ecb91976aba93d63d298503889de63e291a5a49f7c1b8d2cce2b3e858'

test('Go independently reproduces every fixture, full-size multi-block streams, and validation failures', async t => {
  await mkdir(join(root, 'tmp'), { recursive: true })
  const dir = await mkdtemp(join(root, 'tmp/cross-v2-'))
  t.after(() => rm(dir, { recursive: true }))
  const binary = join(dir, 'draw-go')
  await exec('go', ['build', '-o', binary, '.'], { cwd: join(root, 'tools/verify-draw/go') })
  const inputs: Prepared[] = []
  for (const name of ['round-one', 'round-two', 'all-skipped', 'first-round-shortage']) inputs.push(await read(join(root, `examples/verify-draw/${name}.json`)))
  const numbered = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(3, '0')}`)
  const spaces = (ids: string[]) => ids.map(spaceId => ({ type: 'space' as const, spaceId }))
  inputs.push({ schemaVersion: 1, drawRound: 1, pools: [
    { id: 'motorcycle_a', households: numbered('TEST-A-', 65), candidates: spaces(Array.from({ length: 65 }, (_, i) => String(i + 86))) },
    { id: 'motorcycle_b', households: numbered('TEST-B-', 85), candidates: spaces(Array.from({ length: 85 }, (_, i) => String(i + 1)).flatMap(id => ['2', '3', '14'].includes(id) ? [id, `${id}-1`] : [id])) },
    { id: 'bicycle_large', households: numbered('TEST-L-', 38), candidates: spaces(Array.from({ length: 38 }, (_, i) => `大${i + 1}`)) },
    { id: 'bicycle_small', households: numbered('TEST-S-', 19), candidates: spaces(Array.from({ length: 19 }, (_, i) => `小${i + 39}`)) },
  ] })
  for (const [i, input] of inputs.entries()) {
    const pools = join(dir, `input-${i}.json`); await save(pools, input)
    for (const [j, seed] of ['00'.repeat(32), 'ff'.repeat(32), publicSeed].entries()) {
      const output = join(dir, `go-${i}-${j}.json`)
      await exec(binary, ['--seed', seed, '--pools', pools, '--output', output])
      const ts = drawRound(seed, input)
      assert.deepEqual(await read(output), ts)
      const bytes = Buffer.from(ts.streamHex, 'hex')
      assert.equal(ts.streamHex, Buffer.from(chacha20(Buffer.from(seed, 'hex'), new Uint8Array(12), new Uint8Array(bytes.length), undefined, 0)).toString('hex'))
    }
  }
  // Both implementations must reject the same broken boundary cases.
  const invalids: any[] = []
  const base = inputs[1]
  for (const mutate of [
    (x: any) => x.pools.reverse(),
    (x: any) => x.pools[0].households.push(x.pools[0].households[0]),
    (x: any) => x.pools[0].candidates.pop(),
    (x: any) => { x.pools[0].candidates[1].rank = 7 },
    (x: any) => { x.pools[0].candidates[1].spaceId = null },
    (x: any) => { x.pools[0].candidates[0].rank = null },
    (x: any) => { x.pools[0].candidates[0].extra = true },
    (x: any) => { x.pools[1].households = null },
  ]) { const value = structuredClone(base); mutate(value); invalids.push(value) }
  for (const [i, value] of invalids.entries()) {
    const pools = join(dir, `invalid-${i}.json`); await save(pools, value)
    assert.throws(() => drawRound(publicSeed, value))
    await assert.rejects(exec(binary, ['--seed', publicSeed, '--pools', pools, '--output', join(dir, `bad-${i}.json`)]))
  }
})

test('shell v2 preserves evidence, replays saved results, rejects tampering and overwrite, and still verifies seed for all-skipped', async t => {
  await mkdir(join(root, 'tmp'), { recursive: true })
  const dir = await mkdtemp(join(root, 'tmp/shell-v2-'))
  t.after(() => rm(dir, { recursive: true }))
  const seed = join(dir, 'source-seed'); await mkdir(seed)
  await writeFile(join(seed, 'info.json'), await readFile(join(root, 'examples/drand-quicknet-v2-info.json')))
  await writeFile(join(seed, 'beacon.json'), await readFile(join(root, 'examples/drand-quicknet-v2-round-33382601.json')))
  const script = join(root, 'tools/verify-draw.sh'), pools = join(root, 'examples/verify-draw/round-two.json')
  const run = (args: string[]) => exec('bash', [script, ...args], { cwd: dir, maxBuffer: 1024 * 1024 })
  const original = join(dir, 'original result')
  await run(['--input', seed, '--pools', pools, '--output', original])
  assert.equal((await read(join(original, 'comparison.json'))).matches, true)
  const result = await read(join(original, 'ts.json'))
  const replay = join(dir, 'replay')
  await run(['--input', join(original, 'seed'), '--pools', join(original, 'pools.json'), '--expected', join(original, 'ts.json'), '--output', replay])
  assert.equal((await read(join(replay, 'comparison.json'))).expectedMatches, true)
  const expected = join(dir, 'tampered.json')
  for (const [i, field] of ['stream', 'assignment'].entries()) {
    const bad = structuredClone(result)
    if (field === 'stream') bad.streamHex = '00' + bad.streamHex.slice(2)
    else bad.pools[0].assignments[0].household = 'TAMPERED'
    await save(expected, bad)
    const target = join(dir, `mismatch-${i}`)
    await assert.rejects(run(['--input', seed, '--pools', pools, '--expected', expected, '--output', target]))
    assert.equal((await read(join(target, 'comparison.json'))).expectedMatches, false)
    assert.equal((await read(join(target, 'failure.json'))).stage, 'compare')
  }
  const skipped = join(dir, 'skipped')
  await run(['--input', seed, '--pools', join(root, 'examples/verify-draw/all-skipped.json'), '--output', skipped])
  assert.equal((await read(join(skipped, 'seed/receipt.json'))).signatureVerified, true)
  assert.equal((await read(join(skipped, 'ts.json'))).status, 'skipped')
  await assert.rejects(run(['--input', join(dir, 'does-not-exist'), '--output', original]))
  assert.deepEqual(await read(join(original, 'ts.json')), result)
  const badInput = join(dir, 'bad-input.json'); await save(badInput, { schemaVersion: 1 })
  const invalid = join(dir, 'invalid')
  await assert.rejects(run(['--round', '33382601', '--pools', badInput, '--output', invalid]))
  assert.equal((await read(join(invalid, 'failure.json'))).stage, 'input')
  await assert.rejects(access(join(invalid, 'seed')))
  // Worker itself also protects an existing file.
  await assert.rejects(exec(process.execPath, [join(root, 'tools/verify-draw/ts/main.mts'), '--seed', publicSeed, '--pools', pools, '--output', join(original, 'ts.json')]))
})
