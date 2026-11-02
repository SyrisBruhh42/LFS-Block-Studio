import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStudioDocument } from './studioDocument.test-fixtures';
import { StudioEditorSession } from './studioEditorSession';
import { StudioRecipeModel } from './studioRecipeModel';
import { readStudioRecipeDraft, recipeDraftFromMacro, reviewStudioRecipe, type ReviewedStudioRecipe, type StudioRecipeDraft } from './studioRecipeReview';
import { candidateJavaTarget } from './studioTargetPolicy';
import { captureJavaDefinitionBinding } from '../engine/javaCellMapping';
import { prepareStudioRecipe } from '../engine/studioRecipe';
import { createPlacementIdentity } from '../engine/placementContent';
import { executeWorldEditCommand, stampBlueprintIntoWorld, createBlueprintFromCustomBlock } from '../engine/worldEditEngine';

function document(locked=false){
  const d=makeStudioDocument('recipe-review-fixture'),unit={...d.customBlocks.cobble_brick,id:'unit',name:'Recipe unit',shape:'cube' as const,width:1,depth:1,heightPlates:3,hasStuds:false};delete unit.defaultScale;delete unit.voxels;
  d.customBlocks={unit,other:{...unit,id:'other',name:'Other unit'}};d.blueprints=[];d.blocks={'0,1,0':{id:'original-stable',blockDefId:'unit',position:{x:0,y:1,z:0},rotation:0},'2,1,0':{id:'other-stable',blockDefId:'unit',position:{x:2,y:1,z:0},rotation:0}};
  d.extensions={preserve:['all','authored','fields']};d.chunkConfig.activeChunks={'0,0':true};d.chunkConfig.unlockedChunks=['0,0'];
  if(locked){const binding=captureJavaDefinitionBinding(unit,'minecraft:stone');assert.ok(binding.ok);d.schemaVersion=2;d.revision=1;d.historyEpoch='locked-epoch';d.targetPolicy={policyVersion:1,checkpoint:{documentId:d.documentId,revision:0,historyEpoch:'epoch-fixture'},target:candidateJavaTarget([binding.binding])};}
  return d;
}
function session(locked=false,maxBytes=16*1048576){const s=new StudioEditorSession(document(locked),{maxEntries:30,maxBytes});s.setWritable(true);s.setEngineState({...s.getEngineState(),pos1:{x:0,y:1,z:0},pos2:{x:0,y:1,z:0}});return s;}
const draft=(patch:Partial<StudioRecipeDraft>={}):StudioRecipeDraft=>({name:'Review fixture',script:'//set {active}',iterations:'1',intervalMs:'0',activeBlockId:'unit',cursorX:'0',cursorY:'1',cursorZ:'0',...patch});
const source=(s:StudioEditorSession)=>({document:s.getDocument(),workspace:s.getSnapshot().workspace,token:JSON.stringify(s.getToken()),writable:s.getSnapshot().writable&&!s.getSnapshot().exclusive});
const stable=(s:StudioEditorSession)=>JSON.stringify({document:s.getDocument(),workspace:s.getSnapshot().workspace,token:s.getToken(),history:s.getHistoryUsage()});
const review=(s:StudioEditorSession,d=draft())=>reviewStudioRecipe({...source(s),sourceToken:JSON.stringify(s.getToken()),draft:d});
const commit=(s:StudioEditorSession,p:ReviewedStudioRecipe)=>s.transaction('Apply reviewed recipe',()=>{s.setEngineState(p.state);s.setDocumentField('chunkConfig',p.chunkConfig);},JSON.parse(p.sourceToken));
const macro=(commands=['//set {active}'])=>({id:'fixture',name:'Saved recipe',description:'Fixture',commands,iterations:1,intervalMs:0,iconColor:'#ffffff'});
function model(s=session(),producer:typeof reviewStudioRecipe=reviewStudioRecipe){let calls=0;const m=new StudioRecipeModel(()=>source(s),p=>{calls++;return commit(s,p);},producer);s.subscribe(m.synchronize);m.show('unit');m.update(draft(),m.getSnapshot().version);return{s,m,calls:()=>calls,edit:(p:Partial<StudioRecipeDraft>)=>m.update(p,m.getSnapshot().version),preview:()=>m.preview(m.getSnapshot().version)};}

