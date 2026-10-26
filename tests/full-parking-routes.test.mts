import test from 'node:test'
import assert from 'node:assert/strict'
import { arrivalDuration, cardPosition, createArrivalCards, fullArrivalRecords } from '../client/src/models/parking/arrival.ts'
import { auditArrivalRoutes } from '../client/src/models/parking/route-audit.ts'
import { accessibleIds, createParkingSpaces } from '../client/src/models/parking/layout.ts'
for (const mask of Array.from({ length: 8 }, (_, i) => i)) {
  test(`all motorcycle spaces arrive without crossing other bays, accessible split mask ${mask}`, () => {
    const split = accessibleIds.filter((_, i) => mask & (1 << i))
    const spaces = createParkingSpaces('motorcycle', split)
    const records = fullArrivalRecords(spaces), cards = createArrivalCards('motorcycle', records, spaces)
    assert.equal(records.length, 150 + split.length)
    assert.equal(new Set(records.map(r => r.household)).size, records.length)
    assert.deepEqual(auditArrivalRoutes(cards, spaces), [])
    const duration = arrivalDuration(cards)
    for (const card of cards) {
      const end = cardPosition(card, duration), space = spaces.find(s => s.id === card.spaceId)!
      assert.equal(end.arrived, true)
      assert.ok(Math.abs(end.position[0] - space.x) < 1e-9 && Math.abs(end.position[2] - space.z) < 1e-9)
    }
  })
}
test('all 57 bicycle spaces have unique households and no route crosses another bay', () => {
  const spaces = createParkingSpaces('bicycle'), records = fullArrivalRecords(spaces)
  const cards = createArrivalCards('bicycle', records, spaces)
  assert.equal(records.length, 57)
  assert.equal(new Set(records.map(r => r.household)).size, 57)
  assert.deepEqual(auditArrivalRoutes(cards, spaces), [])
  assert.ok(cards.every(c => cardPosition(c, arrivalDuration(cards)).arrived))
})
test('route audit catches a deliberately shortened path across occupied bays', () => {
  const spaces = createParkingSpaces('motorcycle')
  const [card] = createArrivalCards('motorcycle', [{ id: 'test', household: '998-1', spaceId: '127' }])
  card!.route = [spaces.find(s => s.id === '134')!, spaces.find(s => s.id === '127')!].map(s => [s.x, s.z])
  assert.ok(auditArrivalRoutes([card!], spaces).some(issue => issue.obstacle === '130'))
})
test('109, 108, 105, 102 and 99 enter from the upper aisle', () => {
  const spaces = createParkingSpaces('motorcycle')
  for (const id of ['109', '108', '105', '102', '99']) {
    const [card] = createArrivalCards('motorcycle', [{ id: 'test', household: '998-1', spaceId: id }], spaces)
    const before = card!.route.at(-2)!, end = card!.route.at(-1)!
    assert.equal(before[0], end[0])
    assert.ok(before[1] < end[1], `${id} must approach from above`)
  }
})
test('bicycle northern row turns toward each bay without overshooting near the entrance', () => {
  const spaces = createParkingSpaces('bicycle')
  for (const space of spaces.filter(s => Number(s.baseId) <= 14)) {
    const [card] = createArrivalCards('bicycle', [{ id: 'test', household: '998-1', spaceId: space.id }], spaces)
    // Exclude the outside staging approach; inside the entrance X must not reverse.
    const inside = card!.route.slice(1)
    for (let i = 1; i < inside.length; i++) assert.ok(inside[i]![0] >= inside[i - 1]![0] - 1e-9, `${space.id} doubles back`)
    assert.equal(inside.at(-2)![0], space.x)
  }
})
