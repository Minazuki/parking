<script setup lang="ts">
import type { PhaseId } from '../models/activity.ts'

defineProps<{
  items: { id: PhaseId; label: string; available: boolean; done: boolean; current: boolean; selected: boolean }[]
  disabled: boolean
}>()
defineEmits<{ select: [id: PhaseId] }>()
</script>

<template>
  <nav class="timeline" aria-label="活動階段進度">
    <div class="timeline-caption"><span class="eyebrow">活動進度</span><span>完成階段可回看</span></div>
    <ol>
      <li v-for="(item, index) in items" :key="item.id">
        <button :disabled="disabled || !item.available" :class="{ selected: item.selected, completed: item.done, current: item.current }"
          :aria-current="item.current ? 'step' : undefined" @click="$emit('select', item.id)">
          <span class="step-number" aria-hidden="true">{{ item.done ? '✓' : String(index + 1).padStart(2, '0') }}</span>
          <span class="step-copy"><strong>{{ item.label }}</strong><small>{{ item.done ? '已完成' : item.current ? '目前階段' : '尚未開始' }}</small></span>
        </button>
      </li>
    </ol>
  </nav>
</template>
