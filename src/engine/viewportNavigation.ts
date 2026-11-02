import * as THREE from 'three';
import type { CustomBlockDefinition, PlacedBlock } from './types';

export type ViewportNavigationMode = 'orbit' | 'pan' | 'fly';
export const CAMERA_STEP_ACTIONS = Object.freeze(['pan-left', 'pan-right', 'pan-up', 'pan-down', 'orbit-left', 'orbit-right', 'orbit-up', 'orbit-down', 'zoom-in', 'zoom-out'] as const);
export type CameraStepAction = typeof CAMERA_STEP_ACTIONS[number];
export type ViewportNavigationAction = ViewportNavigationMode | CameraStepAction | 'frame-selection' | 'frame-all' | 'home' | 'previous' | 'top' | 'front' | 'side' | 'begin-look' | 'end-look';
export interface ViewportNavigationRequest {
  /** Monotonically increasing within a mounted viewport; repeat actions use a new id. */
  id: number;
  action: ViewportNavigationAction;
}
export interface ViewportNavigationState {
  mode: ViewportNavigationMode;
  projection: 'perspective' | 'orthographic';
  canGoBack: boolean;
}
export type ViewportCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

/** Authored bounds include inactive chunks, rotated footprints and micro-voxels. */
export function computeWorldCameraBounds(blocks: Record<string, PlacedBlock>, definitions: Record<string, CustomBlockDefinition>): THREE.Box3 {
  const result = new THREE.Box3();
  for (const block of Object.values(blocks)) {
    const def = definitions[block.blockDefId];
    if (!def || ![block.position.x, block.position.y, block.position.z, block.rotation].every(Number.isFinite)) continue;
    const scale = block.customScale ?? def.defaultScale ?? { x: 1, y: 1, z: 1 };
    if (![scale.x, scale.y, scale.z, def.width, def.depth, def.heightPlates].every(value => Number.isFinite(value) && value > 0)) continue;
    const width = Math.max(0.2, def.width * scale.x);
    const depth = Math.max(0.2, def.depth * scale.z);
    const height = Math.max(0.15, def.heightPlates / 3 * scale.y);
    const local = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(width - 0.5, height + (def.hasStuds ? 0.2 : 0), depth - 0.5));
    if (def.shape === 'micro_voxel' && def.voxels?.length) {
      local.makeEmpty();
      for (const voxel of def.voxels) {
        if (![voxel.x, voxel.y, voxel.z].every(Number.isFinite)) continue;
        local.expandByPoint(new THREE.Vector3((-0.5 + voxel.x / 8) * scale.x + (width - 1) / 2, voxel.y / 8 * scale.y, (-0.5 + voxel.z / 8) * scale.z + (depth - 1) / 2));
        local.expandByPoint(new THREE.Vector3((-0.5 + (voxel.x + 1) / 8) * scale.x + (width - 1) / 2, (voxel.y + 1) / 8 * scale.y, (-0.5 + (voxel.z + 1) / 8) * scale.z + (depth - 1) / 2));
      }
    }
    const transform = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(block.rotation));
    transform.setPosition(block.position.x, block.position.y, block.position.z);
    result.union(local.applyMatrix4(transform));
  }
  return result;
}

export interface CameraBookmark {
  projection: ViewportNavigationState['projection'];
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  zoom: number;
  verticalSpan: number;
  near: number;
  far: number;
  mode: ViewportNavigationMode;
}

export function isCameraStepAction(action: ViewportNavigationAction): action is CameraStepAction {
  return (CAMERA_STEP_ACTIONS as readonly string[]).includes(action);
}

