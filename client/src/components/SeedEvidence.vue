<script setup lang="ts">
import type { SeedState } from '../models/activity.ts'
import { taipeiTime } from '../models/activity.ts'

defineProps<{ seed?: SeedState; pending: boolean; pressedAt: string | null; url: string; delay: number | null }>()
</script>

<template>
  <section v-if="seed || pending" class="panel seed-panel" aria-label="公開隨機種子">
    <div class="section-heading"><div><span class="eyebrow">DRAND QUICKNET</span><h2>公開隨機種子</h2></div>
      <span class="badge" :class="seed ? 'success' : 'pending'">{{ seed ? '簽章已驗證・已保存' : '正在取得與保存' }}</span>
    </div>
    <dl class="seed-facts">
      <div><dt>抽選指令時間（臺灣）</dt><dd>{{ taipeiTime(seed?.buttonPressedAt ?? pressedAt) }}</dd></div>
      <div><dt>Round number</dt><dd class="round-number">{{ seed?.round ?? '等待回應' }}</dd></div>
      <div><dt>Round 預定時間（臺灣）</dt><dd>{{ taipeiTime(seed?.roundScheduledTimeUtc ?? null) }}</dd></div>
    </dl>
    <template v-if="seed">
      <p class="field-label">Seed</p><code class="seed-value">{{ seed.seed }}</code>
      <div class="seed-footer"><span>回應與 round 預定時間相差 {{ delay?.toFixed(3) }} 秒（每輪 3 秒）</span>
        <a :href="url" target="_blank" rel="noopener noreferrer">查詢此 round ↗</a>
      </div>
    </template>
    <p v-else class="muted">本機程式正在取得公開種子並保存本輪配位，請稍候。</p>
  </section>
</template>
