import data from './layouts.json' with { type: 'json' }

export type ParkingFloor = 'motorcycle' | 'bicycle'
export type ParkingCategory = 'motorcycle_a' | 'motorcycle_b' | 'bicycle_large' | 'bicycle_small'
export type Point = [number, number]
export interface LayoutGroup {
  name: string; ids: number[]; start: Point; end: Point; width: number; depth: number; rotation: number
}
export interface LayoutFeature {
  id: string; label: string; x: number; y: number; width: number; depth: number; height: number; kind: string
}
export interface ParkingLayout {
  name: string; floor: string
  source: { fileName: string; width: number; height: number; sha256: string; coordinates: string }
  origin: Point; scale: number; outline: Point[]; walls: [Point, Point][]; railings: [Point, Point][]; groups: LayoutGroup[]
  doors: { id: string; hinge: Point; end: Point; openEnd: Point }[]
  features: LayoutFeature[]; annotations: { label: string; x: number; y: number }[]
}
export interface ParkingSpace {
  key: string; floor: ParkingFloor; id: string; label: string; baseId: string
  category: ParkingCategory; group: string; x: number; z: number; width: number; depth: number; rotation: number
  accessible: boolean; split: boolean
}
const layouts = data as unknown as { schemaVersion: number; motorcycle: ParkingLayout; bicycle: ParkingLayout }
// All rendered geometry uses metres. Dimensions are length × width, as specified by the user.
export const parkingDimensions = {
  motorcycle: { length: 1.75, width: 0.75 },
  accessible: { length: 2.2, width: 2.25 },
  bicycleLarge: { length: 1.75, width: 0.6 },
  bicycleSmall: { length: 1.55, width: 0.6 },
} as const
export const accessibleIds = ['14', '2', '3'] as const
export function getParkingLayout(floor: ParkingFloor): ParkingLayout { return layouts[floor] }
export function worldPoint(layout: ParkingLayout, point: Point): Point {
  return [(point[0] - layout.origin[0]) * layout.scale, (point[1] - layout.origin[1]) * layout.scale]
}

// Positions follow explicit, visually transcribed row orders, including interleaved IDs.
// This layout is an approximate trace, not a survey or an allocation authority.
export function createParkingSpaces(floor: ParkingFloor, splitAccessible: readonly string[] = []): ParkingSpace[] {
  const layout = getParkingLayout(floor)
  const spaces: ParkingSpace[] = []
  for (const group of layout.groups) {
    for (const [index, number] of group.ids.entries()) {
      const progress = group.ids.length === 1 ? 0 : index / (group.ids.length - 1)
      const source: Point = [group.start[0] + (group.end[0] - group.start[0]) * progress, group.start[1] + (group.end[1] - group.start[1]) * progress]
      const [x, z] = worldPoint(layout, source)
      const baseId = String(number)
      const id = floor === 'motorcycle' ? baseId : `${number <= 38 ? '大' : '小'}${number}`
      const category: ParkingCategory = floor === 'motorcycle' ? number <= 85 ? 'motorcycle_b' : 'motorcycle_a' : number <= 38 ? 'bicycle_large' : 'bicycle_small'
      const accessible = floor === 'motorcycle' && accessibleIds.some(a => a === baseId)
      const dimensions = floor === 'motorcycle' ? accessible ? parkingDimensions.accessible : parkingDimensions.motorcycle : number <= 38 ? parkingDimensions.bicycleLarge : parkingDimensions.bicycleSmall
      const base: ParkingSpace = {
        key: `${floor}:${id}`, floor, id, label: id, baseId, category, group: group.name,
        x, z, width: dimensions.width, depth: dimensions.length,
        rotation: group.rotation * Math.PI / 180, accessible, split: false,
      }
      if (accessible && splitAccessible.includes(baseId)) {
        const width = parkingDimensions.motorcycle.width, depth = parkingDimensions.motorcycle.length
        const offset = base.width / 4
        spaces.push({ ...base, width, depth, x: base.x - offset, split: true })
        spaces.push({ ...base, key: `${floor}:${id}-1`, id: `${id}-1`, label: `${id}-1`, width, depth, x: base.x + offset, split: true })
      } else spaces.push(base)
    }
  }
  return spaces
}
export function findParkingSpace(spaces: readonly ParkingSpace[], query: string): ParkingSpace | undefined {
  const value = query.trim().replace(/號$/, '')
  if (!/^(?:大|小)?[0-9]+(?:-1)?$/.test(value)) return undefined
  const normalized = value.replace(/[0-9]+/, text => String(Number(text)))
  return spaces.find(s => s.id === normalized || (s.floor === 'bicycle' && s.id.replace(/^(大|小)/, '') === normalized))
}
export const categoryNames: Record<ParkingCategory, string> = {
  motorcycle_a: 'A棟基礎車位', motorcycle_b: 'B棟基礎車位', bicycle_large: '大腳踏車', bicycle_small: '小腳踏車',
}
export const categoryColors: Record<ParkingCategory, string> = {
  motorcycle_a: '#f0c699', motorcycle_b: '#a8cdb9', bicycle_large: '#a9c9d9', bicycle_small: '#d5b9cc',
}
