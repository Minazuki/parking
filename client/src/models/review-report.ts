import type { Activity, ReviewState } from './activity.ts'

const names: Record<string, string> = { motorcycle: '機車位', bicycle_large: '腳踏車大', bicycle_small: '腳踏車小' }
const cell = (value: string | number) => String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')
const table = (headers: string[], rows: (string | number)[][]) => [headers, headers.map(() => '---'), ...rows].map(row => `| ${row.map(cell).join(' | ')} |`).join('\n')
export function reviewReport(activity: Activity, review: ReviewState): { fileName: string; text: string } {
  const lines = [`# ${activity.activityYear}年度清票報表`, '', '本報表依已保存的清票結果產生；車位釋出明細與第二輪資料如下。', '', '## 可供第二輪抽選的車位', '']
  const spaces = review.review.flatMap(item => [
    ...item.vacantSpaces.map(space => [names[item.category]!, space, '未抽出']),
    ...item.released.map(space => [names[item.category]!, space.spaceId, '未繳費釋出']),
  ])
  lines.push(table(['車格類型', '號碼', '釋出原因'], spaces), '', '## 第二輪登記與車位池', '')
  lines.push(table(['車格類型', '參與戶數', '實際車位', '候補項目'], review.pools.map(pool => [names[pool.id] ?? pool.id, pool.households.length, pool.candidates.filter(c => c.type === 'space').length, pool.candidates.filter(c => c.type === 'waitlist').length])), '')
  for (const pool of review.pools) {
    lines.push(`### ${names[pool.id] ?? pool.id}`, '', `參與戶號：${pool.households.join('、') || '無'}`, '', `車位池：${pool.candidates.filter(c => c.type === 'space').map(c => c.spaceId).join('、') || '無'}`, '', `候補項目：${pool.candidates.filter(c => c.type === 'waitlist').map(c => `候補${c.rank}`).join('、') || '無'}`, '')
  }
  return { fileName: `${activity.activityYear}年度清票報表.md`, text: lines.join('\n') }
}
