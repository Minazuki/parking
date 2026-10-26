import { expect, test } from '@playwright/test'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const execute = promisify(execFile)
test('release starts from its package with embedded assets, native metadata and no Vite proxy', async ({ page }) => {
  test.setTimeout(120_000)
  const output = await mkdtemp(join(tmpdir(), 'parking-release-'))
  let child: ReturnType<typeof spawn> | undefined
  let exited: Promise<void> | undefined
  try {
    const script = fileURLToPath(new URL('../../script/build-release.sh', import.meta.url))
    const environment = { ...process.env, PARKING_BUILD_EPOCH: String(Math.floor(Date.now() / 1000)) }
    await execute(script, ['--output-dir', output], { env: environment, timeout: 90_000 })
    const names = (await readdir(output)).filter(name => name.startsWith('parking-release-v'))
    expect(names).toHaveLength(1)
    const directory = join(output, names[0]!)
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    expect(manifest.frontendEmbedded).toBe(true)
    expect(names[0]).toBe(`parking-release-v${manifest.version}`)
    expect(manifest.version).toMatch(/^\d{4}\.\d{4}\.\d{4}$/)
    expect(manifest.gitHash).toMatch(/^[a-f0-9]{40}(?:-dirty)?$/)
    expect(Number.isNaN(Date.parse(manifest.buildTime))).toBe(false)
    expect(await readdir(directory)).toEqual(['LICENSE', 'README.md', 'manifest.json', 'parking', 'start.sh'])
    for (const [name, digest] of Object.entries(manifest.files)) expect(createHash('sha256').update(await readFile(join(directory, name))).digest('hex')).toBe(digest)
    const version = await execute(join(directory, 'start.sh'), ['version'], { cwd: output, env: { ...process.env, PATH: '/usr/bin:/bin' } })
    expect(version.stdout).toContain(`version: ${manifest.version}`)
    expect(version.stdout).toContain(`OS: ${manifest.os}`)
    expect(version.stdout).toContain(`ARCH: ${manifest.arch}`)
    await expect(execute(script, ['--output-dir', output], { env: environment })).rejects.toThrow(/拒絕覆寫/)
    const workspace = join(output, 'annual data', '116')
    await cp(new URL('../../examples/workspace', import.meta.url), workspace, { recursive: true })
    const before = await Promise.all(Array.from({ length: 7 }, (_, n) => readFile(join(workspace, `checkpoints/${n}/state.json`), 'utf8')))
    child = spawn(join(directory, 'start.sh'), ['--workspace', 'annual data/116', '--no-browser'], { cwd: output, env: { ...process.env, PATH: '/usr/bin:/bin' } })
    let log = '', failure = ''
    child.stdout!.on('data', data => { log += String(data) })
    child.stderr!.on('data', data => { failure += String(data) })
    exited = new Promise(resolve => { child!.once('exit', () => resolve()); child!.once('error', cause => { failure += String(cause); resolve() }) })
    await expect.poll(() => /Parking backend: (http:\/\/\S+)/.exec(log)?.[1] ?? failure).toMatch(/^http:\/\/127\.0\.0\.1:/)
    const address = /Parking backend: (http:\/\/\S+)/.exec(log)![1]!
    const errors: string[] = [], external: string[] = [], writes: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => {
      if (!request.url().startsWith(address)) external.push(request.url())
      if (request.method() !== 'GET') writes.push(request.url())
    })
    const response = await page.goto(address)
    expect(response?.headers()['content-type']).toContain('text/html')
    await expect(page.getByRole('heading', { name: '兩輪抽選已完成', exact: true, level: 1 })).toBeVisible()
    expect((await (await page.request.get(`${address}/api/v1/status`)).json()).version).toBe(manifest.version)
    expect((await page.request.get(`${address}/api/v1/missing`)).headers()['content-type']).toContain('application/json')
    const missing = await page.request.get(`${address}/assets/missing.js`)
    expect(missing.status()).toBe(404)
    expect(await missing.text()).not.toContain('<html>')
    await page.goto(`${address}/?view=parking&source=activity&round=2&pool=motorcycle`)
    const canvas = page.locator('.parking-canvas')
    await expect(canvas).toHaveAttribute('data-ready', 'true')
    await expect(canvas).toHaveAttribute('data-space-count', '153')
    await page.getByRole('button', { name: '整批進場', exact: true }).click()
    await page.getByRole('button', { name: '顯示結果', exact: true }).click()
    await page.screenshot({ path: '../tmp/release-embedded-preview.png' })
    expect(errors).toEqual([])
    expect(external).toEqual([])
    expect(writes).toEqual([])
    const after = await Promise.all(Array.from({ length: 7 }, (_, n) => readFile(join(workspace, `checkpoints/${n}/state.json`), 'utf8')))
    expect(after).toEqual(before)
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      let timer: ReturnType<typeof setTimeout> | undefined
      try { await Promise.race([exited, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('release shutdown timed out')), 5000) })]) }
      catch { child.kill('SIGKILL'); await exited }
      finally { if (timer) clearTimeout(timer) }
    }
    await rm(output, { recursive: true, force: true })
  }
})
