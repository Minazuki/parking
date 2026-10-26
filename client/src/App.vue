<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import ActivityView from './views/ActivityView.vue'

const ParkingView = defineAsyncComponent(() => import('./views/ParkingView.vue'))
const LiveShowView = defineAsyncComponent(() => import('./views/LiveShowView.vue'))
const view = new URLSearchParams(window.location.search).get('view')
</script>

<template><ParkingView v-if="view === 'parking'" /><ActivityView v-else-if="view === 'workbench'" /><LiveShowView v-else /></template>
