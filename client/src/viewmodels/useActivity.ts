import { computed, nextTick, ref, shallowRef } from 'vue'
import { ApiError, createActivityApi } from '../api/activity.ts'
import type { ActivityApi } from '../api/activity.ts'
import { activePhase, phases, poolNames } from '../models/activity.ts'
import type { Checkpoints, CurrentStage, InputIssue, Mode, PhaseId, Session, Stage } from '../models/activity.ts'

type Action = 'registration' | 'first' | 'payments' | 'review' | 'second'
const actions: Record<number, { id: Action; label: string; description: string }> = {
  [-1]: { id: 'registration', label: '確認匯入第一輪登記', description: '讀取A棟、B棟與無障礙車位資料，保存確認後的名單。' },
  0: { id: 'first', label: '開始第一輪抽選', description: '取得本輪公開種子，計算並保存A／B棟機車與大／小腳踏車配位。' },
  1: { id: 'first', label: '沿用種子完成第一輪配位', description: '本輪種子已保存，將沿用原種子完成配位。' },
  2: { id: 'payments', label: '匯入第一輪繳費狀態', description: '讀取已核對的入帳CSV，保存繳費狀態；此步尚不釋出車位。' },
  3: { id: 'review', label: '確認清票並準備第二輪', description: '依已保存的配位、入帳與兩輪意願，計算保留、釋出及第二輪候補池。' },
  4: { id: 'second', label: '開始第二輪抽選', description: '取得本輪公開種子，保存機車與大／小腳踏車配位及候補順位。' },
  5: { id: 'second', label: '沿用種子完成第二輪配位', description: '本輪種子已保存，將沿用原種子完成配位。' },
}

