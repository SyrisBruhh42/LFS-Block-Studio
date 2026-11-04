import test from 'node:test';
import assert from 'node:assert/strict';
import { captureStudioHistoryDelta, applyStudioHistoryDelta } from './studioHistoryDelta';

const capture = (a: unknown, b: unknown, bytes = 65536) => captureStudioHistoryDelta(a, b, 'Test \u{1F9F1}', bytes);
function roundtrip(a: unknown, b: unknown) {
  const before = JSON.stringify(a), after = JSON.stringify(b), delta = capture(a, b);
  const redone = applyStudioHistoryDelta(a, delta.payload, 'redo'), undone = applyStudioHistoryDelta(b, delta.payload, 'undo');
  assert.deepEqual(redone, b); assert.deepEqual(undone, a);
  assert.equal(JSON.stringify(redone), after); assert.equal(JSON.stringify(undone), before);
  assert.equal(JSON.stringify(a), before); assert.equal(JSON.stringify(b), after);
  return delta;
}

test('nested changes retain exact absence, null, false, zero, empty objects and Unicode without mutating inputs', () => {
  roundtrip({ keep: { zero: 0 }, remove: false, optional: null, array: [{ name: 'old' }] },
    { keep: { zero: 0 }, added: false, optional: {}, array: [{ name: 'Ω\u{1F33F}', nested: null }], zero: 0 });
  for (const [a, b] of [[null, []], [{ a: 1 }, []], [[], {}], [[], [false]], [[null], []], [{ a: null }, {}], [false, 0]]) roundtrip(a, b);
});

test('array insertion, removal, replacement and same-length nested changes roundtrip with unchanged prefix/suffix', () => {
  const prefix = { id: 1, values: [false, '\u{1F9F1}'] }, suffix = { id: 9 };
  for (const [a, b] of [
    [[], [prefix]], [[prefix], []], [[prefix, suffix], [prefix, null, suffix]],
    [[prefix, null, suffix], [prefix, suffix]], [[prefix, { old: true }, suffix], [prefix, { next: true }, false, suffix]],
    [[prefix, suffix], [{ ...prefix, values: ['new', '\u{1F9F1}'] }, suffix]],
    [[{ a: 1, b: 2 }], [{ b: 2, a: 1 }, null]],
  ]) roundtrip(a, b);
});

test('dictionary additions, removals and explicit key reorder restore exact enumeration and serialized bytes', () => {
  roundtrip({ first: 1, middle: 2, last: 3 }, { first: 1, last: 3 });
  roundtrip({ first: 1, last: 3 }, { first: 1, added: 2, last: 3 });
  roundtrip({ first: 1, last: 3 }, { last: 3, first: 1 });
  roundtrip({ '1': 'number', '10': 'number', x: 1, y: 2 }, { '1': 'number', '2': 'added', '10': 'number', y: 2, x: 1 });
});

test('retention scales with the change, including array append and an unchanged 20 MiB value', () => {
  const huge = 'x'.repeat(20 * 1024 * 1024), list = Array.from({ length: 1000 }, (_, index) => ({ index, text: 'untouched' }));
  const a = { huge, list, metadata: { name: 'Before' } }, b = { huge, list: [...list, { index: 1000, text: 'New' }], metadata: { name: 'After' } };
  const delta = roundtrip(a, b);
  assert.ok(delta.bytes < 1024, `Only the changed name/new entry should be retained: ${delta.bytes}`);
  assert.equal(delta.payload.includes(huge.slice(0, 1000)), false);
});

