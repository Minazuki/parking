import type { Activity, AllocationState, FirstState, SeedState } from './activity.ts'
import { poolNames } from './activity.ts'
export interface ResultExport { activity: Activity; first: FirstState; result: AllocationState; seed: SeedState; round: 1 | 2 }
export async function resultCsv(input: ResultExport): Promise<{ fileName: string; text: string }> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input.result)))), n => n.toString(16).padStart(2, '0')).join('')
  const header = ['年度', '活動ID', '輪次', '車種類型', '戶號', '結果', '車位號碼', '候補順位', 'drand round', '結果SHA256', '備註']
  const rows: (string | number)[][] = [header]
  const add = (category: string, household: string, status: string, space = '', rank: number | '' = '', note = '') => rows.push([input.activity.activityYear, input.activity.activityId, input.round, category, household, status, space, rank, input.seed.round, hash, note])
  if (input.round === 1) for (const a of input.first.accessible.assignments) add('機車（無障礙）', a.household, '優先配置', a.spaceId)
  for (const pool of input.result.pools) {
    const category = poolNames[pool.id] ?? pool.id
    for (const a of pool.assignments) add(category, a.household, '配位', a.spaceId)
    for (const w of pool.waitlist) add(category, w.household, '候補', '', w.rank)
    for (const h of pool.unassignedHouseholds) add(category, h, '未配位')
    for (const s of pool.remainingSpaces) add(category, '', '空位', s)
    if (pool.status === 'skipped') add(category, '', '略過', '', '', pool.reason ?? '')
  }
  const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  return { fileName: `${input.activity.activityYear}年度第${input.round}輪機腳踏車位抽選結果_round${input.seed.round}_${hash.slice(0, 8)}.csv`, text: '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n' }
}
