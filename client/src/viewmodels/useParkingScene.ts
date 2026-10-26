import { computed, ref } from 'vue'
import { accessibleIds, categoryColors, categoryNames, createParkingSpaces, findParkingSpace, getParkingLayout } from '../models/parking/layout.ts'
import type { ParkingCategory, ParkingFloor } from '../models/parking/layout.ts'

export function useParkingScene() {
  const floor = ref<ParkingFloor>('motorcycle')
  const view = ref<'oblique' | 'top'>('oblique')
  const split = ref(false)
  const configuredSplits = ref<string[] | null>(null)
  const filter = ref<ParkingCategory | 'all'>('all')
  const selectedKey = ref<string | null>(null)
  const query = ref('')
  const error = ref('')
  const resetSignal = ref(0)
  const focusSignal = ref(0)
  const webglError = ref(false)
  const layout = computed(() => getParkingLayout(floor.value))
  const spaces = computed(() => createParkingSpaces(floor.value, configuredSplits.value ?? (split.value ? accessibleIds : [])))
  const selected = computed(() => spaces.value.find(s => s.key === selectedKey.value))
  const filters = computed(() => (floor.value === 'motorcycle' ? ['motorcycle_a', 'motorcycle_b'] : ['bicycle_large', 'bicycle_small']).map(id => ({ id: id as ParkingCategory, label: categoryNames[id as ParkingCategory], count: spaces.value.filter(s => s.category === id).length, color: categoryColors[id as ParkingCategory] })))
  const visibleSpaces = computed(() => spaces.value.map(space => ({
    ...space, selected: space.key === selectedKey.value,
    muted: filter.value !== 'all' && space.category !== filter.value,
    color: space.key === selectedKey.value ? '#fbbf24' : filter.value !== 'all' && space.category !== filter.value ? '#404040' : space.accessible && !space.split ? '#a3a3a3' : categoryColors[space.category],
  })))
  function changeFloor(value: ParkingFloor) {
    floor.value = value; filter.value = 'all'; selectedKey.value = null; query.value = ''; error.value = ''; resetSignal.value++
  }
  function setSplit(value: boolean) {
    split.value = value
    if (!spaces.value.some(s => s.key === selectedKey.value)) selectedKey.value = null
  }
  function select(key: string) {
    const space = spaces.value.find(s => s.key === key)
    if (space) { selectedKey.value = key; query.value = space.id; error.value = '' }
  }
  function locate() {
    const space = findParkingSpace(spaces.value, query.value)
    if (!space) { error.value = '找不到此車位，請確認編號與目前區域。'; return }
    filter.value = 'all'; select(space.key); focusSignal.value++
  }
  function resetCamera() { resetSignal.value++ }
  return { floor, view, split, filter, selectedKey, query, error, resetSignal, focusSignal, webglError,
    configuredSplits, layout, spaces, visibleSpaces, selected, filters, changeFloor, setSplit, select, locate, resetCamera, categoryNames }
}
