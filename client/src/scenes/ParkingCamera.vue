<script setup lang="ts">
import { useTres } from '@tresjs/core'
import { MOUSE, OrthographicCamera, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { onMounted, onUnmounted, watch } from 'vue'
import type { ParkingLayout, ParkingSpace } from '../models/parking/layout.ts'
import { arrivalBounds } from '../models/parking/arrival.ts'
import { worldPoint } from '../models/parking/layout.ts'

const props = defineProps<{ layout: ParkingLayout; view: 'oblique' | 'top'; resetSignal: number; focusSignal: number; selected?: ParkingSpace; arrivalEnabled?: boolean; containScene?: boolean; interactive?: boolean; followTarget?: [number, number, number]; followEnabled?: boolean }>()
const emit = defineEmits<{ interact: [] }>()
const { camera, renderer, sizes, invalidate } = useTres()
let controls: OrbitControls | undefined
function follow() {
  const cam = camera.value
  if (!(cam instanceof OrthographicCamera) || !controls || !props.followEnabled || !props.followTarget) return
  const target = new Vector3(...props.followTarget)
  const offset = cam.position.clone().sub(controls.target)
  controls.target.copy(target); cam.position.copy(target).add(offset)
  const aspect = sizes.width.value / Math.max(1, sizes.height.value)
  cam.left = -7.5 * aspect; cam.right = 7.5 * aspect; cam.top = 7.5; cam.bottom = -7.5; cam.zoom = 1
  controls.update(); cam.updateProjectionMatrix(); invalidate()
}
let pointerStart: [number, number] | undefined
function pointerDown(event: PointerEvent) { pointerStart = [event.clientX, event.clientY] }
function pointerMove(event: PointerEvent) {
  if (pointerStart && event.buttons && Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 3) {
    pointerStart = undefined; emit('interact')
  }
}
function wheel() { emit('interact') }
function fit(resetZoom: boolean) {
  const cam = camera.value
  if (!(cam instanceof OrthographicCamera)) return
  const target = controls?.target ?? new Vector3()
  const right = new Vector3(1, 0, 0).applyQuaternion(cam.quaternion)
  const up = new Vector3(0, 1, 0).applyQuaternion(cam.quaternion)
  const points = [...props.layout.outline, ...(props.arrivalEnabled ? arrivalBounds(props.layout.floor === 'B1' ? 'motorcycle' : 'bicycle') : []), ...props.layout.features.flatMap(f => [[f.x - f.width / 2, f.y - f.depth / 2], [f.x + f.width / 2, f.y + f.depth / 2]] as [number, number][])]
  const projected = points.map(point => {
    const [x, z] = worldPoint(props.layout, point)
    const value = new Vector3(x, 0, z).sub(target)
    return { x: value.dot(right), y: value.dot(up) }
  })
  const width = Math.max(...projected.map(p => p.x)) - Math.min(...projected.map(p => p.x))
  const height = Math.max(...projected.map(p => p.y)) - Math.min(...projected.map(p => p.y))
  const aspect = sizes.width.value / Math.max(1, sizes.height.value)
  const half = props.containScene
    ? Math.max(...projected.map(p => Math.max(Math.abs(p.y), Math.abs(p.x) / aspect))) * 1.8
    : Math.max(height, width / aspect) * 0.6
  cam.left = -half * aspect; cam.right = half * aspect; cam.top = half; cam.bottom = -half
  // Bring vehicles closer during arrivals while keeping manual zoom available.
  if (resetZoom) cam.zoom = props.containScene ? 1 : props.arrivalEnabled ? 1.3 : 1
  cam.updateProjectionMatrix(); invalidate()
}
function reset() {
  const cam = camera.value
  if (!cam || !controls) return
  controls.target.set(0, 0, 0)
  cam.up.set(0, props.view === 'top' ? 0 : 1, props.view === 'top' ? -1 : 0)
  cam.position.set(props.view === 'top' ? 0 : 45, props.view === 'top' ? 120 : 105, props.view === 'top' ? 0.01 : 85)
  cam.lookAt(controls.target)
  controls.enableRotate = props.view !== 'top'
  controls.mouseButtons.LEFT = props.view === 'top' ? MOUSE.PAN : MOUSE.ROTATE
  controls.update(); fit(true); follow()
}
function changeView() {
  const cam = camera.value
  if (!cam || !controls || !props.followTarget) { reset(); return }
  const target = controls.target.clone()
  cam.up.set(0, props.view === 'top' ? 0 : 1, props.view === 'top' ? -1 : 0)
  cam.position.set(props.view === 'top' ? 0 : 45, props.view === 'top' ? 120 : 105, props.view === 'top' ? 0.01 : 85).add(target)
  cam.lookAt(target); controls.enableRotate = props.view !== 'top'; controls.mouseButtons.LEFT = props.view === 'top' ? MOUSE.PAN : MOUSE.ROTATE
  controls.update(); follow(); invalidate()
}
function focus() {
  const cam = camera.value
  if (!(cam instanceof OrthographicCamera) || !controls || !props.selected) return
  const target = new Vector3(props.selected.x, 0, props.selected.z)
  const offset = cam.position.clone().sub(controls.target)
  controls.target.copy(target); cam.position.copy(target).add(offset)
  cam.zoom = 3; controls.update(); cam.updateProjectionMatrix(); invalidate()
}
onMounted(() => {
  if (!camera.value) return
  controls = new OrbitControls(camera.value, renderer.domElement)
  controls.enabled = props.interactive !== false
  controls.enableDamping = false
  controls.screenSpacePanning = true
  controls.minZoom = 0.55; controls.maxZoom = 8
  controls.minPolarAngle = 0.01; controls.maxPolarAngle = Math.PI / 2.3
  controls.addEventListener('change', invalidate)
  renderer.domElement.addEventListener('pointerdown', pointerDown)
  renderer.domElement.addEventListener('pointermove', pointerMove)
  renderer.domElement.addEventListener('wheel', wheel, { passive: true })
  reset()
})
watch(() => props.view, changeView)
watch([() => props.resetSignal, () => props.arrivalEnabled], reset)
watch([() => props.followTarget, () => props.followEnabled], follow)
watch(() => props.interactive, value => { if (controls) controls.enabled = value !== false })
watch(() => props.focusSignal, focus)
watch([sizes.width, sizes.height], () => { if (props.followEnabled) follow(); else fit(false) })
onUnmounted(() => {
  renderer.domElement.removeEventListener('pointerdown', pointerDown)
  renderer.domElement.removeEventListener('pointermove', pointerMove)
  renderer.domElement.removeEventListener('wheel', wheel)
  controls?.removeEventListener('change', invalidate); controls?.dispose()
})
</script>

<template><TresGroup /></template>
