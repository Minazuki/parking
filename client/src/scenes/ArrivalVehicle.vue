<script setup lang="ts">
defineProps<{ bicycle: boolean; selected: boolean; waiting: boolean }>()
</script>
<template>
  <TresGroup>
    <TresMesh v-for="z in [-0.4, 0.4]" :key="z" :position="[0, 0.18, z]" :rotation="[0, 0, Math.PI / 2]">
      <TresCylinderGeometry :args="[0.18, 0.18, bicycle ? 0.045 : 0.1, 12]" /><TresMeshStandardMaterial color="#293e3c" />
    </TresMesh>
    <TresMesh :position="[0, bicycle ? 0.35 : 0.32, 0]">
      <TresBoxGeometry :args="[bicycle ? 0.055 : 0.3, bicycle ? 0.1 : 0.28, 0.66]" /><TresMeshStandardMaterial :color="selected ? '#ffd15b' : waiting ? '#ce9353' : bicycle ? '#4b9fbb' : '#3a8977'" :metalness="0.25" :roughness="0.6" />
    </TresMesh>
    <TresMesh v-if="bicycle" :position="[0, 0.36, 0]" :rotation="[Math.PI / 4, 0, 0]"><TresBoxGeometry :args="[0.055, 0.055, 0.55]" /><TresMeshStandardMaterial color="#4b9fbb" /></TresMesh>
    <TresMesh :position="[0, 0.55, -0.17]"><TresBoxGeometry :args="[0.23, 0.07, 0.28]" /><TresMeshStandardMaterial color="#293e3c" /></TresMesh>
    <TresMesh :position="[0, 0.49, 0.36]"><TresBoxGeometry :args="[0.055, 0.48, 0.055]" /><TresMeshStandardMaterial color="#526b69" /></TresMesh>
    <TresMesh :position="[0, 0.72, 0.36]"><TresBoxGeometry :args="[0.44, 0.055, 0.055]" /><TresMeshStandardMaterial color="#293e3c" /></TresMesh>
    <!-- A generous invisible hit target keeps the small object easy to select. -->
    <TresMesh :position="[0, 0.4, 0]"><TresBoxGeometry :args="[0.56, 0.9, 1.2]" /><TresMeshBasicMaterial :transparent="true" :opacity="0" :depth-write="false" /></TresMesh>
  </TresGroup>
</template>
