<script setup lang="ts">
import { TresCanvas } from '@tresjs/core'
import { OrthographicCamera } from 'three'
import { markRaw } from 'vue'
import type { ParkingLayout, ParkingSpace } from '../models/parking/layout.ts'
import ParkingGraphics from './ParkingGraphics.vue'
import ParkingCamera from './ParkingCamera.vue'
import ArrivalCards from './ArrivalCards.vue'
import type { ArrivalCard } from '../models/parking/arrival.ts'

const props = defineProps<{
  layout: ParkingLayout; spaces: (ParkingSpace & { selected: boolean; muted: boolean; color: string })[]
  activeArrivalId?: string | null; cards?: ArrivalCard[]; seconds?: number; arrivalRevision?: number; arrivalEnabled?: boolean
  view: 'oblique' | 'top'; resetSignal: number; focusSignal: number; selected?: ParkingSpace
}>()
const emit = defineEmits<{ dismissArrival: []; selectArrival: [id: string]; select: [key: string]; error: [] ; ready: [] }>()
// Scene updates may replay a pointer event; one native click must toggle only once.
const handledClicks = new WeakSet<object>()
function claimClick(event?: { nativeEvent: object }) {
  if (!event) return true
  if (handledClicks.has(event.nativeEvent)) return false
  handledClicks.add(event.nativeEvent)
  return true
}
function dismiss(event?: { nativeEvent: object }) { if (claimClick(event)) emit('dismissArrival') }
function selectVehicle(id: string, event: { nativeEvent: object }) { if (claimClick(event)) emit('selectArrival', id) }
const camera = markRaw(new OrthographicCamera(-60, 60, 45, -45, 0.1, 500))
camera.position.set(45, 105, 85); camera.lookAt(0, 0, 0)
</script>

<template>
  <TresCanvas :camera="camera" clear-color="#eff3ee" :alpha="false" :dpr="[1, 1.6]" render-mode="on-demand" @pointermissed="dismiss($event)" @error="emit('error')" @ready="emit('ready')">
    <ParkingCamera :layout="props.layout" :view="view" :reset-signal="resetSignal" :focus-signal="focusSignal" :selected="selected" :arrival-enabled="arrivalEnabled" />
    <TresGroup @click="dismiss($event)">
    <ArrivalCards v-if="arrivalEnabled && cards" :key="arrivalRevision" :cards="cards" :seconds="seconds ?? 0" :active-id="activeArrivalId ?? null" @select="selectVehicle" />
    <ParkingGraphics :layout="props.layout" :spaces="spaces" @select="dismiss(); emit('select', $event)" />
    </TresGroup>
  </TresCanvas>
</template>
