import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reviewReport } from '../client/src/models/review-report.ts'
import type { Activity, ReviewState } from '../client/src/models/activity.ts'
const activity: Activity = JSON.parse(readFileSync(new URL('../examples/workspace/activity.json', import.meta.url), 'utf8'))
const review: ReviewState = JSON.parse(readFileSync(new URL('../examples/workspace/checkpoints/4/state.json', import.meta.url), 'utf8'))

test('review Markdown includes released/vacant spaces and complete second-round registration and pools', () => {
  const before = JSON.stringify(review)
  const report = reviewReport(activity, review)
  assert.equal(report.fileName, '116年度清票報表.md')
  assert.match(report.text, /車格類型 \| 號碼 \| 釋出原因/)
  const names = { motorcycle: '機車位', bicycle_large: '腳踏車大', bicycle_small: '腳踏車小' }
  for (const item of review.review) {
    for (const space of item.vacantSpaces) assert.ok(report.text.includes(`| ${names[item.category]} | ${space} | 未抽出 |`))
    for (const space of item.released) assert.ok(report.text.includes(`| ${names[item.category]} | ${space.spaceId} | 未繳費釋出 |`))
  }
  for (const pool of review.pools) {
    for (const household of pool.households) assert.ok(report.text.includes(household))
    for (const c of pool.candidates) if (c.type === 'space') assert.ok(report.text.includes(c.spaceId))
    assert.ok(report.text.includes(`| ${names[pool.id as keyof typeof names]} | ${pool.households.length} | ${pool.candidates.filter(c => c.type === 'space').length} | ${pool.candidates.filter(c => c.type === 'waitlist').length} |`))
  }
  assert.equal(JSON.stringify(review), before)
  assert.deepEqual(reviewReport(activity, review), report)
})
test('review Markdown handles empty categories and waitlist entries', () => {
  const value = structuredClone(review)
  value.review = []
  value.pools[0]!.households = []
  value.pools[0]!.candidates = [{ type: 'waitlist', rank: 1 }]
  const report = reviewReport(activity, value)
  assert.ok(report.text.includes('參與戶號：無'))
  assert.ok(report.text.includes('車位池：無'))
  assert.ok(report.text.includes('候補項目：候補1'))
})
