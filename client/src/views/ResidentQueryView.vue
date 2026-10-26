<script setup lang="ts">
import { defineAsyncComponent, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useResidentQuery } from '../viewmodels/useResidentQuery.ts'
import { queryCategories, type QueryRecord } from '../models/resident-query.ts'
import '../resident-query.css'
const ParkingCanvas = defineAsyncComponent(() => import('../scenes/ParkingCanvas.vue'))
const vm = reactive(useResidentQuery(`${import.meta.env.BASE_URL}${import.meta.env.VITE_QUERY_DATA_FILE ?? 'query-data.json'}`))
const webglError = ref(false), panelOpen = ref(true), inputElement = ref<HTMLInputElement>()
async function focusInput() { await nextTick(); if (window.matchMedia('(min-width: 761px)').matches) inputElement.value?.focus() }
async function requery() { vm.requery(); panelOpen.value = true; await focusInput() }
function search() { vm.search(); if (vm.household) { panelOpen.value = true; collapseForMobile() } }
function collapseForMobile() { if (window.matchMedia('(max-width: 760px)').matches) panelOpen.value = false }
function play(item: QueryRecord) { vm.play(item); collapseForMobile() }
function replay() { vm.replay(); collapseForMobile() }
function trapInput(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const elements = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)')]
  if (!elements.length) { event.preventDefault(); return }
  const index = elements.indexOf(document.activeElement as HTMLElement)
  if (event.shiftKey && index <= 0) { event.preventDefault(); elements.at(-1)?.focus() }
  else if (!event.shiftKey && index === elements.length - 1) { event.preventDefault(); elements[0]?.focus() }
}
watch(() => vm.loading, value => { if (!value) void focusInput() })
onMounted(vm.load)
</script>
<template>
  <div class="resident-query" :data-following="vm.followCamera" :data-gated="!vm.household" :data-floor="vm.floor">
    <div class="resident-world" :inert="!vm.household || undefined" :aria-hidden="!vm.household || undefined">
      <ParkingCanvas v-if="!webglError" :key="vm.floor" :layout="vm.layout" :spaces="vm.spaces" :cards="vm.cards" :seconds="vm.seconds" :view="vm.view" :reset-signal="vm.reset" :focus-signal="vm.focus" :selected="vm.selectedSpace" :active-arrival-id="vm.activeId" :focused-arrival-id="vm.record ? 'resident' : undefined" :arrival-enabled="!!vm.record" :arrival-revision="vm.revision" :interactive="!!vm.household" :follow-target="vm.followTarget" :follow-enabled="!!vm.household && vm.followCamera" @camera-interact="vm.followCamera = false" @select-arrival="vm.activeId = vm.activeId ? null : 'resident'" @dismiss-arrival="vm.activeId = null" @error="webglError = true" />
      <div v-else class="resident-no-webgl">此裝置無法顯示3D，查詢結果仍可查看。</div>
    </div>
    <header class="resident-brand"><div class="resident-heading-panel"><span class="eyebrow">瑞典月灣 · {{ vm.data?.activityYear ?? '—' }}年度</span><h1>住戶停車位查詢</h1><p v-if="vm.data">已公布至第{{ vm.data.throughRound }}輪抽選</p></div><p class="resident-preview-notice">查詢結果僅供即時預覽，實際車位請以社區公告為主。</p></header>
    <div v-if="!vm.household" class="resident-gate" role="dialog" aria-modal="true" aria-labelledby="resident-gate-title" @keydown="trapInput">
      <form class="panel resident-search" @submit.prevent="search"><h2 id="resident-gate-title">請輸入戶號</h2><label for="household">戶號</label><input id="household" ref="inputElement" v-model="vm.input" placeholder="例如 151-2" autocomplete="off" :disabled="vm.loading || !vm.data" /><p v-if="vm.error" class="error-alert" role="alert">{{ vm.error }}</p><button class="button primary" :disabled="vm.loading || !vm.data">{{ vm.loading ? '載入中…' : '查詢' }}</button></form>
    </div>
    <aside v-else class="resident-dashboard panel" :class="{ 'is-collapsed': !panelOpen }" aria-label="查詢儀表板">
      <div class="resident-dashboard-heading"><h2 id="resident-title">{{ vm.household.household }} 的車位</h2><button class="button resident-panel-toggle" :aria-expanded="panelOpen" aria-controls="resident-panel-sections" @click="panelOpen = !panelOpen">{{ panelOpen ? '收合面板' : '展開面板' }}</button></div>
      <div v-show="panelOpen" id="resident-panel-sections" class="resident-panel-sections">
        <details open class="resident-section"><summary>視角</summary><div class="resident-camera-actions"><div class="resident-angle" role="group" aria-label="視角"><button class="button" :aria-pressed="vm.view === 'oblique'" @click="vm.changeView('oblique')">斜視</button><button class="button" :aria-pressed="vm.view === 'top'" @click="vm.changeView('top')">俯視</button></div><button class="button" @click="vm.resetCamera">重設</button></div><p class="resident-camera-state">{{ vm.followCamera && vm.record ? '鏡頭跟隨車輛' : vm.record ? '自由視角' : '停車場全景' }}</p></details>
        <details open class="resident-section resident-playback"><summary>播放控制</summary><div class="resident-playback-actions"><button v-if="vm.record" class="button primary" @click="replay">重新播放</button><label class="resident-immediate"><input v-model="vm.immediate" type="checkbox" />馬上就位</label></div></details>
        <details open class="resident-section resident-results"><summary>查詢結果</summary><p v-if="!vm.effective.length">本次沒有抽中車位或候補紀錄。</p><ul><li v-for="(item, i) in vm.effective" :key="i"><div><strong>{{ queryCategories[item.category] }}</strong><span>第{{ item.round }}輪 · {{ item.status === 'waitlisted' ? `候補 ${item.rank}` : `車位 ${item.spaceId}` }}</span></div><button class="button" :aria-pressed="vm.record === item" @click="play(item)">{{ item.status === 'waitlisted' ? '查看候補位置' : '查看位置' }}</button></li></ul>
          <details v-if="vm.history.length" class="resident-history"><summary>先前結果</summary><p v-for="(item, i) in vm.history" :key="i">第{{ item.round }}輪 · {{ queryCategories[item.category] }} · {{ item.spaceId ? `車位 ${item.spaceId}` : '無車位' }} · {{ item.status === 'released' ? '已釋出' : '未取得車位' }}</p></details>
        </details>
        <details open class="resident-section"><summary>重新查詢</summary><button class="button" @click="requery">重新查詢</button></details>

        <p v-if="webglError" class="resident-status" role="status">此裝置無法顯示3D，以上方文字結果為準。</p>
        <footer v-if="vm.data">資料版本：{{ vm.data.builtAt }}</footer>
      </div>
    </aside>
  </div>
</template>
