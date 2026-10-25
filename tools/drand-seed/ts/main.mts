import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fetchBeacon, type ChainInfo, type ChainOptions } from 'drand-client'

export const QUICKNET = Object.freeze({
  chainHash: '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971',
  publicKey: '83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a',
  genesisTime: 1692803367,
  period: 3,
  scheme: 'bls-unchained-g1-rfc9380',
  groupHash: 'f477d5c89f21a17c863a7f937c6a6d15859414d2be09cd448d4279af331c5d3e',
})
export const BASE_URL = `https://api.drand.sh/v2/chains/${QUICKNET.chainHash}`

type V2Info = {
  public_key: string; period: number; genesis_time: number; genesis_seed: string;
  chain_hash: string; scheme: string; beacon_id: string
}
type V2Beacon = { round: number; signature: string }

export function parseRound(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error('round must be a positive safe integer')
  }
  return value
}

export function normalizeInfo(value: unknown): ChainInfo {
  if (!value || typeof value !== 'object') throw new Error('Invalid v2 chain info')
  const info = value as V2Info
  if (info.chain_hash !== QUICKNET.chainHash || info.public_key !== QUICKNET.publicKey ||
      info.scheme !== QUICKNET.scheme || info.period !== QUICKNET.period ||
      info.genesis_time !== QUICKNET.genesisTime || info.genesis_seed !== QUICKNET.groupHash ||
      info.beacon_id !== 'quicknet') {
    throw new Error('Chain info does not match pinned quicknet trust parameters')
  }
  // The official verifier's ChainInfo uses v1-style field names internally.
  return {
    public_key: info.public_key, period: info.period, genesis_time: info.genesis_time,
    hash: info.chain_hash, groupHash: info.genesis_seed, schemeID: info.scheme,
    metadata: { beaconID: info.beacon_id },
  }
}

export function normalizeBeacon(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid v2 beacon')
  const beacon = value as V2Beacon
  const round = parseRound(beacon.round)
  if (typeof beacon.signature !== 'string' || !/^[0-9a-f]{96}$/i.test(beacon.signature)) {
    throw new Error('Expected a 48-byte quicknet signature encoded as hex')
  }
  return {
    round, signature: beacon.signature,
    randomness: createHash('sha256').update(Buffer.from(beacon.signature, 'hex')).digest('hex'),
  }
}

export function roundTimestamp(round: number): number {
  parseRound(round)
  const seconds = QUICKNET.genesisTime + (round - 1) * QUICKNET.period
  const milliseconds = seconds * 1000
  if (!Number.isSafeInteger(milliseconds) || !Number.isFinite(new Date(milliseconds).getTime())) {
    throw new Error('round timestamp is outside the supported date range')
  }
  return milliseconds
}

export async function verifyQuicknet(rawInfo: unknown, rawBeacon: unknown, expectedRound?: number) {
  const info = normalizeInfo(rawInfo)
  const beacon = normalizeBeacon(rawBeacon)
  if (expectedRound !== undefined && parseRound(expectedRound) !== beacon.round) {
    throw new Error('Returned round does not match requested round')
  }
  const options: ChainOptions = {
    disableBeaconVerification: false, noCache: true,
    chainVerificationParams: { chainHash: QUICKNET.chainHash, publicKey: QUICKNET.publicKey },
  }
  // Official drand client, with an in-memory transport. Verification uses the
  // exact raw response saved by this tool and also works without a network.
  const chain = { baseUrl: BASE_URL, info: async () => info }
  const client = {
    options, chain: () => chain,
    get: async () => beacon, latest: async () => beacon,
  }
  await fetchBeacon(client, beacon.round)
  const time = new Date(roundTimestamp(beacon.round))
  const taipeiTime = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(time)
  return {
    provider: 'drand', apiVersion: 'v2', network: 'quicknet',
    chainHash: QUICKNET.chainHash, scheme: QUICKNET.scheme, round: beacon.round,
    seed: beacon.randomness, signature: beacon.signature, signatureVerified: true,
    roundScheduledTimeUtc: time.toISOString(),
    roundScheduledTimeTaipei: `${taipeiTime.replace(' ', 'T')}+08:00`,
    timingNote: 'Round time is scheduled beacon time, not HTTP request or actual publication time.',
    verificationUrl: `${BASE_URL}/rounds/${beacon.round}`,
    verifier: 'drand-client@1.4.2',
  }
}

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n'