test('encoded byte budget includes both endpoints, UTF-8, escaping and the label; exact fit succeeds', () => {
  const a = { text: 'Ω\u{1F33F}\n\t' }, b = { text: '\u{1F9F1}'.repeat(8) }, delta = capture(a, b);
  assert.equal(delta.bytes, Buffer.byteLength(delta.payload) + Buffer.byteLength('Test \u{1F9F1}') + 64);
  assert.deepEqual(capture(a, b, delta.bytes), delta);
  assert.throws(() => capture(a, b, delta.bytes - 1), /Undo history change limit/);
  assert.throws(() => capture({ text: 'x'.repeat(10_000_000) }, {}, 1024), /Undo history change limit/);
  assert.throws(() => capture(a, a), /changed state/);
});

test('wrong endpoints/container shapes reject rather than silently applying a partial restore', () => {
  for (const [a, b, wrong] of [
    [{ k: 1 }, { k: 2 }, { k: 3 }], [[1, 2], [1, 9, 2], [1, 8, 2]],
    [{ list: [1, 2] }, { list: [3, 2] }, { list: [3] }], [{ a: null }, {}, { a: 4 }],
  ]) {
    const delta = capture(a, b), before = JSON.stringify(wrong);
    assert.throws(() => applyStudioHistoryDelta(wrong, delta.payload, 'undo'), /history/);
    assert.equal(JSON.stringify(wrong), before);
  }
});

test('malformed history paths, sparse-array requests and unsupported kinds fail without prototype mutation', () => {
  const invalid: [unknown, string][] = [
    [{}, '{"kind":"object","entries":{"__proto__":{"kind":"replace","before":[],"after":[1]}}}'],
    [[1], '{"kind":"array","length":1,"entries":{"0":{"kind":"replace","before":[1],"after":[]}}}'],
    [[1], '{"kind":"array","length":1,"entries":{"3":{"kind":"replace","before":[],"after":[2]}}}'],
    [[1], '{"kind":"splice","index":-1,"beforeLength":1,"afterLength":2,"before":[],"after":[2]}'],
    [[1], '{"kind":"replace","before":[1,2],"after":[]}'], [[1], '{"kind":"execute","code":"no"}'],
    [[1], '{"kind":"replace","before":[[1]],"after":[]}'],
    [{ a: 1 }, '{"kind":"object","entries":{"a":{"kind":"replace","before":[1],"after":[2]}},"order":false}'],
  ];
  for (const [source, payload] of invalid) {
    const before = JSON.stringify(source); assert.throws(() => applyStudioHistoryDelta(source, payload, 'redo'), /history/i); assert.equal(JSON.stringify(source), before);
  }
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
  assert.throws(() => applyStudioHistoryDelta({}, '{}', 'other' as 'redo'), /direction/);
});

test('deterministic mixed JSON sequences reverse and replay against full-state snapshots', () => {
  let current: any = { cells: {}, list: [], optional: null, text: 'start' }, seed = 7823;
  const states = [structuredClone(current)], frames: string[] = [];
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  for (let i = 0; i < 180; i++) {
    const next = structuredClone(current), n = random(), index = n % 13;
    switch (n % 6) {
      case 0: next.cells[index] = { name: `Ω-${i}`, rotation: n % 4 }; break;
      case 1: delete next.cells[index]; next.text = `removed-${i}`; break;
      case 2: next.list.splice(next.list.length ? n % next.list.length : 0, 0, { index: i, text: '\u{1F33F}' }); break;
      case 3: next.list = next.list.slice(1); next.text = `shift-${i}`; break;
      case 4: if (i % 2) delete next.optional; else next.optional = [null, false, { i }]; next.text = `option-${i}`; break;
      case 5: next.text = `renamed-${i}`; break;
    }
    const delta = roundtrip(current, next); frames.push(delta.payload); current = next; states.push(structuredClone(current));
  }
  for (let i = frames.length - 1; i >= 0; i--) { current = applyStudioHistoryDelta(current, frames[i], 'undo'); assert.deepEqual(current, states[i]); }
  for (let i = 0; i < frames.length; i++) { current = applyStudioHistoryDelta(current, frames[i], 'redo'); assert.deepEqual(current, states[i + 1]); }
});
