<script setup lang="ts">
import { useLoop, useTres } from '@tresjs/core'
import { CanvasTexture, OrthographicCamera, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three'
import { markRaw, onUnmounted } from 'vue'
const props = defineProps<{ household: string; detail: string }>()
function createBubbleTexture(below: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const offset = below ? 44 : 0
  ctx.fillStyle = '#fffef5'; ctx.strokeStyle = '#254b43'; ctx.lineWidth = 8
  ctx.beginPath(); ctx.roundRect(8, 8 + offset, 496, 196, 32); ctx.fill(); ctx.stroke()
  ctx.beginPath()
  ctx.lineWidth = 3
  ctx.moveTo(256, below ? 52 : 204); ctx.lineTo(256, below ? 10 : 246); ctx.stroke()
  ctx.fillStyle = '#254b43'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  let font = 66
  while (font > 20) { ctx.font = `700 ${font}px "PingFang TC", sans-serif`; if (ctx.measureText(props.household).width < 450) break; font-- }
  ctx.fillText(props.household, 256, (props.detail ? 75 : 105) + offset)
  ctx.font = '500 40px "PingFang TC", sans-serif'; ctx.fillText(props.detail, 256, 150 + offset)
  const texture = markRaw(new CanvasTexture(canvas)); texture.colorSpace = SRGBColorSpace
  return texture
}
const texture = createBubbleTexture(false), belowTexture = createBubbleTexture(true)
const anchor = new Vector3()
const material = markRaw(new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }))
const sprite = markRaw(new Sprite(material)); sprite.center.set(0.5, 0); sprite.renderOrder = 1000; sprite.raycast = () => {}; sprite.pointerEvents = 'none'
const { camera, sizes } = useTres()
const { onBeforeRender } = useLoop()
onBeforeRender(() => {
  const cam = camera.value
  if (cam instanceof OrthographicCamera) {
    const unit = (cam.top - cam.bottom) / cam.zoom / Math.max(1, sizes.height.value)
    const width = Math.min(160, sizes.width.value * 0.45) * 1.5 * unit
    sprite.scale.set(width, width / 2, 1)
    sprite.getWorldPosition(anchor).project(cam)
    const screenY = (1 - anchor.y) * sizes.height.value / 2
    const below = screenY < Math.min(160, sizes.width.value * 0.45) * 1.5 / 2 + 8
    sprite.center.set(0.5, below ? 1 : 0)
    material.map = below ? belowTexture : texture
  }
})
onUnmounted(() => { texture.dispose(); belowTexture.dispose(); material.dispose() })
</script>
<template><primitive :object="sprite" :position="[0, 1, 0]" :dispose="null" /></template>
