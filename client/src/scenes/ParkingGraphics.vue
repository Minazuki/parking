<script setup lang="ts">
import { BoxGeometry, ExtrudeGeometry, Shape } from 'three'
import { markRaw, onUnmounted } from 'vue'
import { createParkingSpaces, worldPoint } from '../models/parking/layout.ts'
import type { ParkingLayout, ParkingSpace } from '../models/parking/layout.ts'
import { createLabelAtlas } from './labels.ts'
import ParkingBay from './ParkingBay.vue'
import ParkingLabel from './ParkingLabel.vue'

const props = defineProps<{ layout: ParkingLayout; spaces: (ParkingSpace & { selected: boolean; muted: boolean; color: string })[] }>()
const emit = defineEmits<{ select: [key: string] }>()
const shape = new Shape()
props.layout.outline.forEach((point, index) => {
  const [x, z] = worldPoint(props.layout, point)
  if (index === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z)
})
shape.closePath()
const floorGeometry = markRaw(new ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: false }))
const cube = markRaw(new BoxGeometry(1, 1, 1))
const accessiblePads = createParkingSpaces('motorcycle').filter(s => s.accessible)
const allSpaces = [...createParkingSpaces('motorcycle'), ...createParkingSpaces('motorcycle', ['14', '2', '3']).filter(s => s.id.endsWith('-1')), ...createParkingSpaces('bicycle')]
const labelItems = allSpaces.map(space => ({ key: space.key, text: space.label }))
props.layout.features.filter(f => f.label).forEach(f => labelItems.push({ key: `feature:${f.id}`, text: f.label }))
props.layout.annotations.forEach((a, i) => labelItems.push({ key: `annotation:${i}`, text: a.label }))
const atlas = markRaw(createLabelAtlas(labelItems))
const walls = props.layout.walls.map(([a, b]) => {
  const [x1, z1] = worldPoint(props.layout, a), [x2, z2] = worldPoint(props.layout, b)
  return { x: (x1 + x2) / 2, z: (z1 + z2) / 2, length: Math.hypot(x2 - x1, z2 - z1), angle: -Math.atan2(z2 - z1, x2 - x1) }
})
// Separate open metal railings from solid perimeter walls.
const railings = props.layout.railings.map(([a, b]) => {
  const [x1, z1] = worldPoint(props.layout, a), [x2, z2] = worldPoint(props.layout, b)
  const length = Math.hypot(x2 - x1, z2 - z1)
  const intervals = Math.ceil(length / 1.5)
  return { x: (x1 + x2) / 2, z: (z1 + z2) / 2, length, angle: -Math.atan2(z2 - z1, x2 - x1),
    posts: Array.from({ length: intervals + 1 }, (_, i) => -length / 2 + length * i / intervals) }
})
const doors = props.layout.doors.map(door => {
  const hinge = worldPoint(props.layout, door.hinge), end = worldPoint(props.layout, door.end)
  const openEnd = worldPoint(props.layout, door.openEnd)
  return { id: door.id, hinge, end, x: (hinge[0] + openEnd[0]) / 2, z: (hinge[1] + openEnd[1]) / 2,
    length: Math.hypot(openEnd[0] - hinge[0], openEnd[1] - hinge[1]),
    angle: -Math.atan2(openEnd[1] - hinge[1], openEnd[0] - hinge[0]) }
})
const features = props.layout.features.map(f => ({ ...f, point: worldPoint(props.layout, [f.x, f.y]) }))
const annotations = props.layout.annotations.map((a, index) => ({ ...a, index, point: worldPoint(props.layout, [a.x, a.y]) }))
onUnmounted(() => { cube.dispose(); floorGeometry.dispose(); atlas.texture.dispose() })
</script>

