import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import { validateStudioDocument } from './studioDocument';
import { StudioEditorSession } from './studioEditorSession';
import { StudioCellInspectorModel } from './studioCellInspectorModel';
import { applyStudioCellEditPatch, checkCellDraft, draftStudioCell, effectiveCellScale, prepareStudioCellEdit, resolveStudioCell, type PreparedStudioCellEdit, type StudioCellDraft } from './studioCellEdit';
import { candidateJavaTarget } from './studioTargetPolicy';
import { captureJavaDefinitionBinding } from '../engine/javaCellMapping';

function document(locked = false) {
  const d = makeStudioDocument('cell-fixture');
  const unit = { ...d.customBlocks.cobble_brick, id: 'unit', name: 'Unit', shape: 'cube' as const, width: 1, depth: 1, heightPlates: 3, hasStuds: false };
  delete unit.voxels; delete unit.defaultScale;
  const other = { ...unit, id: 'other', name: 'Other' };
  d.customBlocks = { unit, other }; d.blueprints = [];
  d.blocks = { '0,1,0': { id: 'cell-stable', blockDefId: 'unit', position: { x: 0, y: 1, z: 0 }, rotation: 0 }, '2,1,0': { id: 'occupied', blockDefId: 'other', position: { x: 2, y: 1, z: 0 }, rotation: 0 } };
  d.extensions = { retained: ['cell fixture', { exact: true }] };
  if (locked) {
    const b = captureJavaDefinitionBinding(unit, 'minecraft:stone'); assert.ok(b.ok);
    const b2 = captureJavaDefinitionBinding(other, 'minecraft:cobblestone'); assert.ok(b2.ok);
    d.schemaVersion = 2; d.revision = 1; d.historyEpoch = 'locked-epoch';
    d.targetPolicy = { policyVersion: 1, checkpoint: { documentId: d.documentId, revision: 0, historyEpoch: 'epoch-fixture' }, target: candidateJavaTarget([b.binding,b2.binding]) };
  }
  assert.ok(validateStudioDocument(d).ok); return d;
}
const target = { documentId: 'cell-fixture', blockId: 'cell-stable', keyHint: '0,1,0' };
function session(d = document(), bytes = 16 * 1048576) { const s = new StudioEditorSession(d, { maxEntries: 30, maxBytes: bytes }); s.setWritable(true); return s; }
function draft(s: StudioEditorSession, partial: Partial<StudioCellDraft> = {}) { return { ...draftStudioCell(resolveStudioCell(s.getDocument(),target)!), ...partial }; }
function prepare(s: StudioEditorSession, partial: Partial<StudioCellDraft> = {}) { return prepareStudioCellEdit(s.getDocument(),target,draft(s,partial),JSON.stringify(s.getToken()),s.getSnapshot().workspace); }
function commit(s: StudioEditorSession, p: PreparedStudioCellEdit) {
  return s.transaction('Edit cell properties', () => { const engine = s.getEngineState(), patch = applyStudioCellEditPatch(s.getDocument(),engine,p); s.setEngineState({ ...engine, blocks: patch.blocks, pos1: patch.pos1, pos2: patch.pos2 }); s.setDocumentField('chunkConfig',patch.chunkConfig); }, JSON.parse(p.sourceToken));
}
const stable = (s: StudioEditorSession) => JSON.stringify({ document:s.getDocument(),workspace:s.getSnapshot().workspace,token:s.getToken(),history:s.getHistoryUsage() });
function model(s = session()) {
  let commits = 0;
  const m = new StudioCellInspectorModel(() => ({ document:s.getDocument(),workspace:s.getSnapshot().workspace,token:JSON.stringify(s.getToken()),writable:s.getSnapshot().writable && !s.getSnapshot().exclusive }), p => { commits++; return commit(s,p); });
  s.subscribe(m.synchronize); m.inspect('0,1,0',JSON.stringify(s.getToken()));
  return { s,m,commits:() => commits, edit:(v: Partial<StudioCellDraft>)=>m.updateDraft(v,m.getSnapshot().contextId), review:()=>{ m.review(m.getSnapshot().draftVersion); return m.getSnapshot().review!; } };
}

