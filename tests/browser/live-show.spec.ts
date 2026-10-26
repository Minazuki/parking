import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
const stages = Object.fromEntries(Array.from({ length: 7 }, (_, n) => [n, JSON.parse(readFileSync(new URL(`../../examples/workspace/checkpoints/${n}/state.json`, import.meta.url), 'utf8'))]))
const fixture = JSON.parse(readFileSync(new URL('../../examples/workspace/activity.json', import.meta.url), 'utf8'))
test('dark live mode runs first draw, separate offline review, second draw and explicit CSV downloads', async ({ page }) => {
  let current = -1, activity: unknown = null
  const writes: string[] = [], errors: string[] = [], downloads: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('download', d => downloads.push(d.suggestedFilename()))
  await page.clock.install()
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    if (route.request().method() === 'POST') {
      writes.push(path)
      if (path === '/activities') activity = fixture
      else if (path === '/csv-imports/registration') current = 0
      else if (path === '/rounds/1/draws') current = 2
      else if (path === '/csv-imports/payments') current = 3
      else if (path === '/payment-reviews') current = 4
      else if (path === '/rounds/2/draws') current = 6
      else throw new Error(`unexpected write ${path}`)
      await route.fulfill({ status: 201, json: {} }); return
    }
    await route.fulfill({ json: path === '/status' ? { version: 'dev', workspace: '/fictional', currentStage: current, activity } : stages[Number(path.split('/').at(-1))] })
  })
  await page.goto('/')
  const live = page.locator('.live-show')
  await expect(page.getByRole('button', { name: '開始第一次抽選', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
  await expect(live).toHaveCSS('background-color', 'rgb(10, 10, 10)')
  await expect(page.getByRole('button', { name: '開始第一次抽選', exact: true })).toHaveCSS('background-color', 'rgb(251, 191, 36)')
  await expect(page.getByRole('button', { name: '開始第一次抽選', exact: true })).toHaveCSS('color', 'rgb(23, 23, 23)')
  await expect(page.getByRole('radio', { name: '1x', exact: true })).toBeChecked()
  await expect(page.getByRole('group', { name: '演出速度', exact: true })).toBeVisible()
  await page.getByRole('radio', { name: '2x', exact: true }).check()
  await expect(page.getByRole('radio', { name: '2x', exact: true })).toBeChecked()
  await page.getByRole('radio', { name: '1x', exact: true }).check()
  await expect(page.getByText('將A棟、B棟與無障礙車位CSV放入工作目錄的 inputs。按開始後自動匯入、依序展示四個池，完成後停在結果下載。', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: '../tmp/theme-mono-amber-standby.png' })
  await page.getByRole('button', { name: '開始第一次抽選', exact: true }).click()
  await expect(live).toHaveAttribute('data-step', 'households')
  async function next(expected: string) { await page.clock.fastForward(300_000); await expect(live).toHaveAttribute('data-step', expected) }
  async function round(poolCount: number) {
    for (let i = 0; i < poolCount; i++) {
      await next('pool')
      if (i === 0) { await next('seed'); await expect(page.getByText('簽章已驗證・已保存', { exact: true })).toBeVisible(); await next('arrival') }
      else await next(i === poolCount - 1 ? 'results' : 'arrival')
      if (i !== poolCount - 1) await next('results')
      await next(i === poolCount - 1 ? 'finished' : 'households')
    }
  }
  await round(4)
  expect(current).toBe(2)
  expect(writes).toEqual(['/activities', '/csv-imports/registration', '/rounds/1/draws'])
  expect(downloads).toEqual([])
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下載第一輪結果 CSV', exact: true }).click()
  const download = await downloaded
  expect(await readFile((await download.path())!, 'utf8')).toContain('"機車位","999-3","127",""')
  expect(download.suggestedFilename()).toMatch(/第1輪.*\.csv$/)
  await page.reload()
  await expect(page.getByRole('button', { name: '匯入繳費並清票', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '匯入繳費並清票', exact: true }).click()
  await expect(live).toHaveAttribute('data-step', 'review')
  expect(writes.slice(-2)).toEqual(['/csv-imports/payments', '/payment-reviews'])
  expect(writes).not.toContain('/rounds/2/draws')
  const reviewDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '下載清票報表', exact: true }).click()
  const reviewFile = await reviewDownload
  expect(reviewFile.suggestedFilename()).toBe('116年度清票報表.md')
  const markdown = await readFile((await reviewFile.path())!, 'utf8')
  expect(markdown).toContain('未抽出')
  expect(markdown).toContain('未繳費釋出')
  expect(markdown).toContain('第二輪登記與車位池')
  expect(writes).not.toContain('/rounds/2/draws')
  await page.screenshot({ path: '../tmp/live-dark-review.png' })
  await page.getByRole('button', { name: '清票收工，返回待機', exact: true }).click()
  await page.getByRole('button', { name: '開始第二次抽選', exact: true }).click()
  await expect(live).toHaveAttribute('data-step', 'households')
  await round(3)
  expect(current).toBe(6)
  expect(writes.filter(path => path.startsWith('/rounds/'))).toHaveLength(2)
  expect(downloads).toHaveLength(2)
  await page.screenshot({ path: '../tmp/live-dark-finished.png' })
  expect(errors).toEqual([])
})

