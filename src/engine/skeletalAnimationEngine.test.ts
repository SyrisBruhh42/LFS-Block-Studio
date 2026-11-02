import { describe, it, expect } from 'bun:test';
import * as THREE from 'three';
import {
  detectBoneCycles,
  validateSkinWeights,
  interpolateKeyframes
} from './skeletalAnimationEngine';

describe('Skeletal Animation Engine', () => {
  describe('detectBoneCycles', () => {
    it('should detect cycles in a simple bone hierarchy', () => {
      const bones = [
        { name: 'bone1', children: ['bone2'] },
        { name: 'bone2', children: ['bone1'] }
      ];
      expect(detectBoneCycles(bones)).toBe(true);
    });

    it('should return false for acyclic hierarchy', () => {
      const bones = [
        { name: 'root', children: ['spine'] },
        { name: 'spine', children: ['head', 'arm'] },
        { name: 'head', children: [] },
        { name: 'arm', children: [] }
      ];
      expect(detectBoneCycles(bones)).toBe(false);
    });
  });

  describe('validateSkinWeights', () => {
    it('should validate normalized weights', () => {
      const validWeights = [0.5, 0.3, 0.2, 0.0, 1.0, 0.0, 0.0, 0.0];
      expect(validateSkinWeights(validWeights)).toBe(true);
    });

    it('should invalidate unnormalized weights', () => {
      const invalidWeights = [0.5, 0.3, 0.2, 0.1, 1.0, 0.0, 0.0, 0.0];
      expect(validateSkinWeights(invalidWeights)).toBe(false);
    });
  });

  describe('interpolateKeyframes', () => {
    it('should interpolate vector3 keyframes correctly', () => {
      const v1 = new THREE.Vector3(0, 0, 0);
      const v2 = new THREE.Vector3(10, 20, 30);
      const result = interpolateKeyframes(0, 1, v1, v2, 0.5);
      expect(result.x).toBeCloseTo(5);
      expect(result.y).toBeCloseTo(10);
      expect(result.z).toBeCloseTo(15);
    });

    it('should handle out of bounds time', () => {
      const v1 = new THREE.Vector3(0, 0, 0);
      const v2 = new THREE.Vector3(10, 20, 30);
      const r1 = interpolateKeyframes(0, 1, v1, v2, -0.5);
      expect(r1.x).toBe(0);
      const r2 = interpolateKeyframes(0, 1, v1, v2, 1.5);
      expect(r2.x).toBe(10);
    });
  });
});
