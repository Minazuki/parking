import { createParkingSpaces, getParkingLayout, worldPoint } from './layout.ts'
import type { ParkingFloor, ParkingSpace, Point } from './layout.ts'

export interface ArrivalRecord { id: string; household: string; spaceId?: string; rank?: number; stagingIndex?: number }
export interface ArrivalCard extends ArrivalRecord { floor: ParkingFloor; route: Point[]; delay: number; parkedHeading: number }
// Fictional households only. These fixtures never enter activity checkpoints.
export function demoArrivals(floor: ParkingFloor): ArrivalRecord[] {
  const targets = floor === 'motorcycle' ? ['86', '21', '58', '150', '12', '75'] : ['大1', '大27', '小39', '大38', '小57']
  return [...targets.map((spaceId, i) => ({ id: `${floor}:${i}`, household: `999-${i + 1}`, stagingIndex: i, spaceId })),
    ...[1, 2].map(rank => ({ id: `${floor}:wait:${rank}`, household: `999-${rank + 6}`, rank }))]
}
export function fullArrivalRecords(spaces: ParkingSpace[]): ArrivalRecord[] {
  return spaces.map((space, i) => ({ id: `coverage:${space.key}`, household: `998-${i + 1}`, spaceId: space.id, stagingIndex: i }))
}
export function arrivalBounds(floor: ParkingFloor): Point[] {
  return floor === 'motorcycle' ? [[100, 205], [270, 365]] : [[-75, 100], [130, 290]]
}
function approach(space: ParkingSpace): Point[] {
  const layout = getParkingLayout(space.floor)
  const x = space.x / layout.scale + layout.origin[0], y = space.z / layout.scale + layout.origin[1]
  if (space.floor === 'bicycle') {
    if (space.category === 'bicycle_small') return [[230, 173], [230, 365], [232, 490], [232, 550], [x, 594], [x, y]]
    if (Number(space.baseId) <= 14) return [[x, 173], [x, y]]
    return [[230, 173], [230, 365], [x, 365], [x, y]]
  }
  const n = Number(space.baseId)
  if (n >= 4 && n <= 13 && n !== 9) return [[470, 420], [365, 420], [365, y], [x, y]]
  if (n >= 15 && n <= 20) return [[470, 515], [90, 515], [90, 400], [x, 400], [x, y]]
  if (n === 14 && space.split) return [[470, 420], [365, 420], [365, y], [x, y]]
  if (n === 14) return [[470, 420], [350, 420], [350, y], [x, y]]
  if (n === 1) return [[470, 420], [x, 420], [x, y]]
  if (space.group === '梯間東側上排' || space.group === '梯間東側中排') return [[470, 420], [885, 420], [885, 296], [x, 296], [x, y]]
  if (space.group === '右中上列') return [[470, 420], [x, 420], [x, y]]
  if (space.group === '梯間東側下排') return [[470, 420], [x, 420], [x, y]]
  if (n === 2 || n === 3) return [[470, 420], [470, 405], [x, 405], [x, y]]
  if (space.group === '左側島下列') return [[470, 515], [x, 515], [x, y]]
  if (n >= 114 || n === 9) return [[470, 420], [885, 420], [885, y], [x, y]]
  if (n >= 95 && n <= 113 || n === 2 || n === 3) return [[470, 515], [x, 515], [x, y]]
  if (n >= 21 && n <= 33 || n >= 79 && n <= 94) return [[470, 515], [x, 515], [x, y]]
  if (n >= 34 && n <= 57 || n >= 70 && n <= 78) return [[470, 635], [x, 635], [x, y]]
  return [[470, 635], [x, 635], [x, y]]
}
export function createArrivalCards(floor: ParkingFloor, records: ArrivalRecord[], spaces = createParkingSpaces(floor), options: { waitlistSize?: number } = {}): ArrivalCard[] {
  const layout = getParkingLayout(floor)
  const assignedCount = records.filter(r => !r.rank).length
  // A single queried vehicle can still have rank 36. Size the outside queue
  // for its full rank range, rather than placing it on row 12 of a one-row grid.
  const waitingCount = Math.max(options.waitlistSize ?? 0, records.filter(r => r.rank).length, ...records.map(r => r.rank ?? 0))
  const assignedColumns = Math.max(3, Math.ceil(Math.sqrt(assignedCount * 1.4)))
  const waitingColumns = Math.max(3, Math.ceil(Math.sqrt(waitingCount * 1.4)))
  return records.map((record, i) => {
    const slot = record.rank ? record.rank - 1 : record.stagingIndex ?? i
    const columns = record.rank ? waitingColumns : assignedColumns
    const rows = Math.ceil((record.rank ? waitingCount : assignedCount) / columns)
    const dx = Math.min(floor === 'motorcycle' ? 45 : 48, 140 / Math.max(1, columns - 1))
    const dy = Math.min(floor === 'motorcycle' ? 32 : 44, (record.rank ? 45 : 85) / Math.max(1, rows - 1))
    const start: Point = floor === 'motorcycle' ? [120 + slot % columns * dx, (record.rank ? 220 : 280) + Math.floor(slot / columns) * dy] : [-60 + slot % columns * dx, (record.rank ? 110 : 175) + Math.floor(slot / columns) * dy]
    const source: Point[] = [start]
    let parkedHeading = 0
    if (record.spaceId) {
      const space = spaces.find(s => s.id === record.spaceId)
      if (!space) throw new Error(`Unknown arrival destination: ${record.spaceId}`)
      parkedHeading = space.rotation
      source.push(...(floor === 'motorcycle' ? [[250, 265], [470, 265], [470, 420]] as Point[] : [[140, 173]] as Point[]), ...approach(space))
    }
    return { ...record, floor, parkedHeading, delay: (record.stagingIndex ?? i) * 0.38, route: source.map(p => worldPoint(layout, p)) }
  })
}
export function arrivalDuration(cards: ArrivalCard[]): number {
  // Waitlisted vehicles are already at their outside positions at time zero.
  const latestArrival = Math.max(0, ...cards.filter(c => !c.rank).map(c => 1.2 + c.delay + c.route.slice(1).reduce((total, point, i) => {
    const previous = c.route[i]!
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1])
  }, 0) / 5))
  return latestArrival + 5
}
export function cardPosition(card: ArrivalCard, seconds: number): { position: [number, number, number]; arrived: boolean; heading: number } {
  const start = card.route[0]!
  if (card.rank) return { position: [start[0], 0.35, start[1]], arrived: true, heading: card.parkedHeading }
  let distance = Math.max(0, seconds - 1.2 - card.delay) * 5
  for (let i = 1; i < card.route.length; i++) {
    const a = card.route[i - 1]!, b = card.route[i]!, length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (distance < length) {
      const t = length ? distance / length : 1
      return { position: [a[0] + (b[0] - a[0]) * t, 0.35 + Math.sin(Math.PI * t) * 0.12, a[1] + (b[1] - a[1]) * t], arrived: false, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) }
    }
    distance -= length
  }
  const end = card.route.at(-1)!
  return { position: [end[0], 0.3, end[1]], arrived: true, heading: card.parkedHeading }
}
