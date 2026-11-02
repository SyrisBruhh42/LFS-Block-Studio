import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { prepareStudioRecipe, STUDIO_RECIPE_LIMITS, StudioRecipeError } from './studioRecipe';
import { createInitialEngineState } from './worldEditEngine';
import { DEFAULT_COMMAND_MACRO_LOOPS } from './openSourceBlockMarket';
import type { CommandMacroLoop, WorldEditEngineState } from './types';

function state(): WorldEditEngineState {
  return { ...structuredClone(createInitialEngineState()), blocks: {}, pos1: { x: 0, y: 0, z: 0 }, pos2: { x: 0, y: 0, z: 0 } };
}
function macro(patch: Partial<CommandMacroLoop> = {}): CommandMacroLoop {
  return { id: 'recipe', name: 'Fixture', description: 'Fixture recipe', commands: ['//set {active}'], iterations: 1, intervalMs: 0, iconColor: '#ffffff', ...patch };
}
function options(patch: Partial<Parameters<typeof prepareStudioRecipe>[0]> = {}) {
  return { state: state(), macro: macro(), activeBlockId: 'grass_brick', ...patch };
}
function error(code: StudioRecipeError['code']) { return (reason: unknown) => reason instanceof StudioRecipeError && reason.code === code; }
async function flush() { await Promise.resolve(); await Promise.resolve(); }

test('successful recipe prepares complete isolated state and discards all temporary history', async () => {
  const input = state(); input.undoStack = [{ label: 'existing undo', blocks: {} }]; input.redoStack = [{ label: 'existing redo', blocks: {} }];
  const before = structuredClone(input); const progress: number[][] = [];
  const result = await prepareStudioRecipe(options({ state: input, macro: macro({ commands: ['//set {active}', '//copy', '//pos1 1 0 0', '//paste'] }), onProgress: (done, total) => progress.push([done, total]) }));
  assert.equal(result.commands, 4); assert.deepEqual(progress, [[1, 4], [2, 4], [3, 4], [4, 4]]);
  assert.deepEqual(Object.keys(result.state.blocks).sort(), ['0,0,0', '1,0,0']);
  assert.deepEqual(result.state.undoStack, []); assert.deepEqual(result.state.redoStack, []);
  assert.equal(result.state.clipboard.length, 1); assert.deepEqual(input, before);
  result.state.customBlocks.grass_brick.color = '#000000'; result.state.blocks['0,0,0'].position.y = 10;
  assert.deepEqual(input, before);
});

test('partial command failure exposes no prepared result and leaves the source unchanged', async () => {
  const input = state(); const before = structuredClone(input); const progress: number[] = [];
  await assert.rejects(prepareStudioRecipe(options({ state: input, macro: macro({ commands: ['//set grass_brick', '//unknown', '//clear'] }), onProgress: done => progress.push(done) })), error('command-failed'));
  assert.deepEqual(progress, [1]); assert.deepEqual(input, before);
});

test('the actual default roof recipe builds two perimeter layers and shifts selection without moving earlier walls', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const preset = DEFAULT_COMMAND_MACRO_LOOPS.find(item => item.id === 'macro_step_roof')!;
  const input = state(); input.pos2 = { x: 2, y: 0, z: 2 }; const before = structuredClone(input);
  const pending = prepareStudioRecipe(options({ state: input, macro: preset }));
  for (let i = 1; i < preset.commands.length * preset.iterations; i++) { t.mock.timers.tick(preset.intervalMs); await flush(); }
  const prepared = await pending;
  assert.equal(prepared.commands, 4); assert.equal(Object.keys(prepared.state.blocks).length, 16);
  for (const y of [0, 1]) for (let x = 0; x <= 2; x++) for (let z = 0; z <= 2; z++) {
    const placed = prepared.state.blocks[`${x},${y},${z}`];
    if (x === 1 && z === 1) assert.equal(placed, undefined);
    else { assert.equal(placed.blockDefId, 'oak_plank'); assert.deepEqual(placed.position, { x, y, z }); }
  }
  assert.deepEqual(prepared.state.pos1, { x: 0, y: 2, z: 0 }); assert.deepEqual(prepared.state.pos2, { x: 2, y: 2, z: 2 });
  assert.deepEqual(prepared.state.undoStack, []); assert.deepEqual(prepared.state.redoStack, []); assert.deepEqual(input, before);
});