/** Screen-relative single-tap alternatives. Authored geometry and edit history are not inputs. */
export function stepCameraBookmark(source: CameraBookmark, action: CameraStepAction, aspect: number): CameraBookmark | null {
  if (!isCameraStepAction(action) || !Number.isFinite(aspect) || aspect <= 0) return null;
  if (![source.position, source.target, source.up].every(values => values.length === 3 && values.every(Number.isFinite))
    || ![source.zoom, source.verticalSpan, source.near, source.far].every(value => Number.isFinite(value) && value > 0)
    || source.far <= source.near) return null;
  const position = new THREE.Vector3().fromArray(source.position), target = new THREE.Vector3().fromArray(source.target);
  const up = new THREE.Vector3().fromArray(source.up).normalize(), offset = position.clone().sub(target);
  const distance = offset.length();
  if (distance < 0.000001 || up.lengthSq() < 0.5) return null;
  const right = new THREE.Vector3().crossVectors(offset.clone().negate().normalize(), up).normalize();
  if (right.lengthSq() < 0.5) return null;
  const screenUp = new THREE.Vector3().crossVectors(right, offset.clone().negate().normalize()).normalize();
  const next = structuredClone(source);
  if (action.startsWith('pan-')) {
    const span = source.projection === 'orthographic' ? source.verticalSpan / source.zoom : perspectiveSpan(distance, 48, source.zoom);
    const horizontal = action === 'pan-left' || action === 'pan-right';
    const sign = action === 'pan-left' || action === 'pan-down' ? -1 : 1;
    const delta = (horizontal ? right : screenUp).clone().multiplyScalar(span * (horizontal ? aspect : 1) * 0.15 * sign);
    next.position = position.add(delta).toArray(); next.target = target.add(delta).toArray();
  } else if (action.startsWith('orbit-')) {
    const horizontal = action === 'orbit-left' || action === 'orbit-right';
    const sign = action === 'orbit-left' || action === 'orbit-up' ? -1 : 1;
    const rotation = new THREE.Quaternion().setFromAxisAngle(horizontal ? screenUp : right, THREE.MathUtils.degToRad(15 * sign));
    next.position = target.clone().add(offset.applyQuaternion(rotation)).toArray();
    next.up = up.applyQuaternion(rotation).toArray();
  } else if (source.projection === 'orthographic') {
    next.zoom = THREE.MathUtils.clamp(source.zoom * (action === 'zoom-in' ? 1.25 : 0.8), 0.0001, 10000);
  } else {
    const nextDistance = THREE.MathUtils.clamp(distance * (action === 'zoom-in' ? 0.8 : 1.25), Math.max(0.1, source.near * 2), Math.max(0.1, source.far * 0.8));
    next.position = target.add(offset.multiplyScalar(nextDistance / distance)).toArray();
  }
  if (![...next.position, ...next.target, ...next.up].every(value => Number.isFinite(value) && Math.abs(value) <= 1e12)) return null;
  return JSON.stringify(next) === JSON.stringify(source) ? null : next;
}

/** A temporary view is private to its hold gesture, separate from camera history. */
export class MomentaryCameraView {
  private bookmark: CameraBookmark | null = null;
  get active(): boolean { return this.bookmark !== null; }
  begin(bookmark: CameraBookmark): boolean {
    if (this.bookmark) return false;
    this.bookmark = structuredClone(bookmark);
    return true;
  }
  end(): CameraBookmark | null {
    const previous = this.bookmark;
    this.bookmark = null;
    return previous;
  }
  cancel(): void { this.bookmark = null; }
}

/** A sphere enclosing the bounds fits regardless of camera orientation. */
export function computeCameraFrame(bounds: THREE.Box3, aspect: number, verticalFov = 48) {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const finiteBounds = !bounds.isEmpty() && [...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite);
  const box = finiteBounds ? bounds : new THREE.Box3(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 4, 4));
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
  const vHalf = THREE.MathUtils.degToRad(Math.max(10, Math.min(120, verticalFov))) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * safeAspect);
  const distance = radius * 1.15 / Math.sin(Math.min(vHalf, hHalf));
  return {
    center,
    distance,
    verticalSpan: (radius * 2 * 1.15) / Math.min(1, safeAspect),
    near: Math.max(0.01, distance / 10000),
    far: Math.max(250, distance + radius * 4),
  };
}

/** Match the apparent size at the orbit target when switching projection. */
export function perspectiveSpan(distance: number, fov = 48, zoom = 1): number {
  return 2 * Math.max(0.01, distance) * Math.tan(THREE.MathUtils.degToRad(fov) / 2) / Math.max(0.001, zoom);
}

export function resizeViewportCamera(camera: ViewportCamera, aspect: number): void {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = safeAspect;
  } else {
    const halfHeight = Math.max(0.01, (camera.top - camera.bottom) / 2);
    camera.left = -halfHeight * safeAspect;
    camera.right = halfHeight * safeAspect;
  }
  camera.updateProjectionMatrix();
}

export function captureCameraBookmark(camera: ViewportCamera, target: THREE.Vector3, mode: ViewportNavigationMode): CameraBookmark {
  return {
    projection: camera instanceof THREE.OrthographicCamera ? 'orthographic' : 'perspective',
    position: camera.position.toArray(), target: target.toArray(), up: camera.up.toArray(),
    zoom: camera.zoom,
    verticalSpan: camera instanceof THREE.OrthographicCamera ? camera.top - camera.bottom : perspectiveSpan(camera.position.distanceTo(target), camera.fov),
    near: camera.near, far: camera.far, mode,
  };
}

export function cameraFromBookmark(bookmark: CameraBookmark, aspect: number): ViewportCamera {
  const half = bookmark.verticalSpan / 2;
  const camera = bookmark.projection === 'orthographic'
    ? new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, bookmark.near, bookmark.far)
    : new THREE.PerspectiveCamera(48, aspect, bookmark.near, bookmark.far);
  camera.position.fromArray(bookmark.position);
  camera.up.fromArray(bookmark.up);
  camera.zoom = bookmark.zoom;
  camera.lookAt(new THREE.Vector3().fromArray(bookmark.target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}
