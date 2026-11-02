/**
 * Session-private reversible JSON changes. Inputs are complete validated canonical
 * states, not imported patches. The caller validates the complete restored state.
 * Unchanged data is neither serialized into history nor recovered from history.
 */
type Slot = [] | [unknown];
type KeyOrder = { index: number; before: string[]; after: string[] };
type Change =
  | { kind: 'replace'; before: Slot; after: Slot }
  | { kind: 'object'; entries: Record<string, Change>; order?: KeyOrder }
  | { kind: 'array'; length: number; entries: Record<string, Change> }
  | { kind: 'splice'; index: number; beforeLength: number; afterLength: number; before: unknown[]; after: unknown[] };
const encoder = new TextEncoder();
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a), otherKeys = Object.keys(b);
  return keys.length === otherKeys.length && keys.every((key, index) => key === otherKeys[index] && equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}
function diff(before: Slot, after: Slot): Change | null {
  if (before.length === after.length && (!before.length || before[0] === after[0])) return null;
  const a = before[0], b = after[0];
  if (before.length && after.length && object(a) && object(b)) {
    const entries: Record<string, Change> = Object.create(null);
    const beforeKeys = Object.keys(a), afterKeys = Object.keys(b);
    for (const key of new Set([...beforeKeys, ...afterKeys])) {
      if (forbidden.has(key)) throw new Error('Unsupported history field.');
      const next = diff(Object.hasOwn(a, key) ? [a[key]] : [], Object.hasOwn(b, key) ? [b[key]] : []);
      if (next) entries[key] = next;
    }
    // Preserve enumeration order as well as values. Reinserted dictionary keys
    // must not reorder a build, procedural traversal or exported source hash.
    let prefix = 0, suffix = 0;
    while (prefix < Math.min(beforeKeys.length, afterKeys.length) && beforeKeys[prefix] === afterKeys[prefix]) prefix++;
    if (prefix !== beforeKeys.length || prefix !== afterKeys.length) {
      while (suffix < Math.min(beforeKeys.length, afterKeys.length) - prefix && beforeKeys[beforeKeys.length - suffix - 1] === afterKeys[afterKeys.length - suffix - 1]) suffix++;
      return { kind: 'object', entries, order: { index: prefix, before: beforeKeys.slice(prefix, beforeKeys.length - suffix), after: afterKeys.slice(prefix, afterKeys.length - suffix) } };
    }
    return Object.keys(entries).length ? { kind: 'object', entries } : null;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length === b.length) {
      const entries: Record<string, Change> = Object.create(null);
      for (let i = 0; i < a.length; i++) { const next = diff([a[i]], [b[i]]); if (next) entries[String(i)] = next; }
      return Object.keys(entries).length ? { kind: 'array', length: a.length, entries } : null;
    }
    let prefix = 0, suffix = 0;
    while (prefix < Math.min(a.length, b.length) && equal(a[prefix], b[prefix])) prefix++;
    while (suffix < Math.min(a.length, b.length) - prefix && equal(a[a.length - suffix - 1], b[b.length - suffix - 1])) suffix++;
    return { kind: 'splice', index: prefix, beforeLength: a.length, afterLength: b.length, before: a.slice(prefix, a.length - suffix), after: b.slice(prefix, b.length - suffix) };
  }
  return equal(a, b) && before.length === after.length ? null : { kind: 'replace', before, after };
}

/** Bound encoded retention during serialization, including multibyte text and escaping. */
function encodeBounded(value: unknown, limit: number): string {
  const parts: string[] = []; let bytes = 0;
  const append = (text: string) => {
    bytes += encoder.encode(text).byteLength;
    if (bytes > limit) throw new Error('This edit exceeds the Undo history change limit. No change was applied. Keep larger replacements as a separate project copy.');
    parts.push(text);
  };
  const visit = (item: unknown) => {
    if (typeof item === 'string' && item.length > limit - bytes) throw new Error('This edit exceeds the Undo history change limit. No change was applied. Keep larger replacements as a separate project copy.');
    if (item === null || typeof item !== 'object') { const text = JSON.stringify(item); if (text === undefined) throw new Error('Unsupported history data.'); append(text); return; }
    if (Array.isArray(item)) { append('['); item.forEach((entry, index) => { if (index) append(','); visit(entry); }); append(']'); return; }
    append('{'); Object.entries(item).forEach(([key, entry], index) => { if (index) append(','); append(JSON.stringify(key)); append(':'); visit(entry); }); append('}');
  };
  visit(value); return parts.join('');
}

export function captureStudioHistoryDelta(before: unknown, after: unknown, label: string, maxBytes: number): { payload: string; bytes: number } {
  const change = diff([before], [after]);
  if (!change) throw new Error('A history entry requires a changed state.');
  const overhead = encoder.encode(label).byteLength + 64;
  const payload = encodeBounded(change, maxBytes - overhead);
  return { payload, bytes: encoder.encode(payload).byteLength + overhead };
}