test('malformed bounds reject up front without progress or clamping', async () => {
  const patches: Partial<CommandMacroLoop>[] = [
    ...[NaN, Infinity, -Infinity, 0, -1, 1.5, 17, '2'].map(iterations => ({ iterations: iterations as number })),
    ...[NaN, Infinity, -1, 10_001, '0'].map(intervalMs => ({ intervalMs: intervalMs as number })),
    { commands: [] }, { commands: Array(33).fill('//help') }, { commands: Array(5).fill('//help'), iterations: 16 },
    { commands: ['x'.repeat(4097)] }, { commands: [''] }, { commands: ['   '] }, { commands: [null as unknown as string] },
    { commands: new Array(2) },
  ];
  for (const patch of patches) {
    let progressed = false;
    await assert.rejects(prepareStudioRecipe(options({ macro: macro(patch), onProgress: () => { progressed = true; } })), error('invalid-recipe'));
    assert.equal(progressed, false, JSON.stringify(patch));
  }
  await assert.rejects(prepareStudioRecipe(options({ activeBlockId: 'grass_brick extra-command' })), error('invalid-recipe'));
  await assert.rejects(prepareStudioRecipe(options({ macro: macro({ commands: ['{active}'.repeat(500)] }), activeBlockId: 'a'.repeat(200) })), error('invalid-recipe'));
  await assert.rejects(prepareStudioRecipe(options({ hoveredCoord: { x: Infinity, y: 0, z: 0 } })), error('invalid-recipe'));
});

test('undo and redo are rejected before execution with all supported prefix/case forms', async () => {
  for (const command of ['//undo', '/undo', 'UNDO', '  //ReDo  ', '/REDO', 'redo']) {
    let progressed = false;
    await assert.rejects(prepareStudioRecipe(options({ macro: macro({ commands: ['//set grass_brick', command] }), onProgress: () => { progressed = true; } })), error('invalid-recipe'));
    assert.equal(progressed, false);
  }
  await assert.rejects(prepareStudioRecipe(options({ activeBlockId: 'undo', macro: macro({ commands: ['{active}'] }) })), error('invalid-recipe'));
});

test('aborted signal and progress-triggered cancellation reject without changing source', async () => {
  const input = state(); const before = structuredClone(input); const controller = new AbortController(); controller.abort('custom reason');
  await assert.rejects(prepareStudioRecipe(options({ state: input, signal: controller.signal })), { name: 'AbortError' });
  const during = new AbortController(); const completed: number[] = [];
  await assert.rejects(prepareStudioRecipe(options({ state: input, macro: macro({ commands: ['//set grass_brick', '//clear'] }), signal: during.signal, onProgress: done => { completed.push(done); during.abort(); } })), { name: 'AbortError' });
  assert.deepEqual(completed, [1]); assert.deepEqual(input, before); assert.equal(getEventListeners(during.signal, 'abort').length, 0);
});

test('first step has no delay and later steps use cancellable delays across iteration boundaries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const progress: number[] = []; const controller = new AbortController();
  const pending = prepareStudioRecipe(options({ macro: macro({ commands: ['//help', '//help'], iterations: 2, intervalMs: 10_000 }), signal: controller.signal, onProgress: done => progress.push(done) }));
  assert.deepEqual(progress, [1]); assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  t.mock.timers.tick(9999); await flush(); assert.deepEqual(progress, [1]);
  t.mock.timers.tick(1); await flush(); assert.deepEqual(progress, [1, 2]);
  t.mock.timers.tick(10_000); await flush(); assert.deepEqual(progress, [1, 2, 3]);
  t.mock.timers.tick(10_000); await pending;
  assert.deepEqual(progress, [1, 2, 3, 4]); assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('abort during a pending delay removes its timer/listener and prevents every later step', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clear = t.mock.method(globalThis, 'clearTimeout');
  const controller = new AbortController(); const progress: number[] = [];
  const pending = prepareStudioRecipe(options({ macro: macro({ commands: ['//help', '//help'], intervalMs: 10_000 }), signal: controller.signal, onProgress: done => progress.push(done) }));
  const rejection = assert.rejects(pending, { name: 'AbortError' });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  controller.abort(); await rejection;
  assert.equal(clear.mock.callCount(), 1); assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  t.mock.timers.tick(20_000); await flush(); assert.deepEqual(progress, [1]);
});

