<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import ActivityView from './views/ActivityView.vue'

const ParkingView = defineAsyncComponent(() => import('./views/ParkingView.vue'))
const parking = new URLSearchParams(window.location.search).get('view') === 'parking'
</script>

<template><ParkingView v-if="parking" /><ActivityView v-else /></template>
