import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { drawRound, validatePrepared } from './core.mts'
export { drawRound, validatePrepared, ALGORITHM } from './core.mts'

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), opts: Record<string, string> = {}
    const check = args[0] === '--check'
    if (check) args.shift()
    for (let i = 0; i < args.length; i += 2) {
      if (!['--seed', '--pools', '--output'].includes(args[i]) || !args[i + 1] || opts[args[i]]) throw new Error('Invalid options')
      opts[args[i]] = args[i + 1]
    }
    if (!opts['--pools'] || (check ? Object.keys(opts).length !== 1 : Object.keys(opts).length !== 3)) throw new Error('Use [--check] --pools JSON or --seed HEX --pools JSON --output NEW_FILE')
    const input = JSON.parse(await readFile(opts['--pools'], 'utf8'))
    validatePrepared(input)
    if (!check) await writeFile(opts['--output'], JSON.stringify(drawRound(opts['--seed'], input), null, 2) + '\n', { flag: 'wx' })
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
