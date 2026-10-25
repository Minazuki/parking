import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chacha20 } from '@noble/ciphers/chacha.js'

export const ALGORITHM = 'parking-draw-chacha20-v1'

export function boundedIndex(random: number, n: number) {
  const limit = Math.floor(2 ** 32 / n) * n
  return { limit, index: random < limit ? random % n : -1 }
}

// RFC 8439: 32-byte key, 12-byte zero nonce, initial block counter 0.
// Generate blocks on demand so rejected words consume the same stream.
export function draw150(seed: string) {
  if (!/^[0-9a-f]{64}$/i.test(seed)) throw new Error('seed must contain exactly 32 hex bytes')
  const key = Uint8Array.from(Buffer.from(seed, 'hex'))
  let counter = 0, offset = 64, block = new Uint8Array(64), word = 0
  const next = () => {
    if (offset === 64) {
      block = chacha20(key, new Uint8Array(12), new Uint8Array(64), undefined, counter++)
      offset = 0
    }
    const value = new DataView(block.buffer, block.byteOffset, block.byteLength).getUint32(offset, false)
    offset += 4
    return value
  }
  const pool = Array.from({ length: 150 }, (_, i) => i + 1)
  const order: number[] = []
  const trace: { word: number; poolSize: number; random: number; limit: number; accepted: boolean; index: number; selected: number }[] = []
  while (pool.length) {
    const n = pool.length, random = next()
    const { limit, index } = boundedIndex(random, n)
    const accepted = index !== -1
    const selected = accepted ? pool[index] : 0
    trace.push({ word: word++, poolSize: n, random, limit, accepted, index, selected })
    if (accepted) {
      order.push(selected)
      pool.splice(index, 1)
    }
  }
  return { algorithm: ALGORITHM, seed: seed.toLowerCase(), nonce: '00'.repeat(12), initialCounter: 0, uint32Endian: 'big', poolRemoval: 'stable', order, trace }
}

// Standalone TS worker; orchestration belongs to verify-draw.sh.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 4 || args[0] !== '--seed' || args[2] !== '--output') {
      throw new Error('Usage: node tools/verify-draw/ts/main.mts --seed HEX --output NEW_FILE')
    }
    await writeFile(args[3], JSON.stringify(draw150(args[1]), null, 2) + '\n', { flag: 'wx' })
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
