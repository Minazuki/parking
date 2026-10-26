<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue'
import { useLiveShow } from '../viewmodels/useLiveShow.ts'
import { poolNames } from '../models/activity.ts'
import { resultCsv } from '../models/result-csv.ts'
import { cardPosition } from '../models/parking/arrival.ts'
import SeedEvidence from '../components/SeedEvidence.vue'
import '../live-show.css'
const ParkingCanvas = defineAsyncComponent(() => import('../scenes/ParkingCanvas.vue'))
const vm = reactive(useLiveShow())
const exportError = ref(''), downloading = ref(false), webglError = ref(false)
const title = computed(() => vm.step === 'review' ? '清票結果' : vm.step === 'finished' ? `第${vm.round === 1 ? '一' : '二'}次抽選完成` : vm.activity.currentStage >= 6 ? '兩輪抽選已完成' : vm.activity.currentStage >= 4 ? '第二次現場抽選' : vm.activity.currentStage >= 2 ? '第一輪已完成 · 待清票' : '第一次現場抽選')
const visibleSpaces = computed(() => {
  const destinations = new Set(vm.pool?.candidates.flatMap(c => c.type === 'space' ? [c.spaceId] : []) ?? [])
  const arrived = new Set(vm.cards.filter(c => c.spaceId && cardPosition(c, vm.elapsed).arrived).map(c => c.spaceId))
  return vm.spaces.map(s => ({ ...s, selected: arrived.has(s.id), muted: !destinations.has(s.id), color: arrived.has(s.id) ? '#fbbf24' : destinations.has(s.id) ? '#a3a3a3' : '#404040' }))
})
const pageIndex = computed(() => vm.step === 'results' ? Math.min(vm.page, vm.resultPages - 1) : vm.step === 'households' ? Math.min(vm.page, vm.householdPages - 1) : Math.min(vm.page, vm.poolPages - 1))
const resultPage = computed(() => vm.resultRows.slice(pageIndex.value * vm.resultPageSize, (pageIndex.value + 1) * vm.resultPageSize))
const householdSlide = computed(() => vm.householdSlides[pageIndex.value])
const candidates = computed(() => vm.pool?.candidates.slice(pageIndex.value * 40, (pageIndex.value + 1) * 40) ?? [])
const secondStats = computed(() => vm.activity.review?.pools.map(p => ({ id: p.id, households: p.households.length, spaces: p.candidates.filter(c => c.type === 'space').length, waiting: p.candidates.filter(c => c.type === 'waitlist').length })) ?? [])
async function download(round: 1 | 2) {
  if (downloading.value) return
  downloading.value = true; exportError.value = ''
  try {
    const a = vm.activity, result = a.checkpoints[round === 1 ? 2 : 6], seed = a.checkpoints[round === 1 ? 1 : 5]
    if (!a.status?.activity || !a.first || !result || !seed) throw new Error('本輪結果尚未完整保存，無法下載。')
    const csv = await resultCsv({ activity: a.status.activity, first: a.first, result, seed, round })
    const url = URL.createObjectURL(new Blob([csv.text], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = csv.fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) { exportError.value = cause instanceof Error ? cause.message : '下載失敗。' }
  finally { downloading.value = false }
}
async function fullscreen() { try { await document.documentElement.requestFullscreen() } catch { exportError.value = '無法啟用全螢幕，可繼續在目前視窗操作。' } }
onMounted(() => { void vm.activity.refresh() })
</script>
<template>
  <div class="live-show" :data-step="vm.step" :data-pool="vm.pool?.id ?? ''" :data-round="vm.round">
    <header class="live-header"><div><span class="eyebrow">瑞典月灣 · {{ vm.activity.status?.activity?.activityYear ?? vm.year }}年度</span><h1>{{ vm.running && vm.pool ? poolNames[vm.pool.id] : title }}</h1></div><div><span class="badge">{{ vm.activity.status?.activity?.mode === 'live' ? '正式活動' : '演練模式' }}</span><button class="button secondary" @click="fullscreen">全螢幕</button><a v-if="!vm.running" href="?view=workbench">管理工作台</a></div></header>
    <main>
      <section v-if="vm.error || vm.activity.error || exportError" class="panel live-error" role="alert"><h2>操作已停止</h2><p>{{ vm.error || vm.activity.error || exportError }}</p><ul><li v-for="(issue, i) in vm.activity.issues" :key="i">{{ issue.fileName }} 第{{ issue.row }}列 · {{ issue.column }}：{{ issue.message }}</li></ul><button class="button" :disabled="!!vm.activity.busy" @click="vm.activity.refresh">重新讀取狀態</button></section>
      <section v-if="vm.step === 'idle' || vm.step === 'error'" class="panel live-standby">
        <span class="eyebrow">{{ vm.activity.status?.workspace ?? '正在連線至本機程式…' }}</span><h2>{{ title }}</h2>
        <template v-if="vm.activity.currentStage < 2"><p>將A棟、B棟與無障礙車位CSV放入工作目錄的 inputs。按開始後自動匯入、依序展示四個池，完成後停在結果下載。</p><div v-if="vm.activity.requiresActivity" class="live-settings"><label>民國活動年度<input type="number" min="1" v-model.number="vm.year" /></label><label>活動模式<select v-model="vm.mode"><option value="test">演練模式</option><option value="live">正式活動</option></select></label></div><button class="button primary live-start" :disabled="!vm.activity.canOperate" @click="vm.start(1)">開始第一次抽選</button></template>
        <template v-else-if="vm.activity.currentStage < 4"><p>第一次抽選已保存。待行政核對後，把「第一輪繳費狀態.csv」放入 inputs，再獨立執行清票；此作業不表演、不取得種子。</p><button class="button primary live-start" :disabled="!vm.activity.canOperate" @click="vm.reviewPayments">匯入繳費並清票</button></template>
        <template v-else-if="vm.activity.currentStage < 6"><p>清票結果已保存。按開始後，依序演出機車、大腳踏車與小腳踏車，完成後停在結果下載。</p><button class="button primary live-start" :disabled="!vm.activity.canOperate" @click="vm.start(2)">開始第二次抽選</button><button class="button" @click="vm.reviewPayments">查看清票結果</button></template>
        <template v-else><p>兩輪配位均已保存，可下載結果或唯讀重播。</p><button class="button" @click="vm.start(1)">重播第一次演出</button><button class="button" @click="vm.start(2)">重播第二次演出</button></template>
        <div class="live-downloads"><button v-if="vm.activity.checkpoints[2] && vm.activity.currentStage < 6" class="button" @click="vm.start(1)">重播第一次演出</button><button v-if="vm.activity.checkpoints[2]" class="button" :disabled="downloading" @click="download(1)">下載第一輪結果 CSV</button><button v-if="vm.activity.checkpoints[6]" class="button" :disabled="downloading" @click="download(2)">下載第二輪結果 CSV</button></div>
        <label class="live-speed">演出速度<select v-model.number="vm.speed"><option :value="1">現場 1×</option><option :value="2">演練 2×</option><option :value="4">演練 4×</option></select></label>
      </section>
      <section v-else-if="vm.step === 'preparing'" class="panel live-standby" role="status"><span class="spinner"></span><h2>{{ vm.activity.busy ?? '正在準備資料' }}</h2><p>依既有JSON斷點繼續，請等候。</p></section>
      <template v-else-if="vm.running">
        <div class="live-progress"><span v-for="(pool, i) in vm.pools" :key="pool.id" :class="{ active: i === vm.poolIndex, done: i < vm.poolIndex }">{{ poolNames[pool.id] }}</span></div>
          <section v-if="vm.step === 'households'" class="panel live-sheet"><h2>{{ householdSlide?.title }} · {{ householdSlide?.total }}戶</h2><p>本梯次參與 {{ vm.participants.length }}戶 · 未參與 {{ vm.excluded.length }}戶</p><div class="chips"><span v-for="house in householdSlide?.rows ?? []" :key="house" class="chip household">{{ house }}</span><p v-if="!householdSlide?.rows.length">無。</p></div><p class="live-page">第{{ pageIndex + 1 }}／{{ vm.householdPages }}頁 · 自動翻頁</p></section>
        <section v-else-if="vm.step === 'pool'" class="panel live-sheet"><h2>可抽車位池 · {{ vm.candidateSpaces.length }}格</h2><p>參與 {{ vm.participants.length }}戶 · 候補項目 {{ (vm.pool?.candidates.length ?? 0) - vm.candidateSpaces.length }}項</p><div class="chips"><span v-for="(c, i) in candidates" :key="i" class="chip">{{ c.type === 'space' ? c.spaceId : `候補 ${c.rank}` }}</span></div><p class="live-page">第{{ pageIndex + 1 }}／{{ vm.poolPages }}頁 · 自動翻頁</p></section>
        <section v-else-if="vm.step === 'seed'" class="live-seed"><h2>{{ vm.seed ? '公開種子與整輪配位已保存' : '正在取得公開種子並保存整輪配位' }}</h2><SeedEvidence :seed="vm.seed" :pending="!!vm.activity.busy" :pressed-at="vm.activity.buttonPressedAt" :url="vm.activity.seedUrl" :delay="vm.activity.seedDelaySeconds" /><p>本輪只取得一次種子，後續梯次沿用已保存配位。</p></section>
        <section v-else-if="vm.step === 'arrival'" class="live-arrival"><h2>住戶進場</h2><div class="live-scene"><ParkingCanvas v-if="!webglError" :key="vm.pool?.id" :layout="vm.layout" :spaces="visibleSpaces" view="oblique" :reset-signal="0" :focus-signal="0" :cards="vm.cards" :seconds="vm.elapsed" :arrival-enabled="true" :arrival-revision="vm.poolIndex" :active-arrival-id="vm.activeId" @select-arrival="vm.select" @dismiss-arrival="vm.activeId = null" @error="webglError = true" /><p v-else>3D無法啟用，仍會依時序展示已保存的結果清單。</p></div></section>
        <section v-else-if="vm.step === 'results'" class="panel live-sheet"><h2>抽選結果 · {{ poolNames[vm.pool?.id ?? ''] }}</h2><p v-if="vm.poolResult?.status === 'skipped'">本池略過：{{ vm.poolResult.reason }}</p><table v-if="resultPage.length"><thead><tr><th>戶號</th><th>抽選結果</th><th>類型</th></tr></thead><tbody><tr v-for="row in resultPage" :key="row.household"><td>{{ row.household }}</td><td>{{ row.value }}</td><td>{{ row.type }}</td></tr></tbody></table><p>配位 {{ vm.poolResult?.assignments.length ?? 0 }}戶 · 候補 {{ vm.poolResult?.waitlist.length ?? 0 }}戶 · 剩餘 {{ vm.poolResult?.remainingSpaces.length ?? 0 }}格</p><p class="live-page">第{{ pageIndex + 1 }}／{{ vm.resultPages }}頁 · 自動翻頁，供錄影存證</p></section>
      </template>
      <section v-else-if="vm.step === 'finished'" class="panel live-standby"><h2>{{ title }}</h2><p>所有梯次演出結束，後端JSON已保存。請按下下載結果，再自行上傳至社區Google Drive。</p><button class="button primary live-start" :disabled="downloading" @click="download(vm.round)">下載第{{ vm.round === 1 ? '一' : '二' }}輪結果 CSV</button><p>本次作業已停止，不會自動清票或進入下一輪。</p><button class="button" @click="vm.step = 'idle'">返回待機</button></section>
      <section v-else-if="vm.step === 'review'" class="panel live-sheet"><h2>清票已完成 · 第二輪準備資料已保存</h2><div v-for="item in vm.activity.review?.review ?? []" :key="item.category"><h3>{{ poolNames[item.category] }}</h3><p>已繳保留 {{ item.retained.length }}格 · 未繳釋出 {{ item.released.length }}格 · 原剩餘 {{ item.vacantSpaces.length }}格</p><details><summary>查看未繳釋出明細</summary><div class="chips"><span v-for="r in item.released" :key="r.spaceId" class="chip">{{ r.household }} → {{ r.spaceId }}</span></div></details></div><h3>第二輪登記與車位池</h3><table><thead><tr><th>類型</th><th>參與戶數</th><th>實際車位</th><th>候補項目</th></tr></thead><tbody><tr v-for="s in secondStats" :key="s.id"><td>{{ poolNames[s.id] }}</td><td>{{ s.households }}</td><td>{{ s.spaces }}</td><td>{{ s.waiting }}</td></tr></tbody></table><p>{{ secondStats.some(s => s.households > 0 && s.spaces > 0) ? '有可抽車位且有登記住戶，可安排第二次抽選。' : '目前沒有同時具備住戶與實際車位的類別，請依上表確認是否需要第二次抽選。' }}清票作業不會請求drand種子。</p><button class="button" @click="vm.step = 'idle'">清票收工，返回待機</button></section>
    </main>
    <footer class="live-footer"><span v-if="vm.running">自動演出 · {{ vm.step === 'preparing' ? '資料處理中' : `本段 ${Math.floor(vm.elapsed)}秒` }}</span><span v-else>JSON存檔為斷點 · CSV由下載按鈕匯出</span><span v-if="vm.seed && vm.running">drand round {{ vm.seed.round }}</span></footer>
  </div>
</template>
