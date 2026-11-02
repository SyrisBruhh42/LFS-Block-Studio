/** Exact read-only recipe impact. The existing session alone applies the proposal. */
import { prepareStudioRecipe, STUDIO_RECIPE_LIMITS } from '../engine/studioRecipe';
import { sameBlueprintData, samePlacementContent } from '../engine/placementContent';
import { chunkKey, getChunkCoordForBlock } from '../engine/chunkAndPatternEngine';
import type { CommandMacroLoop, CustomBlockDefinition, GridCoord, PlacedBlock, WorldChunkConfig, WorldEditEngineState } from '../engine/types';
import { validateStudioDocument, STUDIO_DOCUMENT_LIMITS, type StudioDocument } from './studioDocument';
import { validateStudioWorkspace, type StudioWorkspace } from './studioEditorSession';
import { eligibleJavaDefinitions } from './studioCompatibility';

export const RECIPE_SCRIPT_LIMIT = STUDIO_RECIPE_LIMITS.maxCommands * (STUDIO_RECIPE_LIMITS.maxCommandCharacters + 1);
export interface StudioRecipeDraft { name: string; script: string; iterations: string; intervalMs: string; activeBlockId: string; cursorX: string; cursorY: string; cursorZ: string }
export interface StudioRecipeCellChange { key: string; kind: 'added'|'updated'|'removed'; before: PlacedBlock|null; after: PlacedBlock|null }
export interface StudioRecipeWorkspaceSummary { pos1:GridCoord|null; pos2:GridCoord|null; clipboardCells:number; clipboardDefinitions:number }
export interface StudioRecipeReport {
  format: 'lfs-studio-recipe-review'; version: 1; name: string; sourceToken: string; projectName: string; target: string;
  commands: number; workProxy: number; steps: {command:string;message:string}[];
  cursor: {x:number;y:number;z:number}; activeBlockId: string;
  beforeCells: number; afterCells: number; added: number; updated: number; removed: number; unchanged: number;
  cells: StudioRecipeCellChange[]; revealedChunks: string[];
  materials: {id:string;name:string;before:number;after:number;delta:number}[];
  definitionChanges: {id:string;before:CustomBlockDefinition|null;after:CustomBlockDefinition|null}[];
  sourceEnvelope: { schemaVersion:number; documentId:string; revision:number; historyEpoch:string; targetPolicy:StudioDocument['targetPolicy']|null };
  selectionChanged: boolean; clipboardChanged: boolean; workspaceBefore: StudioRecipeWorkspaceSummary; workspaceAfter: StudioRecipeWorkspaceSummary;
  clipboardChange: { before:Pick<StudioWorkspace,'clipboard'|'clipboardCustomDefs'>; after:Pick<StudioWorkspace,'clipboard'|'clipboardCustomDefs'> }|null;
  noop: boolean;
}
export interface ReviewedStudioRecipe { sourceToken: string; state: WorldEditEngineState; chunkConfig: WorldChunkConfig; report: StudioRecipeReport }
const freeze = <T,>(value:T):T => { if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value; };
const fields = ['name','script','iterations','intervalMs','activeBlockId','cursorX','cursorY','cursorZ'] as const;
export function readStudioRecipeDraft(value: StudioRecipeDraft): StudioRecipeDraft {
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==fields.length)throw new Error('Use the known recipe draft fields.');
  const out = {} as StudioRecipeDraft;
  for(const key of fields){const p=Object.getOwnPropertyDescriptor(value,key);const limit=key==='script'?RECIPE_SCRIPT_LIMIT:key==='name'?80:key==='activeBlockId'?200:32;if(!p?.enumerable||!('value'in p)||typeof p.value!=='string'||p.value.length>limit)throw new Error(`Recipe ${key} is unsupported or too long.`);out[key]=p.value;}
  return out;
}
function integer(text:string,name:string,min:number,max:number){if(!/^[+-]?\d+$/.test(text.trim()))throw new Error(`${name} must be a whole number.`);const value=Number(text);if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error(`${name} must be between ${min} and ${max}.`);return value||0;}
export function recipeDraftMacro(value: StudioRecipeDraft) {
  const draft=readStudioRecipeDraft(value),commands=draft.script.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  if(!draft.name.trim())throw new Error('Give this recipe a name.');
  if(commands.length<1||commands.length>STUDIO_RECIPE_LIMITS.maxCommands)throw new Error('Use 1 to 32 commands, one per line. Blank lines are ignored.');
  const iterations=integer(draft.iterations,'Iterations',1,16),intervalMs=integer(draft.intervalMs,'Preview pause',0,10000);
  if(commands.length*iterations>STUDIO_RECIPE_LIMITS.maxTotalCommands)throw new Error('A recipe can prepare at most 64 command steps.');
  const cursor={x:integer(draft.cursorX,'Cursor X',-1000000,1000000),y:integer(draft.cursorY,'Cursor Y',-1000000,1000000),z:integer(draft.cursorZ,'Cursor Z',-1000000,1000000)};
  const macro:CommandMacroLoop={id:'reviewed-recipe',name:draft.name.trim(),description:'Explicit reviewed WorldEdit recipe',commands,iterations,intervalMs,iconColor:'#6ee7b7'};
  return {draft,macro,cursor};
}
export function recipeDraftFromMacro(macro:CommandMacroLoop,activeBlockId:string,cursor={x:0,y:1,z:0}):StudioRecipeDraft {
  if(!macro||typeof macro!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(macro)))throw new Error('This saved recipe is unsupported.');
  const values:Record<string,unknown>={};
  for(const key of ['name','commands','iterations','intervalMs']){const p=Object.getOwnPropertyDescriptor(macro,key);if(!p?.enumerable||!('value'in p))throw new Error('Saved recipes require plain fields.');values[key]=p.value;}
  const commands=values.commands;
  if(!Array.isArray(commands)||Object.getPrototypeOf(commands)!==Array.prototype||commands.length<1||commands.length>32||Reflect.ownKeys(commands).length!==commands.length+1)throw new Error('Use 1 to 32 plain commands.');
  const lines:string[]=[];
  for(let i=0;i<commands.length;i++){const p=Object.getOwnPropertyDescriptor(commands,String(i));if(!p?.enumerable||!('value'in p)||typeof p.value!=='string'||p.value.length>4096||/[\r\n]/.test(p.value))throw new Error('Each saved recipe command must be plain text on one line.');lines.push(p.value);}
  if(typeof values.name!=='string'||typeof values.iterations!=='number'||typeof values.intervalMs!=='number')throw new Error('Saved recipe fields are unsupported.');
  const draft=readStudioRecipeDraft({name:values.name,script:lines.join('\n'),iterations:String(values.iterations),intervalMs:String(values.intervalMs),activeBlockId,cursorX:String(cursor.x),cursorY:String(cursor.y),cursorZ:String(cursor.z)});
  recipeDraftMacro(draft);return draft;
}
const workspaceOf=(state:WorldEditEngineState):StudioWorkspace=>({pos1:state.pos1,pos2:state.pos2,clipboard:state.clipboard,clipboardCustomDefs:state.clipboardCustomDefs});
function admit(document:StudioDocument,state:WorldEditEngineState,chunkConfig=document.chunkConfig){
  const result=validateStudioDocument({...document,blocks:state.blocks,customBlocks:state.customBlocks,chunkConfig});if(!result.ok)throw new Error(result.error.message);
  validateStudioWorkspace(workspaceOf(state),result.value);return result.value;
}
export async function reviewStudioRecipe(options:{document:StudioDocument;workspace:StudioWorkspace;sourceToken:string;draft:StudioRecipeDraft;signal?:AbortSignal;onProgress?:(done:number,total:number)=>void}):Promise<ReviewedStudioRecipe>{
  const {document,workspace,sourceToken,signal,onProgress}=options,{draft,macro,cursor}=recipeDraftMacro(options.draft);
  if(typeof sourceToken!=='string'||!sourceToken.length||sourceToken.length>4096)throw new Error('A current project source is required.');
  if(!document.customBlocks[draft.activeBlockId])throw new Error('Choose an active block from this project.');
  if(document.targetPolicy?.target.kind==='minecraft-java'&&document.targetPolicy.target.locked&&!eligibleJavaDefinitions(document).includes(draft.activeBlockId))throw new Error('Choose an eligible mapped block for this locked project.');
  const result=await prepareStudioRecipe({state:{blocks:document.blocks,customBlocks:document.customBlocks,...workspace,undoStack:[],redoStack:[]},macro,activeBlockId:draft.activeBlockId,hoveredCoord:cursor,signal,onProgress,validateStep:state=>{admit(document,state);}});
  if(signal?.aborted)throw new DOMException('Recipe preview cancelled.','AbortError');
  // Preserve destination identities when the final authored content already matches.
  const blocks={...result.state.blocks};for(const [key,block]of Object.entries(blocks))if(samePlacementContent(document.blocks[key],block))blocks[key]=structuredClone(document.blocks[key]);
  const state={...result.state,blocks},cells:StudioRecipeCellChange[]=[];
  for(const key of new Set([...Object.keys(document.blocks),...Object.keys(blocks)])){
    const before=document.blocks[key],after=blocks[key];if(!sameBlueprintData(before,after))cells.push({key,kind:!before?'added':!after?'removed':'updated',before:before?structuredClone(before):null,after:after?structuredClone(after):null});
  }
  const revealedChunks:string[]=[],chunkConfig=structuredClone(document.chunkConfig),unlocked=new Set(chunkConfig.unlockedChunks);
  for(const cell of cells)if(cell.after){const {cx,cz}=getChunkCoordForBlock(cell.after.position.x,cell.after.position.z,chunkConfig.chunkSize),key=chunkKey(cx,cz);if(!unlocked.has(key)||chunkConfig.activeChunks[key]!==true){if(!unlocked.has(key)){if(unlocked.size>=STUDIO_DOCUMENT_LIMITS.maxChunks)throw new Error('The recipe would exceed the project chunk allowance.');unlocked.add(key);chunkConfig.unlockedChunks.push(key);}chunkConfig.activeChunks[key]=true;revealedChunks.push(key);}}
  admit(document,state,chunkConfig);
  const definitionChanges:StudioRecipeReport['definitionChanges']=[];
  for(const id of new Set([...Object.keys(document.customBlocks),...Object.keys(state.customBlocks)]))if(!sameBlueprintData(document.customBlocks[id],state.customBlocks[id]))definitionChanges.push({id,before:document.customBlocks[id]?structuredClone(document.customBlocks[id]):null,after:state.customBlocks[id]?structuredClone(state.customBlocks[id]):null});
  const counts=(placed:StudioDocument['blocks'])=>{const map=new Map<string,number>();for(const block of Object.values(placed))map.set(block.blockDefId,(map.get(block.blockDefId)??0)+1);return map;},beforeCounts=counts(document.blocks),afterCounts=counts(blocks);
  const materials=[...new Set([...beforeCounts.keys(),...afterCounts.keys()])].filter(id=>beforeCounts.get(id)!==afterCounts.get(id)).map(id=>({id,name:state.customBlocks[id]?.name??document.customBlocks[id]?.name??id,before:beforeCounts.get(id)??0,after:afterCounts.get(id)??0,delta:(afterCounts.get(id)??0)-(beforeCounts.get(id)??0)}));
  const afterWorkspace=workspaceOf(state),selectionChanged=!sameBlueprintData([workspace.pos1,workspace.pos2],[state.pos1,state.pos2]),clipboardChanged=!sameBlueprintData([workspace.clipboard,workspace.clipboardCustomDefs],[state.clipboard,state.clipboardCustomDefs]);
  const added=cells.filter(c=>c.kind==='added').length,updated=cells.filter(c=>c.kind==='updated').length,removed=cells.filter(c=>c.kind==='removed').length;
  const summary=(w:StudioWorkspace):StudioRecipeWorkspaceSummary=>({pos1:w.pos1?{...w.pos1}:null,pos2:w.pos2?{...w.pos2}:null,clipboardCells:w.clipboard.length,clipboardDefinitions:w.clipboardCustomDefs.length});
  const report:StudioRecipeReport={format:'lfs-studio-recipe-review',version:1,name:macro.name,sourceToken,projectName:document.world.worldName,target:document.targetPolicy?.target.kind==='minecraft-java'?`Java candidate · ${document.targetPolicy.target.locked?'Locked':'Unlocked'} · native untested`:'Freeform',commands:result.commands,workProxy:result.workProxy,steps:result.steps,cursor,activeBlockId:draft.activeBlockId,beforeCells:Object.keys(document.blocks).length,afterCells:Object.keys(blocks).length,added,updated,removed,unchanged:Object.keys(blocks).length-added-updated,cells,revealedChunks,materials,definitionChanges,sourceEnvelope:{schemaVersion:document.schemaVersion,documentId:document.documentId,revision:document.revision,historyEpoch:document.historyEpoch,targetPolicy:document.targetPolicy?structuredClone(document.targetPolicy):null},selectionChanged,clipboardChanged,workspaceBefore:summary(workspace),workspaceAfter:summary(afterWorkspace),clipboardChange:clipboardChanged?{before:structuredClone({clipboard:workspace.clipboard,clipboardCustomDefs:workspace.clipboardCustomDefs}),after:structuredClone({clipboard:afterWorkspace.clipboard,clipboardCustomDefs:afterWorkspace.clipboardCustomDefs})}:null,noop:cells.length===0&&definitionChanges.length===0&&!selectionChanged&&!clipboardChanged&&revealedChunks.length===0};
  if(new TextEncoder().encode(JSON.stringify(report)).byteLength>STUDIO_DOCUMENT_LIMITS.maxBytes)throw new Error('The exact recipe review exceeds its 32 MiB allowance. Split the recipe into smaller reviewed edits.');
  return freeze({sourceToken,state,chunkConfig,report});
}
