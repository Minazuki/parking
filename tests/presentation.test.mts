import test from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, nextTick, ref } from 'vue'
import { useDrawPresentation } from '../client/src/viewmodels/useDrawPresentation.ts'
test('presentation gates arrivals on saved results and resets only its local step for each pool', async () => {
  const scope = effectScope(), id = ref('motorcycle_a'), result = ref(false), busy = ref(false)
  const vm = scope.run(() => useDrawPresentation(id, result, busy))!
  vm.next(); vm.next(); vm.next()
  assert.equal(vm.step.value.id, 'seed')
  busy.value = true; vm.previous()
  assert.equal(vm.step.value.id, 'seed')
  busy.value = false; result.value = true; vm.next()
  assert.equal(vm.step.value.id, 'arrival')
  vm.next(); assert.equal(vm.step.value.id, 'results')
  id.value = 'motorcycle_b'; await nextTick()
  assert.equal(vm.step.value.id, 'households')
  assert.equal(result.value, true)
  scope.stop()
})
