import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { QUICKNET, BASE_URL, normalizeInfo, roundTimestamp, verifyQuicknet, main } from '../tools/drand-seed/ts/main.mts'

const info = JSON.parse(await readFile(new URL('../examples/drand-quicknet-v2-info.json', import.meta.url), 'utf8'))
const beacon = JSON.parse(await readFile(new URL('../examples/drand-quicknet-v2-round-33382601.json', import.meta.url), 'utf8'))

test('real public quicknet v2 fixture passes BLS verification and derives seed', async () => {
  const result = await verifyQuicknet(info, beacon, 33382601)
  assert.equal(result.signatureVerified, true)
  assert.match(result.seed, /^[0-9a-f]{64}$/)
  assert.equal(result.roundScheduledTimeUtc, new Date((1692803367 + 33382600 * 3) * 1000).toISOString())
})

test('pins all trust parameters, not just a key from the network', () => {
  for (const [field, value] of Object.entries({ public_key: '00'.repeat(96), chain_hash: 'bad', scheme: 'pedersen-bls-chained', period: 30, genesis_time: 0 })) {
    assert.throws(() => normalizeInfo({ ...info, [field]: value }))
  }
})

test('tampered signature, round, and mismatched requested round fail closed', async () => {
  const changed = (beacon.signature[0] === '0' ? '1' : '0') + beacon.signature.slice(1)
  await assert.rejects(verifyQuicknet(info, { ...beacon, signature: changed }))
  await assert.rejects(verifyQuicknet(info, { ...beacon, round: beacon.round + 1 }))
  await assert.rejects(verifyQuicknet(info, beacon, beacon.round + 1))
})

test('round one begins at genesis and rounds advance by three seconds', () => {
  assert.equal(roundTimestamp(1), QUICKNET.genesisTime * 1000)
  assert.equal(roundTimestamp(2) - roundTimestamp(1), 3000)
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER]) assert.throws(() => roundTimestamp(value))
})

test('online v2 fetch and offline receipt verification preserve the exact response', async t => {
  await mkdir(new URL('../tmp/', import.meta.url), { recursive: true })
  const directory = await mkdtemp(new URL('../tmp/drand-test-', import.meta.url))
  const calls: string[] = []
  t.mock.method(console, 'log', () => {})
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url))
    const raw = String(url).endsWith('/info') ? info : beacon
    return new Response(JSON.stringify(raw))
  })
  try {
    const online = `${directory}/online`, offline = `${directory}/offline`
    await main(['fetch', '--round', String(beacon.round), '--output', online])
    assert.deepEqual(calls, [`${BASE_URL}/info`, `${BASE_URL}/rounds/${beacon.round}`])
    const saved = JSON.parse(await readFile(`${online}/receipt.json`, 'utf8'))
    assert.ok(saved.requestStartedAt)
    assert.ok(saved.responseReceivedAt)
    assert.equal(saved.signatureVerified, true)
    calls.length = 0
    await main(['verify', '--input', online, '--output', offline])
    assert.equal(calls.length, 0)
    const verified = JSON.parse(await readFile(`${offline}/receipt.json`, 'utf8'))
    assert.equal(verified.seed, saved.seed)
    assert.equal(verified.requestStartedAt, null)
    assert.equal(await readFile(`${online}/beacon.json`, 'utf8'), await readFile(`${offline}/beacon.json`, 'utf8'))
    await assert.rejects(main(['fetch', '--output', online]))
    assert.equal(calls.length, 0)
  } finally {
    await rm(directory, { recursive: true })
  }
})
