<script setup lang="ts">
import { computed, reactive, ref, toRef } from 'vue'
import ParkingCanvas from '../scenes/ParkingCanvas.vue'
import { useParkingScene } from '../viewmodels/useParkingScene.ts'
import { cardPosition } from '../models/parking/arrival.ts'
import { useArrivalPreview } from '../viewmodels/useArrivalPreview.ts'
import '../parking.css'

const vm = reactive(useParkingScene())
const arrival = reactive(useArrivalPreview(toRef(vm, 'floor')))
const arrivalSpaces = computed(() => {
  const arrived = new Set(arrival.enabled ? arrival.cards.filter(c => c.spaceId && cardPosition(c, arrival.seconds).arrived).map(c => c.spaceId) : [])
  return vm.visibleSpaces.map(s => arrived.has(s.id) ? { ...s, selected: true, color: '#ffcf5b' } : s)
})
const activeArrivalDetail = computed(() => {
  const card = arrival.activeRecord
  if (!card) return ''
  return card.rank ? `候補 ${card.rank}` : cardPosition(card, arrival.seconds).arrived ? `車位 ${card.spaceId}` : ''
})
const ready = ref(false)
const stageElement = ref<HTMLElement | null>(null)
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await stageElement.value?.requestFullscreen()
  } catch { vm.error = '無法啟用全螢幕，仍可使用目前視窗查看模型。' }
}
const canvasKey = computed(() => vm.floor)
const selectedDimensions = computed(() => vm.selected ? `${vm.selected.depth.toFixed(2)} × ${vm.selected.width.toFixed(2)} m` : '')
function changeFloor(floor: 'motorcycle' | 'bicycle') { ready.value = false; vm.webglError = false; vm.changeFloor(floor) }
</script>

