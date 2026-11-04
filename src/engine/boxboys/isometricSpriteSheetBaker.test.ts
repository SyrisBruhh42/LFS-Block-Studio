import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IsometricSpriteSheetBaker } from './isometricSpriteSheetBaker.js';

test('IsometricSpriteSheetBaker correctly renders 8 directions for normal and albedo passes', () => {
    let renderCallCount = 0;

    // Mock WebGLRenderer because WebGL is not available in node
    const mockRenderer = {
        render: (scene: THREE.Scene, camera: THREE.Camera) => {
            renderCallCount++;
        },
        domElement: null // No canvas element in node
    } as unknown as THREE.WebGLRenderer;

    const baker = new IsometricSpriteSheetBaker(128);
    const mockTarget = new THREE.Object3D();

    const result = baker.bake(mockTarget, mockRenderer);

    // Total frames = 8 directions. For each direction: 1 albedo pass + 1 normal pass = 16 renders total.
    assert.equal(renderCallCount, 16);
    assert.equal(result.frames, 8);
});
