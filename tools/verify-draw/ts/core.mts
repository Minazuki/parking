import { chacha20 } from '@noble/ciphers/chacha.js'

export const ALGORITHM = 'parking-draw-chacha20-v2'
export type Candidate = { type: 'space'; spaceId: string } | { type: 'waitlist'; rank: number }
export type Pool = { id: string; households: string[]; candidates: Candidate[] }
export type Prepared = { schemaVersion: 1; drawRound: 1 | 2; pools: Pool[] }
export type PoolResult = {
  id: string; status: 'completed' | 'skipped'; reason: string | null;
  assignments: { household: string; spaceId: string }[];
  waitlist: { household: string; rank: number }[];
  unassignedHouseholds: string[]; remainingSpaces: string[]
}
export const hex = (bytes: Uint8Array) => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('')
function object(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) {
    throw new Error(`Expected object fields: ${keys.join(', ')}`)
  }
}
function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.trim() !== value) throw new Error('Expected nonempty trimmed text')
}
export function validatePrepared(value: unknown): asserts value is Prepared {
  object(value, ['schemaVersion', 'drawRound', 'pools'])
  if (value.schemaVersion !== 1 || ![1, 2].includes(value.drawRound as number) || !Array.isArray(value.pools)) throw new Error('Invalid input version, round or pools')
  const ids = value.drawRound === 1 ? ['motorcycle_a', 'motorcycle_b', 'bicycle_large', 'bicycle_small'] : ['motorcycle', 'bicycle_large', 'bicycle_small']
  if (value.pools.length !== ids.length) throw new Error('Missing or extra pools')
  const motorHouseholds = new Set<string>(), motorSpaces = new Set<string>()
  for (const [i, raw] of value.pools.entries()) {
    object(raw, ['id', 'households', 'candidates'])
    if (raw.id !== ids[i] || !Array.isArray(raw.households) || !Array.isArray(raw.candidates)) throw new Error('Invalid pool order or arrays')
    const households = new Set<string>(), spaces = new Set<string>()
    for (const household of raw.households) {
      text(household)
      if (households.has(household)) throw new Error('Duplicate household in pool')
      households.add(household)
      if (ids[i].startsWith('motorcycle')) {
        if (motorHouseholds.has(household)) throw new Error('Household appears in both motorcycle pools')
        motorHouseholds.add(household)
      }
    }
    let nextRank = 1, waiting = false
    for (const candidate of raw.candidates) {
      if (!candidate || typeof candidate !== 'object') throw new Error('Invalid candidate')
      const c = candidate as Record<string, unknown>
      if (c.type === 'space') {
        object(c, ['type', 'spaceId']); text(c.spaceId)
        if (waiting || spaces.has(c.spaceId)) throw new Error('Space after waitlist or duplicate space')
        const pattern = ids[i].startsWith('motorcycle') ? /^(?:[1-9][0-9]?|1[0-4][0-9]|150|(?:2|3|14)-1)$/ : ids[i] === 'bicycle_large' ? /^大(?:[1-9]|[12][0-9]|3[0-8])$/ : /^小(?:39|4[0-9]|5[0-7])$/
        if (!pattern.test(c.spaceId)) throw new Error('Space does not belong to category')
        spaces.add(c.spaceId)
        if (ids[i].startsWith('motorcycle')) {
          if (motorSpaces.has(c.spaceId)) throw new Error('Space appears in both motorcycle pools')
          motorSpaces.add(c.spaceId)
        }
      } else if (c.type === 'waitlist') {
        object(c, ['type', 'rank'])
        if (value.drawRound !== 2 || !Number.isSafeInteger(c.rank) || c.rank !== nextRank++) throw new Error('Invalid waitlist rank or round')
        waiting = true
      } else throw new Error('Unknown candidate type')
    }
    const ranks = nextRank - 1
    if (value.drawRound === 2 && ranks !== Math.max(0, households.size - spaces.size)) throw new Error('Waitlist count does not match shortage')
  }
}

// One RFC 8439 stream for the whole round. Only read bytes enter streamHex.
export function drawRound(seed: string, input: unknown) {
  if (!/^[0-9a-f]{64}$/i.test(seed)) throw new Error('seed must contain exactly 32 hex bytes')
  validatePrepared(input)
  const key = Uint8Array.from(seed.match(/../g)!, x => parseInt(x, 16))
  let block = new Uint8Array(64), offset = 64, counter = 0
  const used: number[] = []
  const index = (size: number) => {
    if (size === 1) return 0
    if (offset === 64) {
      if (counter >= 2 ** 32) throw new Error('ChaCha20 counter exhausted')
      block = chacha20(key, new Uint8Array(12), new Uint8Array(64), undefined, counter++)
      offset = 0
    }
    const random = new DataView(block.buffer, block.byteOffset, block.byteLength).getUint32(offset, false)
    used.push(...block.subarray(offset, offset + 4)); offset += 4
    return random % size
  }
  const pools: PoolResult[] = input.pools.map(pool => {
    const households = [...pool.households], candidates = pool.candidates.map(c => ({ ...c }))
    const reason = !households.length && !candidates.length ? 'no_participants_and_no_candidates' : !households.length ? 'no_participants' : !candidates.length ? 'no_candidates' : null
    const result: PoolResult = { id: pool.id, status: reason ? 'skipped' : 'completed', reason, assignments: [], waitlist: [], unassignedHouseholds: [], remainingSpaces: [] }
    while (households.length && candidates.length) {
      const candidate = candidates.splice(index(candidates.length), 1)[0]
      const household = households.splice(index(households.length), 1)[0]
      if (candidate.type === 'space') result.assignments.push({ household, spaceId: candidate.spaceId })
      else result.waitlist.push({ household, rank: candidate.rank })
    }
    result.waitlist.sort((a, b) => a.rank - b.rank)
    result.unassignedHouseholds = households
    result.remainingSpaces = candidates.filter((c): c is { type: 'space'; spaceId: string } => c.type === 'space').map(c => c.spaceId)
    return result
  })
  const skipped = pools.every(pool => pool.status === 'skipped')
  return { schemaVersion: 1, algorithm: ALGORITHM, nonce: '00'.repeat(12), initialCounter: 0, uint32Endian: 'big', poolRemoval: 'stable', status: skipped ? 'skipped' : 'completed', reason: skipped ? 'no_drawable_pools' : null, streamHex: hex(Uint8Array.from(used)), pools }
}
