<script setup lang="ts">
defineProps<{ bicycle: boolean; selected: boolean; waiting: boolean }>()
</script>
<template>
  <TresGroup>
    <!-- 0.4m × 1m oval stays inside the vehicle footprint and the narrowest bay. -->
    <TresMesh :position="[0, 0.14, 0]" :rotation="[-Math.PI / 2, 0, 0]" :scale="[0.4, 1, 1]">
      <TresRingGeometry :args="[0.43, 0.5, 40]" />
      <TresMeshBasicMaterial :color="selected ? '#fde68a' : '#fbbf24'" :transparent="true" :opacity="selected ? 0.95 : 0.7" :depth-write="false" :tone-mapped="false" />
    </TresMesh>
    <TresMesh v-for="z in [-0.4, 0.4]" :key="z" :position="[0, 0.18, z]" :rotation="[0, 0, Math.PI / 2]">
      <TresCylinderGeometry :args="[0.18, 0.18, bicycle ? 0.045 : 0.1, 12]" /><TresMeshStandardMaterial color="#262626" />
    </TresMesh>
    <TresMesh :position="[0, bicycle ? 0.35 : 0.32, 0]">
      <TresBoxGeometry :args="[bicycle ? 0.055 : 0.3, bicycle ? 0.1 : 0.28, 0.66]" /><TresMeshStandardMaterial :color="selected ? '#fbbf24' : waiting ? '#f59e0b' : bicycle ? '#d4d4d4' : '#a3a3a3'" :metalness="0.25" :roughness="0.6" />
    </TresMesh>
    <TresMesh v-if="bicycle" :position="[0, 0.36, 0]" :rotation="[Math.PI / 4, 0, 0]"><TresBoxGeometry :args="[0.055, 0.055, 0.55]" /><TresMeshStandardMaterial color="#d4d4d4" /></TresMesh>
    <TresMesh :position="[0, 0.55, -0.17]"><TresBoxGeometry :args="[0.23, 0.07, 0.28]" /><TresMeshStandardMaterial color="#262626" /></TresMesh>
    <TresMesh :position="[0, 0.49, 0.36]"><TresBoxGeometry :args="[0.055, 0.48, 0.055]" /><TresMeshStandardMaterial color="#737373" /></TresMesh>
    <TresMesh :position="[0, 0.72, 0.36]"><TresBoxGeometry :args="[0.44, 0.055, 0.055]" /><TresMeshStandardMaterial color="#262626" /></TresMesh>
    <!-- A generous invisible hit target keeps the small object easy to select. -->
    <TresMesh :position="[0, 0.4, 0]"><TresBoxGeometry :args="[0.56, 0.9, 1.2]" /><TresMeshBasicMaterial :transparent="true" :opacity="0" :depth-write="false" /></TresMesh>
  </TresGroup>
</template>
