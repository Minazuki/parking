import { test, expect } from '@playwright/test'
import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { promisify, stripVTControlCharacters } from 'node:util'
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const execute = promisify(execFile)
const require = createRequire(new URL('../../client/package.json', import.meta.url))

async function unusedPort(): Promise<number> {
  const listener = createServer()
  await new Promise<void>((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve) })
  const address = listener.address()
  if (!address || typeof address === 'string') throw new Error('no local port')
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))
  return address.port
}
function track(child: ChildProcess) {
  let output = '', error = ''
  child.stdout!.on('data', chunk => { output += stripVTControlCharacters(String(chunk)) })
  child.stderr!.on('data', chunk => { error += stripVTControlCharacters(String(chunk)) })
  const exited = new Promise<void>(resolve => { child.once('exit', () => resolve()); child.once('error', cause => { error += String(cause); resolve() }) })
  return {
    child, get output() { return output }, get error() { return error },
    async stop() {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('shutdown timeout')), 5000) })])
      } catch { child.kill('SIGKILL'); await exited }
      finally { if (timer) clearTimeout(timer) }
    },
  }
}

test('real Go API initializes and imports fictional CSV through the Vite proxy without obtaining a seed', async ({ page }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'parking-client-api-'))
  const binary = join(root, 'parking'), workspace = join(root, 'annual')
  const children: ReturnType<typeof track>[] = []
  try {
    await execute('go', ['build', '-o', binary, './src'], { cwd: fileURLToPath(new URL('../../server', import.meta.url)), timeout: 60_000 })
    await cp(new URL('../../examples/imports/inputs', import.meta.url), join(workspace, 'inputs'), { recursive: true })
    const frontendPort = await unusedPort(), frontendUrl = `http://127.0.0.1:${frontendPort}`
    const backend = track(spawn(binary, ['server', '--workspace', workspace, '--addr', '127.0.0.1:0', '--dev-origin', frontendUrl, '--no-browser']))
    children.push(backend)
    await expect.poll(() => /Parking backend: (http:\/\/\S+)/.exec(backend.output)?.[1] ?? backend.error).toMatch(/^http:\/\/127\.0\.0\.1:/)
    const address = /Parking backend: (http:\/\/\S+)/.exec(backend.output)![1]!
    const viteEntry = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
    const frontend = track(spawn(process.execPath, [viteEntry, '--port', String(frontendPort)], {
      cwd: fileURLToPath(new URL('../../client', import.meta.url)),
      env: { ...process.env, PARKING_API_TARGET: address },
    }))
    children.push(frontend)
    await expect.poll(() => frontend.output.includes(frontendUrl) ? 'ready' : frontend.error).toBe('ready')
    let drawRequested = false
    // All ordinary API calls pass through Vite's actual proxy. Block draws only.
    await page.route('**/api/v1/rounds/**', async route => { drawRequested = true; await route.abort() })
    await page.goto(`${frontendUrl}/?view=workbench`)
    await page.getByLabel('民國活動年度').fill('116')
    await page.getByRole('button', { name: '建立活動', exact: true }).click()
    await page.getByRole('button', { name: '確認匯入第一輪登記', exact: true }).click()
    await expect(page.getByRole('button', { name: '開始第一輪抽選', exact: true })).toBeEnabled()
    await expect(page.getByText('第一輪名單已備妥')).toBeVisible()
    const first = JSON.parse(await readFile(join(workspace, 'checkpoints/0/state.json'), 'utf8'))
    const expected = JSON.parse(await readFile(new URL('../../examples/workspace/checkpoints/0/state.json', import.meta.url), 'utf8'))
    expect(first).toEqual(expected)
    expect(await readdir(join(workspace, 'checkpoints'))).toEqual(['0'])
    expect(drawRequested).toBe(false)
    await page.reload()
    await expect(page.getByRole('button', { name: '開始第一輪抽選', exact: true })).toBeEnabled()
    expect(await readdir(join(workspace, 'checkpoints'))).toEqual(['0'])
  } finally {
    for (const child of children.reverse()) await child.stop()
    await rm(root, { recursive: true, force: true })
  }
})

test('real Go API replays saved second-round results without changing checkpoint files', async ({ page }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'parking-saved-view-'))
  const binary = join(root, 'parking'), workspace = join(root, 'annual')
  const children: ReturnType<typeof track>[] = []
  try {
    await execute('go', ['build', '-o', binary, './src'], { cwd: fileURLToPath(new URL('../../server', import.meta.url)), timeout: 60_000 })
    await cp(new URL('../../examples/workspace', import.meta.url), workspace, { recursive: true })
    const before = await Promise.all(Array.from({ length: 7 }, (_, n) => readFile(join(workspace, `checkpoints/${n}/state.json`), 'utf8')))
    const frontendPort = await unusedPort(), frontendUrl = `http://127.0.0.1:${frontendPort}`
    const backend = track(spawn(binary, ['server', '--workspace', workspace, '--addr', '127.0.0.1:0', '--dev-origin', frontendUrl, '--no-browser']))
    children.push(backend)
    await expect.poll(() => /Parking backend: (http:\/\/\S+)/.exec(backend.output)?.[1] ?? backend.error).toMatch(/^http:\/\/127\.0\.0\.1:/)
    const address = /Parking backend: (http:\/\/\S+)/.exec(backend.output)![1]!
    const viteEntry = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js')
    const frontend = track(spawn(process.execPath, [viteEntry, '--port', String(frontendPort)], {
      cwd: fileURLToPath(new URL('../../client', import.meta.url)), env: { ...process.env, PARKING_API_TARGET: address },
    }))
    children.push(frontend)
    await expect.poll(() => frontend.output.includes(frontendUrl) ? 'ready' : frontend.error).toBe('ready')
    const writes: string[] = []
    await page.route('**/api/v1/**', async route => {
      if (route.request().method() !== 'GET') { writes.push(route.request().url()); await route.abort() }
      else await route.continue()
    })
    await page.goto(`${frontendUrl}/?view=parking&source=activity&round=2&pool=motorcycle`)
    await expect(page.getByLabel('播放梯次')).toHaveValue('motorcycle')
    await expect(page.locator('.parking-canvas')).toHaveAttribute('data-space-count', '153')
    await page.getByRole('button', { name: '整批進場', exact: true }).click()
    await expect(page.locator('.parking-canvas')).toHaveAttribute('data-arrival-count', '4')
    await page.getByRole('button', { name: '顯示結果', exact: true }).click()
    await page.getByLabel('查詢戶號（目前梯次）').fill('997-3')
    await page.getByRole('button', { name: '播放', exact: true }).click()
    await page.getByRole('button', { name: '顯示結果', exact: true }).click()
    await expect(page.locator('.arrival-active-info')).toContainText('車位 149')
    await page.reload()
    await expect(page.getByLabel('播放梯次')).toHaveValue('motorcycle')
    await expect(page.locator('.parking-canvas')).toHaveAttribute('data-arrival-enabled', 'false')
    const after = await Promise.all(Array.from({ length: 7 }, (_, n) => readFile(join(workspace, `checkpoints/${n}/state.json`), 'utf8')))
    expect(after).toEqual(before)
    expect(writes).toEqual([])
  } finally {
    for (const child of children.reverse()) await child.stop()
    await rm(root, { recursive: true, force: true })
  }
})
