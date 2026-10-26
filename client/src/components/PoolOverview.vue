<script setup lang="ts">
import type { Candidate, Pool, PoolResult } from '../domain/draw.mts'

defineProps<{
  pool: Pool; result?: PoolResult; excluded: string[]; round: 1 | 2
  accessible: { household: string; spaceId: string }[]; spaceCount: number; waitlistCount: number
}>()
function candidateLabel(candidate: Candidate) { return candidate.type === 'space' ? candidate.spaceId : `候補${candidate.rank}` }
const skipReasons: Record<string, string> = {
  no_participants: '無參與戶別', no_candidates: '無可抽項目', no_participants_and_no_candidates: '無參與戶別及可抽項目',
}
</script>

<template>
  <div class="pool-metrics">
    <div class="metric"><span>參與戶別</span><strong>{{ pool.households.length }}<small>戶</small></strong></div>
    <div class="metric"><span>實際車位</span><strong>{{ spaceCount }}<small>格</small></strong></div>
    <div class="metric"><span>{{ round === 2 ? '候補項目' : '不參與戶別' }}</span><strong>{{ round === 2 ? waitlistCount : excluded.length }}<small>{{ round === 2 ? '名' : '戶' }}</small></strong></div>
  </div>
  <section v-if="result" class="panel result-panel" aria-label="已保存配位結果">
    <div class="section-heading"><div><span class="eyebrow">SAVED RESULTS</span><h2>已保存配位結果</h2></div>
      <span class="badge" :class="result.status === 'skipped' ? 'neutral' : 'success'">{{ result.status === 'skipped' ? '本池跳過' : '配位完成' }}</span>
    </div>
    <p v-if="result.status === 'skipped'" class="inline-note">{{ skipReasons[result.reason ?? ''] ?? result.reason }}，已保留本輪種子與池內容。</p>
    <div class="result-counts"><span>實際配位 <strong>{{ result.assignments.length }} 戶</strong></span><span>候補 <strong>{{ result.waitlist.length }} 戶</strong></span><span>剩餘車位 <strong>{{ result.remainingSpaces.length }} 格</strong></span></div>
    <div v-if="result.assignments.length || result.waitlist.length" class="table-scroll">
      <table><thead><tr><th>戶號</th><th>抽選結果</th><th>類型</th></tr></thead>
        <tbody>
          <tr v-for="assignment in result.assignments" :key="assignment.household"><td class="household">{{ assignment.household }}</td><td class="space-value">{{ assignment.spaceId }}</td><td><span class="badge neutral">實際車位</span></td></tr>
          <tr v-for="waiting in result.waitlist" :key="waiting.household"><td class="household">{{ waiting.household }}</td><td class="space-value">候補 {{ waiting.rank }}</td><td><span class="badge pending">候補順位</span></td></tr>
        </tbody>
      </table>
    </div>
    <p v-else class="muted">本池沒有配位結果。</p>
    <div v-if="result.unassignedHouseholds.length" class="list-block"><h3>未配位戶別 · {{ result.unassignedHouseholds.length }} 戶</h3><div class="chips"><span v-for="house in result.unassignedHouseholds" :key="house" class="chip">{{ house }}</span></div></div>
    <details v-if="result.remainingSpaces.length"><summary>查看剩餘車位（{{ result.remainingSpaces.length }} 格）</summary><div class="chips"><span v-for="space in result.remainingSpaces" :key="space" class="chip">{{ space }}</span></div></details>
  </section>
  <section class="panel" aria-label="本池名單與車位">
    <div class="section-heading"><h2>{{ result ? '回看本輪輸入' : '確認名單與車位池' }}</h2><span v-if="pool.households.length > pool.candidates.length" class="badge pending">參與戶數超過可抽項目</span></div>
    <div class="list-block"><h3>參與戶別 · {{ pool.households.length }} 戶</h3><div v-if="pool.households.length" class="chips"><span v-for="house in pool.households" :key="house" class="chip household">{{ house }}</span></div><p v-else class="muted">本池無參與戶別。</p></div>
    <div v-if="accessible.length && round === 1" class="list-block"><h3>無障礙優先配置 · {{ accessible.length }} 戶</h3><div class="chips"><span v-for="assignment in accessible" :key="assignment.household" class="chip accent">{{ assignment.household }} → {{ assignment.spaceId }}</span></div><p class="muted">優先獲配戶不重複參加第一輪一般機車抽選。</p></div>
    <details><summary>{{ round === 2 ? '未登記本類兩輪意願' : pool.id.startsWith('motorcycle') ? '放棄一般機車抽選' : '不參與本類腳踏車' }}（{{ excluded.length }} 戶）</summary><div v-if="excluded.length" class="chips"><span v-for="house in excluded" :key="house" class="chip subdued">{{ house }}</span></div><p v-else class="muted">無。</p></details>
    <details :open="!result"><summary>可抽車位與候補項目（{{ pool.candidates.length }} 項）</summary><div class="chips space-chips"><span v-for="(candidate, index) in pool.candidates" :key="index" class="chip" :class="candidate.type === 'waitlist' ? 'waiting' : ''">{{ candidateLabel(candidate) }}</span></div></details>
  </section>
</template>
