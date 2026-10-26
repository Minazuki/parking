import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
const stage = (n: number) => JSON.parse(readFileSync(new URL(`../../examples/workspace/checkpoints/${n}/state.json`, import.meta.url), 'utf8'))
const activity = JSON.parse(readFileSync(new URL('../../examples/workspace/activity.json', import.meta.url), 'utf8'))
test('projection guides lists, pools, one explicit draw, evidence, arrivals and subsequent pools', async ({ page }) => {
  let current = 0, draws = 0
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'POST') {
      expect(path).toBe('/api/v1/rounds/1/draws')
      draws++; current = 2
      await route.fulfill({ status: 201, json: {} }); return
    }
    await route.fulfill({ json: path.endsWith('/status') ? { version: 'dev', workspace: '/fictional', currentStage: current, activity } : stage(Number(path.split('/').at(-1))) })
  })
  await page.goto('/?view=workbench')
  await page.getByRole('button', { name: '開啟投影演出', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '抽選投影演出' })
  await expect(dialog.getByRole('heading', { name: '本梯次戶別名單' })).toBeVisible()
  await expect(dialog).toContainText('999-3')
  await dialog.getByRole('button', { name: '下一步：車位池', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: '確認車位池與數量' })).toBeVisible()
  expect(draws).toBe(0)
  await dialog.getByRole('button', { name: '下一步：公開種子', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '下一步：進場演出', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: '開始第一輪抽選', exact: true }).click()
  await expect(dialog.getByText('簽章已驗證・已保存', { exact: true })).toBeVisible()
  expect(draws).toBe(1)
  await page.screenshot({ path: '../tmp/presentation-seed.png' })
  await dialog.getByRole('button', { name: '下一步：進場演出', exact: true }).click()
  await expect(dialog.locator('canvas')).toBeVisible()
  await dialog.getByRole('button', { name: '直接落位', exact: true }).click()
  await dialog.getByRole('button', { name: '重播本梯次', exact: true }).click()
  expect(draws).toBe(1)
  await page.screenshot({ path: '../tmp/presentation-arrival.png' })
  await dialog.getByRole('button', { name: '下一步：結果總覽', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: '已保存配位結果', exact: true })).toBeVisible()
  await expect(dialog).toContainText('127')
  await dialog.getByRole('button', { name: '下一梯次：B棟機車', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: '本梯次戶別名單' })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'B棟機車', exact: true })).toBeVisible()
  for (const label of ['下一步：車位池', '下一步：公開種子', '下一步：進場演出', '下一步：結果總覽']) await dialog.getByRole('button', { name: label, exact: true }).click()
  expect(draws).toBe(1)
  await dialog.getByRole('button', { name: '下一梯次：大腳踏車', exact: true }).click()
  for (const label of ['下一步：車位池', '下一步：公開種子', '下一步：進場演出', '下一步：結果總覽']) await dialog.getByRole('button', { name: label, exact: true }).click()
  await dialog.getByRole('button', { name: '下一梯次：小腳踏車', exact: true }).click()
  for (const label of ['下一步：車位池', '下一步：公開種子', '下一步：進場演出']) await dialog.getByRole('button', { name: label, exact: true }).click()
  await expect(dialog.getByRole('heading', { name: '本梯次略過', exact: true })).toBeVisible()
  await expect(dialog.locator('canvas')).toHaveCount(0)
  expect(draws).toBe(1)
  await dialog.getByRole('button', { name: '返回工作台', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(errors).toEqual([])
})
