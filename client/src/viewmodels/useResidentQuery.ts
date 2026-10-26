import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { QueryDataset, QueryHousehold, QueryRecord } from '../models/resident-query.ts'
import { normalizeHousehold } from '../models/resident-query.ts'
import { createParkingSpaces, getParkingLayout } from '../models/parking/layout.ts'
import { arrivalDuration, cardPosition, createArrivalCards } from '../models/parking/arrival.ts'

export function useResidentQuery(url: string, fetcher: typeof fetch = (...args) => fetch(...args)) {
  const data = shallowRef<QueryDataset>(), household = shallowRef<QueryHousehold>(), input = ref(''), error = ref(''), loading = ref(true)
  const record = shallowRef<QueryRecord>(), seconds = ref(0), revision = ref(0), activeId = ref<string | null>(null), view = ref<'oblique' | 'top'>('oblique'), reset = ref(0), focus = ref(0)
  const floor = computed(() => !record.value || record.value.category === 'motorcycle' ? 'motorcycle' : 'bicycle')
  const layout = computed(() => getParkingLayout(floor.value))
  const rawSpaces = computed(() => createParkingSpaces(floor.value, data.value?.splitAccessible ?? []))
  const selectedSpace = computed(() => rawSpaces.value.find(s => s.id === record.value?.spaceId))
  const waitlistSize = computed(() => Math.max(0, ...(data.value?.households.flatMap(h => h.records.filter(r => r.category === record.value?.category && r.round === record.value?.round && r.status === 'waitlisted').map(r => r.rank ?? 0)) ?? [])))
  const cards = computed(() => record.value && household.value ? createArrivalCards(floor.value, [{ id: 'resident', household: household.value.household, spaceId: record.value.spaceId, rank: record.value.rank, stagingIndex: 0 }], rawSpaces.value, { waitlistSize: waitlistSize.value }) : [])
  const followCamera = ref(true), immediate = ref(false)
  const followTarget = computed(() => cards.value[0] ? cardPosition(cards.value[0], seconds.value).position : undefined)
  const arrived = computed(() => cards.value.length > 0 && cardPosition(cards.value[0]!, seconds.value).arrived)
  const spaces = computed(() => rawSpaces.value.map(s => ({ ...s, selected: arrived.value && s.id === record.value?.spaceId, muted: !!record.value && s.id !== record.value.spaceId, color: arrived.value && s.id === record.value?.spaceId ? '#fbbf24' : '#a3a3a3' })))
  const effective = computed(() => household.value?.records.filter(r => r.status === 'assigned' || r.status === 'waitlisted') ?? [])
  const history = computed(() => household.value?.records.filter(r => r.status === 'released' || r.status === 'unassigned') ?? [])
  let timer: ReturnType<typeof setInterval> | undefined, alive = true
  const abort = new AbortController()
  function stop() { if (timer) clearInterval(timer); timer = undefined }
  async function load() {
    try {
      const response = await fetcher(url, { signal: abort.signal })
      if (!response.ok) throw new Error('查詢資料載入失敗，請重新整理。')
      const value = await response.json() as QueryDataset
      if (value.schemaVersion !== 1 || ![1, 2].includes(value.throughRound) || !Array.isArray(value.households) || !Array.isArray(value.splitAccessible)) throw new Error('查詢資料格式無法辨識。')
      if (alive) data.value = value
    } catch (cause) { if (alive) error.value = cause instanceof Error ? cause.message : '無法載入查詢資料。' }
    finally { if (alive) loading.value = false }
  }
  function play(value: QueryRecord) {
    stop(); record.value = value; seconds.value = 0; revision.value++; activeId.value = 'resident'
    const start = performance.now(), duration = arrivalDuration(cards.value)
    if (immediate.value) { seconds.value = duration; return }
    timer = setInterval(() => { seconds.value = Math.min(duration, (performance.now() - start) / 1000); if (seconds.value >= duration) stop() }, 33)
  }
  function resetCamera() { followCamera.value = true; view.value = 'oblique'; reset.value++ }
  function changeView(value: 'oblique' | 'top') { view.value = value }
  function replay() {
    if (!record.value) return
    followCamera.value = true
    if (immediate.value) immediate.value = false // The watcher restarts playback.
    else play(record.value)
  }
  function requery() {
    stop(); input.value = ''; household.value = undefined; record.value = undefined; error.value = ''
    seconds.value = 0; activeId.value = null; immediate.value = false; revision.value++; resetCamera()
  }
  watch(immediate, value => {
    if (!record.value) return
    if (value) { stop(); seconds.value = arrivalDuration(cards.value) }
    else play(record.value)
  })
  function search() {
    stop(); record.value = undefined; household.value = undefined; error.value = ''
    const id = normalizeHousehold(input.value)
    if (!id) { error.value = '請輸入戶號，例如 151-2。'; return }
    household.value = data.value?.households.find(h => h.household === id)
    if (!household.value) { error.value = '查無此戶號，請確認門牌與樓層。'; return }
    followCamera.value = true
    const first = effective.value.find(r => r.category === 'motorcycle') ?? effective.value[0]
    if (first) play(first)
  }
  onScopeDispose(() => { alive = false; abort.abort(); stop() })
  return { data, input, household, record, error, loading, seconds, revision, activeId, view, reset, focus, floor, layout, cards, spaces, selectedSpace, effective, history, followCamera, followTarget, immediate, resetCamera, changeView, replay, requery, load, search, play }
}
