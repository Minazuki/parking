<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { OrthographicCamera } from 'three'
import { markRaw } from 'vue'
import type { ParkingLayout, ParkingSpace } from '../models/parking/layout.ts'
import ParkingGraphics from './ParkingGraphics.vue'
import ParkingCamera from './ParkingCamera.vue'

const props = defineProps<{
  layout: ParkingLayout; spaces: (ParkingSpace & { selected: boolean; muted: boolean; color: string })[]
  view: 'oblique' | 'top'; resetSignal: number; focusSignal: number; selected?: ParkingSpace
}>()
const emit = defineEmits<{ select: [key: string]; error: [] ; ready: [] }>()
const camera = markRaw(new OrthographicCamera(-60, 60, 45, -45, 0.1, 500))
camera.position.set(45, 105, 85); camera.lookAt(0, 0, 0)
</script>

<template>
  <TresCanvas :camera="camera" clear-color="#eff3ee" :alpha="false" :dpr="[1, 1.6]" render-mode="on-demand" @error="emit('error')" @ready="emit('ready')">
    <ParkingCamera :layout="props.layout" :view="view" :reset-signal="resetSignal" :focus-signal="focusSignal" :selected="selected" />
    <ParkingGraphics :layout="props.layout" :spaces="spaces" @select="emit('select', $event)" />
  </TresCanvas>
</template>
