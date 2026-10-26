import type { ArrivalCard } from './arrival.ts'
import type { ParkingSpace, Point } from './layout.ts'

export interface RouteIssue { spaceId: string; obstacle: string; segment: number }
// Centre-line audit in each bay's local coordinates. This is not a vehicle-body collision simulation.
function crosses(a: Point, b: Point, space: ParkingSpace): boolean {
  const local = (p: Point): Point => {
    const dx = p[0] - space.x, dz = p[1] - space.z
    return [Math.cos(space.rotation) * dx - Math.sin(space.rotation) * dz, Math.sin(space.rotation) * dx + Math.cos(space.rotation) * dz]
  }
  const from = local(a), to = local(b)
  let low = 0, high = 1
  for (const axis of [0, 1] as const) {
    const half = (axis === 0 ? space.width : space.depth) / 2 - 1e-6
    const delta = to[axis] - from[axis]
    if (Math.abs(delta) < 1e-12) { if (Math.abs(from[axis]) >= half) return false; continue }
    const t1 = (-half - from[axis]) / delta, t2 = (half - from[axis]) / delta
    low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2))
    if (high <= low) return false
  }
  return high > low
}
export function auditArrivalRoutes(cards: ArrivalCard[], spaces: ParkingSpace[]): RouteIssue[] {
  const issues: RouteIssue[] = []
  for (const card of cards) {
    if (!card.spaceId) continue
    const seen = new Set<string>()
    for (let i = 1; i < card.route.length; i++) {
      for (const other of spaces) {
        if (other.id === card.spaceId || seen.has(other.id)) continue
        if (crosses(card.route[i - 1]!, card.route[i]!, other)) {
          seen.add(other.id); issues.push({ spaceId: card.spaceId, obstacle: other.id, segment: i })
        }
      }
    }
  }
  return issues
}
