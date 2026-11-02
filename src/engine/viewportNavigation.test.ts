import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  cameraFromBookmark, captureCameraBookmark, computeCameraFrame,
  computeWorldCameraBounds, perspectiveSpan, resizeViewportCamera,
  stepCameraBookmark, CAMERA_STEP_ACTIONS,
} from './viewportNavigation';
import { ViewportGestureTracker, shouldIgnoreViewportKeyboard } from './viewportInput';
import { createDefaultHotkeyConfig, loadHotkeyConfig, matchesKeyBinding } from './hotkeys';
import type { CustomBlockDefinition, PlacedBlock } from './types';

function corners(box: THREE.Box3) {
  return [box.min.x, box.max.x].flatMap(x => [box.min.y, box.max.y].flatMap(y => [box.min.z, box.max.z].map(z => new THREE.Vector3(x, y, z))));
}

test('single-tap screen pan preserves distance and projection in perspective and orthographic views', () => {
  const camera = new THREE.PerspectiveCamera(48, 2, 0.1, 1000); camera.position.set(10, 8, 12); camera.lookAt(0, 0, 0);
  for (const projection of ['perspective', 'orthographic'] as const) {
    const source = { ...captureCameraBookmark(camera, new THREE.Vector3(), 'pan'), projection, verticalSpan: 20, zoom: 2 };
    const original = structuredClone(source);
    for (const [forward, reverse] of [['pan-left', 'pan-right'], ['pan-up', 'pan-down']] as const) {
      const moved = stepCameraBookmark(source, forward, 2)!; assert.ok(moved);
      assert.notDeepEqual(moved.position, source.position); assert.notDeepEqual(moved.target, source.target);
      assert.ok(Math.abs(new THREE.Vector3().fromArray(moved.position).distanceTo(new THREE.Vector3().fromArray(moved.target)) - camera.position.length()) < 1e-10);
      const restored = stepCameraBookmark(moved, reverse, 2)!;
      assert.ok(new THREE.Vector3().fromArray(restored.position).distanceTo(camera.position) < 1e-10);
      assert.ok(new THREE.Vector3().fromArray(restored.target).length() < 1e-10);
      assert.equal(moved.projection, projection); assert.equal(moved.zoom, source.zoom);
    }
    assert.deepEqual(source, original);
  }
});

test('single-tap orbit works from all orthographic axes without losing pivot or distance', () => {
  for (const [position, up] of [[[0, 10, 0], [0, 0, -1]], [[0, 0, 10], [0, 1, 0]], [[10, 0, 0], [0, 1, 0]]] as const) {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000); camera.position.fromArray(position); camera.up.fromArray(up); camera.lookAt(0, 0, 0);
    const source = captureCameraBookmark(camera, new THREE.Vector3(), 'orbit');
    for (const action of ['orbit-left', 'orbit-right', 'orbit-up', 'orbit-down'] as const) {
      const next = stepCameraBookmark(source, action, 1)!; assert.ok(next);
      assert.deepEqual(next.target, source.target); assert.equal(next.projection, 'orthographic'); assert.notDeepEqual(next.position, source.position);
      assert.ok(Math.abs(new THREE.Vector3().fromArray(next.position).length() - 10) < 1e-10);
      const view = cameraFromBookmark(next, 1); assert.ok(view.matrixWorld.elements.every(Number.isFinite));
    }
  }
});

test('single-tap zoom preserves working point and uses projection-appropriate magnification', () => {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000); camera.position.set(4, 5, 16); const target = new THREE.Vector3(4, 5, 6); camera.lookAt(target);
  const source = captureCameraBookmark(camera, target, 'fly');
  const near = stepCameraBookmark(source, 'zoom-in', 1)!; assert.deepEqual(near.target, source.target); assert.equal(near.position[2], 14); assert.equal(near.mode, 'fly');
  const restored = stepCameraBookmark(near, 'zoom-out', 1)!; assert.deepEqual(restored.position, source.position);
  const ortho = { ...source, projection: 'orthographic' as const };
  const magnified = stepCameraBookmark(ortho, 'zoom-in', 1)!; assert.deepEqual(magnified.position, ortho.position); assert.equal(magnified.zoom, 1.25); assert.equal(magnified.verticalSpan, ortho.verticalSpan);
});

