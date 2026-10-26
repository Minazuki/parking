import { CanvasTexture, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three'

export interface LabelAtlas { texture: CanvasTexture; indices: Map<string, number>; columns: number; rows: number }
export function createLabelAtlas(labels: { key: string; text: string }[]): LabelAtlas {
  const columns = 16, rows = 16, cell = 128
  if (labels.length > columns * rows) throw new Error('Parking label atlas capacity exceeded')
  const canvas = document.createElement('canvas')
  canvas.width = columns * cell; canvas.height = rows * cell
  const context = canvas.getContext('2d')
  if (!context) throw new Error('無法建立車位文字圖層')
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#234c43'
  const indices = new Map<string, number>()
  labels.forEach((label, index) => {
    indices.set(label.key, index)
    const lines = label.text.split('\n')
    let size = Math.min(52, Math.floor((cell - 12) / lines.length))
    do { context.font = `700 ${size}px "PingFang TC", sans-serif`; size-- } while (Math.max(...lines.map(line => context.measureText(line).width)) > cell - 12 && size > 10)
    lines.forEach((line, row) => context.fillText(line, index % columns * cell + cell / 2, Math.floor(index / columns) * cell + cell / 2 + (row - (lines.length - 1) / 2) * (size + 1)))
  })
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return { texture, indices, columns, rows }
}
export function labelResources(atlas: LabelAtlas, key: string) {
  const index = atlas.indices.get(key)
  if (index === undefined) throw new Error(`Missing parking label ${key}`)
  const geometry = new PlaneGeometry(1, 1)
  const uv = geometry.attributes.uv!
  const left = index % atlas.columns / atlas.columns
  const bottom = 1 - (Math.floor(index / atlas.columns) + 1) / atlas.rows
  for (let i = 0; i < uv.count; i++) uv.setXY(i, left + uv.getX(i) / atlas.columns, bottom + uv.getY(i) / atlas.rows)
  const material = new MeshBasicMaterial({ map: atlas.texture, transparent: true, alphaTest: 0.03, depthWrite: false, toneMapped: false })
  return { geometry, material }
}
