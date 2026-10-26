import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chacha20 } from '@noble/ciphers/chacha.js'
import { drawRound, validatePrepared, type Prepared } from '../client/src/domain/draw.mts'

const fixture = async (name: string): Promise<Prepared> => JSON.parse(await readFile(new URL(`../examples/verify-draw/${name}.json`, import.meta.url), 'utf8'))
const seeds = ['00'.repeat(32), 'ff'.repeat(32), '7010277ecb91976aba93d63d298503889de63e291a5a49f7c1b8d2cce2b3e858']

test('RFC ChaCha20 stream vector and direct-mod double-draw order', async () => {
  const input = await fixture('round-one')
  const result = drawRound(seeds[0], input)
  assert.equal(result.streamHex.slice(0, 32), '76b8e0ada0f13d90405d6ae55386bd28')
  // First uint32 selects a space, the second selects a household.
  assert.deepEqual(result.pools[0].assignments[0], {
    spaceId: ['86', '87', '88'][0x76b8e0ad % 3],
    household: input.pools[0].households[0xa0f13d90 % 3],
  })
  assert.equal(result.streamHex.length / 2, 28)
  const key = new Uint8Array(32)
  assert.equal(result.streamHex, Buffer.from(chacha20(key, new Uint8Array(12), new Uint8Array(28), undefined, 0)).toString('hex'))
})

test('fixtures are reproducible, do not mutate input, and conserve every household and space', async () => {
  for (const [name, words] of [['round-one', 7], ['round-two', 6], ['all-skipped', 0], ['first-round-shortage', 1]] as const) {
    const input = await fixture(name), before = structuredClone(input)
    for (const seed of seeds) {
      const result = drawRound(seed, input)
      assert.deepEqual(drawRound(seed, input), result)
      assert.equal(result.streamHex.length, words * 8)
      assert.equal(Object.hasOwn(result, 'seed'), false)
      assert.equal(Object.hasOwn(result, 'trace'), false)
      for (const [i, output] of result.pools.entries()) {
        const source = input.pools[i]
        assert.deepEqual([...output.assignments.map(a => a.household), ...output.waitlist.map(a => a.household), ...output.unassignedHouseholds].sort(), [...source.households].sort())
        assert.deepEqual([...output.assignments.map(a => a.spaceId), ...output.remainingSpaces].sort(), source.candidates.filter(c => c.type === 'space').map(c => c.spaceId).sort())
        assert.deepEqual(output.waitlist.map(x => x.rank), source.candidates.filter(c => c.type === 'waitlist').map(c => c.rank))
      }
    }
    assert.deepEqual(input, before)
  }
})

test('waitlist-only pools execute, singletons consume nothing, skipped pools retain remaining spaces', async () => {
  const input = await fixture('round-two'), output = drawRound(seeds[0], input)
  assert.equal(output.pools[1].status, 'completed')
  assert.equal(output.pools[1].waitlist.length, 2)
  assert.equal(output.pools[2].reason, 'no_participants')
  assert.deepEqual(output.pools[2].remainingSpaces, ['小39', '小40'])
  const skipped = drawRound(seeds[0], await fixture('all-skipped'))
  assert.equal(skipped.status, 'skipped'); assert.equal(skipped.streamHex, '')
  const singleton = await fixture('all-skipped')
  singleton.pools[0] = { id: 'motorcycle', households: ['TEST-ONE'], candidates: [{ type: 'waitlist', rank: 1 }] }
  const single = drawRound(seeds[0], singleton)
  assert.equal(single.status, 'completed'); assert.equal(single.streamHex, '')
  assert.deepEqual(single.pools[0].waitlist, [{ household: 'TEST-ONE', rank: 1 }])
})

test('rejects malformed or ambiguous prepared pools and seeds', async () => {
  const base = await fixture('round-two')
  const mutations = [
    (x: any) => { x.schemaVersion = 9 },
    (x: any) => { x.drawRound = 0 },
    (x: any) => { x.extra = true },
    (x: any) => { x.pools.reverse() },
    (x: any) => { x.pools[0].households.push(x.pools[0].households[0]) },
    (x: any) => { x.pools[0].households = null },
    (x: any) => { x.pools[0].candidates.pop() },
    (x: any) => { x.pools[0].candidates[1].rank = 2 },
    (x: any) => { x.pools[0].candidates[1].spaceId = null },
    (x: any) => { x.pools[0].candidates[1].type = 'unknown' },
    (x: any) => { x.pools[0].candidates.reverse() },
    (x: any) => { x.pools[0].candidates[0].spaceId = '151' },
    (x: any) => { x.pools[1].candidates = [{ type: 'space', spaceId: '小39' }] },
    (x: any) => { x.pools[0].candidates.push({ type: 'waitlist', rank: 3 }) },
  ]
  for (const mutate of mutations) {
    const copy = structuredClone(base); mutate(copy)
    assert.throws(() => validatePrepared(copy))
  }
  const first = await fixture('round-one')
  first.pools[0].candidates[0] = { type: 'waitlist', rank: 1 }
  assert.throws(() => validatePrepared(first))
  for (const seed of ['', 'abc', 'gg'.repeat(32), '00'.repeat(33)]) assert.throws(() => drawRound(seed, base))
})

test('matches the published v2 vectors confirmed by independent Go computation', async () => {
  for (const name of ['round-one', 'round-two', 'all-skipped', 'first-round-shortage']) {
    const expected = JSON.parse(await readFile(new URL(`../examples/verify-draw/${name}.expected.json`, import.meta.url), 'utf8'))
    assert.deepEqual(drawRound(seeds[2], await fixture(name)), expected)
  }
})
