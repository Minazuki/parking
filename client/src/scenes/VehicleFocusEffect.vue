<script setup lang="ts">
import { useTres } from '@tresjs/core'
import { AdditiveBlending, DoubleSide, Object3D } from 'three'
import type { MeshBasicMaterial } from 'three'
import { markRaw, onMounted, onUnmounted, ref, shallowRef } from 'vue'
const target = markRaw(new Object3D()); target.position.set(0, 0.35, 0)
const shaft = shallowRef<MeshBasicMaterial>(), halo = shallowRef<MeshBasicMaterial>()
const media = window.matchMedia('(prefers-reduced-motion: reduce)')
const reduced = ref(media.matches)
const { invalidate } = useTres()
let frame: number | undefined
function render() {
  const pulse = reduced.value ? 0.5 : (Math.sin(performance.now() / 1000 * Math.PI / 1.4) + 1) / 2
  if (shaft.value) shaft.value.opacity = 0.12 + pulse * 0.1
  if (halo.value) halo.value.opacity = 0.65 + pulse * 0.3
  invalidate()
  frame = reduced.value ? undefined : requestAnimationFrame(render)
}
function motionChanged() { reduced.value = media.matches; if (frame !== undefined) cancelAnimationFrame(frame); render() }
onMounted(() => { media.addEventListener('change', motionChanged); render() })
onUnmounted(() => { media.removeEventListener('change', motionChanged); if (frame !== undefined) cancelAnimationFrame(frame) })
</script>
<template>
  <TresGroup>
    <primitive :object="target" />
    <TresSpotLight :position="[0, 5.6, 0]" :target="target" color="#e0f2fe" :intensity="20" :distance="7" :angle="0.035" :penumbra="0.9" :decay="2" />
    <!-- A visible shaft above the vehicle makes the focus readable in 3D.
         It is a visual marker, separate from the actual local spotlight. -->
    <TresMesh :position="[0, 3.05, 0]">
      <TresCylinderGeometry :args="[0.03, 0.18, 4.4, 24, 1, true]" />
      <TresMeshBasicMaterial ref="shaft" color="#e0f2fe" :transparent="true" :opacity="0.17" :depth-write="false" :side="DoubleSide" :blending="AdditiveBlending" :tone-mapped="false" />
    </TresMesh>
    <!-- Even the breathing halo stays inside the original 0.4m × 1m footprint. -->
    <TresMesh :position="[0, 0.14, 0]" :rotation="[-Math.PI / 2, 0, 0]" :scale="[0.4, 1, 1]">
      <TresRingGeometry :args="[0.34, 0.5, 40]" /><TresMeshBasicMaterial color="#0a0a0a" :transparent="true" :opacity="0.95" :depth-write="false" />
    </TresMesh>
    <TresMesh :position="[0, 0.145, 0]" :rotation="[-Math.PI / 2, 0, 0]" :scale="[0.4, 1, 1]">
      <TresRingGeometry :args="[0.4, 0.48, 40]" /><TresMeshBasicMaterial ref="halo" color="#ffffff" :transparent="true" :opacity="0.8" :depth-write="false" :blending="AdditiveBlending" :tone-mapped="false" />
    </TresMesh>
  </TresGroup>
</template>
