<script setup lang="ts">
import VehicleFocusEffect from './VehicleFocusEffect.vue'
defineProps<{ bicycle: boolean; selected: boolean; waiting: boolean }>()
</script>
<template>
  <TresGroup>
    <VehicleFocusEffect v-if="selected" />
    <TresMesh v-for="z in [-0.4, 0.4]" :key="z" :position="[0, 0.18, z]" :rotation="[0, 0, Math.PI / 2]">
      <TresCylinderGeometry :args="[0.18, 0.18, bicycle ? 0.045 : 0.1, 12]" /><TresMeshStandardMaterial color="#262626" />
    </TresMesh>
    <TresMesh :position="[0, bicycle ? 0.35 : 0.32, 0]">
      <TresBoxGeometry :args="[bicycle ? 0.055 : 0.3, bicycle ? 0.1 : 0.28, 0.66]" /><TresMeshStandardMaterial :color="selected ? '#0072b2' : '#d4d4d4'" :metalness="0.1" :roughness="0.65" />
    </TresMesh>
    <!-- White roof stripe remains identifiable without relying on hue. -->
    <TresMesh v-if="selected" :position="[0, bicycle ? 0.408 : 0.465, 0]">
      <TresBoxGeometry :args="[bicycle ? 0.025 : 0.07, 0.012, 0.54]" /><TresMeshBasicMaterial color="#ffffff" :tone-mapped="false" />
    </TresMesh>
    <TresMesh v-if="bicycle" :position="[0, 0.36, 0]" :rotation="[Math.PI / 4, 0, 0]"><TresBoxGeometry :args="[0.055, 0.055, 0.55]" /><TresMeshStandardMaterial :color="selected ? '#0072b2' : '#d4d4d4'" /></TresMesh>
    <TresMesh :position="[0, 0.55, -0.17]"><TresBoxGeometry :args="[0.23, 0.07, 0.28]" /><TresMeshStandardMaterial color="#262626" /></TresMesh>
    <TresMesh :position="[0, 0.49, 0.36]"><TresBoxGeometry :args="[0.055, 0.48, 0.055]" /><TresMeshStandardMaterial color="#737373" /></TresMesh>
    <TresMesh :position="[0, 0.72, 0.36]"><TresBoxGeometry :args="[0.44, 0.055, 0.055]" /><TresMeshStandardMaterial color="#262626" /></TresMesh>
    <!-- A generous invisible hit target keeps the small object easy to select. -->
    <TresMesh :position="[0, 0.4, 0]"><TresBoxGeometry :args="[0.56, 0.9, 1.2]" /><TresMeshBasicMaterial :transparent="true" :opacity="0" :depth-write="false" /></TresMesh>
  </TresGroup>
</template>
