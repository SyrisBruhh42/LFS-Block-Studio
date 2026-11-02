import * as THREE from 'three';

export interface BoneHierarchy {
  name: string;
  parent?: string;
  children: string[];
}

export function detectBoneCycles(bones: BoneHierarchy[]): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const boneMap = new Map<string, BoneHierarchy>();

  for (const bone of bones) {
    boneMap.set(bone.name, bone);
  }

  function dfs(nodeName: string): boolean {
    if (recursionStack.has(nodeName)) {
      return true;
    }
    if (visited.has(nodeName)) {
      return false;
    }

    visited.add(nodeName);
    recursionStack.add(nodeName);

    const node = boneMap.get(nodeName);
    if (node) {
      for (const child of node.children) {
        if (dfs(child)) {
          return true;
        }
      }
    }

    recursionStack.delete(nodeName);
    return false;
  }

  for (const bone of bones) {
    if (dfs(bone.name)) {
      return true;
    }
  }

  return false;
}

export function validateSkinWeights(weights: number[], epsilon = 1e-4): boolean {
  for (let i = 0; i < weights.length; i += 4) {
    const sum = weights[i] + weights[i + 1] + weights[i + 2] + weights[i + 3];
    if (Math.abs(sum - 1.0) > epsilon) {
      return false;
    }
  }
  return true;
}

export function interpolateKeyframes(
  t1: number,
  t2: number,
  v1: THREE.Vector3,
  v2: THREE.Vector3,
  t: number
): THREE.Vector3 {
  if (t <= t1) return v1.clone();
  if (t >= t2) return v2.clone();

  const factor = (t - t1) / (t2 - t1);
  const result = new THREE.Vector3();
  result.lerpVectors(v1, v2, factor);
  return result;
}
