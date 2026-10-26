import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { accessibleIds, createParkingSpaces, findParkingSpace, getParkingLayout } from '../client/src/models/parking/layout.ts'
import { useParkingScene } from '../client/src/viewmodels/useParkingScene.ts'

test('traced layouts contain every physical motorcycle and bicycle space exactly once', () => {
  const motorcycle = createParkingSpaces('motorcycle'), bicycle = createParkingSpaces('bicycle')
  assert.equal(motorcycle.length, 150)
  assert.equal(bicycle.length, 57)
  assert.equal(new Set(motorcycle.map(s => s.key)).size, 150)
  assert.deepEqual(motorcycle.map(s => Number(s.id)).sort((a,b) => a-b), Array.from({length:150},(_,i)=>i+1))
  assert.equal(motorcycle.filter(s => s.category === 'motorcycle_a').length, 65)
  assert.equal(motorcycle.filter(s => s.category === 'motorcycle_b').length, 85)
  assert.equal(bicycle.filter(s => s.category === 'bicycle_large').length, 38)
  assert.equal(bicycle.filter(s => s.category === 'bicycle_small').length, 19)
  for (const space of [...motorcycle,...bicycle]) assert.ok(Number.isFinite(space.x) && Number.isFinite(space.z) && space.width > 0 && space.depth > 0)
})
test('layout preserves photographed interleaved rows and reverse bicycle numbering', () => {
  const motorcycle = createParkingSpaces('motorcycle')
  const row = motorcycle.filter(s => s.group === '左側島下列').sort((a,b)=>a.x-b.x).map(s=>Number(s.id))
  assert.deepEqual(row,[57,56,55,54,53,50,48,46,45,44,41,39,37,35,34])
  const bicycle = createParkingSpaces('bicycle')
  assert.deepEqual(bicycle.filter(s => s.group === '大車位中排（由左至右）').sort((a,b)=>a.x-b.x).map(s=>s.id),Array.from({length:12},(_,i)=>`大${26-i}`))
  assert.ok(findParkingSpace(motorcycle,'150')!.z < findParkingSpace(motorcycle,'135')!.z)
})
test('accessible split variants retain the original footprint and all saved candidate IDs', async () => {
  const original = createParkingSpaces('motorcycle'), split = createParkingSpaces('motorcycle',accessibleIds)
  assert.equal(split.length,153)
  assert.equal(createParkingSpaces('motorcycle',['2','3']).length,152)
  for (const id of accessibleIds) {
    const base = original.find(s=>s.id===id)!, left=split.find(s=>s.id===id)!,right=split.find(s=>s.id===`${id}-1`)!
    assert.equal(left.width,0.75)
    assert.equal(right.width,0.75)
    assert.equal(left.depth,1.75)
    assert.ok(left.x-left.width/2>=base.x-base.width/2)
    assert.ok(right.x+right.width/2<=base.x+base.width/2)
    assert.ok(left.depth<=base.depth)
    assert.ok(Math.abs((left.x+right.x)/2-base.x)<1e-9)
    assert.equal(left.z,right.z)
    assert.ok(left.split && right.split)
  }
  const first=JSON.parse(await readFile(new URL('../examples/workspace/checkpoints/0/state.json',import.meta.url),'utf8'))
  for(const pool of first.pools.filter((p:{id:string})=>p.id.startsWith('motorcycle'))) {
    for(const candidate of pool.candidates) assert.ok(split.some(s=>s.id===candidate.spaceId))
  }
})
test('scene model selection and filters stay independent of activity or draw state', () => {
  const vm=useParkingScene()
  vm.query.value='014';vm.locate()
  assert.equal(vm.selected.value?.id,'14')
  vm.setSplit(true);vm.query.value='14-1';vm.locate()
  assert.equal(vm.selected.value?.id,'14-1')
  vm.setSplit(false);assert.equal(vm.selected.value,undefined)
  vm.changeFloor('bicycle');vm.query.value='小39';vm.locate()
  assert.equal(vm.selected.value?.id,'小39')
  vm.query.value='58';vm.locate();assert.match(vm.error.value,/找不到/)
  assert.equal(getParkingLayout('motorcycle').source.fileName,'機車平面.jpg')
})

test('parking meshes use the specified metre dimensions rather than photo rectangle sizes', () => {
  for (const slot of createParkingSpaces('motorcycle')) {
    assert.equal(slot.width,slot.accessible?2.25:0.75)
    assert.equal(slot.depth,slot.accessible?2.2:1.75)
  }
  for (const slot of createParkingSpaces('bicycle')) {
    assert.equal(slot.width,0.6)
    assert.equal(slot.depth,slot.category==='bicycle_large'?1.75:1.55)
  }
})