export async function main(argv = process.argv.slice(2)) {
  const operation = argv.shift()
  if (!operation || operation === '--help') {
    console.log(`Usage:
  ./tools/drand-seed.sh fetch --output tmp/drand-latest-001
  ./tools/drand-seed.sh fetch --round 33382601 --output tmp/drand-round-001
  ./tools/drand-seed.sh verify --input tmp/drand-round-001 --output tmp/drand-verified-001

fetch uses only quicknet v2 /info and /rounds/latest or /rounds/<round>.
verify reads local info.json and beacon.json without any network request.
Output must be a new directory. No API key or automatic retries are used.`)
    return
  }
  if (!['fetch', 'verify'].includes(operation)) throw new Error('Unknown operation')
  const opts: Record<string, string> = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i], value = argv[i + 1]
    if (!['--output', '--input', '--round'].includes(key) || !value || value.startsWith('--') || opts[key]) {
      throw new Error('Invalid or repeated option; use --help')
    }
    opts[key] = value
  }
  if (!opts['--output']) throw new Error('--output is required')
  if (operation === 'verify' && (!opts['--input'] || opts['--round'])) throw new Error('verify requires --input, without --round')
  if (operation === 'fetch' && opts['--input']) throw new Error('fetch does not accept --input')
  const expectedRound = opts['--round'] === undefined ? undefined : parseRound(Number(opts['--round']))
  const directory = resolve(opts['--output'])
  await mkdir(resolve(directory, '..'), { recursive: true })
  await mkdir(directory)
  const save = (name: string, raw: string) => writeFile(join(directory, name), raw, { flag: 'wx' })
  const status = (state: string, extra = {}) => writeFile(join(directory, 'status.json'), json({ state, operation, ...extra }))
  await status('pending')
  try {
    let infoRaw: string, beaconRaw: string
    let requestStartedAt: string | null = null, responseReceivedAt: string | null = null
    let durationMs: number | null = null
    if (operation === 'verify') {
      infoRaw = await readFile(join(resolve(opts['--input']), 'info.json'), 'utf8')
      beaconRaw = await readFile(join(resolve(opts['--input']), 'beacon.json'), 'utf8')
      await save('request.json', json({ mode: 'offline', sourceDirectory: resolve(opts['--input']) }))
      await save('info.json', infoRaw)
      await save('beacon.json', beaconRaw)
    } else {
      const beaconUrl = `${BASE_URL}/rounds/${expectedRound ?? 'latest'}`
      await save('request.json', json({ mode: 'online', infoUrl: `${BASE_URL}/info`, beaconUrl, expectedRound: expectedRound ?? null }))
      const get = async (url: string) => {
        const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(30_000) })
        const text = await response.text()
        if (!response.ok) throw new Error(`drand HTTP ${response.status}: ${url}`)
        return text
      }
      infoRaw = await get(`${BASE_URL}/info`)
      await save('info.json', infoRaw)
      normalizeInfo(JSON.parse(infoRaw))
      requestStartedAt = new Date().toISOString()
      const started = performance.now()
      // Save timing before the request so a failed request has an audit trail.
      await status('requesting_beacon', { requestStartedAt, expectedRound: expectedRound ?? null })
      beaconRaw = await get(beaconUrl)
      responseReceivedAt = new Date().toISOString()
      durationMs = Math.round(performance.now() - started)
      await save('beacon.json', beaconRaw)
    }
    const verified = await verifyQuicknet(JSON.parse(infoRaw), JSON.parse(beaconRaw), expectedRound)
    const receipt = {
      ...verified, mode: operation === 'verify' ? 'offline' : 'online',
      requestStartedAt, responseReceivedAt, durationMs,
      verifiedAt: new Date().toISOString(),
      roundAgeAtResponseMs: responseReceivedAt === null ? null : Date.parse(responseReceivedAt) - roundTimestamp(verified.round),
      freshnessNote: 'Valid signature does not imply latest/fresh. Historical rounds are allowed; inspect round age separately.',
    }
    await save('receipt.json', json(receipt))
    await status('verified', { round: receipt.round })
    console.log(json({ directory, ...receipt }))
  } catch (error) {
    await status('failed', { error: error instanceof Error ? error.message : 'Verification failed' })
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