test('detached review preserves source and exact one-cell selection/chunk edit restores through Undo and Redo', () => {
  const s = session(); s.setEngineState({ ...s.getEngineState(),pos1:{x:0,y:1,z:0},pos2:{x:0,y:1,z:0},clipboard:[{ ...s.getDocument().blocks['2,1,0'] }] });
  const before = stable(s), p = prepare(s,{ x:'-18',y:'-20.25',z:'18',definitionId:'other',rotation:'270',scaleMode:'custom',scaleX:'2',scaleY:'.5',scaleZ:'1' });
  assert.equal(stable(s),before); assert.equal(p.report.revealsChunk,'-1,1'); assert.equal(p.report.followsSelection,true); assert.ok(Object.isFrozen(p.after));
  assert.equal(commit(s,p).status,'applied');
  const d = s.getDocument(), after = JSON.stringify({document:d,workspace:s.getSnapshot().workspace});
  assert.equal(d.blocks['-18,-20,18'].id,'cell-stable'); assert.equal(d.blocks['0,1,0'],undefined);
  assert.deepEqual(s.getSnapshot().workspace.pos1,{x:-18,y:-20,z:18}); assert.equal(d.chunkConfig.activeChunks['-1,1'],true);
  assert.deepEqual(d.extensions,{retained:['cell fixture',{exact:true}]});
  assert.equal(s.undo().status,'applied'); assert.deepEqual(s.getDocument(),JSON.parse(before).document); assert.deepEqual(s.getSnapshot().workspace,JSON.parse(before).workspace);
  assert.equal(s.redo().status,'applied'); assert.equal(JSON.stringify({document:s.getDocument(),workspace:s.getSnapshot().workspace}),after);
});
test('unrelated region selection and clipboard remain unchanged when a cell moves', () => {
  const s=session(); s.setEngineState({...s.getEngineState(),pos1:{x:0,y:1,z:0},pos2:{x:5,y:1,z:0}}); const workspace=s.getSnapshot().workspace;
  const p=prepare(s,{x:'1.2'}); assert.equal(p.report.followsSelection,false); assert.equal(commit(s,p).status,'applied'); assert.deepEqual(s.getSnapshot().workspace,workspace);
});
test('a fractional Freeform cell selected by its integer anchor remains usable by region commands after moving', () => {
  const d=document();d.blocks['0,1,0'].position={x:.2,y:1.25,z:0};const s=session(d);s.setEngineState({...s.getEngineState(),pos1:{x:0,y:1,z:0},pos2:{x:0,y:1,z:0}});
  const p=prepare(s,{x:'-18.1',y:'-20.25'});assert.equal(p.report.followsSelection,true);assert.equal(commit(s,p).status,'applied');assert.deepEqual(s.getSnapshot().workspace.pos1,{x:-18,y:-20,z:0});assert.deepEqual(s.getDocument().blocks['-18,-20,0'].position,{x:-18.1,y:-20.25,z:0});
});
test('occupied rounded anchors reject without replacing cells, history or source', () => {
  const s=session(), before=stable(s); assert.throws(()=>prepare(s,{x:'1.8'}),/occupied/); assert.equal(stable(s),before);
});
test('Freeform fractional positions retain exact values and follow the schema rounded key', () => {
  const s=session(), p=prepare(s,{x:'-.5',y:'1.49',z:'-2.51'}); assert.equal(p.toKey,'0,1,-3'); assert.equal(commit(s,p).status,'applied'); assert.equal(s.getDocument().blocks[p.toKey].position.x,-.5);
});
test('numeric boundaries reject empty, hex, nonfinite and out of range data', () => {
  const s=session(), before=stable(s);
  for (const value of ['', '0x20','Infinity','NaN','1000001','-1000001','1e999']) assert.throws(()=>prepare(s,{x:value}));
  for (const value of ['0','.009','64.01','NaN']) assert.throws(()=>prepare(s,{scaleMode:'custom',scaleX:value}));
  assert.doesNotThrow(()=>prepare(s,{x:'-1e6',scaleMode:'custom',scaleX:'.01',scaleY:'64'})); assert.equal(stable(s),before);
});
test('definition scale is displayed truthfully and absent override remains a no-op with Redo intact', () => {
  const d=document(); d.customBlocks.unit.defaultScale={x:2,y:3,z:.5}; const s=session(d);
  assert.deepEqual(effectiveCellScale(d.blocks['0,1,0'],d.customBlocks.unit),{x:2,y:3,z:.5}); assert.equal(draft(s).scaleY,'3');
  s.setWorldField('worldName','Redo me'); s.undo(); const before=stable(s), p=prepare(s);
  assert.equal(p.report.noop,true); assert.equal(commit(s,p).status,'noop'); assert.equal(stable(s),before); assert.equal(s.redo().status,'applied');
});
test('instance scale identity remains explicit until definition source is deliberately chosen', () => {
  const d=document(); d.blocks['0,1,0'].customScale={x:1,y:1,z:1}; const s=session(d);
  assert.equal(prepare(s).report.noop,true); const p=prepare(s,{scaleMode:'definition'}); assert.equal(p.report.noop,false); assert.equal(commit(s,p).status,'applied'); assert.equal(s.getDocument().blocks['0,1,0'].customScale,undefined); s.undo(); assert.deepEqual(s.getDocument().blocks['0,1,0'].customScale,{x:1,y:1,z:1});
});
test('definition changes preserve instance appearance unless its removal is explicitly reviewed', () => {
  const d=document(); Object.assign(d.blocks['0,1,0'],{colorOverride:'#123456',textureOverride:'cobblestone',materialOverride:'metallic'});
  const s=session(d); assert.equal(commit(s,prepare(s,{definitionId:'other'})).status,'applied'); assert.equal(s.getDocument().blocks['0,1,0'].colorOverride,'#123456');
  const p=prepare(s,{resetAppearance:true}); assert.ok(p.report.changes.includes('Instance appearance')); assert.equal(commit(s,p).status,'applied'); assert.equal(s.getDocument().blocks['0,1,0'].colorOverride,undefined); assert.equal(s.getDocument().blocks['0,1,0'].textureOverride,undefined);
});
test('locked Java accepts mapped whole cell edits and rejects scale, rotation, fractions and unknown definitions', () => {
  const s=session(document(true)), policy=s.getDocument().targetPolicy;
  for (const v of [{x:'.5'},{rotation:'90'},{scaleMode:'custom' as const,scaleX:'2'},{definitionId:'unknown'}]) assert.throws(()=>prepare(s,v));
  assert.equal(commit(s,prepare(s,{x:'-18',definitionId:'other'})).status,'applied'); assert.deepEqual(s.getDocument().targetPolicy,policy); assert.ok(validateStudioDocument(s.getDocument()).ok); assert.equal(s.undo().status,'applied');
});
test('stable cell identity follows moves and Undo without capturing a replacement at the former anchor', () => {
  const s=session(); commit(s,prepare(s,{x:'4'})); assert.equal(resolveStudioCell(s.getDocument(),target)?.key,'4,1,0');
  s.setDocumentField('blocks',{...s.getDocument().blocks,'0,1,0':{...s.getDocument().blocks['2,1,0'],id:'replacement',position:{x:0,y:1,z:0}}});
  assert.equal(resolveStudioCell(s.getDocument(),target)?.key,'4,1,0'); assert.equal(resolveStudioCell({...s.getDocument(),documentId:'different'},target),null);
  s.undo(); s.undo(); assert.equal(resolveStudioCell(s.getDocument(),target)?.key,'0,1,0');
});
test('review rejects current preimage changes and edit-to-Undo ABA before entering commit', () => {
  const s=session(), p=prepare(s,{x:'4'}); s.setWorldField('worldName','Intervening'); s.undo(); const before=stable(s); assert.equal(commit(s,p).status,'rejected'); assert.equal(stable(s),before);
  const d=structuredClone(s.getDocument()); d.blocks['0,1,0'].rotation=90; assert.throws(()=>applyStudioCellEditPatch(d,s.getSnapshot().workspace,p),/changed/);
});
test('history-capacity failure rolls back the cell, revealed chunk, selection and token', () => {
  const s=session(document(),1), before=stable(s); assert.equal(commit(s,prepare(s,{x:'18'})).status,'rejected'); assert.equal(stable(s),before);
});
test('draft validation rejects unknown fields, accessors and oversized values without invoking getters', () => {
  const s=session(); let read=0; const getter={...draft(s)}; Object.defineProperty(getter,'x',{enumerable:true,get(){read++;return'5';}});
  assert.throws(()=>checkCellDraft(getter)); assert.equal(read,0); assert.throws(()=>checkCellDraft({...draft(s),extra:'unknown'} as any)); assert.throws(()=>checkCellDraft({...draft(s),x:'1'.repeat(65)}));
  const f=model(s), old=f.m.getSnapshot(); const patch=Object.defineProperty({},'x',{enumerable:true,get(){read++;return'5';}});
  assert.equal(f.m.updateDraft(patch,old.contextId).status,'rejected'); assert.equal(read,0); assert.deepEqual(f.m.getSnapshot().draft,old.draft);
});
test('opening, reviewing, canceling and closing properties do not change authored data or history', () => {
  const s=session(), before=stable(s), f=model(s); f.edit({x:'4'}); f.review(); f.m.cancelReview(f.m.getSnapshot().review!); f.m.close(); assert.equal(stable(s),before); assert.equal(f.commits(),0);
});
test('close preserves a draft and revokes old controls/reviews through reopen and a newer review', () => {
  const f=model(), context=f.m.getSnapshot().contextId; f.edit({x:'4'}); const old=f.review(); f.m.close(); assert.equal(f.m.getSnapshot().draft?.x,'4'); assert.equal(f.m.apply(old).status,'rejected');
  f.m.reopen(); assert.equal(f.m.updateDraft({x:'9'},context).status,'rejected'); const current=f.review(); assert.notEqual(current,old); assert.equal(f.m.apply(old).status,'rejected'); assert.equal(f.m.getSnapshot().review,current); assert.equal(f.m.apply(current).status,'applied'); assert.equal(f.commits(),1); assert.equal(f.m.apply(current).status,'rejected');
});
test('an unfinished draft prevents switching targets until explicit reload/discard', () => {
  const f=model(); f.edit({x:'4'}); const before=stable(f.s); assert.equal(f.m.inspect('2,1,0',JSON.stringify(f.s.getToken())).status,'rejected'); assert.equal(f.m.getSnapshot().target?.blockId,'cell-stable'); assert.equal(f.m.getSnapshot().draft?.x,'4'); assert.equal(stable(f.s),before);
  f.m.reload(f.m.getSnapshot().contextId); assert.equal(f.m.inspect('2,1,0',JSON.stringify(f.s.getToken())).status,'noop'); assert.equal(f.m.getSnapshot().target?.blockId,'occupied');
});
test('external source changes retain dirty values, invalidate reviews, and require explicit reload after ABA', () => {
  const f=model(); f.edit({x:'4'}); const old=f.review(); f.s.setWorldField('worldName','Intervening'); f.s.undo(); assert.equal(f.m.getSnapshot().draft?.x,'4'); assert.equal(f.m.getSnapshot().review,null); assert.equal(f.m.apply(old).status,'rejected'); assert.equal(f.m.review(f.m.getSnapshot().draftVersion).status,'rejected');
  f.m.reload(f.m.getSnapshot().contextId); assert.equal(f.m.getSnapshot().draft?.x,'0'); assert.equal(f.m.getSnapshot().dirty,false); assert.ok(f.review());
});
test('clean views follow external moves and deletions/Undo while dirty drafts cannot cross a replacement project', () => {
  const f=model(); commit(f.s,prepare(f.s,{x:'4'})); assert.equal(f.m.getSnapshot().draft?.x,'4');
  const blocks={...f.s.getDocument().blocks}; delete blocks['4,1,0']; f.s.setDocumentField('blocks',blocks); assert.equal(f.m.getSnapshot().draft,null); f.s.undo(); assert.equal(f.m.getSnapshot().draft?.x,'4');
  f.edit({x:'5'}); const old=f.review(); const d=document(); d.documentId='different'; const handle=f.s.beginExclusive()!; assert.equal(f.s.installVerifiedDocument(d).status,'applied'); f.s.endExclusive(handle); assert.equal(f.m.getSnapshot().draft?.x,'5'); assert.equal(f.m.apply(old).status,'rejected'); f.m.reload(f.m.getSnapshot().contextId); assert.equal(f.m.getSnapshot().draft,null); assert.equal(f.m.getSnapshot().dirty,false);
});
test('failed commits retain the draft; recovery/exclusive gates prevent a review without changing source', () => {
  const f=model(session(document(),1)); f.edit({x:'18'}); const report=f.review(); const before=stable(f.s); assert.equal(f.m.apply(report).status,'rejected'); assert.equal(stable(f.s),before); assert.equal(f.m.getSnapshot().draft?.x,'18'); assert.equal(f.m.getSnapshot().dirty,true);
  f.s.setWritable(false); assert.equal(f.m.review(f.m.getSnapshot().draftVersion).status,'rejected'); assert.equal(f.commits(),1);
});
