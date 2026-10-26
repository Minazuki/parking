<script setup lang="ts">
import { useTres } from '@tresjs/core'
import { MeshStandardMaterial } from 'three'
import type { BoxGeometry } from 'three'
import { computed, markRaw, onUnmounted, watchEffect } from 'vue'
import type { ParkingSpace } from '../models/parking/layout.ts'
import type { LabelAtlas } from './labels.ts'
import ParkingLabel from './ParkingLabel.vue'

const props = defineProps<{ space: ParkingSpace & { selected: boolean; muted: boolean; color: string }; cube: BoxGeometry; atlas: LabelAtlas }>()
const emit = defineEmits<{ select: [key: string] }>()
const { invalidate } = useTres()
const border = markRaw(new MeshStandardMaterial({ color: '#ffffff', roughness: 1 }))
const fill = markRaw(new MeshStandardMaterial({ roughness: 0.95 }))
const labelWidth = computed(() => Math.min((Math.abs(Math.sin(props.space.rotation)) > 0.7 ? props.space.depth : props.space.width) * 0.95, 3.5))
watchEffect(() => {
  fill.color.set(props.space.color)
  border.color.set(props.space.selected ? '#df9e21' : props.space.muted ? '#d9dfda' : '#ffffff')
  fill.emissive.set(props.space.selected ? '#6c4605' : '#000000')
  fill.emissiveIntensity = props.space.selected ? 0.12 : 0
  invalidate()
})
onUnmounted(() => { border.dispose(); fill.dispose() })
</script>

<template>
  <TresGroup :position="[space.x, 0, space.z]" :dispose="null" @click.stop="emit('select', space.key)">
    <TresGroup :rotation="[0, space.rotation, 0]">
      <TresMesh :geometry="cube" :material="border" :position="[0, 0.055, 0]" :scale="[space.width, 0.11, space.depth]" />
      <TresMesh :geometry="cube" :material="fill" :position="[0, 0.12, 0]" :scale="[Math.max(0.1, space.width - 0.08), 0.035, Math.max(0.1, space.depth - 0.08)]" />
    </TresGroup>
    <TresGroup :rotation="[0, space.floor === 'motorcycle' && space.baseId === '58' ? space.rotation - Math.PI / 2 : 0, 0]">
      <ParkingLabel :atlas="atlas" :label-key="space.key" :position="[0, 0.15, 0]" :width="labelWidth" :height="Math.min(labelWidth * 0.8, 2.5)" />
    </TresGroup>
  </TresGroup>
</template>
