import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DropPodVoxelMesh } from './dropPodVoxelMesh';

test('DropPodVoxelMesh initialization', () => {
  const mesh = new DropPodVoxelMesh();
  
  // Verify it's a THREE.Group
  assert.ok(mesh instanceof THREE.Group);
  
  // Verify parts
  assert.ok(mesh.mainBody instanceof THREE.Mesh);
  assert.ok(mesh.doors.left instanceof THREE.Mesh);
  assert.ok(mesh.doors.right instanceof THREE.Mesh);
  assert.equal(mesh.thrusterVents.length, 4);
  
  // Verify they are added to the group
  assert.ok(mesh.children.includes(mesh.mainBody));
  assert.ok(mesh.children.includes(mesh.doors.left));
  assert.ok(mesh.children.includes(mesh.doors.right));
  for (const vent of mesh.thrusterVents) {
    assert.ok(mesh.children.includes(vent));
  }
});

test('DropPodVoxelMesh openDoors', () => {
  const mesh = new DropPodVoxelMesh();
  
  const initialLeftX = mesh.doors.left.position.x;
  const initialRightX = mesh.doors.right.position.x;
  
  // Fully closed
  mesh.openDoors(0);
  assert.equal(mesh.doors.left.position.x, initialLeftX);
  assert.equal(mesh.doors.right.position.x, initialRightX);
  
  // Fully open
  mesh.openDoors(1);
  assert.notEqual(mesh.doors.left.position.x, initialLeftX);
  assert.notEqual(mesh.doors.right.position.x, initialRightX);
  assert.equal(mesh.doors.left.position.x, initialLeftX - 0.7);
  assert.equal(mesh.doors.right.position.x, initialRightX + 0.7);
  
  // Partially open (e.g. 50%)
  mesh.openDoors(0.5);
  assert.equal(mesh.doors.left.position.x, initialLeftX - 0.35);
  assert.equal(mesh.doors.right.position.x, initialRightX + 0.35);

  // Out of bounds clamped
  mesh.openDoors(-1);
  assert.equal(mesh.doors.left.position.x, initialLeftX);
  
  mesh.openDoors(2);
  assert.equal(mesh.doors.left.position.x, initialLeftX - 0.7);
});

test('DropPodVoxelMesh animateThrusters', () => {
  const mesh = new DropPodVoxelMesh();
  
  // Initial state should be inactive
  const ventMat = mesh.thrusterVents[0].material as THREE.MeshBasicMaterial;
  const initialColor = ventMat.color.getHex();
  
  // Activate
  mesh.animateThrusters(true);
  const activeColor = (mesh.thrusterVents[0].material as THREE.MeshBasicMaterial).color.getHex();
  assert.notEqual(activeColor, initialColor);
  assert.equal(activeColor, 0xffaa00);
  assert.equal(mesh.thrusterVents[0].scale.y, 1.5);
  
  // Deactivate
  mesh.animateThrusters(false);
  const deactivatedColor = (mesh.thrusterVents[0].material as THREE.MeshBasicMaterial).color.getHex();
  assert.equal(deactivatedColor, initialColor);
  assert.equal(mesh.thrusterVents[0].scale.y, 1);
});
