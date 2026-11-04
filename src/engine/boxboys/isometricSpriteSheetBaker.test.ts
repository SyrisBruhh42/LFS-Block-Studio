import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IsometricSpriteSheetBaker } from './isometricSpriteSheetBaker.ts';

test('IsometricSpriteSheetBaker', async (t) => {
  await t.test('initializes with default config', () => {
    const baker = new IsometricSpriteSheetBaker();
    const config = baker.getConfig();
    assert.equal(config.frameSize, 128);
    assert.equal(config.directions, 8);
    assert.equal(config.distance, 100);
    assert.ok(Math.abs(config.isometricAngle - Math.atan(1 / Math.sqrt(2))) < 0.0001);
  });

  await t.test('calculates correct layout for 8 directions', () => {
    const baker = new IsometricSpriteSheetBaker({ frameSize: 64, directions: 8 });
    const layout = baker.getLayout();
    assert.equal(layout.frames, 8);
    assert.equal(layout.columns, 4);
    assert.equal(layout.rows, 2);
    assert.equal(layout.sheetWidth, 256);
    assert.equal(layout.sheetHeight, 128);
  });

  await t.test('calculates correct layout for generic directions', () => {
    const baker = new IsometricSpriteSheetBaker({ frameSize: 32, directions: 5 });
    const layout = baker.getLayout();
    assert.equal(layout.frames, 5);
    assert.equal(layout.columns, 3);
    assert.equal(layout.rows, 2);
    assert.equal(layout.sheetWidth, 96);
    assert.equal(layout.sheetHeight, 64);
  });

  await t.test('getCameraForDirection computes correct deterministic isometric angles', () => {
    const baker = new IsometricSpriteSheetBaker({ distance: 50 });
    const cam0 = baker.getCameraForDirection(0);
    
    // Direction 0: yaw=0, pitch=isometricAngle
    // Should be at distance 50, moved up on Y and on Z
    assert.ok(cam0.position.y > 0, 'Camera should be pitched up');
    assert.ok(cam0.position.z > 0, 'Camera should be facing Z axis');
    assert.ok(Math.abs(cam0.position.x) < 1e-5, 'Camera x should be 0');
    
    // LookAt center
    const lookAtVec = new THREE.Vector3(0, 0, -1).applyQuaternion(cam0.quaternion);
    const target = cam0.position.clone().add(lookAtVec.multiplyScalar(50));
    assert.ok(target.length() < 0.001, 'Camera should look at origin');

    const cam2 = baker.getCameraForDirection(2); // 90 degrees
    assert.ok(cam2.position.y > 0, 'Camera should be pitched up');
    assert.ok(Math.abs(cam2.position.z) < 1e-5, 'Camera z should be near 0 at 90 deg yaw');
    assert.ok(cam2.position.x > 0, 'Camera x should be positive at 90 deg yaw');
  });

  await t.test('bake method correctly coordinates rendering passes', () => {
    const baker = new IsometricSpriteSheetBaker({ frameSize: 64, directions: 8 });
    
    let renderCalls = 0;
    const mockRenderer = {
      getClearAlpha: () => 1,
      getClearColor: (c: THREE.Color) => { c.setHex(0xffffff); return c; },
      setClearColor: () => {},
      getRenderTarget: () => null,
      autoClear: true,
      setRenderTarget: () => {},
      clear: () => {},
      setViewport: () => {},
      setScissor: () => {},
      setScissorTest: () => {},
      render: () => {
        renderCalls++;
      }
    } as unknown as THREE.WebGLRenderer;

    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(mesh);

    const result = baker.bake(mockRenderer, scene);
    
    // 8 directions * 2 passes (albedo + normal) = 16 renders
    assert.equal(renderCalls, 16);
    
    assert.ok(result.albedoTarget instanceof THREE.WebGLRenderTarget);
    assert.ok(result.normalTarget instanceof THREE.WebGLRenderTarget);
    assert.equal(result.albedoTarget.width, 256);
    assert.equal(result.albedoTarget.height, 128);
  });
});
