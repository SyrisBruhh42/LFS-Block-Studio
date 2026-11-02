import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateStudioStorageQuota, idbGetStrict } from './indexedDbStorage';

test('missing IndexedDB is an explicit failure for strict legacy reads', async () => {
  await assert.rejects(idbGetStrict('autosave_snapshots'), /could not be opened/);
});

test('quota estimates preserve measured zero and report unknown rather than fabricated capacity', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { estimate: async () => ({ usage: 0, quota: 1024 }) } } });
    const zero = await estimateStudioStorageQuota(); assert.equal(zero.usageBytes, 0); assert.equal(zero.usageFormatted, '0 B'); assert.equal(zero.quotaBytes, 1024);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { estimate: async () => { throw new Error('denied'); } } } });
    const unknown = await estimateStudioStorageQuota(); assert.equal(unknown.usageBytes, null); assert.equal(unknown.quotaBytes, null); assert.equal(unknown.quotaFormatted, 'Unavailable');
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original); else delete (globalThis as any).navigator;
  }
});
