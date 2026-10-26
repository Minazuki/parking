<script setup lang="ts">
import { computed } from 'vue'
import { cardPosition } from '../models/parking/arrival.ts'
import type { ArrivalCard } from '../models/parking/arrival.ts'
import ArrivalVehicle from './ArrivalVehicle.vue'
import ArrivalBubble from './ArrivalBubble.vue'
const props = defineProps<{ cards: ArrivalCard[]; seconds: number; activeId: string | null }>()
const emit = defineEmits<{ select: [id: string, event: { nativeEvent: object }] }>()
const positions = computed(() => props.cards.map(c => ({ ...c, ...cardPosition(c, props.seconds) })))
</script>
<template>
  <TresGroup v-for="card in positions" :key="card.id" :position="[card.position[0], 0.04, card.position[2]]" @click.stop="emit('select', card.id, $event)">
    <TresGroup :rotation="[0, card.heading, 0]"><ArrivalVehicle :bicycle="card.floor === 'bicycle'" :selected="activeId === card.id" :waiting="!!card.rank" /></TresGroup>
    <ArrivalBubble v-if="activeId === card.id" :key="`${card.id}:${card.arrived}`" :household="card.household" :detail="card.rank ? `候補 ${card.rank}` : card.arrived ? `車位 ${card.spaceId}` : ''" />
  </TresGroup>
</template>
