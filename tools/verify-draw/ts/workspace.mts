import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readWorkspace, type Stage0, type Stage4, type SeedState } from './checkpoints.mts'
import { verifyQuicknet } from '../../drand-seed/ts/main.mts'

export async function prepareWorkspace(directory: string, round: number, output: string) {
  if (round !== 1 && round !== 2) throw new Error('draw-round must be 1 or 2')
  const workspace = await readWorkspace(directory)
  const inputStage = round === 1 ? 0 : 4, seedStage = round === 1 ? 1 : 5, resultStage = round === 1 ? 2 : 6
  if (!workspace.stages.has(resultStage)) throw new Error(`Saved result stage ${resultStage} is required for verification`)
  const prepared = workspace.stages.get(inputStage) as Stage0 | Stage4
  const seed = workspace.stages.get(seedStage) as SeedState
  const evidence = join(workspace.root, 'checkpoints', String(seedStage))
  const infoRaw = await readFile(join(evidence, 'info.json'), 'utf8')
  const beaconRaw = await readFile(join(evidence, 'beacon.json'), 'utf8')
  const verified = await verifyQuicknet(JSON.parse(infoRaw), JSON.parse(beaconRaw), seed.round)
  if (verified.seed !== seed.seed || verified.chainHash !== seed.chainHash) throw new Error('Seed evidence changed during workspace read')
  const save = (file: string, data: unknown) => writeFile(join(output, file), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
  await save('pools.json', { schemaVersion: 1, drawRound: round, pools: prepared.pools })
  await save('expected.json', workspace.stages.get(resultStage))
  await mkdir(join(output, 'seed'))
  await writeFile(join(output, 'seed/info.json'), infoRaw, { flag: 'wx' })
  await writeFile(join(output, 'seed/beacon.json'), beaconRaw, { flag: 'wx' })
  await save('seed/receipt.json', { ...verified, mode: 'offline', requestStartedAt: null, responseReceivedAt: null, verifiedAt: new Date().toISOString() })
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.length !== 6 || args[0] !== '--workspace' || args[2] !== '--draw-round' || args[4] !== '--output') {
    console.error('Use --workspace DIRECTORY --draw-round 1|2 --output EMPTY_DIRECTORY')
    process.exitCode = 1
  } else {
    prepareWorkspace(args[1], Number(args[3]), args[5]).catch(error => { console.error(error.message); process.exitCode = 1 })
  }
}
