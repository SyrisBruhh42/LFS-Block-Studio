import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialEngineState, executeWorldEditCommand } from './worldEditEngine';
import { StudioEditorSession } from '../lib/studioEditorSession';
import { makeStudioDocument } from '../lib/studioDocument.test-fixtures';

function session() {
  const editor = new StudioEditorSession(makeStudioDocument('selection-fixture'));
  editor.setWritable(true);
  return editor;
}
function run(editor: StudioEditorSession, command: string) {
  const token = editor.getToken();
  const result = executeWorldEditCommand(editor.getEngineState(), command);
  assert.equal(result.success, true, result.message);
  return editor.transaction(command, () => { editor.setEngineState(result.nextState); }, token);
}

test('clear-selection aliases preserve build, definitions and clipboard without inventing a region', () => {
  for (const command of ['//desel', '//deselect', '//sel']) {
    const initial = createInitialEngineState();
    const block = Object.values(initial.blocks)[0];
    const state = { ...initial, pos1: { x: -2, y: 1, z: 3 }, pos2: null, clipboard: [structuredClone(block)] };
    const before = structuredClone(state);
    const result = executeWorldEditCommand(state, command);
    assert.equal(result.success, true);
    assert.equal(result.affectedCount, 0);
    assert.equal(result.nextState.pos1, null);
    assert.equal(result.nextState.pos2, null);
    assert.deepEqual(state, before);
    assert.deepEqual(result.nextState.blocks, before.blocks);
    assert.deepEqual(result.nextState.customBlocks, before.customBlocks);
    assert.deepEqual(result.nextState.clipboard, before.clipboard);
    for (const regionCommand of ['//set cobble_brick', '//walls cobble_brick', '//copy', '//cut', '//move 1 up']) {
      const rejected = executeWorldEditCommand(result.nextState, regionCommand);
      assert.equal(rejected.success, false, regionCommand);
      assert.equal(rejected.nextState, result.nextState, regionCommand);
    }
  }
});

test('clearing selection has one real session Undo/Redo and changes no authored document field', () => {
  const editor = session();
  const first = Object.values(editor.getEngineState().blocks)[0];
  assert.equal(editor.setEngineState(state => ({ ...state, pos1: { x: -4, y: 2, z: 7 }, pos2: { x: 3, y: 4, z: 8 }, clipboard: [first] })).status, 'applied');
  const before = structuredClone(editor.getSnapshot());
  const priorToken = editor.getToken();
  assert.equal(run(editor, '//desel').status, 'applied');
  assert.deepEqual(editor.getDocument(), before.document);
  assert.deepEqual(editor.getSnapshot().workspace.clipboard, before.workspace.clipboard);
  assert.equal(editor.getEngineState().pos1, null);
  assert.ok(editor.getToken().editRevision > priorToken.editRevision);
  assert.equal(editor.undo().status, 'applied');
  assert.deepEqual(editor.getSnapshot().workspace, before.workspace);
  assert.equal(editor.redo().status, 'applied');
  assert.equal(editor.getEngineState().pos1, null);
  assert.equal(editor.getEngineState().pos2, null);
  assert.deepEqual(editor.getDocument(), before.document);
});

test('clear-selection no-op retains actual pending Redo and invalid arguments reject untouched', () => {
  const editor = session();
  assert.equal(editor.setEngineState(state => ({ ...state, pos1: { x: 8, y: 2, z: -5 } })).status, 'applied');
  assert.equal(editor.undo().status, 'applied');
  const before = structuredClone(editor.getSnapshot());
  const token = editor.getToken();
  assert.equal(run(editor, '//desel').status, 'noop');
  assert.deepEqual(editor.getSnapshot(), before);
  assert.deepEqual(editor.getToken(), token);
  const rejected = executeWorldEditCommand(editor.getEngineState(), '//desel extra');
  assert.equal(rejected.success, false);
  assert.equal(rejected.nextState, editor.getEngineState());
  assert.equal(editor.redo().status, 'applied');
  assert.deepEqual(editor.getEngineState().pos1, { x: 8, y: 2, z: -5 });
});
