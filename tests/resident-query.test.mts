import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHousehold } from '../client/src/models/resident-query.ts'
test('resident query normalizes household numbers and rejects invalid input', () => {
  assert.equal(normalizeHousehold('999-02F'), '999-2')
  assert.equal(normalizeHousehold(' 999-2 '), '999-2')
  assert.equal(normalizeHousehold('997-03f'), '997-3')
  for (const input of ['0-2','999-0','foo','999-2-3','999-2.5','999-2<script>','999999999999999999999-2']) assert.equal(normalizeHousehold(input), null)
})

import { effectScope, nextTick } from 'vue'
import { useResidentQuery } from '../client/src/viewmodels/useResidentQuery.ts'
import type { QueryDataset } from '../client/src/models/resident-query.ts'
const fixture: QueryDataset = { schemaVersion: 1, activityYear:116, throughRound:2, testMode:true, builtAt:'2026-10-27T00:00:00Z', splitAccessible:['14','2','3'], households:[{household:'999-2',records:[{category:'motorcycle',round:2,status:'assigned',spaceId:'86'},{category:'bicycle_small',round:2,status:'waitlisted',rank:10}]}] }
test('resident scene starts gated on motorcycle, supports immediate placement and clears on requery', async () => {
  const scope=effectScope()
  const fetcher=(async()=>new Response(JSON.stringify(fixture))) as typeof fetch
  const vm=scope.run(()=>useResidentQuery('/fixture.json',fetcher))!
  assert.equal(vm.floor.value,'motorcycle')
  assert.equal(vm.cards.value.length,0)
  await vm.load()
  vm.input.value='999-02F';vm.search()
  assert.equal(vm.household.value?.household,'999-2')
  assert.equal(vm.followCamera.value,true)
  assert.equal(vm.record.value?.spaceId,'86')
  vm.changeView('top')
  assert.equal(vm.followCamera.value,true)
  vm.resetCamera()
  assert.equal(vm.followCamera.value,true)
  vm.immediate.value=true;await nextTick()
  assert.ok(vm.seconds.value>0)
  vm.followCamera.value=false
  vm.replay();await nextTick()
  assert.equal(vm.immediate.value,false)
  assert.equal(vm.followCamera.value,true)
  assert.equal(vm.seconds.value,0)
  assert.equal(vm.view.value,'oblique')
  vm.followCamera.value=false
  vm.changeView('top')
  assert.equal(vm.followCamera.value,false)
  vm.play(vm.effective.value[1]!)
  assert.equal(vm.floor.value,'bicycle')
  assert.equal(vm.record.value?.rank,10)
  vm.requery();await nextTick()
  assert.equal(vm.input.value,'')
  assert.equal(vm.household.value,undefined)
  assert.equal(vm.cards.value.length,0)
  assert.equal(vm.immediate.value,false)
  assert.equal(vm.floor.value,'motorcycle')
  scope.stop()
})

test('resident lookup keeps each waitlist position aligned with the full category queue', async () => {
  const data: QueryDataset={...fixture,households:Array.from({length:36},(_,i)=>({household:`999-${i+1}`,records:[{category:'motorcycle',round:2,status:'waitlisted',rank:i+1}]}))}
  const scope=effectScope()
  const vm=scope.run(()=>useResidentQuery('/fixture.json',(async()=>new Response(JSON.stringify(data))) as typeof fetch))!
  await vm.load()
  vm.input.value='999-8';vm.search()
  const first=vm.cards.value[0]!.route[0]!
  vm.input.value='999-36';vm.search()
  const last=vm.cards.value[0]!.route[0]!
  assert.ok(last[1]>=first[1])
  // The complete 36-position queue only spans 45 source units vertically.
  assert.ok(last[1]-first[1] <= 45*0.045+1e-9)
  assert.equal(vm.cards.value[0]!.rank,36)
  assert.equal(vm.cards.value[0]!.route.length,1)
  scope.stop()
})
