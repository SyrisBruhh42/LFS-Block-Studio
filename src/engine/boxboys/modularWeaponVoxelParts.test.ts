import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  VoxelReceiver,
  VoxelBarrel,
  VoxelMagazine,
  VoxelOptic,
  ModularWeaponBuilder
} from './modularWeaponVoxelParts';

test('ModularWeaponVoxelParts - instantiate parts', () => {
  const receiver = new VoxelReceiver();
  const barrel = new VoxelBarrel();
  const magazine = new VoxelMagazine();
  const optic = new VoxelOptic();

  assert.strictEqual(receiver.meshGroup.name, 'Receiver');
  assert.strictEqual(barrel.meshGroup.name, 'Barrel');
  assert.strictEqual(magazine.meshGroup.name, 'Magazine');
  assert.strictEqual(optic.meshGroup.name, 'Optic');

  // Verify attachment points exist on the receiver
  assert.ok(receiver.barrelAttachmentPoint instanceof THREE.Vector3);
  assert.ok(receiver.magazineAttachmentPoint instanceof THREE.Vector3);
  assert.ok(receiver.opticAttachmentPoint instanceof THREE.Vector3);
});

test('ModularWeaponVoxelParts - assemble weapon', () => {
  const receiver = new VoxelReceiver();
  const barrel = new VoxelBarrel();
  const magazine = new VoxelMagazine();
  const optic = new VoxelOptic();

  const builder = new ModularWeaponBuilder();
  const weapon = builder.assembleWeapon(receiver, barrel, magazine, optic);

  assert.strictEqual(weapon.name, 'ModularWeapon');
  assert.strictEqual(weapon.children.length, 4);

  // Check positions of attached parts matches the attachment points of the receiver
  assert.strictEqual(
    barrel.meshGroup.position.equals(receiver.barrelAttachmentPoint),
    true,
    'Barrel is not positioned at the barrel attachment point'
  );

  assert.strictEqual(
    magazine.meshGroup.position.equals(receiver.magazineAttachmentPoint),
    true,
    'Magazine is not positioned at the magazine attachment point'
  );

  assert.strictEqual(
    optic.meshGroup.position.equals(receiver.opticAttachmentPoint),
    true,
    'Optic is not positioned at the optic attachment point'
  );
});