test('live results fit the viewport and highlight one row at a time before paging', async ({ page }) => {
  await page.clock.install()
  const saved = structuredClone(stages)
  saved[2].pools[0].assignments = Array.from({ length: 50 }, (_, i) => ({ household: `999-${i + 1}`, spaceId: String(86 + i) }))
  saved[0].pools[0].households = saved[2].pools[0].assignments.map((a: { household: string }) => a.household)
  saved[2].pools[0].remainingSpaces = Array.from({ length: 15 }, (_, i) => String(136 + i))
  await page.route('**/api/v1/**', async route => {
    expect(route.request().method()).toBe('GET')
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    await route.fulfill({ json: path === '/status' ? { version: 'dev', workspace: '/fictional', currentStage: 2, activity: fixture } : saved[Number(path.split('/').at(-1))] })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: '重播第一次演出', exact: true }).click()
  const live = page.locator('.live-show')
  await expect(live).toHaveAttribute('data-step', 'households')
  for (const step of ['pool', 'seed', 'arrival', 'results']) {
    await page.clock.fastForward(300_000)
    await expect(live).toHaveAttribute('data-step', step)
  }
  const rows = page.locator('.live-results tbody tr')
  await expect(rows.first()).toBeVisible()
  const tallCount = await rows.count()
  expect(tallCount).toBeGreaterThan(6)
  await expect(page.locator('.live-header .live-progress')).toHaveCount(1)
  await expect(page.locator('main .live-progress')).toHaveCount(0)
  const fits = async () => {
    const bottom = await rows.last().boundingBox(), footer = await page.locator('.live-footer').boundingBox()
    expect(bottom!.y + bottom!.height).toBeLessThanOrEqual(footer!.y)
    expect(await page.locator('.live-show').evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)
  }
  await fits()
  await expect(page.locator('.live-quick-check')).toContainText('數量一致')
  await expect(page.locator('.result-highlight')).toHaveCount(0)
  await page.clock.fastForward(3000)
  await expect(rows.nth(0)).toHaveClass(/result-highlight/)
  await page.clock.fastForward(1000)
  await expect(rows.nth(1)).toHaveClass(/result-highlight/)
  await expect(rows.nth(0)).not.toHaveClass(/result-highlight/)
  const leftCount = await page.locator('.live-result-columns table').nth(0).locator('tbody tr').count()
  expect(await page.locator('.live-result-columns table').count()).toBe(2)
  await page.clock.fastForward((leftCount - 1) * 1000)
  await expect(page.locator('.live-result-columns table').nth(1).locator('tbody tr').first()).toHaveClass(/result-highlight/)
  await expect(page.locator('.result-highlight')).toHaveCount(1)
  await page.screenshot({ path: '../tmp/live-results-adaptive-900.png' })
  await page.clock.fastForward((tallCount - leftCount) * 1000)
  await expect(page.locator('.result-highlight')).toHaveCount(0)
  await expect(rows.first()).toContainText('999-1')
  await page.clock.fastForward(2000)
  await expect(rows.first()).toContainText(`999-${tallCount + 1}`)
  await page.setViewportSize({ width: 1280, height: 600 })
  await expect.poll(() => rows.count()).toBeLessThan(tallCount)
  await fits()
  await page.screenshot({ path: '../tmp/live-results-adaptive-600.png' })
})

