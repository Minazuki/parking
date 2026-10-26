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
export function arrivalBounds(floor: ParkingFloor): Point[] {
  return floor === 'motorcycle' ? [[100, 205], [270, 365]] : [[-75, 100], [130, 290]]
}
function approach(space: ParkingSpace): Point[] {
  const layout = getParkingLayout(space.floor)
  const x = space.x / layout.scale + layout.origin[0], y = space.z / layout.scale + layout.origin[1]
  if (space.floor === 'bicycle') {
    if (space.category === 'bicycle_small') return [[230, 173], [230, 365], [232, 490], [232, 550], [x, 594], [x, y]]
    const lane = Number(space.baseId) <= 14 ? 173 : 365
    return [[230, 173], [230, lane], [x, lane], [x, y]]
  }
  const n = Number(space.baseId)
  if (n >= 4 && n <= 13) return [[470, 420], [365, 420], [365, y], [x, y]]
  if (n >= 15 && n <= 20 || n === 14) return [[470, 420], [470, 465], [105, 465], [105, 408], [x, 408], [x, y]]
  if (n === 1) return [[470, 420], [x, 420], [x, y]]
  if (n >= 114 || n === 9) return [[470, 420], [885, 420], [885, y], [x, y]]
  if (n >= 95 && n <= 113 || n === 2 || n === 3) return [[470, 515], [x, 515], [x, y]]
  if (n >= 21 && n <= 33 || n >= 79 && n <= 94) return [[470, 515], [x, 515], [x, y]]
  if (n >= 34 && n <= 57 || n >= 70 && n <= 78) return [[470, 635], [x, 635], [x, y]]
  return [[470, 635], [x, 635], [x, y]]
}
export function createArrivalCards(floor: ParkingFloor, records: ArrivalRecord[], spaces = createParkingSpaces(floor)): ArrivalCard[] {
  const layout = getParkingLayout(floor)
  return records.map((record, i) => {
    const slot = record.rank ? record.rank - 1 : record.stagingIndex ?? i
    const start: Point = floor === 'motorcycle' ? [140 + slot % 3 * 45, (record.rank ? 225 : 290) + Math.floor(slot / 3) * 32] : [-40 + slot % 3 * 48, (record.rank ? 110 : 175) + Math.floor(slot / 3) * 44]
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
