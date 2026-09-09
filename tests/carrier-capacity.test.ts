import test from 'node:test'
import assert from 'node:assert/strict'
import { createBlenderVehicle } from '../lib/game/blender-vehicles'
import { addCarrierOccupants, updateCarrierOccupants } from '../lib/game/carrier-occupants'
import { vehicleRig } from '../lib/game/vehicle-animation'
import { BASES, createUnit, initialState, troopSeats } from '../lib/game/types'
import { manualGetIn } from '../lib/game/transport'

function fixture(passengers: number) {
  const state = initialState(), carrier = createUnit('BLU', 'TROOP_TRUCK', 'carrier', BASES.BLU)
  carrier.ammo = 100; carrier.fuel = 100; carrier.servicing = false
  const squad = createUnit('BLU', 'RIFLE', 'passengers', BASES.BLU)
  squad.members = passengers; squad.maxMembers = passengers
  squad.soldiers = Array.from({ length: passengers }, (_, i) => ({ ...squad.soldiers![0], id: `${squad.id}:${i}` }))
  state.units = [carrier, squad]
  return { state, carrier, squad }
}

test('troop carrier runtime capacity matches seven passenger seats and one modeled driver', () => {
  const seats = vehicleRig('TROOP_TRUCK')!.seats!
  assert.equal(seats[0].id, '01_driver')
  assert.equal(troopSeats('TROOP_TRUCK'), 7)
  assert.equal(seats.length, troopSeats('TROOP_TRUCK') + 1)
  assert.equal(new Set(seats.map(s => s.id)).size, 8)
  const { state, carrier, squad } = fixture(7), root = createBlenderVehicle('TROOP_TRUCK', 'BLU')
  squad.carrier = carrier.id
  addCarrierOccupants(root, 'BLU'); updateCarrierOccupants(root, carrier, state)
  assert.equal(root.children.filter(o => o.userData.seatId && o.visible).length, 8)
  assert.equal(root.getObjectByName('seated-driver')!.visible, true)
  squad.soldiers![6].status = 'downed'; updateCarrierOccupants(root, carrier, state)
  assert.equal(root.children.filter(o => o.userData.seatId && o.visible).length, 7)
  carrier.crewBailed = true; updateCarrierOccupants(root, carrier, state)
  assert.equal(root.getObjectByName('seated-driver')!.visible, false)
  assert.equal(root.children.filter(o => o.userData.seatId && o.visible).length, 6)
})

test('actual manual transport accepts seven living passengers and rejects an eighth without reserving', () => {
  const full = fixture(7)
  assert.equal(manualGetIn(full.state, 'BLU', full.squad.id, full.carrier.id), true)
  assert.deepEqual(full.carrier.transport?.passengers, [full.squad.id])
  const over = fixture(8)
  assert.equal(manualGetIn(over.state, 'BLU', over.squad.id, over.carrier.id), false)
  assert.equal(over.carrier.transport, undefined)
  assert.equal(over.squad.carrier, undefined)
})
