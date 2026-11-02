import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectBackupPayload } from './googleDrive';
import { importStudioCandidate } from './legacyStudioImport';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import { createDefaultHotkeyConfig } from '../engine/hotkeys';
import { stringifyBoundedJson } from './boundedJson';

test('portable backup preserves edited built-ins and the complete authored document independently of later edits', () => {
  const document = makeStudioDocument();
  const edited = Object.values(document.customBlocks)[0];
  edited.color = '#123456';
  document.extensions = { fixture: { retain: true } };
  const backup = buildProjectBackupPayload({
    ...document.world, blocks: document.blocks, customBlocks: document.customBlocks,
    blueprints: document.blueprints, hotkeys: createDefaultHotkeyConfig(), completeDocument: document,
  });
  const originalJson = JSON.stringify(document);
  edited.color = '#ffffff';
  document.world.description = 'Changed after backup';
  assert.equal(JSON.stringify(backup.completeDocument), originalJson);
  assert.equal(backup.customBlocks.find(def => def.id === edited.id)?.color, '#123456');
  const restored = importStudioCandidate(JSON.stringify(backup), makeStudioDocument('unrelated-defaults'));
  assert.equal(restored.ok, true);
  if (restored.ok) assert.equal(JSON.stringify(restored.value), originalJson);
});

test('bounded service payload rejects excess UTF-8 bytes and never returns truncated JSON', () => {
  assert.equal(stringifyBoundedJson({ text: 'é' }, 13, 'Test'), '{"text":"é"}');
  assert.throws(() => stringifyBoundedJson({ text: 'é' }, 12, 'Test'), /size limit/);
  const value = { a: 'x'.repeat(100) };
  assert.throws(() => stringifyBoundedJson(value, 100, 'Test'), /complete local project/);
});
