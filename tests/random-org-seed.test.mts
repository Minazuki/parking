import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generationParams, getParams, redactRequest, seedSummary, main, ENDPOINT } from '../tools/random-org-seed/ts/main.mts'
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises'

test('requests a single 256-bit hex seed and redacts only the saved key', () => {
  const params = generationParams('test-secret', { purpose: 'test' })
  const redacted = redactRequest({ params, method: 'generateSignedBlobs' })
  assert.equal(params.apiKey, 'test-secret')
  assert.equal(redacted.params.apiKey, '<REDACTED>')
  assert.equal(params.size, 256)
  assert.equal(params.n, 1)
  assert.equal(params.format, 'hex')
})

test('rejects absent credentials, oversized userData and invalid serial numbers', () => {
  assert.throws(() => generationParams('', {}))
  assert.throws(() => generationParams('test', { value: 'x'.repeat(1000) }))
  for (const serial of [0, -1, 1.5, 'nope']) assert.throws(() => getParams('test', serial))
  assert.deepEqual(getParams('test', '123'), { apiKey: 'test', serialNumber: 123 })
})

test('extracts the response format without claiming cryptographic verification', async () => {
  const receipt = JSON.parse(await readFile(new URL('../examples/random-org-response.example.json', import.meta.url), 'utf8'))
  const summary = seedSummary(receipt)
  assert.equal(summary.seed.length, 64)
  assert.equal(summary.serialNumber, 12345)
  assert.equal(summary.signatureVerified, false)
  receipt.result.random.data[0] = 'bad-seed'
  assert.throws(() => seedSummary(receipt))
})

test('generate and get preserve provider receipts without saving the API key', async t => {
  await mkdir(new URL('../tmp/', import.meta.url), { recursive: true })
  const directory = await mkdtemp(new URL('../tmp/seed-test-', import.meta.url))
  const previous = process.env.RANDOM_ORG_API_KEY
  process.env.RANDOM_ORG_API_KEY = 'test-secret-not-real'
  const receipt = JSON.parse(await readFile(new URL('../examples/random-org-response.example.json', import.meta.url), 'utf8'))
  const calls: string[] = []
  t.mock.method(console, 'log', () => {})
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, ENDPOINT)
    assert.equal(ENDPOINT, 'https://api.random.org/json-rpc/2/invoke')
    const request = JSON.parse(String(init?.body))
    calls.push(request.method)
    if (request.method === 'generateSignedBlobs') assert.equal(request.params.size, 256)
    else assert.equal(request.params.serialNumber, 12345)
    assert.equal(request.params.apiKey, 'test-secret-not-real')
    return new Response(JSON.stringify({ ...receipt, id: request.id }), { status: 200 })
  })
  try {
    const generated = `${directory}/generated`
    const fetched = `${directory}/fetched`
    await main(['generate', '--output', generated])
    const request = await readFile(`${generated}/request.json`, 'utf8')
    assert.ok(!request.includes('test-secret-not-real'))
    assert.ok(request.includes('<REDACTED>'))
    const saved = JSON.parse(await readFile(`${generated}/response.json`, 'utf8'))
    assert.deepEqual(saved.result, receipt.result)
    await main(['get', '--receipt', `${generated}/response.json`, '--output', fetched])
    assert.equal(JSON.parse(await readFile(`${fetched}/status.json`, 'utf8')).state, 'signed_response_saved_not_yet_verified')
    await assert.rejects(main(['generate', '--output', generated]))
    assert.deepEqual(calls, ['generateSignedBlobs', 'getResult'])
  } finally {
    if (previous === undefined) delete process.env.RANDOM_ORG_API_KEY
    else process.env.RANDOM_ORG_API_KEY = previous
    await rm(directory, { recursive: true })
  }
})

test('a transport failure records unknown delivery without retrying', async t => {
  await mkdir(new URL('../tmp/', import.meta.url), { recursive: true })
  const directory = await mkdtemp(new URL('../tmp/seed-failure-', import.meta.url))
  const previous = process.env.RANDOM_ORG_API_KEY
  process.env.RANDOM_ORG_API_KEY = 'test-secret-not-real'
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('simulated timeout') })
  try {
    await assert.rejects(main(['generate', '--output', `${directory}/attempt`]))
    assert.equal(calls, 1)
    const status = JSON.parse(await readFile(`${directory}/attempt/status.json`, 'utf8'))
    assert.equal(status.state, 'delivery_unknown_do_not_regenerate_automatically')
  } finally {
    if (previous === undefined) delete process.env.RANDOM_ORG_API_KEY
    else process.env.RANDOM_ORG_API_KEY = previous
    await rm(directory, { recursive: true })
  }
})