function fields(value: unknown, keys: string[]): asserts value is Record<string, any> {
  if (!object(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error('Invalid session history entry.');
}
function slot(value: unknown): asserts value is Slot { if (!Array.isArray(value) || value.length > 1) throw new Error('Invalid session history value.'); }
function integer(value: unknown): asserts value is number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid session history index.'); }

/** Applies without mutating the source. Endpoints must match before any publication. */
export function applyStudioHistoryDelta<T>(current: T, payload: string, direction: 'undo' | 'redo'): T {
  if (direction !== 'undo' && direction !== 'redo') throw new Error('Unsupported session history direction.');
  const change: unknown = JSON.parse(payload);
  const visit = (present: Slot, delta: unknown): Slot => {
    if (!object(delta)) throw new Error('Invalid session history change.');
    if (delta.kind === 'replace') {
      fields(delta, ['kind', 'before', 'after']); slot(delta.before); slot(delta.after);
      const expected = direction === 'undo' ? delta.after : delta.before, replacement = direction === 'undo' ? delta.before : delta.after;
      if (present.length !== expected.length || present.length && !equal(present[0], expected[0])) throw new Error('Session history no longer matches the current edit.');
      return replacement;
    }
    const value = present[0];
    if (delta.kind === 'object' || delta.kind === 'array') {
      fields(delta, delta.kind === 'array' ? ['kind', 'length', 'entries'] : Object.hasOwn(delta, 'order') ? ['kind', 'entries', 'order'] : ['kind', 'entries']);
      if (!present.length || !object(delta.entries) || !Object.keys(delta.entries).length && !delta.order) throw new Error('Invalid session history branch.');
      const array = delta.kind === 'array';
      if (array ? !Array.isArray(value) || value.length !== delta.length : !object(value)) throw new Error('Session history container no longer matches.');
      if (array) integer(delta.length);
      const output: any = array ? (value as unknown[]).slice() : { ...value as Record<string, unknown> };
      for (const [key, child] of Object.entries(delta.entries)) {
        if (forbidden.has(key) || array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= output.length)) throw new Error('Invalid session history path.');
        const next = visit(Object.hasOwn(output, key) ? [output[key]] : [], child);
        if (next.length) output[key] = next[0]; else { if (array) throw new Error('History cannot create a sparse array.'); delete output[key]; }
      }
      if (!array && Object.hasOwn(delta, 'order')) {
        fields(delta.order, ['index', 'before', 'after']); integer(delta.order.index);
        const order = delta.order;
        if (!Array.isArray(order.before) || !Array.isArray(order.after) || [...order.before, ...order.after].some(key => typeof key !== 'string' || forbidden.has(key))) throw new Error('Invalid session history key order.');
        const keys = Object.keys(value!), expected = direction === 'undo' ? order.after : order.before, replacement = direction === 'undo' ? order.before : order.after;
        if (order.index + expected.length > keys.length || !equal(keys.slice(order.index, order.index + expected.length), expected)) throw new Error('Session history key order no longer matches.');
        const ordered = keys.slice(0, order.index).concat(replacement, keys.slice(order.index + expected.length));
        if (new Set(ordered).size !== ordered.length || ordered.length !== Object.keys(output).length || ordered.some(key => !Object.hasOwn(output, key))) throw new Error('Session history key order is incomplete.');
        const result = Object.fromEntries(ordered.map(key => [key, output[key]]));
        if (!equal(Object.keys(result), ordered)) throw new Error('Invalid session history enumeration order.');
        return [result];
      }
      return [output];
    }
    if (delta.kind === 'splice') {
      fields(delta, ['kind', 'index', 'beforeLength', 'afterLength', 'before', 'after']);
      integer(delta.index); integer(delta.beforeLength); integer(delta.afterLength);
      if (!Array.isArray(value) || !Array.isArray(delta.before) || !Array.isArray(delta.after)) throw new Error('Invalid session history splice.');
      const expected = direction === 'undo' ? delta.after : delta.before, replacement = direction === 'undo' ? delta.before : delta.after;
      const length = direction === 'undo' ? delta.afterLength : delta.beforeLength;
      if (value.length !== length || delta.index + expected.length > length || delta.beforeLength - delta.before.length + delta.after.length !== delta.afterLength || !equal(value.slice(delta.index, delta.index + expected.length), expected)) throw new Error('Session history array no longer matches.');
      return [value.slice(0, delta.index).concat(replacement, value.slice(delta.index + expected.length))];
    }
    throw new Error('Unsupported session history change.');
  };
  const result = visit([current], change);
  if (!result.length) throw new Error('History cannot remove the root state.');
  return result[0] as T;
}
