import { computed, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { ArrivalRecord } from '../models/parking/arrival.ts'
import type { ParkingFloor, ParkingSpace } from '../models/parking/layout.ts'
import { arrivalDuration, createArrivalCards, demoArrivals, fullArrivalRecords } from '../models/parking/arrival.ts'
export function useArrivalPreview(floor: Ref<ParkingFloor>, savedRecords?: Ref<ArrivalRecord[] | null>, spaces?: Ref<ParkingSpace[]>) {
  const enabled = ref(false), query = ref(''), error = ref(''), seconds = ref(0), playing = ref(false), revision = ref(0)
  const selectedHousehold = ref('')
  const fullCoverage = ref(false), speed = ref(1)
  const activeId = ref<string | null>(null)
  const activeRecord = computed(() => cards.value.find(c => c.id === activeId.value))
  const records = computed(() => savedRecords?.value ?? (fullCoverage.value && spaces ? fullArrivalRecords(spaces.value) : demoArrivals(floor.value)))
  const cards = computed(() => createArrivalCards(floor.value, records.value, spaces?.value).filter(r => !selectedHousehold.value || r.household === selectedHousehold.value))
  const duration = computed(() => arrivalDuration(cards.value))
  let frame = 0, previous = 0
  function stop() { playing.value = false; cancelAnimationFrame(frame); previous = 0 }
  function tick(now: number) {
    if (previous) seconds.value = Math.min(duration.value, seconds.value + (now - previous) / 1000 * speed.value)
    previous = now
    if (seconds.value >= duration.value) { stop(); return }
    frame = requestAnimationFrame(tick)
  }
  function replay() { stop(); enabled.value = true; seconds.value = selectedHousehold.value ? Math.min(...cards.value.map(c => c.delay)) : 0; revision.value++; playing.value = true; frame = requestAnimationFrame(tick) }
  function select(id: string) { if (cards.value.some(c => c.id === id)) activeId.value = activeId.value === id ? null : id }
  function all() { activeId.value = null; selectedHousehold.value = ''; error.value = ''; replay() }
  function search() {
    const value = query.value.trim()
    if (!records.value.some(r => r.household === value)) { error.value = savedRecords?.value ? '目前梯次查無此戶號的配位或候補紀錄。' : '查無示範戶號，請使用下方清單中的戶號。'; return }
    selectedHousehold.value = value; activeId.value = cards.value[0]?.id ?? null; error.value = ''; replay()
  }
  function coverage(value: boolean) { close(); fullCoverage.value = value; selectedHousehold.value = ''; query.value = ''; error.value = '' }
  function playSpace(spaceId: string) {
    const record = records.value.find(r => r.spaceId === spaceId)
    if (!record) return
    query.value = record.household; search()
  }
  function seek(value: number) { stop(); seconds.value = Math.max(0, Math.min(duration.value, value)) }
  function finish() { stop(); seconds.value = duration.value }
  function close() { stop(); enabled.value = false; activeId.value = null }
  watch(floor, () => { close(); selectedHousehold.value = ''; query.value = ''; error.value = '' })
  onUnmounted(stop)
  return { fullCoverage, speed, coverage, playSpace, seek, enabled, query, error, seconds, duration, playing, revision, records, cards, activeId, activeRecord, select, all, search, replay, finish, close }
}
