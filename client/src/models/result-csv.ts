import type { Activity, AllocationState, FirstState, SeedState } from './activity.ts'
export interface ResultExport { activity: Activity; first: FirstState; result: AllocationState; seed: SeedState; round: 1 | 2 }
export async function resultCsv(input: ResultExport): Promise<{ fileName: string; text: string }> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input.result)))), n => n.toString(16).padStart(2, '0')).join('')
  const header = ['輪次', '車位類型', '戶號', '車位', '候補']
  const rows: (string | number)[][] = [header]
  const add = (category: string, household: string, space = '', rank: number | '' = '') => rows.push([input.round, category, household, space, rank])
  if (input.round === 1) for (const a of input.first.accessible.assignments) add('機車位', a.household, a.spaceId)
  for (const pool of input.result.pools) {
    const category = pool.id.startsWith('motorcycle') ? '機車位' : pool.id === 'bicycle_large' ? '腳踏車大' : '腳踏車小'
    for (const a of pool.assignments) add(category, a.household, a.spaceId)
    for (const w of pool.waitlist) add(category, w.household, '', w.rank)
    for (const h of pool.unassignedHouseholds) add(category, h)
    for (const s of pool.remainingSpaces) add(category, '', s)
  }
  const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  return { fileName: `${input.activity.activityYear}年度第${input.round}輪機腳踏車位抽選結果_round${input.seed.round}_${hash.slice(0, 8)}.csv`, text: '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n' }
}
