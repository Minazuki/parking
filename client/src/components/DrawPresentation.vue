<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, toRef, watch } from 'vue'
import type { AllocationState, FirstState, SeedState } from '../models/activity.ts'
import { poolNames } from '../models/activity.ts'
import type { Pool, PoolResult } from '../domain/draw.mts'
import { createParkingSpaces, getParkingLayout } from '../models/parking/layout.ts'
import { poolFloor, savedArrivalRecords, savedSplitSpaces } from '../models/parking/saved-arrivals.ts'
import { useArrivalPreview } from '../viewmodels/useArrivalPreview.ts'
import { presentationSteps, useDrawPresentation } from '../viewmodels/useDrawPresentation.ts'
import ParkingCanvas from '../scenes/ParkingCanvas.vue'
import SeedEvidence from './SeedEvidence.vue'
import PoolOverview from './PoolOverview.vue'
import '../parking.css'
import '../presentation.css'
const props = defineProps<{
  year: number; round: 1 | 2; first: FirstState; pool: Pool; allocation?: AllocationState; result?: PoolResult
  excluded: string[]; accessible: { household: string; spaceId: string }[]
  seed?: SeedState; seedUrl: string; seedDelay: number | null; pressedAt: string | null
  busy: boolean; error: string; canDraw: boolean; nextPool?: string
}>()
const emit = defineEmits<{ close: []; draw: []; nextPool: [] }>()
const panel = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
const skipReasons: Record<string, string> = { no_participants: '無參與戶別', no_candidates: '無可抽項目', no_participants_and_no_candidates: '無參與戶別及可抽項目' }
const fullscreenError = ref('')
const webglError = ref(false)
const poolId = computed(() => props.pool.id)
const flow = reactive(useDrawPresentation(poolId, computed(() => !!props.result), toRef(props, 'busy')))
const floor = computed(() => poolFloor(props.pool.id))
const layout = computed(() => getParkingLayout(floor.value))
const spaces = computed(() => createParkingSpaces(floor.value, savedSplitSpaces(props.first)))
const records = computed(() => props.allocation ? savedArrivalRecords(props.first, props.allocation, props.pool.id) : [])
const arrival = reactive(useArrivalPreview(floor, records, spaces))
const visibleSpaces = computed(() => spaces.value.map(s => ({ ...s, selected: false, muted: !props.pool.candidates.some(c => c.type === 'space' && c.spaceId === s.id), color: props.pool.candidates.some(c => c.type === 'space' && c.spaceId === s.id) ? '#a3a3a3' : '#404040' })))
const spaceCount = computed(() => props.pool.candidates.filter(c => c.type === 'space').length)
const waitCount = computed(() => props.pool.candidates.length - spaceCount.value)
const excludedLabel = computed(() => props.round === 2 ? '未登記本類兩輪意願' : props.pool.id.startsWith('motorcycle') ? '放棄一般機車抽選' : '不參與本類腳踏車')
watch(() => flow.step.id, async id => {
  arrival.close()
  if (id === 'arrival' && records.value.length) arrival.all()
  await nextTick(); if (content.value) content.value.scrollTop = 0
})
watch(poolId, () => { arrival.close(); webglError.value = false })
async function fullscreen() {
  try { fullscreenError.value = ''; if (!document.fullscreenElement) await panel.value?.requestFullscreen(); else await document.exitFullscreen() }
  catch { fullscreenError.value = '無法啟用全螢幕，仍可在目前視窗播放。' }
}
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !props.busy) emit('close')
  if (event.key !== 'Tab') return
  const nodes = Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select') ?? [])
  if (!nodes.length) return
  const first = nodes[0]!, last = nodes.at(-1)!
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
onMounted(() => panel.value?.focus({ preventScroll: true }))
</script>
<template>
  <section ref="panel" class="draw-presentation" role="dialog" aria-modal="true" aria-label="抽選投影演出" tabindex="-1" @keydown="keydown">
    <header class="presentation-header"><div><span class="eyebrow">{{ year }}年度 · 第{{ round }}輪</span><h1>{{ poolNames[pool.id] }}</h1></div><div><button class="button" @click="fullscreen">全螢幕投影</button><button class="button" :disabled="busy" @click="emit('close')">返回工作台</button></div></header>
    <ol class="presentation-steps" aria-label="本梯次演出進度"><li v-for="(item, i) in presentationSteps" :key="item.id" :aria-current="flow.index === i ? 'step' : undefined" :class="{ active: flow.index === i, done: i < flow.index }">{{ i + 1 }} · {{ item.label }}</li></ol>
    <main ref="content" class="presentation-content">
      <p v-if="error || fullscreenError" role="alert" class="error-message">{{ error || fullscreenError }}</p>
      <template v-if="flow.step.id === 'households'">
        <h2>本梯次戶別名單</h2><div class="presentation-counts"><strong>{{ pool.households.length }}<small>戶參與</small></strong><strong>{{ excluded.length }}<small>戶{{ excludedLabel }}</small></strong></div>
        <h3>參與戶別</h3><div class="chips"><span v-for="house in pool.households" :key="house" class="chip household">{{ house }}</span><p v-if="!pool.households.length">本梯次無參與戶別。</p></div>
        <h3>{{ excludedLabel }}</h3><div class="chips"><span v-for="house in excluded" :key="house" class="chip subdued">{{ house }}</span><p v-if="!excluded.length">無。</p></div>
        <template v-if="accessible.length && round === 1"><h3>無障礙優先配置 · {{ accessible.length }}戶</h3><div class="chips"><span v-for="item in accessible" :key="item.household" class="chip">{{ item.household }} → {{ item.spaceId }}</span></div><p>無障礙獲配戶不重複參加第一輪一般機車抽選。</p></template>
      </template>
      <template v-else-if="flow.step.id === 'pool'">
        <h2>確認車位池與數量</h2><div class="presentation-counts"><strong>{{ pool.households.length }}<small>戶參與</small></strong><strong>{{ spaceCount }}<small>格實際車位</small></strong><strong v-if="round === 2">{{ waitCount }}<small>項候補順位</small></strong></div>
        <div class="chips"><span v-for="(candidate, i) in pool.candidates" :key="i" class="chip">{{ candidate.type === 'space' ? candidate.spaceId : `候補 ${candidate.rank}` }}</span><p v-if="!pool.candidates.length">本梯次無可抽項目。</p></div>
      </template>
      <template v-else-if="flow.step.id === 'seed'">
        <h2>{{ result ? '本輪已保存的公開種子' : '準備取得本輪公開種子' }}</h2><p>同一輪所有梯次共用一次取值；種子與整輪配位保存完成後，才播放進場演出。</p>
        <SeedEvidence :seed="seed" :pending="busy" :pressed-at="pressedAt" :url="seedUrl" :delay="seedDelay" />
        <button v-if="!result" class="button primary presentation-draw" :disabled="!canDraw || busy" @click="emit('draw')">{{ busy ? '正在取得種子並保存整輪配位…' : seed ? '沿用已保存種子完成本輪配位' : `開始第${round === 1 ? '一' : '二'}輪抽選` }}</button>
        <p v-else class="badge success">本輪配位已保存，後續播放不會重新取種子。</p>
      </template>
      <template v-else-if="flow.step.id === 'arrival'">
        <h2 class="presentation-arrival-heading">{{ result?.status === 'skipped' ? '本梯次略過' : '住戶進場' }}</h2>
        <p v-if="result?.status === 'skipped'">{{ skipReasons[result.reason ?? ''] ?? result.reason }} · 本輪種子與池內容已保留。</p>
        <template v-else><div class="presentation-scene"><ParkingCanvas v-if="!webglError" :key="pool.id" :layout="layout" :spaces="visibleSpaces" view="oblique" :reset-signal="0" :focus-signal="0" :cards="arrival.cards" :seconds="arrival.seconds" :arrival-enabled="arrival.enabled" :arrival-revision="arrival.revision" :active-arrival-id="arrival.activeId" @select-arrival="arrival.select" @dismiss-arrival="arrival.activeId = null" @error="webglError = true" /><p v-else role="alert">無法啟用3D，可繼續查看已保存結果。</p></div><div class="presentation-playback"><button class="button" @click="arrival.all">重播本梯次</button><button class="button" @click="arrival.finish">直接落位</button><span>點擊物件可查看戶號；到站後才顯示車位編號。</span></div></template>
      </template>
      <template v-else><PoolOverview :pool="pool" :result="result" :round="round" :excluded="excluded" :accessible="accessible" :space-count="spaceCount" :waitlist-count="waitCount" /></template>
    </main>
    <footer class="presentation-footer"><span>演出進度不寫入JSON斷點；重開後可從頭回看。</span><div><button class="button" :disabled="flow.index === 0 || busy" @click="flow.previous">上一步</button><button v-if="flow.index < 4" class="button primary" :disabled="!flow.canNext" @click="flow.next">下一步：{{ presentationSteps[flow.index + 1]?.label }}</button><button v-else-if="nextPool" class="button primary" @click="emit('nextPool')">下一梯次：{{ poolNames[nextPool] }}</button><button v-else class="button primary" @click="emit('close')">完成本輪展示</button></div></footer>
  </section>
</template>