test('step navigation refuses degenerate camera data and bounds repeated navigation', () => {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1000); camera.position.set(0, 0, 10); const source = captureCameraBookmark(camera, new THREE.Vector3(), 'orbit');
  for (const invalid of [{ ...source, position: [0, 0, 0] }, { ...source, up: [0, 0, 1] }, { ...source, zoom: Infinity }, { ...source, target: [NaN, 0, 0] }]) {
    assert.equal(stepCameraBookmark(invalid as typeof source, 'pan-left', 1), null);
  }
  assert.equal(stepCameraBookmark(source, 'zoom-in', NaN), null);
  let next = source;
  for (let i = 0; i < 1000; i++) next = stepCameraBookmark(next, CAMERA_STEP_ACTIONS[i % CAMERA_STEP_ACTIONS.length], 1) ?? next;
  assert.ok([...next.position, ...next.target, ...next.up, next.zoom].every(Number.isFinite));
  assert.equal(source.position[2], 10);
});

test('framing contains every corner for wide/portrait perspective views at nonzero coordinates', () => {
  const box = new THREE.Box3(new THREE.Vector3(-300, 40, 600), new THREE.Vector3(200, 54, 650));
  for (const aspect of [0.35, 1, 2.4]) {
    const fit = computeCameraFrame(box, aspect);
    const camera = new THREE.PerspectiveCamera(48, aspect, fit.near, fit.far);
    camera.position.copy(fit.center).addScaledVector(new THREE.Vector3(1, 2, 3).normalize(), fit.distance);
    camera.lookAt(fit.center);
    camera.updateMatrixWorld();
    for (const corner of corners(box)) {
      const ndc = corner.project(camera);
      assert.ok(Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && Math.abs(ndc.z) < 1, JSON.stringify({ aspect, ndc }));
    }
  }
});

test('orthographic top/front/side framing fits and parallel lines have no perspective shrink', () => {
  const box = new THREE.Box3(new THREE.Vector3(-10, -3, 5), new THREE.Vector3(6, 20, 11));
  for (const [direction, up] of [
    [[0, 1, 0], [0, 0, -1]], [[0, 0, 1], [0, 1, 0]], [[1, 0, 0], [0, 1, 0]],
  ]) {
    const fit = computeCameraFrame(box, 0.5);
    const camera = cameraFromBookmark({
      projection: 'orthographic', position: fit.center.clone().addScaledVector(new THREE.Vector3(...direction), fit.distance).toArray(),
      target: fit.center.toArray(), up: up as [number, number, number], zoom: 1,
      verticalSpan: fit.verticalSpan, near: fit.near, far: fit.far, mode: 'orbit',
    }, 0.5);
    assert.ok(camera instanceof THREE.OrthographicCamera);
    for (const corner of corners(box)) {
      const ndc = corner.project(camera);
      assert.ok(Math.abs(ndc.x) < 1 && Math.abs(ndc.y) < 1 && Math.abs(ndc.z) < 1);
    }
    const side = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const widthAt = (depth: number) => {
      const p = fit.center.clone().addScaledVector(new THREE.Vector3(...direction), depth);
      return p.clone().add(side).project(camera).distanceTo(p.clone().sub(side).project(camera));
    };
    assert.ok(Math.abs(widthAt(0) - widthAt(10)) < 1e-10);
  }
});

test('empty, degenerate and nonfinite bounds produce a usable frame', () => {
  for (const box of [new THREE.Box3(), new THREE.Box3(new THREE.Vector3(), new THREE.Vector3()), new THREE.Box3(new THREE.Vector3(-Infinity, 0, 0), new THREE.Vector3(Infinity, 1, 1))]) {
    const frame = computeCameraFrame(box, NaN);
    assert.ok([...frame.center.toArray(), frame.distance, frame.verticalSpan, frame.near, frame.far].every(Number.isFinite));
    assert.ok(frame.distance > 0 && frame.far > frame.near);
  }
});