for (const testMode of [false, true]) {
  test(`launch test flag ${testMode} controls the label and new activity mode`, async ({ page }) => {
    let current = -1, activity: unknown = null, createdMode = ''
    await page.clock.install()
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
      if (route.request().method() === 'POST') {
        if (path === '/activities') {
          createdMode = route.request().postDataJSON().mode
          expect(route.request().postDataJSON().activityYear).toBe(117)
          activity = { ...fixture, mode: createdMode, activityYear: 117 }
        } else if (path === '/csv-imports/registration') current = 0
        else throw new Error(`unexpected write ${path}`)
        await route.fulfill({ status: 201, json: {} }); return
      }
      await route.fulfill({ json: path === '/status' ? { version: 'dev', workspace: '/fictional', testMode, defaultActivityYear: 117, currentStage: current, activity } : stages[Number(path.split('/').at(-1))] })
    })
    await page.goto('/')
    const start = page.getByRole('button', { name: '開始第一次抽選', exact: true })
    await expect(start).toBeEnabled()
    await expect(page.locator('.live-settings input')).toHaveValue('117')
    await expect(page.locator('.live-header .badge')).toHaveCount(testMode ? 1 : 0)
    await expect(page.getByText('活動模式', { exact: true })).toHaveCount(0)
    await start.click()
    await expect(page.locator('.live-show')).toHaveAttribute('data-step', 'households')
    expect(createdMode).toBe(testMode ? 'test' : 'live')
  })
}

for (const stage of [-1, 2, 4, 6]) {
  test(`standby at checkpoint ${stage} has one next action and ordered completed stages`, async ({ page }) => {
    const writes: string[] = []
    await page.route('**/api/v1/**', async route => {
      if (route.request().method() !== 'GET') writes.push(route.request().url())
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
      await route.fulfill({ json: path === '/status' ? { version: 'dev', workspace: '/fictional', currentStage: stage, activity: stage < 0 ? null : fixture } : stages[Number(path.split('/').at(-1))] })
    })
    await page.goto('/')
    const primary = page.locator('.live-standby')
    await expect(primary).toBeVisible()
    await expect(primary.locator('button')).toHaveCount(stage === 6 ? 0 : 1)
    await expect(primary.locator('p')).toHaveCount(0)
    const expected = stage < 2 ? [] : stage < 4 ? ['first'] : stage < 6 ? ['first', 'review'] : ['first', 'review', 'second']
    await expect(page.locator('.live-history-stage')).toHaveCount(expected.length)
    expect(await page.locator('.live-history-stage').evaluateAll(rows => rows.map(row => row.getAttribute('data-history-stage')))).toEqual(expected)
    if (stage >= 4) {
      await page.getByRole('button', { name: '查看清票結果', exact: true }).click()
      await expect(page.locator('.live-show')).toHaveAttribute('data-step', 'review')
      expect(writes).toEqual([])
    }
    if (stage === 4) await page.screenshot({ path: '../tmp/live-history-review.png' })
    expect(writes).toEqual([])
  })
}
