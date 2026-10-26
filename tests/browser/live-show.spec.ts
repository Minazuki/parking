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
  expect(await readFile((await download.path())!, 'utf8')).toContain('"999-3","配位","127"')
  expect(download.suggestedFilename()).toMatch(/第1輪.*\.csv$/)
  await page.reload()
  await expect(page.getByRole('button', { name: '匯入繳費並清票', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '匯入繳費並清票', exact: true }).click()
  await expect(live).toHaveAttribute('data-step', 'review')
  expect(writes.slice(-2)).toEqual(['/csv-imports/payments', '/payment-reviews'])
  expect(writes).not.toContain('/rounds/2/draws')
  await page.screenshot({ path: '../tmp/live-dark-review.png' })
  await page.getByRole('button', { name: '清票收工，返回待機', exact: true }).click()
  await page.getByRole('button', { name: '開始第二次抽選', exact: true }).click()
  await expect(live).toHaveAttribute('data-step', 'households')
  await round(3)
  expect(current).toBe(6)
  expect(writes.filter(path => path.startsWith('/rounds/'))).toHaveLength(2)
  expect(downloads).toHaveLength(1)
  await page.screenshot({ path: '../tmp/live-dark-finished.png' })
  expect(errors).toEqual([])
})
