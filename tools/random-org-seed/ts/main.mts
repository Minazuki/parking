import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

export const ENDPOINT = 'https://api.random.org/json-rpc/2/invoke'
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type Params = Record<string, Json>
export type Receipt = {
  jsonrpc: string
  id: string | number
  result?: {
    random?: Record<string, Json>
    signature?: string
    authenticity?: boolean
    [key: string]: unknown
  }
  error?: { code: number; message: string }
}

export function generationParams(apiKey: string, userData: Params): Params {
  if (!apiKey.trim()) throw new Error('RANDOM_ORG_API_KEY is required')
  if (JSON.stringify(userData).length > 1000) throw new Error('userData exceeds 1000 characters')
  return { apiKey, n: 1, size: 256, format: 'hex', userData }
}

export function readSignedResult(receipt: Receipt) {
  const random = receipt.result?.random
  const signature = receipt.result?.signature
  if (receipt.error) throw new Error(`API error ${receipt.error.code}: ${receipt.error.message}`)
  if (!random || typeof signature !== 'string' || !signature) {
    throw new Error('Response does not contain a signed random object')
  }
  if (!Number.isSafeInteger(random.serialNumber) || Number(random.serialNumber) < 1) {
    throw new Error('Response has an invalid serialNumber')
  }
  return { random, signature }
}

export function getParams(apiKey: string, serial: string | number): Params {
  const serialNumber = Number(serial)
  if (!apiKey.trim()) throw new Error('RANDOM_ORG_API_KEY is required')
  if (!Number.isSafeInteger(serialNumber) || serialNumber < 1) {
    throw new Error('serialNumber must be a positive integer')
  }
  return { apiKey, serialNumber }
}

export function redactRequest(request: { params: Params; [key: string]: unknown }) {
  const params = { ...request.params }
  if ('apiKey' in params) params.apiKey = '<REDACTED>'
  return { ...request, params }
}

export function seedSummary(receipt: Receipt) {
  const { random, signature } = readSignedResult(receipt)
  const data = random.data
  if (random.method !== 'generateSignedBlobs' || random.n !== 1 || random.size !== 256 ||
      random.format !== 'hex' || !Array.isArray(data) || data.length !== 1 ||
      typeof data[0] !== 'string' || !/^[0-9a-f]{64}$/i.test(data[0])) {
    throw new Error('Expected exactly one 256-bit hex BLOB')
  }
  return {
    seed: data[0], completionTime: random.completionTime,
    serialNumber: random.serialNumber, userData: random.userData,
    signaturePresent: Boolean(signature), signatureVerified: false,
  }
}

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n'