test('complete recipe review is detached, exact, chunk-aware and commits one full document/workspace Undo',async()=>{
  const s=session(),before=stable(s),p=await review(s,draft({script:'//pos1 -18 1 0\n//pos2 -16 2 1\n//set {active}\n//copy\n//shift 1 up'}));
  assert.equal(stable(s),before);assert.equal(p.report.added,12);assert.equal(p.report.updated,0);assert.equal(p.report.removed,0);assert.equal(p.report.afterCells,14);assert.equal(p.report.selectionChanged,true);assert.equal(p.report.clipboardChanged,true);assert.deepEqual(p.report.revealedChunks,['-1,0']);assert.equal(p.report.workspaceAfter.clipboardCells,12);assert.equal(p.report.commands,5);assert.equal(p.report.steps.length,5);assert.equal(p.report.steps[2].command,'//set @unit');
  assert.ok(Object.isFrozen(p.report.cells[0].after!.position));assert.equal(commit(s,p).status,'applied');const after=JSON.stringify({document:s.getDocument(),workspace:s.getSnapshot().workspace});assert.equal(s.getDocument().blocks['0,1,0'].id,'original-stable');assert.equal(s.getDocument().chunkConfig.activeChunks['-1,0'],true);assert.deepEqual(s.getDocument().extensions,{preserve:['all','authored','fields']});
  assert.equal(s.undo().status,'applied');assert.deepEqual(s.getDocument(),JSON.parse(before).document);assert.deepEqual(s.getSnapshot().workspace,JSON.parse(before).workspace);assert.equal(s.redo().status,'applied');assert.equal(JSON.stringify({document:s.getDocument(),workspace:s.getSnapshot().workspace}),after);
});
test('unchanged final cells keep original IDs and preserve source, history and pending Redo',async()=>{
  const s=session();s.setWorldField('worldName','Pending Redo');s.undo();const before=stable(s),p=await review(s);assert.equal(p.report.noop,true);assert.equal(p.report.cells.length,0);assert.equal(p.state.blocks['0,1,0'].id,'original-stable');assert.equal(commit(s,p).status,'noop');assert.equal(stable(s),before);assert.equal(s.redo().status,'applied');
});
test('an updated cell reports appearance loss and exact before/after rather than a net block count',async()=>{
  const s=session();s.setDocumentField('blocks',{...s.getDocument().blocks,'0,1,0':{...s.getDocument().blocks['0,1,0'],colorOverride:'#123456',customScale:{x:2,y:1,z:1}}});const p=await review(s);assert.equal(p.report.beforeCells,p.report.afterCells);assert.equal(p.report.updated,1);assert.equal(p.report.cells[0].before?.colorOverride,'#123456');assert.equal(p.report.cells[0].after?.colorOverride,undefined);assert.deepEqual(p.report.cells[0].before?.customScale,{x:2,y:1,z:1});assert.equal(p.report.noop,false);
});
test('removed cells, selection-only and clipboard-only recipes expose their independent effects',async()=>{
  const s=session();const removed=await review(s,draft({script:'//clear'}));assert.equal(removed.report.removed,1);assert.equal(removed.report.cells[0].after,null);assert.deepEqual(removed.report.revealedChunks,[]);
  const selection=await review(s,draft({script:'//pos1 4 5 6\n//pos2 4 5 6'}));assert.equal(selection.report.cells.length,0);assert.equal(selection.report.selectionChanged,true);assert.equal(selection.report.noop,false);assert.equal(commit(s,selection).status,'applied');s.undo();
  const copy=await review(s,draft({script:'//copy'}));assert.equal(copy.report.cells.length,0);assert.equal(copy.report.clipboardChanged,true);assert.equal(copy.report.clipboardChange!.after.clipboard[0].blockDefId,'unit');assert.equal(copy.report.clipboardChange!.after.clipboardCustomDefs[0].id,'unit');
});
test('material totals expose exact positive and negative changes including unchanged cells',async()=>{
  const s=session(),p=await review(s,draft({script:'//set other'}));assert.deepEqual(p.report.materials,[{id:'unit',name:'Recipe unit',before:2,after:1,delta:-1},{id:'other',name:'Other unit',before:0,after:1,delta:1}]);assert.equal(p.report.unchanged,1);
});
test('explicit cursor is captured for omitted command coordinates and does not inherit a later hover',async()=>{
  const s=session(),p=await review(s,draft({script:'//pos1\n//pos2\n//set {active}',cursorX:'-18',cursorY:'4',cursorZ:'2'}));assert.deepEqual(p.report.cursor,{x:-18,y:4,z:2});assert.ok(p.state.blocks['-18,4,2']);assert.deepEqual(s.getSnapshot().workspace.pos1,{x:0,y:1,z:0});
});
test('partial errors, unknown commands and undo/redo leave all source and history unchanged',async()=>{
  const s=session(),before=stable(s);for(const script of ['//set other\n//unknown','//set other\n//undo','//redo','alert(1)'])await assert.rejects(review(s,draft({script})));assert.equal(stable(s),before);
});
test('the locked profile validates every intermediate command, not only a later repaired final result',async()=>{
  const s=session(true),before=stable(s);await assert.rejects(review(s,draft({script:'//set other\n//set unit'})),/command 1.*rejected/i);assert.equal(stable(s),before);const p=await review(s,draft({script:'//pos1 -18 1 0\n//pos2 -18 1 0\n//set {active}'}));assert.equal(commit(s,p).status,'applied');assert.deepEqual(s.getDocument().targetPolicy,JSON.parse(before).document.targetPolicy);assert.equal(s.getDocument().blocks['-18,1,0'].rotation,0);
});
test('invalid script, parameters, material and cursor reject without coercion or source mutation',async()=>{
  const s=session(),before=stable(s);for(const p of [{name:''},{iterations:'17'},{iterations:'0x10'},{intervalMs:'10001'},{intervalMs:'1.5'},{cursorX:'.5'},{cursorZ:'1000001'},{activeBlockId:'missing'},{script:''},{script:Array(33).fill('//help').join('\n')},{script:'x'.repeat(4097)},{iterations:'16',script:Array(5).fill('//help').join('\n')}])await assert.rejects(review(s,draft(p)));assert.equal(stable(s),before);
});
test('draft and saved-macro admission reject getters, sparse arrays and unknown draft fields before reading them',()=>{
  let reads=0;const value=Object.defineProperty({...draft()},'script',{enumerable:true,get(){reads++;return'//help';}});assert.throws(()=>readStudioRecipeDraft(value));assert.throws(()=>readStudioRecipeDraft({...draft(),extra:'field'} as any));const saved=macro();Object.defineProperty(saved.commands,'0',{enumerable:true,get(){reads++;return'//help';}});assert.throws(()=>recipeDraftFromMacro(saved,'unit'));assert.throws(()=>recipeDraftFromMacro(macro(new Array(2)),'unit'));assert.equal(reads,0);
});
test('the shared step validator rejects before any later command or progress and exposes no result',async()=>{
  const s=session(),progress:number[]=[];await assert.rejects(prepareStudioRecipe({state:s.getEngineState(),macro:macro(['//help','//clear']),activeBlockId:'unit',validateStep:()=>{throw new Error('Rejected validation fixture');},onProgress:n=>progress.push(n)}),/command 1.*Rejected validation/);assert.deepEqual(progress,[]);
});
test('a final history admission failure rolls back cells, selection, clipboard and chunks after review',async()=>{
  const s=session(false,1024);const p=await review(s,draft({script:'//pos1 18 1 18\n//pos2 20 3 20\n//set unit\n//copy'}));const before=stable(s);assert.equal(commit(s,p).status,'rejected');assert.equal(stable(s),before);
});
test('model preview and Cancel are read-only and keep the commands for a fresh preview',async()=>{
  const f=model(),before=stable(f.s);await f.preview();assert.ok(f.m.getSnapshot().report);f.m.cancel();assert.equal(f.m.getSnapshot().report,null);assert.equal(f.m.getSnapshot().draft.script,'//set {active}');assert.equal(stable(f.s),before);assert.equal(f.calls(),0);await f.preview();assert.ok(f.m.getSnapshot().report);
});
test('model Apply executes once and old Apply callbacks cannot target a new review after close/reopen',async()=>{
  const f=model();f.edit({script:'//set other'});await f.preview();const old=f.m.getSnapshot().report!;f.m.close();assert.equal(f.m.apply(old).status,'rejected');f.m.show('unit');await f.preview();const current=f.m.getSnapshot().report!;assert.equal(f.m.apply(old).status,'rejected');assert.equal(f.m.getSnapshot().report,current);assert.equal(f.m.apply(current).status,'applied');assert.equal(f.m.apply(current).status,'rejected');assert.equal(f.calls(),1);
});
test('dirty close/reopen and shelf replacement preserve drafts until replacement is explicit',()=>{
  const f=model();f.edit({name:'Keep this',script:'//set other'});f.m.close();f.m.show('unit');assert.equal(f.m.getSnapshot().draft.name,'Keep this');assert.equal(f.m.loadMacro(macro(),'unit',{x:0,y:1,z:0},false,f.m.getSnapshot().version).status,'rejected');assert.equal(f.m.getSnapshot().draft.script,'//set other');assert.equal(f.m.loadMacro(macro(),'unit',{x:0,y:1,z:0},true,f.m.getSnapshot().version).status,'noop');assert.equal(f.m.getSnapshot().draft.name,'Saved recipe');assert.equal(f.m.getSnapshot().dirty,false);
});
test('intervening edits, selection changes, edit-to-Undo ABA and project activation revoke prepared Apply',async()=>{
  const f=model();f.edit({script:'//set other'});await f.preview();const p=f.m.getSnapshot().report!;f.s.setWorldField('worldName','Intervening');f.s.undo();assert.equal(f.m.getSnapshot().report,null);assert.equal(f.m.apply(p).status,'rejected');assert.equal(f.calls(),0);assert.equal(f.m.getSnapshot().draft.script,'//set other');await f.preview();const q=f.m.getSnapshot().report!;const handle=f.s.beginExclusive()!;assert.equal(f.s.installVerifiedDocument({...document(),documentId:'different'}).status,'applied');f.s.endExclusive(handle);assert.equal(f.m.apply(q).status,'rejected');
});
test('Cancel during a cooperative delay prevents further steps and preserves all authored effects',async()=>{
  const f=model(),before=stable(f.s);f.edit({script:'//set other\n//clear',intervalMs:'10000'});const pending=f.preview();assert.equal(f.m.getSnapshot().completed,1);f.m.cancel();await pending;assert.equal(f.m.getSnapshot().preparing,false);assert.equal(f.m.getSnapshot().report,null);assert.equal(stable(f.s),before);assert.equal(f.calls(),0);
});
test('editing while preparation is delayed cancels the old job and a cached draft callback cannot overwrite a new one',async()=>{
  const f=model();f.edit({script:'//help\n//set other',intervalMs:'10000'});const version=f.m.getSnapshot().version,pending=f.preview();f.edit({script:'//clear',intervalMs:'0'});assert.equal(f.m.update({name:'stale'},version).status,'rejected');await pending;assert.equal(f.m.getSnapshot().draft.script,'//clear');assert.equal(f.m.getSnapshot().report,null);await f.preview();assert.equal(f.m.getSnapshot().report?.removed,1);
});
test('a producer ignoring cancellation cannot publish late progress/results into a newer job or closed context',async()=>{
  const s=session(),prepared=await review(s,draft({script:'//set other'}));const jobs:{resolve:(v:ReviewedStudioRecipe)=>void;progress?:((a:number,b:number)=>void)}[]=[];
  const fake:typeof reviewStudioRecipe=o=>new Promise(resolve=>jobs.push({resolve,progress:o.onProgress}));const f=model(s,fake),a=f.preview();f.m.close();f.m.show('unit');const b=f.preview();jobs[0].progress?.(63,64);jobs[0].resolve(prepared);await a;assert.equal(f.m.getSnapshot().completed,0);assert.equal(f.m.getSnapshot().report,null);jobs[1].resolve(prepared);await b;assert.equal(f.m.getSnapshot().report,prepared.report);assert.equal(f.calls(),0);
});
test('source change cancels delayed preparation and unavailable write authority blocks Preview/Apply',async()=>{
  const f=model();f.edit({script:'//help\n//set other',intervalMs:'10000'});const pending=f.preview();f.s.setWorldField('worldName','Changed');await pending;assert.equal(f.m.getSnapshot().report,null);assert.equal(f.m.getSnapshot().preparing,false);f.s.setWritable(false);assert.equal((await f.preview()).status,'rejected');assert.equal(f.calls(),0);
});
test('recipes can build at a former coordinate without duplicating a cell ID moved by precise editing',async()=>{
  const s=session();s.setDocumentField('blocks',{'10,1,0':{...s.getDocument().blocks['0,1,0'],id:'blk_0_1_0',position:{x:10,y:1,z:0}}});const p=await review(s);assert.equal(commit(s,p).status,'applied');assert.equal(s.getDocument().blocks['10,1,0'].id,'blk_0_1_0');assert.notEqual(s.getDocument().blocks['0,1,0'].id,'blk_0_1_0');
});
test('deleting and rebuilding an anchor creates a new identity while command moves preserve the moved identity',async()=>{
  const s=session();s.setDocumentField('blocks',{'0,1,0':{...s.getDocument().blocks['0,1,0'],id:'blk_0_1_0'}});assert.equal(commit(s,await review(s,draft({script:'//clear'}))).status,'applied');assert.equal(commit(s,await review(s)).status,'applied');const id=s.getDocument().blocks['0,1,0'].id;assert.notEqual(id,'blk_0_1_0');assert.equal(commit(s,await review(s,draft({script:'//move 2 east'}))).status,'applied');assert.equal(s.getDocument().blocks['2,1,0'].id,id);
});
test('pasting a clipboard definition reports its exact admitted library change and full Undo',async()=>{
  const s=session(),def={...s.getDocument().customBlocks.unit,id:'clipboard-unit',name:'Portable clipboard unit'};s.setEngineState({...s.getEngineState(),clipboard:[{id:'clip-only',blockDefId:def.id,position:{x:0,y:0,z:0},rotation:0}],clipboardCustomDefs:[def]});const before=stable(s),p=await review(s,draft({script:'//paste 18 2 18'}));assert.equal(p.report.definitionChanges.length,1);assert.equal(p.report.definitionChanges[0].before,null);assert.deepEqual(p.report.definitionChanges[0].after,def);assert.equal(p.report.clipboardChange,null,'Unchanged clipboard must not be copied into the review.');assert.equal(commit(s,p).status,'applied');s.undo();assert.deepEqual(s.getDocument(),JSON.parse(before).document);assert.deepEqual(s.getSnapshot().workspace,JSON.parse(before).workspace);
});
test('placement identity allocation is stable per anchor, unique for new anchors and bounded when entropy repeats',t=>{
  const s=session(),allocate=createPlacementIdentity(s.getDocument().blocks);assert.equal(allocate('0,1,0'),'original-stable');const a=allocate('5,1,0');assert.equal(allocate('5,1,0'),a);assert.notEqual(allocate('6,1,0'),a);
  const repeated=createPlacementIdentity({'9,1,0':{...s.getDocument().blocks['0,1,0'],id:'block-collision'}});const mock=t.mock.method(globalThis.crypto,'randomUUID',()=> 'collision');assert.throws(()=>repeated('7,1,0'),/unique placement identity/);assert.equal(mock.mock.callCount(),8);
});
test('command allocation failure rejects the complete session transaction without partial cells/history',t=>{
  const s=session();s.setDocumentField('blocks',{'9,1,0':{...s.getDocument().blocks['0,1,0'],id:'block-collision',position:{x:9,y:1,z:0}}});const before=stable(s);t.mock.method(globalThis.crypto,'randomUUID',()=> 'collision');const r=s.transaction('Entropy failure',()=>s.setEngineState(executeWorldEditCommand(s.getEngineState(),'//set unit').nextState));assert.equal(r.status,'rejected');assert.equal(stable(s),before);
});
test('blueprint stamping uses fresh identities after a retained coordinate ID moved elsewhere',()=>{
  const s=session();s.setDocumentField('blocks',{'10,1,0':{...s.getDocument().blocks['0,1,0'],id:'blk_0_1_0',position:{x:10,y:1,z:0}}});const bp=createBlueprintFromCustomBlock(s.getDocument().customBlocks.unit);const r=s.transaction('Stamp collision fixture',()=>s.setEngineState(stampBlueprintIntoWorld(s.getEngineState(),bp,{x:0,y:1,z:0})));assert.equal(r.status,'applied');assert.equal(new Set(Object.values(s.getDocument().blocks).map(b=>b.id)).size,2);assert.equal(s.getDocument().blocks['10,1,0'].id,'blk_0_1_0');
});
test('the selected active block is exact even when definition IDs differ only in case',async()=>{
  const s=session();s.setDocumentField('customBlocks',{...s.getDocument().customBlocks,Unit:{...s.getDocument().customBlocks.unit,id:'Unit',name:'Upper case unit'},unit:{...s.getDocument().customBlocks.unit,name:'Lower case unit'}});const p=await review(s,draft({activeBlockId:'Unit'}));assert.equal(p.state.blocks['0,1,0'].blockDefId,'Unit');
});
test('an active definition named air is placed as a block rather than interpreted as an erase alias',async()=>{
  const s=session();s.setDocumentField('customBlocks',{...s.getDocument().customBlocks,air:{...s.getDocument().customBlocks.unit,id:'air',name:'Air named custom block'}});const p=await review(s,draft({activeBlockId:'air'}));assert.equal(p.state.blocks['0,1,0']?.blockDefId,'air');
});
test('exact @id references cannot fall back to a similarly named block and placeholders must occupy complete arguments',async()=>{
  const s=session(),before=stable(s);await assert.rejects(review(s,draft({script:'//set @uni'})),/not found/);await assert.rejects(review(s,draft({script:'//set prefix_{active}'})),/complete block argument/);await assert.rejects(review(s,draft({script:'{active}'})),/command name/);assert.equal(stable(s),before);const p=await review(s,draft({script:'//set @other'}));assert.equal(p.state.blocks['0,1,0'].blockDefId,'other');
});
test('loading saved commands does not silently expand an embedded newline into an additional operation',()=>{
  assert.throws(()=>recipeDraftFromMacro(macro(['//help\n//island']),'unit'),/one line/);
});
test('step admission cannot silently ignore an async function or returned Promise',async()=>{
  const s=session(),before=stable(s);let called=false;await assert.rejects(prepareStudioRecipe({state:s.getEngineState(),macro:macro(),activeBlockId:'unit',validateStep:async()=>{called=true;}}),/synchronous callback/);assert.equal(called,false);
  await assert.rejects(prepareStudioRecipe({state:s.getEngineState(),macro:macro(),activeBlockId:'unit',validateStep:()=>Promise.reject(new Error('Late validator failure'))}),/complete synchronously/);await Promise.resolve();assert.equal(stable(s),before);
});
