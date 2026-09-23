import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as D from '../lib/game/scene-data'
import { SoldierBatch } from '../lib/game/unit-models'
import { findPersonnelHand, loadRifleAsset, loadSoldierAsset, loadSoldierWeaponAsset } from '../lib/game/soldier-asset'

test('production soldier batch equips a separate rifle on the animated humanoid wrist', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path = String(input).replace(/^.*?(?=\/(models|animations)\/)/, '')
    return new Response(readFileSync(`public${path}`))
  }) as typeof fetch
  const scene = new D.Scene(), material = new D.MeshStandardMaterial({})
  const batch = new SoldierBatch(scene, 'BLU', material)
  try {
    await Promise.all([loadSoldierAsset('soldier'), loadSoldierAsset('commander'), loadSoldierAsset('logistics'), loadSoldierWeaponAsset(), loadRifleAsset()])
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(batch.asset, 'ready')
    const soldier = { id: 'test:rifle', x: 0, y: 0, status: 'active' as const, stance: 'stand' as const, action: 'walk' as const, heading: 0, aim: 0, since: 0, shotAt: -10 }
    batch.begin(); batch.pose(soldier, 'RIFLE', 1, 0, true); batch.end(true)
    const rig = batch.rigs.get(soldier.id)!
    assert(rig.model.userData.nativeAssetURL.endsWith('/models/soldier.glb'))
    const rifle = rig.weapons.get('RIFLE')!
    assert(rifle, 'rifle prop must exist')
    assert(rifle.userData.nativeAssetURL.endsWith('/models/rifle.glb'))
    assert.equal(rifle.parent, rig.model.getObjectByName('Bone_022'))
    assert(rig.clip?.endsWith('walk'))
    const equipment = rig.model.userData.personnelEquipment
    const grip = new D.Vector3().fromArray(equipment.grip).multiplyScalar(equipment.scale).applyQuaternion(rifle.quaternion).add(rifle.position)
    assert(grip.distanceTo(new D.Vector3().fromArray(equipment.palm_offset)) < .000001)
    batch.pose({ ...soldier, id: 'test:logistics' }, 'LOGISTICS', 1, 0, true)
    const logistics = batch.rigs.get('test:logistics')!
    assert(logistics.model.userData.nativeAssetURL.endsWith('/models/soldier.glb'))
    assert.equal(logistics.weapons.size, 0)
  } finally { batch.dispose(); material.dispose(); globalThis.fetch = originalFetch }
})

test('hand lookup accepts Mixamo naming without confusing a finger for a wrist', () => {
  for (const name of ['mixamorig:RightHand', 'mixamorigRightHand', 'RightHand', 'hand.R']) {
    const model = new D.Group(), finger = new D.Group(), hand = new D.Group()
    finger.name = 'mixamorig:RightHandIndex1'; hand.name = name
    model.add(finger); model.add(hand)
    assert.equal(findPersonnelHand(model), hand)
  }
})

