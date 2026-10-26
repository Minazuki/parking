<script setup lang="ts">
import { markRaw, onUnmounted, shallowRef, watch } from 'vue'
import type { Mesh } from 'three'
import type { LabelAtlas } from './labels.ts'
import { labelResources } from './labels.ts'

const props = defineProps<{ atlas: LabelAtlas; labelKey: string; position: [number, number, number]; width: number; height: number }>()
const resources = labelResources(props.atlas, props.labelKey)
const geometry = markRaw(resources.geometry), material = markRaw(resources.material)
const mesh = shallowRef<Mesh>()
watch(mesh, value => { if (value) value.raycast = () => {} }, { flush: 'post' })
onUnmounted(() => { geometry.dispose(); material.dispose() })
</script>

<template>
  <TresMesh ref="mesh" :geometry="geometry" :material="material" :position="position" :rotation="[-Math.PI / 2, 0, 0]" :scale="[width, height, 1]" :dispose="null" />
</template>
