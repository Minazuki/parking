import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { readFile, readdir, lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { drawRound, validatePrepared, type Pool, type Prepared } from '../../../client/src/domain/draw.mts'
import { verifyQuicknet } from '../../drand-seed/ts/main.mts'

export type Registration = { household: string; motorcycle: number; bicycleLarge: number; bicycleSmall: number }
export type Stage0 = { schemaVersion: 1; registrations: { A: Registration[]; B: Registration[] }; accessible: { assignments: { order: number; household: string; spaceId: string }[]; splitSpaces: string[]; transferredSpaces: string[] }; pools: Pool[] }
export type SeedState = { schemaVersion: 1; provider: 'drand'; apiVersion: 'v2'; chainHash: string; seed: string; round: number; buttonPressedAt: string; requestStartedAt: string; responseReceivedAt: string; roundScheduledTimeUtc: string; signatureVerified: true }
export type Stage3 = { schemaVersion: 1; source: { fileName: string; sha256: string; importedAt: string }; payments: { household: string; motorcycle: boolean; bicycleLarge: boolean; bicycleSmall: boolean }[] }
export type Stage4 = { schemaVersion: 1; review: { category: string; retained: { household: string; spaceId: string }[]; released: { household: string; spaceId: string; reason: string }[]; vacantSpaces: string[] }[]; pools: Pool[]; spaceOrigins: { category: string; spaceId: string; source: string }[] }
export type Allocation = ReturnType<typeof drawRound>
export type StageState = Stage0 | SeedState | Stage3 | Stage4 | Allocation

const ajv = new Ajv2020({ strict: false, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
addFormats(ajv)
const schemaDirectory = new URL('../../../schemas/checkpoints/', import.meta.url)
for (const file of await readdir(schemaDirectory)) {
  if (file.endsWith('.schema.json')) ajv.addSchema(JSON.parse(await readFile(new URL(file, schemaDirectory), 'utf8')))
}
export function validateState(stage: number, value: unknown): asserts value is StageState {
  const validator = ajv.getSchema(`urn:parking:schema:stage-${stage}`)
  if (!validator) throw new Error(`Unknown stage ${stage}`)
  if (!validator(value)) throw new Error(`Stage ${stage} schema: ${ajv.errorsText(validator.errors, { separator: '; ' })}`)
}
const numericHousehold = (id: string) => {
  const parts = id.split('-').map(Number)
  if (parts.length !== 2 || parts.some(x => !Number.isSafeInteger(x) || x < 1)) throw new Error('Household numbers must be positive safe integers')
  return parts
}
export function compareHouseholds(a: string, b: string) {
  const [doorA, floorA] = numericHousehold(a), [doorB, floorB] = numericHousehold(b)
  return doorA - doorB || floorA - floorB
}
export function compareSpaces(a: string, b: string) {
  const parts = (s: string) => s.replace(/^[大小]/, '').split('-').map(Number)
  const [a0, a1 = 0] = parts(a), [b0, b1 = 0] = parts(b)
  return a0 - b0 || a1 - b1
}
function uniqueSorted(values: string[], comparator: (a: string, b: string) => number, label: string) {
  for (const value of values) comparator(value, value)
  if (new Set(values).size !== values.length || !isDeepStrictEqual(values, [...values].sort(comparator))) throw new Error(`${label} must be unique and numerically ordered`)
}
function validateOrdered(pools: Pool[]) {
  for (const pool of pools) {
    if (pool.households.some(h => !/^[1-9][0-9]*-[1-9][0-9]*$/.test(h))) throw new Error('Checkpoint household must use door-floor format')
    uniqueSorted(pool.households, compareHouseholds, `${pool.id} households`)
    uniqueSorted(pool.candidates.filter(c => c.type === 'space').map(c => c.spaceId), compareSpaces, `${pool.id} spaces`)
  }
}
function registrations(state: Stage0) {
  const all = [...state.registrations.A, ...state.registrations.B]
  if (new Set(all.map(r => r.household)).size !== all.length) throw new Error('Duplicate registration')
  for (const building of ['A', 'B'] as const) uniqueSorted(state.registrations[building].map(r => r.household), compareHouseholds, `${building} registration`)
  return all
}
function validateFirst(state: Stage0) {
  const all = registrations(state), accessible = new Set<string>()
  const ids = ['14', '2', '3']
  for (const [i, item] of state.accessible.assignments.entries()) {
    if (item.order !== i + 1 || item.spaceId !== ids[i] || accessible.has(item.household) || !all.some(r => r.household === item.household)) throw new Error('Invalid accessible assignment sequence or household')
    accessible.add(item.household)
  }
  const aAssignments = state.accessible.assignments.filter(x => state.registrations.A.some(r => r.household === x.household)).length
  const transferred = Array.from({ length: aAssignments }, (_, i) => String(86 + i))
  const occupied = new Set(state.accessible.assignments.map(x => x.spaceId))
  const split = ids.filter(id => !occupied.has(id)).flatMap(id => [id, `${id}-1`]).sort(compareSpaces)
  if (!isDeepStrictEqual(state.accessible.splitSpaces, split) || !isDeepStrictEqual(state.accessible.transferredSpaces, transferred)) throw new Error('Accessible split or transfer data differs from assignment rules')
  const expectedA = Array.from({ length: 65 }, (_, i) => String(i + 86)).filter(id => !transferred.includes(id))
  const expectedB = [...Array.from({ length: 85 }, (_, i) => String(i + 1)).filter(id => !occupied.has(id)), ...split.filter(id => id.endsWith('-1')), ...transferred].sort(compareSpaces)
  const expectedSpaces = [expectedA, expectedB, Array.from({ length: 38 }, (_, i) => `大${i + 1}`), Array.from({ length: 19 }, (_, i) => `小${i + 39}`)]
  for (const [i, values] of expectedSpaces.entries()) if (!isDeepStrictEqual(state.pools[i].candidates.map(c => c.type === 'space' ? c.spaceId : ''), values)) throw new Error('First-round spaces differ from configured capacity and accessible rules')
  const expected = [state.registrations.A.filter(r => r.motorcycle > 0 && !accessible.has(r.household)), state.registrations.B.filter(r => r.motorcycle > 0 && !accessible.has(r.household)), all.filter(r => r.bicycleLarge > 0), all.filter(r => r.bicycleSmall > 0)]
  for (const [i, rows] of expected.entries()) if (!isDeepStrictEqual(state.pools[i].households, rows.map(r => r.household).sort(compareHouseholds))) throw new Error('First-round pool does not match registration')
  const input: Prepared = { schemaVersion: 1, drawRound: 1, pools: state.pools }
  validatePrepared(input); validateOrdered(state.pools)
}
function validateSecond(state: Stage4, first: Stage0, allocation: Allocation, payments: Stage3) {
  const all = registrations(first)
  const expected = [all.filter(r => r.motorcycle === 2), all.filter(r => r.bicycleLarge === 2), all.filter(r => r.bicycleSmall === 2)]
  for (const [i, rows] of expected.entries()) if (!isDeepStrictEqual(state.pools[i].households, rows.map(r => r.household).sort(compareHouseholds))) throw new Error('Second-round pool does not match original two-round registration')
  validatePrepared({ schemaVersion: 1, drawRound: 2, pools: state.pools }); validateOrdered(state.pools)
  const payment = new Map(payments.payments.map(row => [row.household, row]))
  const categories = ['motorcycle', 'bicycle_large', 'bicycle_small']
  const flags = ['motorcycle', 'bicycleLarge', 'bicycleSmall'] as const
  for (const [i, category] of categories.entries()) {
    const pools = allocation.pools.filter(p => i === 0 ? p.id.startsWith('motorcycle') : p.id === category)
    const assignments = [...pools.flatMap(p => p.assignments), ...(i === 0 ? first.accessible.assignments.map(x => ({ household: x.household, spaceId: x.spaceId })) : [])]
    const retained = assignments.filter(a => payment.get(a.household)![flags[i]]).sort((a, b) => compareSpaces(a.spaceId, b.spaceId))
    const released = assignments.filter(a => !payment.get(a.household)![flags[i]]).map(a => ({ ...a, reason: 'unpaid_after_deadline' })).sort((a, b) => compareSpaces(a.spaceId, b.spaceId))
    const vacantSpaces = pools.flatMap(p => p.remainingSpaces).sort(compareSpaces)
    if (!isDeepStrictEqual(state.review[i], { category, retained, released, vacantSpaces })) throw new Error('Payment review differs from saved allocations and payments')
  }
  for (const review of state.review) {
    const spaces = [...review.retained.map(x => x.spaceId), ...review.released.map(x => x.spaceId), ...review.vacantSpaces]
    if (new Set(spaces).size !== spaces.length) throw new Error('Duplicate space in payment review')
    const available = [...review.released.map(x => x.spaceId), ...review.vacantSpaces].sort(compareSpaces)
    const pool = state.pools.find(p => p.id === review.category)!
    if (!isDeepStrictEqual(available, pool.candidates.filter(c => c.type === 'space').map(c => c.spaceId))) throw new Error('Review spaces differ from second-round pool')
    const origins = state.spaceOrigins.filter(x => x.category === review.category)
    const wanted = [...review.released.map(x => ({ category: review.category, spaceId: x.spaceId, source: 'unpaid_after_deadline' })), ...review.vacantSpaces.map(spaceId => ({ category: review.category, spaceId, source: 'first_round_vacant' }))].sort((a, b) => compareSpaces(a.spaceId, b.spaceId))
    if (!isDeepStrictEqual(origins, wanted)) throw new Error('Invalid space origins')
  }
}
async function jsonFile(path: string) {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected regular file: ${path}`)
  return JSON.parse(await readFile(path, 'utf8'))
}
export async function readWorkspace(directory: string) {
  const root = await realpath(directory)
  if (!(await lstat(root)).isDirectory()) throw new Error('Workspace must be a directory')
  let activity: unknown = null, hasActivity = false
  try { activity = await jsonFile(join(root, 'activity.json')); hasActivity = true } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (hasActivity) {
    const validate = ajv.getSchema('urn:parking:schema:activity')!
    if (!validate(activity)) throw new Error(`Activity schema: ${ajv.errorsText(validate.errors)}`)
  }
  let entries: string[]
  try {
    if (!(await lstat(join(root, 'checkpoints'))).isDirectory()) throw new Error('Invalid checkpoints directory')
    entries = await readdir(join(root, 'checkpoints'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { root, activity, currentStage: -1, stages: new Map<number, StageState>() }
    throw error
  }
  const numbers = entries.filter(x => /^\d+$/.test(x)).map(x => {
    if (!/^[0-6]$/.test(x)) throw new Error(`Unsupported checkpoint ${x}`)
    return Number(x)
  }).sort((a, b) => a - b)
  if (numbers.some((n, i) => n !== i)) throw new Error('Checkpoint chain has a missing stage')
  const stages = new Map<number, StageState>()
  for (const n of numbers) {
    const dir = join(root, 'checkpoints', String(n)), info = await lstat(dir)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Invalid stage directory ${n}`)
    const state = await jsonFile(join(dir, 'state.json'))
    validateState(n, state)
    stages.set(n, state)
    if (n === 0) validateFirst(state as Stage0)
    if (n === 3) {
      const rows = (state as Stage3).payments.map(p => p.household)
      uniqueSorted(rows, compareHouseholds, 'payments')
      if (!isDeepStrictEqual(rows, registrations(stages.get(0) as Stage0).map(r => r.household).sort(compareHouseholds))) throw new Error('Payment households must match registration')
    }
    if (n === 4) validateSecond(state as Stage4, stages.get(0) as Stage0, stages.get(2) as Allocation, stages.get(3) as Stage3)
    if (n === 1 || n === 5) {
      const seed = state as SeedState
      const verified = await verifyQuicknet(await jsonFile(join(dir, 'info.json')), await jsonFile(join(dir, 'beacon.json')), seed.round)
      if (seed.seed !== verified.seed || seed.chainHash !== verified.chainHash || seed.roundScheduledTimeUtc !== verified.roundScheduledTimeUtc) throw new Error(`Stage ${n} seed receipt differs from signed beacon`)
      if (!(Date.parse(seed.buttonPressedAt) <= Date.parse(seed.requestStartedAt) && Date.parse(seed.requestStartedAt) <= Date.parse(seed.responseReceivedAt))) throw new Error('Invalid seed observation chronology')
    }
    if (n === 2 || n === 6) {
      const prepared = stages.get(n === 2 ? 0 : 4) as Stage0 | Stage4
      const seed = stages.get(n === 2 ? 1 : 5) as SeedState
      const recomputed = drawRound(seed.seed, { schemaVersion: 1, drawRound: n === 2 ? 1 : 2, pools: prepared.pools })
      if (!isDeepStrictEqual(recomputed, state)) throw new Error(`Stage ${n} stream or allocation differs from saved inputs and seed`)
    }
  }
  return { root, activity, currentStage: numbers.length - 1, stages }
}
