export type QueryCategory = 'motorcycle' | 'bicycle_large' | 'bicycle_small'
export interface QueryRecord { category: QueryCategory; round: number; status: 'assigned' | 'released' | 'waitlisted' | 'unassigned'; spaceId?: string; rank?: number }
export interface QueryHousehold { household: string; records: QueryRecord[] }
export interface QueryDataset { schemaVersion: 1; activityYear: number; throughRound: number; testMode: boolean; builtAt: string; splitAccessible: string[]; households: QueryHousehold[] }
export const queryCategories: Record<QueryCategory, string> = { motorcycle: '機車位', bicycle_large: '腳踏車大', bicycle_small: '腳踏車小' }
export function normalizeHousehold(value: string): string | null {
  const match = value.trim().match(/^(\d+)-(\d+)[fF]?$/)
  if (!match) return null
  const door = Number(match[1]), floor = Number(match[2])
  return Number.isSafeInteger(door) && Number.isSafeInteger(floor) && door > 0 && floor > 0 ? `${door}-${floor}` : null
}
