<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useActivity } from '../viewmodels/useActivity.ts'
import { intentLabel, taipeiTime } from '../models/activity.ts'
import type { Mode } from '../models/activity.ts'
import StageTimeline from '../components/StageTimeline.vue'
import PoolOverview from '../components/PoolOverview.vue'
import SeedEvidence from '../components/SeedEvidence.vue'

const DrawPresentation = defineAsyncComponent(() => import('../components/DrawPresentation.vue'))
const presenting = ref(false)
const vm = reactive(useActivity())
const nextPool = computed(() => vm.pools[vm.pools.findIndex(p => p.id === vm.selectedPool?.id) + 1]?.id)
const form = reactive({ year: '', mode: 'test' as Mode })
const now = ref(new Date())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => { void vm.refresh(); clock = setInterval(() => { now.value = new Date() }, 1000) })
onUnmounted(() => { if (clock) clearInterval(clock) })
</script>

<template>
  <div class="workspace-shell" :inert="presenting || undefined">
    <header class="app-header">
      <div class="brand-mark" aria-hidden="true">P<span>抽</span></div>
      <div class="brand-copy"><span class="eyebrow">瑞典月灣 · 年度停車位</span><h1>停車位抽選工作台</h1></div>
      <div class="header-meta">
        <a class="scene-entry-link" href="?view=parking">停車場3D ↗</a>
        <span class="badge" :class="vm.status?.activity?.mode === 'live' ? 'live' : 'neutral'">{{ vm.status?.activity?.mode === 'live' ? '正式活動' : vm.status?.activity?.mode === 'test' ? '演練模式' : '尚未設定活動' }}</span>
        <div class="clock"><span>臺灣時間</span><time>{{ taipeiTime(now) }}</time></div>
      </div>
    </header>

    <main>
      <section class="workspace-bar" aria-label="目前工作資料夾">
        <div><span class="field-label">工作資料夾</span><code>{{ vm.status?.workspace ?? '正在連線至本機程式…' }}</code></div>
        <div class="connection"><span class="connection-dot" :class="{ online: vm.connected }"></span><span>{{ vm.connected ? '已連線' : '未確認連線' }}</span><span v-if="vm.status" class="version">{{ vm.status.version }}</span></div>
      </section>

      <div v-if="vm.error" class="alert error-alert" role="alert">
        <strong>操作未能順利完成</strong><p>{{ vm.error }}</p>
        <ul v-if="vm.issues.length"><li v-for="(issue, index) in vm.issues" :key="index">{{ issue.fileName }} · {{ issue.row ? `第${issue.row}列` : '檔案' }} · {{ issue.column }}：{{ issue.message }}</li></ul>
        <p v-if="vm.outcomeUnknown">尚無法確認後端是否已保存，請先重新讀取進度；目前不會再次送出操作。</p>
        <p v-else-if="!vm.connected && vm.status">下方為上次讀取的資料，請重新讀取最新進度後再繼續。</p>
      </div>
      <p v-if="vm.notice" class="alert success-alert" role="status">✓ {{ vm.notice }}</p>

      <div class="page-heading">
        <div><div class="heading-kicker"><span class="eyebrow">{{ vm.status?.activity ? `${vm.status.activity.activityYear}年度` : '年度活動' }}</span><span class="quiet-divider">/</span><span>機車・腳踏車</span></div>
          <h2>{{ vm.phaseTitle }}</h2><p>{{ vm.phaseDescription }}</p>
        </div>
        <button class="button secondary refresh-button" :disabled="!!vm.busy" @click="vm.refresh">{{ vm.busy === '正在讀取活動進度' ? '讀取中…' : '重新讀取進度' }}<span aria-hidden="true">↻</span></button>
      </div>

      <div class="work-grid">
        <div class="main-column">
          <section v-if="vm.requiresActivity" class="panel setup-panel">
            <span class="eyebrow">NEW ACTIVITY</span><h2>建立本年度活動</h2><p class="muted">先指定活動年度與模式，再讀取工作資料夾中的行政登記。</p>
            <form class="setup-form" @submit.prevent="vm.initialize(Number(form.year), form.mode)">
              <label>民國活動年度<input v-model="form.year" type="number" min="1" step="1" required placeholder="例如 116" :disabled="!vm.canOperate" /></label>
              <label>活動模式<select v-model="form.mode" :disabled="!vm.canOperate"><option value="test">演練模式</option><option value="live">正式活動</option></select></label>
              <button class="button primary" :disabled="!vm.canOperate || !form.year" type="submit">建立活動</button>
            </form>
          </section>

          <template v-if="vm.selectedPhase === 'registration'">
            <section v-if="!vm.first" class="panel empty-state">
              <div class="empty-icon" aria-hidden="true">↥</div><span class="eyebrow">REGISTRATION INPUTS</span><h2>從行政登記開始</h2>
              <p>將三份CSV放入工作資料夾的 inputs，再確認匯入。</p>
              <div class="file-list"><span>A棟資料.csv</span><span>B棟資料.csv</span><span>無障礙車位資料.csv</span></div>
              <p class="muted">保留工作表的文字選單即可；本機程式會檢查並轉成標準資料。</p>
            </section>
            <template v-else>
              <div class="building-grid"><section v-for="building in vm.registrationMetrics" :key="building.building" class="panel building-summary">
                <span class="eyebrow">BUILDING {{ building.building }}</span><h2>{{ building.building }}棟 <small>{{ building.total }} 戶</small></h2>
                <dl><div><dt>一般機車抽選</dt><dd>{{ building.participants }} 戶</dd></div><div><dt>放棄一般抽選</dt><dd>{{ building.declined }} 戶</dd></div><div><dt>無障礙優先配置</dt><dd>{{ building.assigned }} 戶</dd></div></dl>
              </section></div>
              <section class="panel"><div class="section-heading"><h2>登記資料</h2><span class="badge success">已確認保存</span></div>
                <div class="table-scroll"><table><thead><tr><th>棟別</th><th>戶號</th><th>機車位</th><th>腳踏車（大）</th><th>腳踏車（小）</th></tr></thead>
                  <tbody><tr v-for="row in vm.registrationRows" :key="row.household"><td>{{ row.building }}棟</td><td class="household">{{ row.household }}</td><td>{{ intentLabel(row.motorcycle) }}</td><td>{{ intentLabel(row.bicycleLarge, true) }}</td><td>{{ intentLabel(row.bicycleSmall, true) }}</td></tr></tbody>
                </table></div>
              </section>
            </template>
          </template>

          <template v-else-if="vm.selectedPhase === 'first' || vm.selectedPhase === 'second'">
            <div class="pool-tabs" role="group" aria-label="車位類型"><button v-for="pool in vm.pools" :key="pool.id" :class="{ active: pool.id === vm.selectedPool?.id }" :aria-pressed="pool.id === vm.selectedPool?.id" @click="vm.selectPool(pool.id)">{{ vm.poolNames[pool.id] }}</button><button v-if="vm.first && vm.selectedPool" class="button primary" @click="presenting = true">開啟投影演出</button></div>
            <SeedEvidence :seed="vm.seed" :pending="vm.drawing" :pressed-at="vm.buttonPressedAt" :url="vm.seedUrl" :delay="vm.seedDelaySeconds" />
            <a v-if="vm.poolResult" class="button" :href="`?view=parking&source=activity&round=${vm.round}&pool=${vm.selectedPool?.id}`">播放此梯次3D進場 ↗</a>
            <PoolOverview v-if="vm.selectedPool" :pool="vm.selectedPool" :result="vm.poolResult" :round="vm.round" :excluded="vm.excludedHouseholds" :accessible="vm.poolAccessible" :space-count="vm.realSpaces.length" :waitlist-count="vm.waitlistSlots.length" />
          </template>

          <template v-else-if="vm.selectedPhase === 'payments'">
            <section v-if="!vm.payments" class="panel empty-state"><div class="empty-icon" aria-hidden="true">✓</div><span class="eyebrow">PAYMENT INPUTS</span><h2>匯入已核對的入帳資料</h2><p>將第一輪繳費狀態.csv放入 inputs，再確認匯入。</p><p class="muted">繳費表須保留全部戶別，三項核取值明確使用 TRUE／FALSE。</p></section>
            <template v-else>
              <div class="pool-metrics"><div v-for="metric in vm.paymentMetrics" :key="metric.label" class="metric"><span>{{ metric.label }}</span><strong>{{ metric.count }}<small>戶</small></strong></div></div>
              <section class="panel"><div class="section-heading"><h2>已保存的入帳資料</h2><span class="badge success">匯入完成</span></div>
                <p class="muted">{{ vm.payments.source.fileName }} · {{ taipeiTime(vm.payments.source.importedAt) }}</p>
                <div class="table-scroll"><table><thead><tr><th>戶號</th><th>機車位</th><th>腳踏車（大）</th><th>腳踏車（小）</th></tr></thead><tbody><tr v-for="payment in vm.payments.payments" :key="payment.household"><td class="household">{{ payment.household }}</td><td>{{ payment.motorcycle ? '✓ 已入帳' : '未入帳' }}</td><td>{{ payment.bicycleLarge ? '✓ 已入帳' : '未入帳' }}</td><td>{{ payment.bicycleSmall ? '✓ 已入帳' : '未入帳' }}</td></tr></tbody></table></div>
              </section>
            </template>
          </template>

          <template v-else-if="vm.selectedPhase === 'review'">
            <div class="pool-metrics"><div v-for="metric in vm.paymentMetrics" :key="metric.label" class="metric"><span>{{ metric.label }}</span><strong>{{ metric.count }}<small>戶</small></strong></div></div>
            <section v-if="!vm.review" class="panel review-intro"><span class="eyebrow">PAYMENT REVIEW</span><h2>入帳資料已保存，準備清票</h2><p>清票會保留已入帳配置，並將第一輪未配位及未繳釋出的車位納入第二輪。</p><p class="inline-note">第二輪名單沿用登記時的兩輪意願，即使第一輪未繳費仍可參與；車位不足時加入候補項目。</p></section>
            <section v-for="item in vm.review?.review ?? []" :key="item.category" class="panel">
              <div class="section-heading"><h2>{{ vm.poolNames[item.category] }}</h2><span class="badge success">清票完成</span></div>
              <div class="result-counts"><span>已繳保留 <strong>{{ item.retained.length }} 格</strong></span><span>未繳釋出 <strong>{{ item.released.length }} 格</strong></span><span>第一輪剩餘 <strong>{{ item.vacantSpaces.length }} 格</strong></span></div>
              <details v-if="item.released.length"><summary>查看未繳釋出戶別與原車位</summary><div class="chips"><span v-for="row in item.released" :key="row.spaceId" class="chip">{{ row.household }} · {{ row.spaceId }}</span></div></details>
            </section>
          </template>
        </div>

        <aside class="operation-column">
          <section class="panel action-panel" aria-label="階段操作">
            <span class="eyebrow">{{ vm.currentStage === 6 ? 'DRAW COMPLETED' : 'NEXT ACTION' }}</span>
            <h2>{{ vm.currentStage === 6 ? '兩輪配位已完成' : vm.selectedPhase !== vm.currentPhase ? '目前正在查閱' : vm.requiresActivity ? '先建立活動資訊' : vm.nextAction?.label ?? '讀取活動進度' }}</h2>
            <p v-if="vm.currentStage === 6">可由底部進度軸回看名單、清票與兩輪結果。第二輪未繳遞補由行政依候補順位辦理。</p>
            <p v-else-if="vm.selectedPhase !== vm.currentPhase">此階段資料供查閱；繼續操作請回到目前階段。</p>
            <p v-else-if="vm.requiresActivity">建立年度與模式後，即可匯入第一輪登記。</p>
            <p v-else>{{ vm.nextAction?.description }}</p>
            <div v-if="vm.busy" class="operation-pending" role="status"><span class="spinner" aria-hidden="true"></span><strong>{{ vm.busy }}</strong><p>請等待本機程式完成，勿重複送出操作。</p></div>
            <button v-else-if="vm.selectedPhase !== vm.currentPhase" class="button secondary full-width" :disabled="!vm.canOperate" @click="vm.selectPhase(vm.currentPhase)">前往{{ vm.progress.find(p => p.id === vm.currentPhase)?.label }} →</button>
            <button v-else-if="vm.nextAction && !vm.requiresActivity" class="button primary full-width" :disabled="!vm.canRunNext" @click="vm.runNext">{{ vm.nextAction.label }}<span aria-hidden="true">→</span></button>
            <p v-if="vm.drawing || vm.outcomeUnknown" class="action-footnote">已開始的作業由本機程式繼續處理；重新開啟頁面後，請讀取最新進度。</p>
          </section>
          <section class="panel status-panel"><span class="eyebrow">WORKSPACE STATUS</span><h2>本次活動</h2><dl><div><dt>活動年度</dt><dd>{{ vm.status?.activity ? `${vm.status.activity.activityYear}年度` : '尚未設定' }}</dd></div><div><dt>已保存進度</dt><dd>{{ vm.currentStage < 0 ? '尚未匯入登記' : vm.currentStage === 6 ? '第二輪配位完成' : vm.currentStage === 5 ? '第二輪種子已保存' : vm.currentStage === 4 ? '第二輪名單已備妥' : vm.currentStage === 3 ? '繳費資料已匯入' : vm.currentStage === 2 ? '第一輪配位完成' : vm.currentStage === 1 ? '第一輪種子已保存' : '第一輪名單已備妥' }}</dd></div><div><dt>最近讀取（臺灣）</dt><dd>{{ taipeiTime(vm.lastRefreshedAt) }}</dd></div></dl></section>
        </aside>
      </div>
    </main>
    <StageTimeline :items="vm.progress" :disabled="!!vm.busy" @select="vm.selectPhase" />
  </div>
  <DrawPresentation v-if="presenting && vm.first && vm.selectedPool" :year="vm.status?.activity?.activityYear ?? 0" :round="vm.round" :first="vm.first" :pool="vm.selectedPool" :allocation="vm.result" :result="vm.poolResult" :excluded="vm.excludedHouseholds" :accessible="vm.poolAccessible" :seed="vm.seed" :seed-url="vm.seedUrl" :seed-delay="vm.seedDelaySeconds" :pressed-at="vm.buttonPressedAt" :busy="!!vm.busy" :error="vm.error" :can-draw="vm.canRunNext" :next-pool="nextPool" @draw="vm.runNext" @close="presenting = false" @next-pool="vm.selectPool(nextPool!)" />
</template>
