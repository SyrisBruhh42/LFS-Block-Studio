import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHotkeyCapture } from './HotkeysModal';
import { dispatchViewportDrop, ghostShortcutHint } from './SkyblockViewport';
import { MomentaryCameraView, cameraFromBookmark, captureCameraBookmark, type CameraBookmark } from '../engine/viewportNavigation';
import * as THREE from 'three';

function documentWithModal(options?: { hidden?: boolean; ariaHidden?: boolean; visible?: boolean }): Document {
  return {
    querySelectorAll: () => options ? [{
      hidden: Boolean(options.hidden),
      getAttribute: (name: string) => name === 'aria-hidden' && options.ariaHidden ? 'true' : null,
      getClientRects: () => options.visible === false ? [] : [{}],
    }] : [],
  } as unknown as Document;
}
const key = (overrides: Partial<KeyboardEvent> = {}) => ({ code: 'KeyR', key: 'r', isComposing: false, keyCode: 82, repeat: false, ...overrides });

test('viewport command drops cannot execute while root input or a visible modal owns input', () => {
  const calls: string[] = [];
  const command = JSON.stringify({ type: 'command', targetId: '//clear' });
  const actions = { runCommand: (value: string) => calls.push(value) };
  assert.equal(dispatchViewportDrop(command, true, documentWithModal(), actions), false);
  assert.equal(dispatchViewportDrop(command, false, documentWithModal({}), actions), false);
  assert.deepEqual(calls, []);
  assert.equal(dispatchViewportDrop(command, false, documentWithModal(), actions), true);
  assert.deepEqual(calls, ['//clear']);
});

test('hidden dialogs do not block drops and blocked equip drops do not change tools or blocks', () => {
  const calls: string[] = [];
  const actions = { selectBlock: (id: string) => calls.push(id), selectTool: (mode: string) => calls.push(mode) };
  for (const type of ['block', 'tool']) {
    const payload = JSON.stringify({ type, targetId: type === 'block' ? 'oak_plank' : 'erase' });
    assert.equal(dispatchViewportDrop(payload, true, documentWithModal(), actions), false);
  }
  assert.deepEqual(calls, []);
  for (const options of [{ hidden: true }, { ariaHidden: true }, { visible: false }]) {
    assert.equal(dispatchViewportDrop('{"type":"block","targetId":"oak_plank"}', false, documentWithModal(options), actions), true);
  }
  assert.deepEqual(calls, ['oak_plank', 'oak_plank', 'oak_plank']);
  for (const invalid of ['not json', '{}', '{"type":"command","targetId":""}', '{"type":"macro_loop","targetId":"x"}']) {
    assert.equal(dispatchViewportDrop(invalid, false, documentWithModal(), actions), false);
  }
});

test('closed or inactive hotkey capture ignores input; IME and dead keys stop capture without binding', () => {
  assert.equal(classifyHotkeyCapture(false, true, key()), 'inactive');
  assert.equal(classifyHotkeyCapture(true, false, key()), 'inactive');
  for (const event of [key({ isComposing: true }), key({ keyCode: 229 }), key({ key: 'Process' }), key({ key: 'Dead' })]) {
    assert.equal(classifyHotkeyCapture(true, true, event), 'composition');
  }
  assert.equal(classifyHotkeyCapture(true, true, key({ repeat: true })), 'ignore');
  assert.equal(classifyHotkeyCapture(true, true, key()), 'bind');
});

test('Tab remains focus traversal and Escape cancels rather than becoming a stored shortcut', () => {
  assert.equal(classifyHotkeyCapture(true, true, key({ code: 'Tab', key: 'Tab' })), 'reserved-tab');
  assert.equal(classifyHotkeyCapture(true, true, key({ code: '', key: 'Tab' })), 'reserved-tab');
  assert.equal(classifyHotkeyCapture(true, true, key({ code: 'Escape', key: 'Escape' })), 'cancel');
});

test('ghost shortcut help follows the configured key and explains reserved legacy Tab', () => {
  assert.equal(ghostShortcutHint('Enter').label, 'Enter');
  assert.equal(ghostShortcutHint('KeyQ').label, 'Q');
  assert.match(ghostShortcutHint('KeyQ').description, /Q/);
  assert.match(ghostShortcutHint('Tab').description, /reserved.*focus/);
  assert.equal(ghostShortcutHint('Tab').label, 'Rebind Tab in Controls');
  assert.match(ghostShortcutHint('').description, /No keyboard shortcut/);
});

function priorView(): CameraBookmark {
  return { projection: 'orthographic', position: [15, 38, -7], target: [15, 2, -7], up: [0, 0, -1], zoom: 2.5, verticalSpan: 80, near: 0.01, far: 1000, mode: 'pan' };
}

test('momentary look restores the complete prior orthographic view and isolates mutable source data', () => {
  const view = new MomentaryCameraView();
  const original = priorView();
  const expected = structuredClone(original);
  assert.equal(view.begin(original), true);
  original.position[0] = 999;
  original.target[1] = -800;
  const restored = view.end();
  assert.deepEqual(restored, expected);
  const camera = cameraFromBookmark(restored!, 1.7);
  assert.ok(camera instanceof THREE.OrthographicCamera);
  assert.deepEqual(captureCameraBookmark(camera, new THREE.Vector3().fromArray(restored!.target), restored!.mode), expected);
  assert.equal(view.active, false);
});

test('momentary look tolerates duplicate begin, coalesced release and cancellation by ordinary navigation', () => {
  const view = new MomentaryCameraView();
  assert.equal(view.end(), null); // A fast press/release can deliver only end-look.
  const original = priorView();
  assert.equal(view.begin(original), true);
  assert.equal(view.begin({ ...original, mode: 'fly', position: [99, 99, 99] }), false);
  assert.deepEqual(view.end(), original);
  assert.equal(view.end(), null);
  assert.equal(view.begin(original), true);
  view.cancel(); // The viewport calls cancel before any ordinary explicit action.
  assert.equal(view.end(), null); // A stale key release cannot restore the earlier view.
});