<template>
  <div class="parking-page">
    <header class="parking-header">
      <a class="parking-back" href="/">← 返回抽選工作台</a>
      <div class="parking-title"><span class="eyebrow">瑞典月灣 · PARKING ATLAS</span><h1>停車場空間預覽</h1></div>
      <span class="badge neutral">平面圖描繪 · 配置示意</span>
    </header>
    <main class="parking-main">
      <div class="parking-topline"><div><span class="eyebrow">{{ vm.layout.floor }} / FLOOR PLAN</span><h2>{{ vm.layout.name }}</h2><p>依提供的平面圖建立相對位置，點選車位或輸入編號查看。</p></div>
        <div class="parking-floor-switch" role="group" aria-label="停車場區域"><button :class="{ active: vm.floor === 'motorcycle' }" :aria-pressed="vm.floor === 'motorcycle'" @click="changeFloor('motorcycle')">B1 機車</button><button :class="{ active: vm.floor === 'bicycle' }" :aria-pressed="vm.floor === 'bicycle'" @click="changeFloor('bicycle')">1F 腳踏車</button></div>
      </div>
      <div class="parking-grid">
        <section ref="stageElement" class="parking-stage" aria-label="停車場3D模型">
          <div class="parking-canvas-toolbar"><span class="parking-count">{{ vm.spaces.length }}<small>格車位</small></span><div class="parking-camera-switch" role="group" aria-label="模型視角"><button :class="{ active: vm.view === 'oblique' }" @click="vm.view = 'oblique'">斜俯視</button><button :class="{ active: vm.view === 'top' }" @click="vm.view = 'top'">俯視</button><button @click="vm.resetCamera">重設 ↺</button><button @click="toggleFullscreen">全螢幕 ⤢</button></div></div>
          <div class="parking-canvas" :data-active-arrival="arrival.activeRecord?.household ?? ''" :data-bubble-count="arrival.enabled && arrival.activeRecord ? 1 : 0" :data-arrival-enabled="arrival.enabled" :data-arrival-count="arrival.enabled ? arrival.cards.length : 0" :data-arrival-seconds="arrival.seconds.toFixed(1)" :data-ready="ready" :data-floor="vm.floor" :data-space-count="vm.spaces.length" :data-selected="vm.selected?.id ?? ''">
            <ParkingCanvas v-if="!vm.webglError" :key="canvasKey" :layout="vm.layout" :spaces="arrivalSpaces" :view="vm.view" :reset-signal="vm.resetSignal" :focus-signal="vm.focusSignal" :selected="vm.selected" :cards="arrival.cards" :seconds="arrival.seconds" :arrival-enabled="arrival.enabled" :arrival-revision="arrival.revision" :active-arrival-id="arrival.activeId" @select-arrival="arrival.select" @select="vm.select" @ready="ready = true" @error="vm.webglError = true" />
            <div v-if="vm.webglError" class="parking-canvas-message" role="alert"><strong>此視窗無法啟用3D繪圖</strong><p>請確認Chrome硬體加速設定，或先使用下方車位清單核對位置。</p></div>
            <div v-else-if="!ready" class="parking-canvas-message"><span class="spinner"></span><span>正在建立場景…</span></div>
            <div class="parking-orientation" aria-hidden="true"><span>◇</span>方位依平面圖</div>
          </div>
          <div class="parking-stage-footer"><span>{{ vm.view === 'top' ? '拖曳平移' : '拖曳旋轉 · 右鍵平移' }} · 滾輪縮放</span><span>車位編號依原圖位置排列</span></div>
        </section>
        <aside class="parking-sidebar">
          <section class="panel arrival-panel"><span class="eyebrow">ARRIVAL · DEMO</span><h2>住戶進場演出</h2>
            <p>虛構配位試播。點擊機車／腳踏車可顯示戶號，同時只開啟一個對話框。</p>
            <div class="arrival-actions"><button class="button primary" @click="arrival.all(); vm.resetCamera()">整批進場</button><button v-if="arrival.enabled" class="button" @click="arrival.replay(); vm.resetCamera()">重播</button><button v-if="arrival.enabled" class="button" @click="arrival.finish">顯示結果</button><button v-if="arrival.enabled" class="button" @click="arrival.close">收起物件</button></div>
            <form @submit.prevent="arrival.search(); vm.resetCamera()"><label for="arrival-household">查詢戶號（示範）</label><div class="parking-search"><input id="arrival-household" v-model="arrival.query" placeholder="例如 999-1、999-7" /><button class="button primary" type="submit">播放</button></div></form>
            <p v-if="arrival.error" role="alert" class="parking-search-error">{{ arrival.error }}</p>
            <p v-if="arrival.enabled" aria-live="polite">{{ arrival.playing ? '住戶進場中' : '配位展示' }} · {{ arrival.cards.length }} 個物件</p>
            <p v-if="arrival.enabled && arrival.activeRecord" class="arrival-active-info" role="status">{{ arrival.activeRecord.household }}<span v-if="activeArrivalDetail"> · {{ activeArrivalDetail }}</span><button type="button" @click="arrival.activeId = null">關閉對話框</button></p>
            <details><summary>示範戶號與配位</summary><ul><li v-for="record in arrival.records" :key="record.id"><button v-if="arrival.enabled && arrival.cards.some(c => c.id === record.id)" class="arrival-select" @click="arrival.select(record.id)">{{ record.household }}</button><span v-else>{{ record.household }}</span> → {{ record.rank ? `候補 ${record.rank}` : record.spaceId }}</li></ul></details>
          </section>
          <section class="panel parking-locate"><span class="eyebrow">FIND A SPACE</span><h2>定位車位</h2>
            <form @submit.prevent="vm.locate"><label for="parking-space-query">車位編號</label><div class="parking-search"><input id="parking-space-query" v-model="vm.query" :placeholder="vm.floor === 'motorcycle' ? '例如 14、86' : '例如 大1、小39'" /><button class="button primary" type="submit">定位</button></div></form>
            <p v-if="vm.error" class="parking-search-error" role="alert">{{ vm.error }}</p>
            <div v-if="vm.selected" class="parking-selected" aria-live="polite"><span class="eyebrow">SELECTED SPACE</span><strong>{{ vm.selected.id }}<small>號</small></strong><p>{{ vm.categoryNames[vm.selected.category] }}</p><p>{{ vm.selected.group }}</p><p>長 × 寬：{{ selectedDimensions }}</p><span v-if="vm.selected.accessible" class="badge" :class="vm.selected.split ? 'pending' : 'neutral'">{{ vm.selected.split ? '無障礙拆分示意' : '無障礙原格' }}</span></div>
            <p v-else class="muted">點選模型中的車位，也可顯示其編號與所在排。</p>
          </section>
          <section class="panel parking-legend"><span class="eyebrow">DISPLAY LAYERS</span><h2>顯示範圍</h2><button class="parking-filter" :class="{ active: vm.filter === 'all' }" @click="vm.filter = 'all'"><span>全部車位</span><strong>{{ vm.spaces.length }}</strong></button>
            <button v-for="item in vm.filters" :key="item.id" class="parking-filter" :class="{ active: vm.filter === item.id }" @click="vm.filter = item.id"><span><i :style="{ background: item.color }"></i>{{ item.label }}</span><strong>{{ item.count }}</strong></button>
            <label v-if="vm.floor === 'motorcycle'" class="parking-split-toggle"><input type="checkbox" :checked="vm.split" @change="vm.setSplit(($event.target as HTMLInputElement).checked)" /><span>預覽三處無障礙位拆分<small>14、2、3各拆成兩格</small></span></label>
          </section>
          <section class="parking-source-note"><span class="eyebrow">LAYOUT NOTES</span><p>1 unit＝1公尺；車格採指定尺寸，排列與隔間參照原圖。尚未套用活動登記或抽選結果。</p><p v-if="vm.floor === 'motorcycle'">棟別顏色表示原始編號範圍；拆分後的左右編號方向待現場確認。</p><p>來源：{{ vm.layout.source.fileName }}</p></section>
        </aside>
      </div>
      <details class="parking-space-index"><summary>車位清單 · {{ vm.spaces.length }} 格</summary><div class="parking-index-grid"><button v-for="space in vm.spaces" :key="space.key" :class="{ selected: space.key === vm.selectedKey }" @click="vm.select(space.key)">{{ space.id }}</button></div></details>
    </main>
  </div>
</template>
