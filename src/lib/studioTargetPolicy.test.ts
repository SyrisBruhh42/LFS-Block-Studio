import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import { validateStudioDocument, type StudioDocument } from './studioDocument';
import { candidateJavaTarget, assertCompatiblePolicyTransition, samePolicyEnvelope } from './studioTargetPolicy';
import { captureJavaDefinitionBinding } from '../engine/javaCellMapping';
import { StudioEditorSession } from './studioEditorSession';

function nextPolicy(source: StudioDocument): StudioDocument {
  return { ...structuredClone(source), schemaVersion: 2, revision: source.revision + 1, historyEpoch: `${source.historyEpoch}-next`,
    targetPolicy: { policyVersion: 1, checkpoint: { documentId: source.documentId, revision: source.revision, historyEpoch: source.historyEpoch }, target: { kind: 'freeform' } } };
}
function javaDocument(locked = true): StudioDocument {
  const source = makeStudioDocument(); source.blocks = {}; source.blueprints = [];
  const original = Object.values(source.customBlocks)[0];
  const definition = { ...original, id: 'unit', name: 'Mapped unit', shape: 'cube' as const, width: 1, depth: 1, heightPlates: 3, hasStuds: false };
  delete definition.voxels; delete definition.defaultScale;
  source.customBlocks = { unit: definition };
  const binding = captureJavaDefinitionBinding(definition, 'minecraft:stone'); assert.ok(binding.ok);
  const document = nextPolicy(source); document.targetPolicy!.target = candidateJavaTarget([binding.binding], locked);
  document.blocks['-2,3,5'] = { id: 'unit-one', blockDefId: 'unit', position: { x: -2, y: 3, z: 5 }, rotation: 0 };
  assert.ok(validateStudioDocument(document).ok);
  return document;
}

test('schema1 remains readable while policy requires explicit schema2 and supported identity', () => {
  const original = makeStudioDocument(); assert.ok(validateStudioDocument(original).ok);
  const next = nextPolicy(original); assert.ok(validateStudioDocument(next).ok);
  assert.equal(validateStudioDocument({ ...original, targetPolicy: next.targetPolicy }).ok, false);
  assert.equal(validateStudioDocument({ ...next, targetPolicy: undefined }).ok, false);
  assert.equal(validateStudioDocument({ ...next, schemaVersion: 3 }).ok, false);
  assert.equal(validateStudioDocument({ ...next, targetPolicy: { ...next.targetPolicy, policyVersion: 99 } }).ok, false);
});
test('locked Java policy validates actual coordinates, definition bindings and complete admitted identity', () => {
  const source = javaDocument();
  const cases: ((document: any) => void)[] = [
    d => { d.blocks['-2,3,5'].position.x = -1.75; },
    d => { d.blocks['-2,3,5'].scale = { x: 2, y: 1, z: 1 }; },
    d => { d.blocks['-2,3,5'].rotation = 90; },
    d => { d.customBlocks.unit.color = '#ff0000'; },
    d => { d.targetPolicy.target.bindings = []; },
    ...['profileId', 'registryIdentity', 'mappingRevision', 'validatorRevision'].map(key => (d: any) => { d.targetPolicy.target[key] = 'unknown'; }),
    d => { d.targetPolicy.target.nativeQualification = 'passed'; },
  ];
  for (const change of cases) { const next = structuredClone(source); change(next); assert.equal(validateStudioDocument(next).ok, false); }
  const unlocked = structuredClone(source); (unlocked.targetPolicy!.target as any).locked = false; unlocked.customBlocks.unit.color = '#ff0000';
  assert.ok(validateStudioDocument(unlocked).ok, 'Unlocked candidate still supports Freeform edits.');
});
test('unknown policy and accessors reject without invoking supplied getters or falling back to unlocked', () => {
  let invoked = 0; const source = javaDocument();
  Object.defineProperty(source.targetPolicy!, 'target', { enumerable: true, get() { invoked++; return { kind: 'freeform' }; } });
  assert.equal(validateStudioDocument(source).ok, false); assert.equal(invoked, 0);
});
test('ordinary session edits and full Undo preserve target policy; forbidden edits have no history or effects', () => {
  const source = javaDocument(), session = new StudioEditorSession(source); session.setWritable(true);
  const policy = JSON.stringify(source.targetPolicy); let effects = 0;
  const rejected = session.transaction('Forbidden definition change', () => {
    session.setDocumentField('customBlocks', defs => ({ ...defs, unit: { ...defs.unit, color: '#ff0000' } }));
    session.afterCommit(() => { effects++; });
  });
  assert.equal(rejected.status, 'rejected'); assert.equal(effects, 0); assert.equal(session.getSnapshot().canUndo, false);
  assert.equal(session.setWorldField('worldName', 'Valid metadata').status, 'applied');
  assert.equal(session.undo().status, 'applied'); assert.equal(JSON.stringify(session.getDocument().targetPolicy), policy);
  assert.equal(session.redo().status, 'applied'); assert.equal(JSON.stringify(session.getDocument().targetPolicy), policy);
  assert.equal(session.setDocumentField('targetPolicy' as any, undefined).status, 'rejected');
});
test('policy transition binds complete unchanged content to exact predecessor and distinct epoch', () => {
  const original = makeStudioDocument(), candidate = nextPolicy(original);
  assert.doesNotThrow(() => assertCompatiblePolicyTransition(original, candidate));
  for (const mutate of [
    (d: StudioDocument) => { d.world.worldName = 'Changed'; },
    (d: StudioDocument) => { d.historyEpoch = original.historyEpoch; },
    (d: StudioDocument) => { d.targetPolicy!.checkpoint.revision++; },
    (d: StudioDocument) => { d.targetPolicy!.checkpoint.documentId = 'other'; },
    (d: StudioDocument) => { d.documentId = 'other'; },
  ]) { const changed = structuredClone(candidate); mutate(changed); assert.throws(() => assertCompatiblePolicyTransition(original, changed)); }
});
test('same-project Java transition permits only lock change; new mappings need a separate copy', () => {
  const previous = javaDocument(); const next = nextPolicy(previous); next.targetPolicy!.target = structuredClone(previous.targetPolicy!.target);
  (next.targetPolicy!.target as any).locked = false; assert.doesNotThrow(() => assertCompatiblePolicyTransition(previous, next));
  assert.equal(samePolicyEnvelope(previous, next), false);
  const sameLock = structuredClone(next); (sameLock.targetPolicy!.target as any).locked = true;
  assert.throws(() => assertCompatiblePolicyTransition(previous, sameLock));
  const remapped = structuredClone(next); (remapped.targetPolicy!.target as any).bindings[0].blockState = 'minecraft:cobblestone';
  assert.throws(() => assertCompatiblePolicyTransition(previous, remapped));
  const freeform = structuredClone(next); freeform.targetPolicy!.target = { kind: 'freeform' };
  assert.throws(() => assertCompatiblePolicyTransition(previous, freeform));
});
test('durable acknowledgement cannot introduce a different policy under an existing epoch', () => {
  const source = javaDocument(false), session = new StudioEditorSession(source); session.setWritable(true);
  const saved = structuredClone(source); saved.revision++; (saved.targetPolicy!.target as any).locked = true;
  assert.equal(session.acknowledgeDurable(saved, session.getToken()).status, 'rejected');
  assert.deepEqual(session.getDocument(), source);
});
