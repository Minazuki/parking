import type { AllocationState, FirstState } from '../activity.ts'
import type { ArrivalRecord } from './arrival.ts'
import { createArrivalCards } from './arrival.ts'
import { accessibleIds, createParkingSpaces } from './layout.ts'
import type { ParkingFloor } from './layout.ts'

export function savedSplitSpaces(first: FirstState): string[] {
  return accessibleIds.filter(id => first.accessible.splitSpaces.includes(`${id}-1`))
}
export function poolFloor(id: string): ParkingFloor {
  if (id === 'accessible' || ['motorcycle', 'motorcycle_a', 'motorcycle_b'].includes(id)) return 'motorcycle'
  if (id === 'bicycle_large' || id === 'bicycle_small') return 'bicycle'
  throw new Error(`無法辨識車位池：${id}`)
}
export function savedArrivalRecords(first: FirstState, result: AllocationState, poolId: string): ArrivalRecord[] {
  let records: ArrivalRecord[]
  if (poolId === 'accessible') {
    records = first.accessible.assignments.map((a, i) => ({ id: `accessible:${i}`, household: a.household, spaceId: a.spaceId, stagingIndex: i }))
  } else {
    const pool = result.pools.find(p => p.id === poolId)
    if (!pool) throw new Error(`存檔缺少車位池：${poolId}`)
    records = [...pool.assignments.map((a, i) => ({ ...a, id: `${pool.id}:space:${i}`, stagingIndex: i })),
      ...pool.waitlist.map(w => ({ ...w, id: `${pool.id}:wait:${w.rank}` }))]
  }
  // Resolve every destination now; mismatched snapshots must fail before playback.
  const floor = poolFloor(poolId)
  createArrivalCards(floor, records, createParkingSpaces(floor, savedSplitSpaces(first)))
  return records
}
