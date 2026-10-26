import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import type { CurrentStage } from '../../client/src/models/activity.ts'

const saved = Object.fromEntries(Array.from({ length: 7 }, (_, n) => [n, JSON.parse(readFileSync(new URL(`../../examples/workspace/checkpoints/${n}/state.json`, import.meta.url), 'utf8'))]))
const activityFixture = JSON.parse(readFileSync(new URL('../../examples/workspace/activity.json', import.meta.url), 'utf8'))

async function mockBackend(page: Page, initial: CurrentStage, emptyActivity = false) {
  let stage: CurrentStage = initial
  let activity = emptyActivity ? null : { ...activityFixture }
  let draws = 0
  let importError = false
  let releaseDraw: (() => void) | null = null
  const source = structuredClone(saved)
  const apiCalls: string[] = []
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '')
    apiCalls.push(`${request.method()} ${path}`)
    let response: unknown = {}
    if (request.method() === 'GET' && path === '/status') response = { version: 'dev', workspace: '/停車位抽籤資料/116年度・演練', currentStage: stage, activity }
    else if (request.method() === 'GET' && path.startsWith('/stages/')) response = source[Number(path.split('/').at(-1))]
    else if (path === '/activities') activity = { ...activityFixture, activityYear: request.postDataJSON().activityYear, mode: request.postDataJSON().mode }
    else if (path === '/csv-imports/registration') {
      if (importError) {
        await route.fulfill({ status: 400, json: { error: '登記資料有誤', issues: [{ fileName: 'A棟資料.csv', row: 2, column: '機車位', message: '請填寫下拉選項' }] } })
        return
      }
      stage = 0
    } else if (path.startsWith('/rounds/')) {
      draws++
      const round = path.includes('/1/') ? 1 : 2
      const seedStage = round === 1 ? 1 : 5
      if (request.postDataJSON()?.buttonPressedAt) source[seedStage].buttonPressedAt = request.postDataJSON().buttonPressedAt
      // Keep the response pending so duplicate-button protection can be observed.
      await new Promise<void>(resolve => { releaseDraw = resolve })
      stage = round === 1 ? 2 : 6
    } else if (path === '/csv-imports/payments') stage = 3
    else if (path === '/payment-reviews') stage = 4
    else { await route.fulfill({ status: 404, json: { error: 'unexpected mock API call' } }); return }
    await route.fulfill({ status: request.method() === 'GET' ? 200 : 201, json: response })
  })
  return {
    get stage() { return stage }, get draws() { return draws }, apiCalls,
    failImport() { importError = true },
    finishDraw() { expect(releaseDraw).not.toBeNull(); releaseDraw!(); releaseDraw = null },
  }
}

test('new activity imports CSV, draws both rounds once, reviews payments, and preserves saved results', async ({ page }) => {
  const mock = await mockBackend(page, -1, true)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/?view=workbench')
  await expect(page.getByRole('heading', { name: '建立本年度活動' })).toBeVisible()
  await page.getByLabel('民國活動年度').fill('116')
  await page.getByRole('button', { name: '建立活動', exact: true }).click()
  await page.getByRole('button', { name: '確認匯入第一輪登記', exact: true }).click()
  await expect(page.getByRole('heading', { name: '確認名單與車位池' })).toBeVisible()
  await expect(page.getByRole('button', { name: '大腳踏車', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '開始第一輪抽選', exact: true }).click()
  await expect(page.getByText('正在取得公開種子並保存配位', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '開始第一輪抽選', exact: true })).toHaveCount(0)
  expect(mock.draws).toBe(1)
  mock.finishDraw()
  await expect(page.getByRole('heading', { name: '已保存配位結果' })).toBeVisible()
  await expect(page.getByText('簽章已驗證・已保存')).toBeVisible()
  await expect(page.getByRole('link', { name: '查詢此 round' })).toHaveAttribute('href', /\/v2\/chains\/.+\/rounds\/33382601/)
  expect(mock.stage).toBe(2)
  const seedClearance = await page.evaluate(() => document.querySelector('.timeline')!.getBoundingClientRect().top - document.querySelector('.seed-panel')!.getBoundingClientRect().bottom)
  expect(seedClearance).toBeGreaterThanOrEqual(0)
  await page.getByRole('button', { name: '前往繳費匯入' }).click()
  await page.getByRole('button', { name: '匯入第一輪繳費狀態', exact: true }).click()
  await expect(page.getByRole('heading', { name: '入帳資料已保存，準備清票' })).toBeVisible()
  await page.getByRole('button', { name: '確認清票並準備第二輪', exact: true }).click()
  await expect(page.getByRole('button', { name: '機車（A／B棟）', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '開始第二輪抽選', exact: true }).click()
  await expect(page.getByText('正在取得公開種子並保存配位', { exact: true })).toBeVisible()
  mock.finishDraw()
  await expect(page.getByRole('heading', { name: '兩輪配位已完成' })).toBeVisible()
  expect(mock.draws).toBe(2)
  await page.reload()
  await expect(page.getByRole('heading', { name: '兩輪配位已完成' })).toBeVisible()
  expect(mock.draws).toBe(2)
  expect(errors).toEqual([])
  await mkdir(new URL('../../tmp/', import.meta.url), { recursive: true })
  await page.screenshot({ path: '../tmp/client-completed-desktop.png', fullPage: true })
})

test('CSV row errors remain visible and do not advance the timeline', async ({ page }) => {
  const mock = await mockBackend(page, -1)
  mock.failImport()
  await page.goto('/?view=workbench')
  await page.getByRole('button', { name: '確認匯入第一輪登記', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('A棟資料.csv · 第2列 · 機車位')
  expect(mock.stage).toBe(-1)
  expect(mock.draws).toBe(0)
  await expect(page.getByRole('button', { name: /第一輪抽選.*尚未開始/ })).toBeDisabled()
})

test('a saved seed resumes without a fresh timestamp; narrow Chrome layout has no page overflow', async ({ page }) => {
  const mock = await mockBackend(page, 1)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?view=workbench')
  await expect(page.getByText('簽章已驗證・已保存')).toBeVisible()
  await page.getByRole('button', { name: '沿用種子完成第一輪配位', exact: true }).click()
  await expect(page.getByText('正在沿用已保存種子完成配位', { exact: true })).toBeVisible()
  mock.finishDraw()
  await expect(page.getByRole('heading', { name: '已保存配位結果' })).toBeVisible()
  expect(mock.draws).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '../tmp/client-completed-mobile.png', fullPage: true })
})

test('short desktop keeps the full seed evidence above the fixed progress timeline', async ({ page }) => {
  await mockBackend(page, 2)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/?view=workbench')
  await page.getByRole('button', { name: /第一輪抽選.*已完成/ }).click()
  await expect(page.getByRole('heading', { name: '公開隨機種子' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  const bounds = await page.evaluate(() => {
    const seed = document.querySelector('.seed-panel')!.getBoundingClientRect()
    const timeline = document.querySelector('.timeline')!.getBoundingClientRect()
    return { top: seed.top, bottom: seed.bottom, timelineTop: timeline.top, overflow: document.documentElement.scrollWidth > innerWidth }
  })
  expect(bounds.top).toBeGreaterThanOrEqual(0)
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.timelineTop)
  expect(bounds.overflow).toBe(false)
  await page.screenshot({ path: '../tmp/client-seed-short-desktop.png' })
})
