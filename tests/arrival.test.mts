import test from 'node:test'
import assert from 'node:assert/strict'
import { cardPosition, createArrivalCards, demoArrivals } from '../client/src/models/parking/arrival.ts'
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
