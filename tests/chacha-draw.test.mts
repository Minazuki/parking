import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chacha20 } from '@noble/ciphers/chacha.js'
import { draw150, boundedIndex } from '../tools/verify-draw/ts/main.mts'

test('ChaCha20 zero key/nonce counter-zero known vector', () => {
  const stream=chacha20(new Uint8Array(32),new Uint8Array(12),new Uint8Array(16),undefined,0)
  assert.equal(Buffer.from(stream).toString('hex'),'76b8e0ada0f13d90405d6ae55386bd28')
})
test('150 draws form a reproducible permutation with stable removal', () => {
  for (const seed of ['00'.repeat(32),'ff'.repeat(32),'7010277ecb91976aba93d63d298503889de63e291a5a49f7c1b8d2cce2b3e858']) {
    const result=draw150(seed)
    assert.deepEqual(result,draw150(seed))
    assert.deepEqual([...result.order].sort((a,b)=>a-b),Array.from({length:150},(_,i)=>i+1))
    const pool=Array.from({length:150},(_,i)=>i+1)
    for (const entry of result.trace) {
      assert.equal(entry.poolSize,pool.length)
      if(entry.accepted) assert.equal(pool.splice(entry.index,1)[0],entry.selected)
    }
    assert.equal(pool.length,0)
  }
  assert.notDeepEqual(draw150('00'.repeat(32)).order,draw150('ff'.repeat(32)).order)
  assert.throws(()=>draw150('abc'))
})
test('rejects modulo-bias tail, including the uint32 boundary', () => {
  const limit=Math.floor(2**32/150)*150
  assert.equal(boundedIndex(limit-1,150).index,149)
  assert.equal(boundedIndex(limit,150).index,-1)
  assert.equal(boundedIndex(2**32-1,150).index,-1)
  assert.equal(boundedIndex(2**32-1,1).index,0)
  assert.equal(boundedIndex(2**32-1,2).index,1)
})

test('matches the independently verified Go public-round fixture', async () => {
  const fixture=JSON.parse(await readFile(new URL('../examples/chacha-draw-33382601.json',import.meta.url),'utf8'))
  assert.deepEqual(draw150(fixture.seed).order,fixture.order)
})