test('bookmark restore preserves camera, projection, pivot and apparent zoom after resize', () => {
  const target = new THREE.Vector3(4, 5, 6);
  const camera = new THREE.OrthographicCamera(-20, 20, 10, -10, 0.1, 400);
  camera.position.set(4, 25, 6); camera.up.set(0, 0, -1); camera.zoom = 2; camera.lookAt(target);
  const bookmark = captureCameraBookmark(camera, target, 'pan');
  const restored = cameraFromBookmark(bookmark, 0.5) as THREE.OrthographicCamera;
  assert.deepEqual(restored.position.toArray(), camera.position.toArray());
  assert.deepEqual(restored.up.toArray(), [0, 0, -1]);
  assert.equal(restored.zoom, 2);
  assert.equal((restored.top - restored.bottom) / restored.zoom, 10);
  resizeViewportCamera(restored, 3);
  assert.equal((restored.right - restored.left) / (restored.top - restored.bottom), 3);
  assert.deepEqual(bookmark.target, [4, 5, 6]);
  assert.ok(Math.abs(perspectiveSpan(10, 90) - 20) < 1e-10);
});

test('frame-all bounds include rotated/scaled footprints rather than only anchor cells', () => {
  const definition: CustomBlockDefinition = { id: 'wide', name: 'Wide', shape: 'brick', width: 8, depth: 2, heightPlates: 6, color: '#fff', texturePattern: 'smooth_abs', materialFinish: 'matte', hasStuds: false };
  const block: PlacedBlock = { id: 'a', blockDefId: 'wide', position: { x: 100, y: -4, z: 20 }, rotation: 90, customScale: { x: 2, y: 3, z: 1 } };
  const bounds = computeWorldCameraBounds({ a: block }, { wide: definition });
  assert.ok(bounds.containsPoint(new THREE.Vector3(99.5, -4, 4.5)));
  assert.ok(bounds.containsPoint(new THREE.Vector3(101.5, 2, 20.5)));
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).z - 16) < 1e-8);
});

test('drag that returns to origin and fast drags remain camera-owned', () => {
  const tracker = new ViewportGestureTracker();
  tracker.begin(1, 5, 5, 'edit'); tracker.move(1, 100, 5); tracker.move(1, 5, 5);
  assert.equal(tracker.finish(1, 5, 5), 'camera');
  tracker.begin(2, 0, 0, 'edit');
  assert.equal(tracker.finish(2, 20, 0), 'camera');
  tracker.begin(3, 0, 0, 'edit');
  assert.equal(tracker.finish(3, 2, 2), 'edit');
});

test('cancellation and outside-origin releases cannot commit a click', () => {
  const tracker = new ViewportGestureTracker();
  tracker.begin(1, 0, 0, 'edit'); tracker.cancel();
  assert.equal(tracker.finish(1, 0, 0), undefined);
  assert.equal(tracker.finish(99, 0, 0), undefined);
  tracker.begin(2, 0, 0, 'camera');
  assert.equal(tracker.finish(2, 0, 0), 'camera');
});

test('multi-pointer navigation never turns the remaining finger back into an edit', () => {
  const tracker = new ViewportGestureTracker();
  tracker.begin(1, 0, 0, 'edit'); tracker.begin(2, 20, 0, 'edit');
  assert.equal(tracker.finish(2, 20, 0), 'camera');
  assert.equal(tracker.finish(1, 0, 0), 'camera');
  tracker.begin(3, 0, 0, 'stylus'); tracker.move(3, 50, 50);
  assert.equal(tracker.finish(3, 50, 50), 'stylus');
});

test('IME and consumed key events never become viewport shortcuts', () => {
  const base = { target: null, defaultPrevented: false, isComposing: false, keyCode: 87 };
  assert.equal(shouldIgnoreViewportKeyboard(base), false);
  assert.equal(shouldIgnoreViewportKeyboard({ ...base, isComposing: true }), true);
  assert.equal(shouldIgnoreViewportKeyboard({ ...base, keyCode: 229 }), true);
  assert.equal(shouldIgnoreViewportKeyboard({ ...base, defaultPrevented: true }), true);
  assert.equal(matchesKeyBinding({ ...base, isComposing: true, code: 'KeyW', key: 'w' } as KeyboardEvent, 'KeyW'), false);
});

test('default keys are unique, Tab is free, and saved custom bindings remain untouched', () => {
  const defaults = createDefaultHotkeyConfig();
  const keys = Object.values(defaults.bindings);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.includes('Tab'), false);
  const custom = { ...defaults, bindings: { ...defaults.bindings, resetCamera: 'KeyV', toggleSymmetryMirror: 'KeyV', acceptCopilotGhost: 'Tab' } };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify(custom) } });
  try { assert.deepEqual(loadHotkeyConfig().bindings, custom.bindings); }
  finally { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); }
});
