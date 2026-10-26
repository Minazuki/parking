import test from 'node:test'
import assert from 'node:assert/strict'
import { arrivalDuration, cardPosition, createArrivalCards, demoArrivals } from '../client/src/models/parking/arrival.ts'
import { createParkingSpaces, getParkingLayout, worldPoint } from '../client/src/models/parking/layout.ts'

test('arrival routes reach their assigned spaces and waitlists remain outside', () => {
  for (const floor of ['motorcycle', 'bicycle'] as const) {
    const spaces = createParkingSpaces(floor)
    for (const card of createArrivalCards(floor, demoArrivals(floor))) {
      const final = cardPosition(card, 30)
      assert.equal(final.arrived, true)
      if (card.rank) assert.deepEqual(final.position, cardPosition(card, 0).position)
      else {
        const target = spaces.find(s => s.id === card.spaceId)!
        assert.equal(final.heading, target.rotation)
        assert.ok(Math.abs(final.position[0] - target.x) < 1e-9)
        assert.ok(Math.abs(final.position[2] - target.z) < 1e-9)
      }
    }
  }
})
test('small bicycle arrivals pass through the doorway before reaching the space', () => {
  const [card] = createArrivalCards('bicycle', [{ id: 'test', household: '999-1', spaceId: '小39' }])
  const layout = getParkingLayout('bicycle')
  const before = worldPoint(layout, [232, 490]), after = worldPoint(layout, [232, 550])
  const index = card!.route.findIndex(p => p[0] === before[0] && p[1] === before[1])
  assert.ok(index >= 0)
  assert.deepEqual(card!.route[index + 1], after)
})
test('querying one household preserves its staging location and departure delay', () => {
  const records = demoArrivals('motorcycle')
  const all = createArrivalCards('motorcycle', records)
  const [single] = createArrivalCards('motorcycle', records.filter(r => r.household === '999-3'))
  assert.deepEqual(single, all.find(c => c.household === '999-3'))
})
test('east upper and middle rows approach from the aisle without crossing other spaces', () => {
  const spaces = createParkingSpaces('motorcycle')
  const targets = spaces.filter(s => ['梯間東側上排', '梯間東側中排'].includes(s.group))
  for (const target of targets) {
    const [card] = createArrivalCards('motorcycle', [{ id: 'test', household: '999-3', spaceId: target.id }])
    const approach = card!.route.slice(-4)
    for (let i = 1; i < approach.length; i++) {
      const a = approach[i - 1]!, b = approach[i]!
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05)
      for (let step = 0; step <= steps; step++) {
        const t = step / steps, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t
        for (const other of spaces) {
          if (other.id === target.id) continue
          const dx = x - other.x, dz = z - other.z
          const localX = Math.cos(other.rotation) * dx - Math.sin(other.rotation) * dz
          const localZ = Math.sin(other.rotation) * dx + Math.cos(other.rotation) * dz
          assert.ok(Math.abs(localX) >= other.width / 2 || Math.abs(localZ) >= other.depth / 2, `${target.id} crosses ${other.id}`)
        }
      }
    }
  }
})

test('playback ends five seconds after the final assigned vehicle parks', () => {
  for (const records of [demoArrivals('motorcycle').slice(0, 1), demoArrivals('motorcycle')]) {
    const cards = createArrivalCards('motorcycle', records)
    const end = arrivalDuration(cards)
    assert.ok(cards.every(card => cardPosition(card, end - 5 + 1e-8).arrived))
    assert.ok(cards.some(card => !cardPosition(card, end - 5 - 1e-6).arrived))
  }
  assert.equal(arrivalDuration([]), 5)
  const waits = createArrivalCards('motorcycle', [{ id: 'wait', household: '999-1', rank: 1, stagingIndex: 100 }])
  assert.equal(arrivalDuration(waits), 5)
})
