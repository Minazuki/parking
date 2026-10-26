import { computed, ref, shallowRef } from 'vue'
import { createActivityApi } from '../api/activity.ts'
import type { ActivityApi } from '../api/activity.ts'
import type { Activity, AllocationState, FirstState } from '../models/activity.ts'
import { poolNames } from '../models/activity.ts'
import { poolFloor, savedArrivalRecords, savedSplitSpaces } from '../models/parking/saved-arrivals.ts'

export function useSavedArrivals(api: ActivityApi = createActivityApi()) {
  const round = ref<1 | 2>(1), poolId = ref(''), loading = ref(false), error = ref('')
  const snapshot = shallowRef<{ activity: Activity; first: FirstState; result: AllocationState; round: 1 | 2 } | null>(null)
  const choices = computed(() => snapshot.value ? [
    ...(snapshot.value.round === 1 && snapshot.value.first.accessible.assignments.length ? [{ id: 'accessible', label: '無障礙配位' }] : []),
    ...snapshot.value.result.pools.map(p => ({ id: p.id, label: poolNames[p.id] ?? p.id })),
  ] : [])
  const records = computed(() => snapshot.value && poolId.value ? savedArrivalRecords(snapshot.value.first, snapshot.value.result, poolId.value) : [])
  const splits = computed(() => snapshot.value ? savedSplitSpaces(snapshot.value.first) : [])
  const floor = computed(() => poolId.value ? poolFloor(poolId.value) : 'motorcycle')
  const selectedResult = computed(() => snapshot.value?.result.pools.find(p => p.id === poolId.value))
  let request = 0
  async function load(preferredPool?: string) {
    const generation = ++request, requestedRound = round.value
    loading.value = true; error.value = ''; snapshot.value = null; poolId.value = ''
    try {
      const status = await api.status()
      if (!status.activity || status.currentStage < (requestedRound === 1 ? 2 : 6)) throw new Error(`目前尚無第${requestedRound === 1 ? '一' : '二'}輪結果。`)
      const first = await api.stage(0)
      const result = requestedRound === 1 ? await api.stage(2) : await api.stage(6)
      for (const pool of result.pools) savedArrivalRecords(first, result, pool.id)
      if (requestedRound === 1) savedArrivalRecords(first, result, 'accessible')
      const after = await api.status()
      if (status.currentStage !== after.currentStage || status.activity.activityId !== after.activity?.activityId) throw new Error('活動進度在讀取期間已改變，請重新讀取。')
      if (generation !== request) return
      snapshot.value = { activity: status.activity, first, result, round: requestedRound }
      poolId.value = choices.value.some(p => p.id === preferredPool) ? preferredPool! : choices.value[0]?.id ?? ''
    } catch (cause) { if (generation === request) error.value = cause instanceof Error ? cause.message : '讀取活動存檔失敗。' }
    finally { if (generation === request) loading.value = false }
  }
  function clear() { request++; snapshot.value = null; poolId.value = ''; loading.value = false; error.value = '' }
  return { round, poolId, loading, error, snapshot, choices, records, splits, floor, selectedResult, load, clear }
}
