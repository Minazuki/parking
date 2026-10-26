import { computed, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import type { ParkingFloor } from '../models/parking/layout.ts'
import { createArrivalCards, demoArrivals } from '../models/parking/arrival.ts'
export function useArrivalPreview(floor: Ref<ParkingFloor>) {
  const enabled = ref(false), query = ref(''), error = ref(''), seconds = ref(0), playing = ref(false), revision = ref(0)
  const selectedHousehold = ref('')
  const activeId = ref<string | null>(null)
  const activeRecord = computed(() => cards.value.find(c => c.id === activeId.value))
  const records = computed(() => demoArrivals(floor.value))
  const cards = computed(() => createArrivalCards(floor.value, records.value.filter(r => !selectedHousehold.value || r.household === selectedHousehold.value)))
  let frame = 0, previous = 0
  function stop() { playing.value = false; cancelAnimationFrame(frame); previous = 0 }
  function tick(now: number) {
    if (previous) seconds.value = Math.min(30, seconds.value + (now - previous) / 1000)
    previous = now
    if (seconds.value >= 30) { stop(); return }
    frame = requestAnimationFrame(tick)
  }
  function replay() { stop(); enabled.value = true; seconds.value = 0; revision.value++; playing.value = true; frame = requestAnimationFrame(tick) }
  function select(id: string) { if (cards.value.some(c => c.id === id)) activeId.value = id }
  function all() { activeId.value = null; selectedHousehold.value = ''; error.value = ''; replay() }
  function search() {
    const value = query.value.trim()
    if (!records.value.some(r => r.household === value)) { error.value = '查無示範戶號，請使用下方清單中的戶號。'; return }
    selectedHousehold.value = value; activeId.value = cards.value[0]?.id ?? null; error.value = ''; replay()
  }
  function finish() { stop(); seconds.value = 30 }
  function close() { stop(); enabled.value = false; activeId.value = null }
  watch(floor, () => { close(); selectedHousehold.value = ''; query.value = ''; error.value = '' })
  onUnmounted(stop)
  return { enabled, query, error, seconds, playing, revision, records, cards, activeId, activeRecord, select, all, search, replay, finish, close }
}