export function useActivity(api: ActivityApi = createActivityApi()) {
  const session = shallowRef<Session | null>(null)
  const selectedPhase = ref<PhaseId>('registration')
  const selectedPoolId = ref('')
  const busy = ref<string | null>(null)
  const connected = ref(false)
  const outcomeUnknown = ref(false)
  const error = ref('')
  const issues = ref<InputIssue[]>([])
  const notice = ref('')
  const buttonPressedAt = ref<string | null>(null)
  const lastRefreshedAt = ref<string | null>(null)
  const status = computed(() => session.value?.status ?? null)
  const currentStage = computed<CurrentStage>(() => status.value?.currentStage ?? -1)
  const checkpoints = computed<Checkpoints>(() => session.value?.checkpoints ?? {})
  const first = computed(() => checkpoints.value[0])
  const payments = computed(() => checkpoints.value[3])
  const review = computed(() => checkpoints.value[4])
  const currentPhase = computed(() => activePhase(currentStage.value))
  const requiresActivity = computed(() => !!status.value && status.value.activity === null && currentStage.value === -1)
  const canOperate = computed(() => !!session.value && connected.value && !outcomeUnknown.value && !busy.value)
  const nextAction = computed(() => actions[currentStage.value] ?? null)
  const canRunNext = computed(() => canOperate.value && !requiresActivity.value && selectedPhase.value === currentPhase.value && !!nextAction.value)
  const phaseTitle = computed(() => phases.find(p => p.id === selectedPhase.value)!.label)
  const progress = computed(() => phases.map(p => ({
    ...p, available: !!status.value && currentStage.value >= p.minimum,
    done: currentStage.value >= p.completed,
    current: p.id === currentPhase.value && currentStage.value < 6,
    selected: p.id === selectedPhase.value,
  })))
  const round = computed<1 | 2>(() => selectedPhase.value === 'second' ? 2 : 1)
  const pools = computed(() => round.value === 1 ? first.value?.pools ?? [] : review.value?.pools ?? [])
  const selectedPool = computed(() => pools.value.find(p => p.id === selectedPoolId.value) ?? pools.value[0])
  const result = computed(() => round.value === 1 ? checkpoints.value[2] : checkpoints.value[6])
  const poolResult = computed(() => result.value?.pools.find(p => p.id === selectedPool.value?.id))
  const seed = computed(() => round.value === 1 ? checkpoints.value[1] : checkpoints.value[5])
  const seedUrl = computed(() => seed.value ? `https://api.drand.sh/v2/chains/${seed.value.chainHash}/rounds/${seed.value.round}` : '')
  const seedDelaySeconds = computed(() => seed.value ? (Date.parse(seed.value.responseReceivedAt) - Date.parse(seed.value.roundScheduledTimeUtc)) / 1000 : null)
  const realSpaces = computed(() => selectedPool.value?.candidates.filter(c => c.type === 'space') ?? [])
  const waitlistSlots = computed(() => selectedPool.value?.candidates.filter(c => c.type === 'waitlist') ?? [])
  const registrationRows = computed(() => first.value ? [
    ...first.value.registrations.A.map(r => ({ ...r, building: 'A' })),
    ...first.value.registrations.B.map(r => ({ ...r, building: 'B' })),
  ] : [])
  const accessibleHouseholds = computed(() => new Set(first.value?.accessible.assignments.map(a => a.household) ?? []))
  const excludedHouseholds = computed(() => {
    const id = selectedPool.value?.id
    if (!id || !first.value) return []
    let rows = registrationRows.value
    if (id === 'motorcycle_a') rows = rows.filter(r => r.building === 'A')
    if (id === 'motorcycle_b') rows = rows.filter(r => r.building === 'B')
    return rows.filter(r => {
      if (round.value === 2) return (id === 'motorcycle' ? r.motorcycle : id === 'bicycle_large' ? r.bicycleLarge : r.bicycleSmall) !== 2
      if (id.startsWith('motorcycle')) return r.motorcycle === 0 && !accessibleHouseholds.value.has(r.household)
      return (id === 'bicycle_large' ? r.bicycleLarge : r.bicycleSmall) === 0
    }).map(r => r.household)
  })
  const poolAccessible = computed(() => first.value?.accessible.assignments.filter(a => {
    const building = registrationRows.value.find(r => r.household === a.household)?.building
    return selectedPool.value?.id === (building === 'A' ? 'motorcycle_a' : 'motorcycle_b')
  }) ?? [])
  const registrationMetrics = computed(() => ['A', 'B'].map(building => {
    const rows = building === 'A' ? first.value?.registrations.A ?? [] : first.value?.registrations.B ?? []
    const assigned = rows.filter(r => accessibleHouseholds.value.has(r.household)).length
    return { building, total: rows.length, participants: first.value?.pools.find(p => p.id === `motorcycle_${building.toLowerCase()}`)?.households.length ?? 0,
      declined: rows.filter(r => r.motorcycle === 0 && !accessibleHouseholds.value.has(r.household)).length, assigned }
  }))
  const paymentMetrics = computed(() => [
    { label: '機車已入帳', count: payments.value?.payments.filter(p => p.motorcycle).length ?? 0 },
    { label: '大腳踏車已入帳', count: payments.value?.payments.filter(p => p.bicycleLarge).length ?? 0 },
    { label: '小腳踏車已入帳', count: payments.value?.payments.filter(p => p.bicycleSmall).length ?? 0 },
  ])
  const drawing = computed(() => !!busy.value && /種子|配位/.test(busy.value))
  const phaseDescription = computed(() => ({
    registration: '確認戶別意願、無障礙配置與本次抽選範圍。',
    first: result.value ? '第一輪配位已保存，可依車位類型查閱結果。' : '先核對參與名單與車位池，再開始整輪抽選。',
    payments: '讀取行政核對的入帳資料，與清票分開保存。',
    review: '核對保留與釋出車位，準備第二輪名單及候補項目。',
    second: result.value ? '第二輪配位與候補順位已保存。' : '依原登記的兩輪意願抽選，第一輪未繳費仍可參與。',
  })[selectedPhase.value])

  function selectPhase(id: PhaseId) {
    if (!busy.value && progress.value.find(p => p.id === id)?.available) {
      selectedPhase.value = id
      selectedPoolId.value = ''
    }
  }
  function selectPool(id: string) { if (pools.value.some(p => p.id === id)) selectedPoolId.value = id }
  function showError(cause: unknown) {
    error.value = cause instanceof Error ? cause.message : '發生無法辨識的錯誤。'
    issues.value = cause instanceof ApiError ? cause.issues : []
  }
  async function loadSession(followProgress: boolean) {
    // Immutable checkpoints form a consistent prefix. Detect another operator advancing mid-read.
    for (let attempt = 0; attempt < 2; attempt++) {
      const observed = await api.status()
      const entries = await Promise.all(Array.from({ length: observed.currentStage + 1 }, async (_, index) => {
        const number = index as Stage
        return [number, await api.stage(number)] as const
      }))
      const confirmed = await api.status()
      if (observed.currentStage !== confirmed.currentStage || observed.activity?.activityId !== confirmed.activity?.activityId) continue
      session.value = { status: confirmed, checkpoints: Object.fromEntries(entries) as Checkpoints }
      connected.value = true
      outcomeUnknown.value = false
      lastRefreshedAt.value = new Date().toISOString()
      if (followProgress || !progress.value.find(p => p.id === selectedPhase.value)?.available) {
        selectedPhase.value = activePhase(confirmed.currentStage)
        selectedPoolId.value = ''
      }
      return
    }
    throw new Error('讀取期間活動進度已變更，請再讀取一次最新進度。')
  }
  async function refresh() {
    if (busy.value) return
    busy.value = '正在讀取活動進度'
    error.value = ''; issues.value = []; notice.value = ''
    try { await loadSession(session.value === null) } catch (cause) { connected.value = false; showError(cause) }
    finally { busy.value = null }
  }
  async function execute(label: string, operation: () => Promise<void>) {
    if (!canOperate.value) return
    busy.value = label
    error.value = ''; issues.value = []; notice.value = ''
    await nextTick() // Render click time and in-flight state before sending the command.
    try {
      await operation()
      await loadSession(true)
      notice.value = '已保存完成，畫面已更新為目前進度。'
    } catch (cause) {
      showError(cause)
      // A dropped response may still have committed. Reconcile with read-only requests; never repeat POST.
      try { await loadSession(true) }
      catch { connected.value = false; outcomeUnknown.value = true }
    } finally { busy.value = null }
  }
  async function initialize(year: number, mode: Mode) {
    if (!requiresActivity.value || !canOperate.value) return
    if (!Number.isSafeInteger(year) || year < 1) { error.value = '請輸入有效的民國活動年度。'; return }
    await execute('正在建立年度活動', () => api.initialize(year, mode))
  }
  async function runNext() {
    if (!canRunNext.value || !nextAction.value) return
    const action = nextAction.value
    if (action.id === 'first' || action.id === 'second') {
      const drawRound = action.id === 'first' ? 1 : 2
      const savedSeed = drawRound === 1 ? checkpoints.value[1] : checkpoints.value[5]
      buttonPressedAt.value = savedSeed?.buttonPressedAt ?? new Date().toISOString()
      await execute(savedSeed ? '正在沿用已保存種子完成配位' : '正在取得公開種子並保存配位', () => api.draw(drawRound, savedSeed ? undefined : buttonPressedAt.value!))
      if (checkpoints.value[drawRound === 1 ? 2 : 6]) {
        selectedPhase.value = action.id
        notice.value = '' // The saved-result badge confirms success without pushing seed evidence off-screen.
      }
    } else if (action.id === 'registration') await execute('正在匯入第一輪登記', api.importRegistration)
    else if (action.id === 'payments') await execute('正在匯入第一輪繳費狀態', api.importPayments)
    else await execute('正在清票並準備第二輪', api.review)
  }
  return {
    status, currentStage, checkpoints, first, payments, review, session, selectedPhase, selectedPool,
    busy, connected, outcomeUnknown, error, issues, notice, buttonPressedAt, lastRefreshedAt,
    requiresActivity, canOperate, nextAction, canRunNext, currentPhase, phaseTitle, phaseDescription,
    progress, round, pools, result, poolResult, seed, seedUrl, seedDelaySeconds, realSpaces,
    waitlistSlots, registrationRows, excludedHouseholds, poolAccessible, poolNames, registrationMetrics, paymentMetrics, drawing,
    selectPhase, selectPool, refresh, initialize, runNext,
  }
}
export type ActivityViewModel = ReturnType<typeof useActivity>
