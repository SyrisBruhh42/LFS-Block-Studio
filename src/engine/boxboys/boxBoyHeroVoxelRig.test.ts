import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxBoyHeroVoxelRig } from './boxBoyHeroVoxelRig';

test('BoxBoyHeroVoxelRig initializes correctly', (t) => {
  const rig = new BoxBoyHeroVoxelRig();

  // Root tests
  assert.ok(rig.root, 'Root group should exist');
  assert.strictEqual(rig.root.name, 'BoxBoyHero', 'Root name should be BoxBoyHero');
  assert.strictEqual(rig.root.children.length, 6, 'Root should have 6 main children (head, body, arms, legs)');

  // Body part tests
  assert.ok(rig.head, 'Head mesh should exist');
  assert.strictEqual(rig.head.name, 'Head');
  
  assert.ok(rig.body, 'Body mesh should exist');
  assert.strictEqual(rig.body.name, 'Body');

  assert.ok(rig.leftArm, 'LeftArm mesh should exist');
  assert.strictEqual(rig.leftArm.name, 'LeftArm');

  assert.ok(rig.rightArm, 'RightArm mesh should exist');
  assert.strictEqual(rig.rightArm.name, 'RightArm');

  assert.ok(rig.leftLeg, 'LeftLeg mesh should exist');
  assert.strictEqual(rig.leftLeg.name, 'LeftLeg');

  assert.ok(rig.rightLeg, 'RightLeg mesh should exist');
  assert.strictEqual(rig.rightLeg.name, 'RightLeg');

  // Socket tests
  const rightHandSocket = rig.getSocket('rightHand');
  assert.ok(rightHandSocket, 'rightHand socket should exist');
  assert.strictEqual(rightHandSocket.name, 'rightHand');
  assert.strictEqual(rightHandSocket.bone.name, 'Socket_rightHand');
  assert.strictEqual(rightHandSocket.bone.parent, rig.rightArm, 'rightHand socket should be parented to rightArm');

  const leftHandSocket = rig.getSocket('leftHand');
  assert.ok(leftHandSocket, 'leftHand socket should exist');
  assert.strictEqual(leftHandSocket.bone.parent, rig.leftArm, 'leftHand socket should be parented to leftArm');

  const headSocket = rig.getSocket('head');
  assert.ok(headSocket, 'head socket should exist');
  assert.strictEqual(headSocket.bone.parent, rig.head, 'head socket should be parented to head');

  // Missing socket test
  const missingSocket = rig.getSocket('nonExistent');
  assert.strictEqual(missingSocket, undefined, 'Missing socket should return undefined');
});

test('BoxBoyHeroVoxelRig returns root correctly via getRoot()', (t) => {
  const rig = new BoxBoyHeroVoxelRig();
  assert.strictEqual(rig.getRoot(), rig.root, 'getRoot() should return the root object');
});
