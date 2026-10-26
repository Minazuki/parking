import { expect, test } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const execute = promisify(execFile)

test('offline query packages show first and combined results without a backend or private checkpoints', async ({ page }) => {
  test.setTimeout(120000)
  const temp = await mkdtemp(join(tmpdir(), 'parking-query-browser-'))
  const source = fileURLToPath(new URL('../../examples/workspace', import.meta.url))
  const before = await Promise.all(['activity.json', ...Array.from({length:7},(_,i)=>`checkpoints/${i}/state.json`)].map(name=>readFile(join(source,name),'utf8')))
  let directory = join(temp, 'round one')
  const server = createServer(async (request,response) => {
    const path = new URL(request.url!, 'http://localhost').pathname
    const file = resolve(directory, '.' + (path === '/' ? '/index.html' : path))
    if (!file.startsWith(directory + '/')) {response.writeHead(404).end();return}
    try {
      const data = await readFile(file)
      response.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'} as Record<string,string>)[extname(file)] ?? 'application/octet-stream')
      response.end(data)
    } catch {response.writeHead(404).end()}
  })
  try {
    const script=fileURLToPath(new URL('../../script/build-query.sh',import.meta.url))
    await execute(script,['--workspace',source,'--round','1','--output',directory],{timeout:90000})
    await expect(execute(script,['--workspace',source,'--output',directory])).rejects.toThrow(/拒絕覆寫/)
    const files=await readdir(directory)
    expect(files).toContain('index.html')
    expect(files).not.toContain('checkpoints')
    const json=await readFile(join(directory,files.find(f=>f.startsWith('query-data-'))!),'utf8')
    expect(JSON.parse(json).throughRound).toBe(1)
    for(const key of ['payments','seed','streamHex','activityId'])expect(json).not.toContain(`"${key}"`)
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    const address=server.address() as {port:number}
    const url=`http://127.0.0.1:${address.port}`
    const errors:string[]=[], requests:string[]=[]
    page.on('pageerror',e=>errors.push(e.message))
    page.on('request',r=>requests.push(r.url()))
    await page.goto(url)
    await expect(page.getByRole('button',{name:'查詢',exact:true})).toBeEnabled()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.locator('.resident-preview-notice')).toHaveText('查詢結果僅供即時預覽，實際車位請以社區公告為主。')
    await expect(page.locator('.resident-query')).toHaveAttribute('data-floor', 'motorcycle')
    await expect(page.locator('.resident-dashboard')).toHaveCount(0)
    await expect(page.locator('.resident-world')).toHaveAttribute('inert', '')
    await page.screenshot({path:'../tmp/query-desktop-gate.png'})
    await page.getByLabel('戶號',{exact:true}).fill('999-02F')
    await page.getByRole('button',{name:'查詢',exact:true}).click()
    await expect(page.getByRole('heading',{name:'999-2 的車位'})).toBeVisible()
    await expect(page.locator('.resident-results ul')).toContainText('車位 104')
    await expect(page.locator('.resident-world canvas')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.resident-query')).toHaveAttribute('data-following', 'true')
    await expect(page.locator('.resident-section > summary')).toHaveText(['視角','播放控制','查詢結果','重新查詢'])
    await page.getByLabel('馬上就位',{exact:true}).check()
    await expect(page.getByLabel('馬上就位',{exact:true})).toBeChecked()
    await page.getByRole('button',{name:'俯視',exact:true}).click()
    await expect(page.locator('.resident-query')).toHaveAttribute('data-following','true')
    await page.getByRole('button',{name:'重新播放',exact:true}).click()
    await expect(page.getByLabel('馬上就位',{exact:true})).not.toBeChecked()
    await expect(page.getByRole('button',{name:'俯視',exact:true})).toHaveAttribute('aria-pressed','true')
    await page.getByRole('button',{name:'重設',exact:true}).click()
    await expect(page.locator('.resident-query')).toHaveAttribute('data-following','true')
    await page.locator('.resident-world canvas').hover({position:{x:200,y:300}})
    await page.mouse.wheel(0,120)
    await expect(page.locator('.resident-query')).toHaveAttribute('data-following','false')
    await page.getByRole('button',{name:'重設',exact:true}).click()
    await expect(page.locator('.resident-query')).toHaveAttribute('data-following','true')
    await page.screenshot({path:'../tmp/query-first-round.png',fullPage:true})
    directory=join(temp,'round two')
    await execute(script,['--workspace',source,'--output',directory],{timeout:90000})
    // New deployment may return new content; reload without relying on the old resource cache.
    await page.reload()
    await expect(page.getByRole('button',{name:'查詢',exact:true})).toBeEnabled()
    await page.setViewportSize({width:390,height:844})
    await page.getByLabel('戶號',{exact:true}).fill('999-2')
    await page.getByRole('button',{name:'查詢',exact:true}).click()
    await expect(page.getByRole('button',{name:'展開面板',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'展開面板',exact:true}).click()
    await expect(page.locator('header')).toContainText('第2輪')
    await expect(page.locator('.resident-results ul')).not.toContainText('車位 104')
    await page.getByText('先前結果',{exact:true}).click()
    await expect(page.locator('.resident-results details')).toContainText('車位 104 · 已釋出')
    await page.setViewportSize({width:390,height:844})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('.resident-preview-notice')).toBeVisible()
    await page.screenshot({path:'../tmp/query-combined-mobile.png',fullPage:true})
    await page.getByRole('button',{name:'重新播放',exact:true}).click()
    await expect(page.getByRole('button',{name:'展開面板',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'展開面板',exact:true}).click()
    await page.getByRole('button',{name:'查看位置',exact:true}).first().click()
    await expect(page.getByRole('button',{name:'展開面板',exact:true})).toBeVisible()
    const collapsed=await page.locator('.resident-dashboard').boundingBox()
    expect(collapsed!.height).toBeLessThan(120)
    await page.screenshot({path:'../tmp/query-mobile-collapsed.png'})
    await page.getByRole('button',{name:'展開面板',exact:true}).click()
    await page.getByRole('button',{name:'重新查詢',exact:true}).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByLabel('戶號',{exact:true})).toHaveValue('')
    await expect(page.locator('.resident-query')).toHaveAttribute('data-floor','motorcycle')
    await expect(page.locator('.resident-dashboard')).toHaveCount(0)

    expect(requests.every(r=>r.startsWith(url))).toBe(true)
    expect(requests.some(r=>r.includes('/api/'))).toBe(false)
    expect(errors).toEqual([])
    const after=await Promise.all(['activity.json', ...Array.from({length:7},(_,i)=>`checkpoints/${i}/state.json`)].map(name=>readFile(join(source,name),'utf8')))
    expect(after).toEqual(before)
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(temp,{recursive:true,force:true})}
})
