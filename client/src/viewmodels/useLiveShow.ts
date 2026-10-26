import { computed, onScopeDispose, reactive, ref } from 'vue'
import { useActivity } from './useActivity.ts'
import type { ActivityApi } from '../api/activity.ts'
import type { Mode } from '../models/activity.ts'
import { poolFloor, savedArrivalRecords, savedSplitSpaces } from '../models/parking/saved-arrivals.ts'
import { createParkingSpaces, getParkingLayout } from '../models/parking/layout.ts'
import { arrivalDuration, createArrivalCards } from '../models/parking/arrival.ts'
export type LiveStep = 'idle' | 'preparing' | 'households' | 'pool' | 'seed' | 'arrival' | 'results' | 'finished' | 'review' | 'error'
export function useLiveShow(api?: ActivityApi, clock: () => number = () => performance.now()) {
  const activity = reactive(useActivity(api))
  const year = ref(116), mode = ref<Mode>('test'), round = ref<1 | 2>(1)
  const step = ref<LiveStep>('idle'), poolIndex = ref(0), elapsed = ref(0), error = ref(''), activeId = ref<string | null>(null)
  const speed = ref(1)
  const running = computed(() => !['idle', 'finished', 'review', 'error'].includes(step.value))
  const pools = computed(() => round.value === 1 ? activity.first?.pools ?? [] : activity.review?.pools ?? [])
  const pool = computed(() => pools.value[poolIndex.value])
  const result = computed(() => round.value === 1 ? activity.checkpoints[2] : activity.checkpoints[6])
  const poolResult = computed(() => result.value?.pools.find(p => p.id === pool.value?.id))
  const seed = computed(() => round.value === 1 ? activity.checkpoints[1] : activity.checkpoints[5])
  const floor = computed(() => pool.value ? poolFloor(pool.value.id) : 'motorcycle')
  const layout = computed(() => getParkingLayout(floor.value))
  const spaces = computed(() => createParkingSpaces(floor.value, activity.first ? savedSplitSpaces(activity.first) : []))
  const cards = computed(() => activity.first && result.value && pool.value ? createArrivalCards(floor.value, savedArrivalRecords(activity.first, result.value, pool.value.id), spaces.value) : [])
  const resultRows = computed(() => [
    ...(poolResult.value?.assignments.map(a => ({ household: a.household, value: a.spaceId, type: '配位' })) ?? []),
    ...(poolResult.value?.waitlist.map(w => ({ household: w.household, value: `候補 ${w.rank}`, type: '候補' })) ?? []),
    ...(poolResult.value?.unassignedHouseholds.map(h => ({ household: h, value: '未配位', type: '未配位' })) ?? []),
  ])
  const participants = computed(() => pool.value?.households ?? [])
  const excluded = computed(() => activity.excludedHouseholds)
  const candidateSpaces = computed(() => pool.value?.candidates.filter(c => c.type === 'space') ?? [])
  const page = computed(() => Math.floor(elapsed.value / 6))
  const resultPageSize = 6
  const resultPages = computed(() => Math.max(1, Math.ceil(resultRows.value.length / resultPageSize)))
  const householdSlides = computed(() => {
    const slides: { title: string; rows: string[]; total: number }[] = []
    const add = (title: string, rows: string[], showEmpty = false) => {
      if (!rows.length && !showEmpty) return
      for (let i = 0; i < Math.max(1, rows.length); i += 24) slides.push({ title, rows: rows.slice(i, i + 24), total: rows.length })
    }
    add('參與住戶', participants.value, true)
    add(round.value === 2 ? '未登記本類兩輪意願' : pool.value?.id.startsWith('motorcycle') ? '放棄一般機車抽選' : '不參與本類腳踏車', excluded.value)
    if (round.value === 1) add('無障礙優先配置', activity.poolAccessible.map(a => `${a.household} → ${a.spaceId}`))
    return slides
  })
  const householdPages = computed(() => householdSlides.value.length)
  const poolPages = computed(() => Math.max(1, Math.ceil((pool.value?.candidates.length ?? 0) / 40)))
  const duration = computed(() => step.value === 'households' ? householdPages.value * 6 : step.value === 'pool' ? poolPages.value * 6 : step.value === 'seed' ? 8 : step.value === 'arrival' ? arrivalDuration(cards.value) : step.value === 'results' ? resultPages.value * 6 : Infinity)
  let disposed = false
  let started = 0, transitioning = false, timer: ReturnType<typeof setInterval> | undefined
  function stopTimer() { if (timer) clearInterval(timer); timer = undefined }
  function enter(value: LiveStep) { step.value = value; elapsed.value = 0; started = clock(); activeId.value = null }
  function checked() { if (disposed) throw new Error('頁面已關閉，停止後續自動作業。'); if (activity.error || !activity.connected || activity.outcomeUnknown) throw new Error(activity.error || '無法確認目前存檔進度，請重新讀取。') }
  async function command(expected: number) {
    activity.selectPhase(activity.currentPhase)
    await activity.runNext(); checked()
    if (activity.currentStage !== expected) throw new Error('後端未完成預期階段，演出已停止。')
  }
  async function start(target: 1 | 2) {
    if (disposed || running.value || activity.busy) return
    stopTimer(); round.value = target; error.value = ''; poolIndex.value = 0; enter('preparing')
    try {
      await activity.refresh(); checked()
      if (target === 1) {
        if (activity.requiresActivity) { await activity.initialize(year.value, mode.value); checked() }
        if (activity.currentStage < 0) await command(0)
      } else {
        if (activity.currentStage < 4) throw new Error('請先完成獨立清票作業，再開始第二次現場抽選。')
      }
      activity.selectPhase(target === 1 ? 'first' : 'second')
      if (!pools.value.length) throw new Error('找不到本輪已準備的車位池。')
      activity.selectPool(pools.value[0]!.id)
      enter('households')
      timer = setInterval(() => { void tick() }, 200)
    } catch (cause) { fail(cause) }
  }
  async function reviewPayments() {
    if (disposed || running.value || activity.busy) return
    stopTimer(); error.value = ''; enter('preparing')
    try {
      await activity.refresh(); checked()
      if (activity.currentStage < 2) throw new Error('請先完成第一次抽選。')
      if (activity.currentStage === 2) await command(3)
      if (activity.currentStage === 3) await command(4)
      enter('review')
    } catch (cause) { fail(cause) }
  }
  function fail(cause: unknown) { stopTimer(); error.value = cause instanceof Error ? cause.message : '現場演出失敗。'; enter('error') }
  async function advance() {
    if (disposed || transitioning || !running.value || step.value === 'preparing') return
    transitioning = true
    try {
      if (step.value === 'households') enter('pool')
      else if (step.value === 'pool') {
        if (poolIndex.value === 0) {
          enter('seed')
          if (!result.value) await command(round.value === 1 ? 2 : 6)
          // Keep the originally selected pool after the immutable session refresh.
          activity.selectPool(pools.value[poolIndex.value]!.id)
          enter('seed')
        } else enter(poolResult.value?.status === 'skipped' ? 'results' : 'arrival')
      } else if (step.value === 'seed') enter(poolResult.value?.status === 'skipped' ? 'results' : 'arrival')
      else if (step.value === 'arrival') enter('results')
      else if (step.value === 'results') {
        if (poolIndex.value + 1 < pools.value.length) { poolIndex.value++; activity.selectPool(pool.value!.id); enter('households') }
        else { enter('finished'); stopTimer() }
      }
    } catch (cause) { fail(cause) }
    finally { transitioning = false }
  }
  async function tick() {
    if (disposed || transitioning || !running.value || step.value === 'preparing') return
    elapsed.value = Math.max(0, (clock() - started) / 1000 * speed.value)
    if (elapsed.value >= duration.value) await advance()
  }
  function select(id: string) { activeId.value = activeId.value === id ? null : id }
  onScopeDispose(() => { disposed = true; stopTimer() })
  return { activity, year, mode, round, step, running, poolIndex, pools, pool, result, poolResult, seed, floor, layout, spaces, cards, activeId, select,
    elapsed, duration, page, resultPageSize, householdSlides, householdPages, resultPages, poolPages, participants, excluded, candidateSpaces, resultRows, speed, error, start, reviewPayments, advance, tick }
}