<template>
  <TresAmbientLight :intensity="1.6" />
  <TresDirectionalLight :position="[-30, 70, 45]" :intensity="2.3" />
  <TresDirectionalLight :position="[40, 30, -50]" :intensity="0.9" />
  <TresMesh :geometry="floorGeometry" :rotation="[-Math.PI / 2, 0, 0]" :position="[0, -0.32, 0]"><TresMeshStandardMaterial color="#e3e9e4" :roughness="1" /></TresMesh>
  <TresMesh v-for="(wall, index) in walls" :key="`wall:${index}`" :position="[wall.x, 0.4, wall.z]" :rotation="[0, wall.angle, 0]">
    <TresBoxGeometry :args="[wall.length, 0.8, 0.3]" /><TresMeshStandardMaterial color="#a3b2a8" :roughness="1" />
  </TresMesh>
  <TresGroup v-for="(railing, index) in railings" :key="`railing:${index}`" :position="[railing.x, 0, railing.z]" :rotation="[0, railing.angle, 0]">
    <TresMesh v-for="height in [0.48, 0.95]" :key="height" :position="[0, height, 0]">
      <TresBoxGeometry :args="[railing.length, 0.07, 0.07]" /><TresMeshStandardMaterial color="#56656a" :metalness="0.65" :roughness="0.4" />
    </TresMesh>
    <TresMesh v-for="(x, post) in railing.posts" :key="`post:${post}`" :position="[x, 0.48, 0]">
      <TresBoxGeometry :args="[0.08, 0.96, 0.08]" /><TresMeshStandardMaterial color="#56656a" :metalness="0.65" :roughness="0.4" />
    </TresMesh>
  </TresGroup>
  <TresGroup v-for="door in doors" :key="door.id">
    <!-- An open leaf and threshold identify the doorway without covering the bicycle bays. -->
    <TresMesh :position="[(door.hinge[0] + door.end[0]) / 2, 0.025, (door.hinge[1] + door.end[1]) / 2]">
      <TresBoxGeometry :args="[door.length, 0.04, 0.14]" /><TresMeshStandardMaterial color="#ba965c" />
    </TresMesh>
    <TresMesh :position="[door.x, 0.4, door.z]" :rotation="[0, door.angle, 0]">
      <TresBoxGeometry :args="[door.length, 0.8, 0.08]" /><TresMeshStandardMaterial color="#ba965c" :transparent="true" :opacity="0.65" />
    </TresMesh>
  </TresGroup>
  <TresGroup v-for="feature in features" :key="feature.id" :position="[feature.point[0], 0, feature.point[1]]">
    <TresMesh :position="[0, feature.height / 2, 0]"><TresBoxGeometry :args="[feature.width * layout.scale, feature.height, feature.depth * layout.scale]" /><TresMeshStandardMaterial :color="feature.kind === 'pillar' ? '#a5b6ab' : '#d0dbd2'" :roughness="1" /></TresMesh>
    <ParkingLabel v-if="feature.label" :atlas="atlas" :label-key="`feature:${feature.id}`" :position="[0, feature.height + 0.025, 0]" :width="Math.min(feature.width * layout.scale * 0.92, 11)" :height="Math.min(feature.width * layout.scale * 0.92, 11)" />
  </TresGroup>
  <ParkingLabel v-for="annotation in annotations" :key="`annotation:${annotation.index}`" :atlas="atlas" :label-key="`annotation:${annotation.index}`" :position="[annotation.point[0], 0.035, annotation.point[1]]" :width="annotation.label.length * layout.scale * 18" :height="annotation.label.length * layout.scale * 18" />
  <template v-if="spaces[0]?.floor === 'motorcycle'">
    <TresMesh v-for="pad in accessiblePads" :key="`pad:${pad.id}`" :position="[pad.x, 0.014, pad.z]">
      <TresBoxGeometry :args="[pad.width + 0.05, 0.025, pad.depth + 0.05]" /><TresMeshStandardMaterial color="#c1d5da" :roughness="1" />
    </TresMesh>
  </template>
  <ParkingBay v-for="space in spaces" :key="space.key" :space="space" :atlas="atlas" :cube="cube" @select="emit('select', $event)" />
</template>