export async function main(argv = process.argv.slice(2)) {
  const operation = argv.shift()
  if (!operation || operation === '--help') {
    console.log(`Usage (Node with native TypeScript support):
  ./tools/random-org-seed.sh preview --output tmp/seed-format
  ./tools/random-org-seed.sh generate --output tmp/seed-live [--user-data path.json]
  ./tools/random-org-seed.sh get --receipt tmp/seed-live/response.json --output tmp/seed-fetched
  ./tools/random-org-seed.sh get --serial 123 --output tmp/seed-fetched
  ./tools/random-org-seed.sh verify --receipt tmp/seed-live/response.json --output tmp/seed-verified

generate/get read RANDOM_ORG_API_KEY from the environment. Each output directory
must be new. preview is offline; its response and signature are NOT genuine.
Live requests are sent once, without automatic retry.`)
    return
  }
  if (!['preview', 'generate', 'get', 'verify'].includes(operation)) throw new Error('Unknown operation')
  const options: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1]
    if (!['--output', '--user-data', '--receipt', '--serial'].includes(key) || !value || value.startsWith('--') || options[key]) {
      throw new Error('Invalid, repeated, or incomplete option; use --help')
    }
    options[key] = value
  }
  if (!options['--output']) throw new Error('--output is required')
  const apiKey = process.env.RANDOM_ORG_API_KEY ?? ''
  let method = 'generateSignedBlobs'
  let params: Params
  let original: Receipt | undefined
  if (operation === 'get' || operation === 'verify') {
    if (options['--receipt']) original = JSON.parse(await readFile(options['--receipt'], 'utf8'))
    if (operation === 'get') {
      if (Boolean(original) === Boolean(options['--serial'])) throw new Error('Choose --receipt or --serial')
      const serial = original ? readSignedResult(original).random.serialNumber : options['--serial']
      params = getParams(apiKey, serial as string | number)
      method = 'getResult'
    } else {
      if (!original) throw new Error('verify requires --receipt')
      const signed = readSignedResult(original)
      params = { random: signed.random, signature: signed.signature }
      method = 'verifySignature'
    }
  } else {
    const userData = options['--user-data']
      ? JSON.parse(await readFile(options['--user-data'], 'utf8'))
      : { purpose: 'parking-seed-format-test', activityYear: 116, stage: 'test-only' }
    if (!userData || Array.isArray(userData) || typeof userData !== 'object') throw new Error('userData must be an object')
    params = generationParams(operation === 'preview' ? '<OFFLINE_PLACEHOLDER>' : apiKey, userData)
  }
  const request = { jsonrpc: '2.0', method, params, id: randomUUID() }
  const directory = resolve(options['--output'])
  await mkdir(resolve(directory, '..'), { recursive: true })
  await mkdir(directory) // Refuse an existing directory BEFORE sending any request.
  const save = (name: string, data: string) => writeFile(join(directory, name), data, { flag: 'wx', mode: 0o600 })
  await save('request.json', json(redactRequest(request)))
  const statusPath = join(directory, 'status.json')
  const status = (state: string, extra = {}) => writeFile(statusPath, json({ state, operation, requestId: request.id, ...extra }), { mode: 0o600 })
  if (operation === 'preview') {
    const fixture = JSON.parse(await readFile(new URL('../../../examples/random-org-response.example.json', import.meta.url), 'utf8'))
    fixture.id = request.id
    fixture.result.random.userData = params.userData
    await save('response.example.json', json(fixture))
    await status('offline_example_not_a_real_receipt')
    console.log(json({ directory, ...seedSummary(fixture), exampleOnly: true }))
    return
  }
  await status('request_pending')
  let received = false
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request), signal: AbortSignal.timeout(30_000),
    })
    const raw = await response.text()
    received = true
    // Keep the provider response unchanged; never save a request containing apiKey.
    if (apiKey && raw.includes(apiKey)) throw new Error('Response unexpectedly contains API key; not saved')
    await save('response.json', raw)
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}; inspect response.json`)
    const receipt: Receipt = JSON.parse(raw)
    if (receipt.jsonrpc !== '2.0' || receipt.id !== request.id) throw new Error('JSON-RPC response identifier mismatch')
    if (receipt.error) throw new Error(`Provider error ${receipt.error.code}; inspect response.json`)
    if (operation === 'verify') {
      if (typeof receipt.result?.authenticity !== 'boolean') throw new Error('Invalid verification response')
      await status(receipt.result.authenticity ? 'signature_verified' : 'signature_invalid')
      console.log(json({ directory, authenticity: receipt.result.authenticity }))
      if (!receipt.result.authenticity) throw new Error('Signature verification failed')
    } else {
      const summary = seedSummary(receipt)
      const matchesOriginal = original
        ? isDeepStrictEqual(receipt.result?.random, original.result?.random) && receipt.result?.signature === original.result?.signature
        : undefined
      if (matchesOriginal === false) throw new Error('Retrieved record differs from original receipt')
      await status('signed_response_saved_not_yet_verified', { serialNumber: summary.serialNumber })
      console.log(json({ directory, ...summary, ...(original ? { matchesOriginal } : {}) }))
    }
  } catch (error) {
    await status(received ? 'response_received_but_failed' : 'delivery_unknown_do_not_regenerate_automatically')
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const secret = process.env.RANDOM_ORG_API_KEY
    const message = error instanceof Error ? error.message : 'Request failed'
    console.error(secret ? message.split(secret).join('<REDACTED>') : message)
    process.exitCode = 1
  })
}
