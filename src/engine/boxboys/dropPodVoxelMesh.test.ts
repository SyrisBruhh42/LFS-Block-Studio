import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DropPodVoxelMesh } from './dropPodVoxelMesh.js';

// Mock WebGLRenderer for Node.js test environment (no canvas)

test('DropPodVoxelMesh', async (t) => {
  await t.test('instantiates correctly with default state', () => {
    const mesh = new DropPodVoxelMesh();
    assert.ok(mesh instanceof THREE.Group);
    assert.equal(mesh.name, 'DropPodVoxelMesh');
    assert.equal(mesh.state.doorProgress, 0);
    assert.equal(mesh.state.thrustersActive, false);

    // Check components
    assert.ok(mesh.hull);
    assert.ok(mesh.doors);
    assert.ok(mesh.leftDoor);
    assert.ok(mesh.rightDoor);
    assert.equal(mesh.thrusterVents.length, 4);
  });

  await t.test('setDoorProgress updates door positions', () => {
    const mesh = new DropPodVoxelMesh();

    // Initial closed state
    assert.equal(mesh.leftDoor.position.x, -1);
    assert.equal(mesh.rightDoor.position.x, 1);

    // Half open
    mesh.setDoorProgress(0.5);
    assert.equal(mesh.state.doorProgress, 0.5);
    assert.equal(mesh.leftDoor.position.x, -2); // -1 - (2.0 * 0.5)
    assert.equal(mesh.rightDoor.position.x, 2); // 1 + (2.0 * 0.5)

    // Fully open
    mesh.setDoorProgress(1.0);
    assert.equal(mesh.state.doorProgress, 1.0);
    assert.equal(mesh.leftDoor.position.x, -3);
    assert.equal(mesh.rightDoor.position.x, 3);

    // Clamp test
    mesh.setDoorProgress(1.5);
    assert.equal(mesh.state.doorProgress, 1.0);
    mesh.setDoorProgress(-0.5);
    assert.equal(mesh.state.doorProgress, 0.0);
  });

  await t.test('setThrustersActive updates emissive color', () => {
    const mesh = new DropPodVoxelMesh();

    // Initially inactive
    assert.equal(mesh.state.thrustersActive, false);
    for (const vent of mesh.thrusterVents) {
      assert.equal((vent.material as THREE.MeshStandardMaterial).emissive.getHex(), 0x000000);
    }

    // Activate thrusters
    mesh.setThrustersActive(true);
    assert.equal(mesh.state.thrustersActive, true);
    for (const vent of mesh.thrusterVents) {
      assert.equal((vent.material as THREE.MeshStandardMaterial).emissive.getHex(), 0xff4500);
    }

    // Deactivate thrusters
    mesh.setThrustersActive(false);
    assert.equal(mesh.state.thrustersActive, false);
    for (const vent of mesh.thrusterVents) {
      assert.equal((vent.material as THREE.MeshStandardMaterial).emissive.getHex(), 0x000000);
    }
  });
});