test('zero interval still yields between steps and command inputs are captured before yielding', async () => {
  const originalMacro = macro({ commands: ['//help', '//set {active}'] }); const progress: number[] = [];
  const pending = prepareStudioRecipe(options({ macro: originalMacro, onProgress: done => { progress.push(done); if (done === 1) originalMacro.commands[1] = '//unknown'; } }));
  assert.deepEqual(progress, [1]); await flush(); assert.deepEqual(progress, [1]);
  const result = await pending; assert.equal(result.commands, 2); assert.equal(result.state.blocks['0,0,0'].blockDefId, 'grass_brick');
});

test('maximum command/iteration bounds remain finite; callbacks cannot extend the captured recipe', async () => {
  const configured = macro({ commands: Array(4).fill('//help'), iterations: 16 }); let completed = 0;
  const result = await prepareStudioRecipe(options({ macro: configured, onProgress: done => { completed = done; configured.iterations = Infinity; configured.commands.push('//help'); } }));
  assert.equal(result.commands, 64); assert.equal(completed, 64);
  assert.equal((await prepareStudioRecipe(options({ macro: macro({ commands: Array(32).fill('//help'), iterations: 2 }) }))).commands, 64);
});

test('aggregate proxy budget charges current and resulting block counts and stops preparation', async () => {
  const input = state();
  for (let x = 0; x < 25_000; x++) input.blocks[`${x},0,0`] = { id: `block_${x}`, blockDefId: 'grass_brick', position: { x, y: 0, z: 0 }, rotation: 0 };
  const originalFirst = structuredClone(input.blocks['0,0,0']); const progress: number[] = [];
  const within = await prepareStudioRecipe(options({ state: input, macro: macro({ commands: ['//help', '//help'] }) })); assert.equal(within.commands, 2);
  await assert.rejects(prepareStudioRecipe(options({ state: input, macro: macro({ commands: ['//help', '//help', '//help'] }), onProgress: done => progress.push(done) })), error('work-limit'));
  assert.deepEqual(progress, [1, 2]); assert.deepEqual(input.blocks['0,0,0'], originalFirst);
  const growing = state(); growing.blocks['-1,0,0'] = { id: 'outside', blockDefId: 'grass_brick', position: { x: -1, y: 0, z: 0 }, rotation: 0 };
  growing.pos2 = { x: 99_999, y: 0, z: 0 };
  await assert.rejects(prepareStudioRecipe(options({ state: growing })), error('work-limit'));
  assert.deepEqual(Object.keys(growing.blocks), ['-1,0,0']);
});

test('oversized sources reject before cloning and existing engine preallocation guards still reject huge sparse selections', async () => {
  const large = state();
  for (let i = 0; i <= STUDIO_RECIPE_LIMITS.maxBlockWork; i++) large.blocks[String(i)] = null as any;
  Object.defineProperty(large, 'customBlocks', { get: () => { throw new Error('Should reject block budget before cloning definitions.'); } });
  await assert.rejects(prepareStudioRecipe(options({ state: large })), error('work-limit'));
  const sparse = state(); sparse.pos2 = { x: 1_000_000, y: 1_000_000, z: 1_000_000 };
  await assert.rejects(prepareStudioRecipe(options({ state: sparse })), error('command-failed'));
  assert.deepEqual(sparse.blocks, {});
});

test('source histories are never traversed and progress exceptions return no partial state', async () => {
  const input = state();
  Object.defineProperty(input, 'undoStack', { get: () => { throw new Error('History must not be traversed.'); } });
  Object.defineProperty(input, 'redoStack', { get: () => { throw new Error('History must not be traversed.'); } });
  const result = await prepareStudioRecipe(options({ state: input })); assert.deepEqual(result.state.undoStack, []); assert.deepEqual(result.state.redoStack, []);
  const clean = state(); const before = structuredClone(clean);
  await assert.rejects(prepareStudioRecipe(options({ state: clean, onProgress: () => { throw new Error('Progress callback failed'); } })), /Progress callback failed/);
  assert.deepEqual(clean, before);
});
