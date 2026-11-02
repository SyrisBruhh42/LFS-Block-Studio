/** One cancellable draft/review lifecycle; no authored world or history ownership. */
import { readStudioRecipeDraft, recipeDraftFromMacro, reviewStudioRecipe, type ReviewedStudioRecipe, type StudioRecipeDraft, type StudioRecipeReport } from './studioRecipeReview';
import type { StudioDocument } from './studioDocument';
import type { StudioEditorResult, StudioWorkspace } from './studioEditorSession';
import type { CommandMacroLoop, GridCoord } from '../engine/types';

export interface StudioRecipeSnapshot {
  readonly open:boolean; readonly draft:Readonly<StudioRecipeDraft>; readonly version:number; readonly dirty:boolean;
  readonly preparing:boolean; readonly completed:number; readonly total:number; readonly report:StudioRecipeReport|null;
  readonly message:string; readonly focusSerial:number;
}
export interface StudioRecipeSource { document:StudioDocument; workspace:StudioWorkspace; token:string; writable:boolean }
const rejected=(message:string):StudioEditorResult=>({status:'rejected',message});
export class StudioRecipeModel {
  private snapshot:StudioRecipeSnapshot=Object.freeze({open:false,draft:Object.freeze({name:'Small room shell',script:'//pos1 10 1 10\n//pos2 14 4 14\n//box {active}',iterations:'1',intervalMs:'0',activeBlockId:'',cursorX:'0',cursorY:'1',cursorZ:'0'}),version:0,dirty:false,preparing:false,completed:0,total:0,report:null,message:'',focusSerial:0});
  private readonly listeners=new Set<()=>void>();
  private job:AbortController|null=null;
  private generation=0;
  private prepared:ReviewedStudioRecipe|null=null;
  private observedToken:string;
  constructor(private readonly read:()=>StudioRecipeSource,private readonly commit:(proposal:ReviewedStudioRecipe)=>StudioEditorResult,private readonly prepare:typeof reviewStudioRecipe=reviewStudioRecipe){this.observedToken=read().token;}
  getSnapshot=()=>this.snapshot;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private publish(patch:Partial<StudioRecipeSnapshot>){this.snapshot=Object.freeze({...this.snapshot,...patch});for(const listener of this.listeners)listener();}
  private invalidate(){this.generation++;this.job?.abort();this.job=null;this.prepared=null;}
  private fail(message:string){this.publish({message});return rejected(message);}
  show=(activeBlockId:string)=>{
    this.invalidate();const draft=this.snapshot.draft.activeBlockId?this.snapshot.draft:{...this.snapshot.draft,activeBlockId};
    this.publish({open:true,draft:Object.freeze(draft),preparing:false,report:null,version:this.snapshot.version+1,focusSerial:this.snapshot.focusSerial+1,message:''});
  };
  close=()=>{this.invalidate();this.publish({open:false,preparing:false,report:null,version:this.snapshot.version+1});};
  cancel=()=>{this.invalidate();this.publish({preparing:false,report:null,version:this.snapshot.version+1,message:'Preview cancelled. The build and recipe draft are unchanged.'});};
  update=(partial:Partial<StudioRecipeDraft>,version:number):StudioEditorResult=>{
    if(!this.snapshot.open||version!==this.snapshot.version)return rejected('This recipe draft is no longer active.');
    try{
      if(!partial||typeof partial!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(partial)))throw new Error('Use plain recipe values.');
      const next={...this.snapshot.draft};for(const key of Reflect.ownKeys(partial)){if(typeof key!=='string'||!Object.hasOwn(next,key))throw new Error('Unknown recipe field.');const p=Object.getOwnPropertyDescriptor(partial,key)!;if(!p.enumerable||!('value'in p))throw new Error('Use plain recipe values.');(next as any)[key]=p.value;}
      const draft=Object.freeze(readStudioRecipeDraft(next));this.invalidate();this.publish({draft,dirty:true,preparing:false,report:null,message:'',version:this.snapshot.version+1});return{status:'noop'};
    }catch(error){return this.fail(error instanceof Error?error.message:'Unsupported recipe value.');}
  };
  loadMacro=(macro:CommandMacroLoop,activeBlockId:string,cursor:GridCoord,replace:boolean,version:number):StudioEditorResult=>{
    if(!this.snapshot.open||version!==this.snapshot.version)return rejected('This recipe shelf is no longer active.');
    try{
      const draft=recipeDraftFromMacro(macro,activeBlockId,cursor);
      if(this.snapshot.dirty&&!replace)return this.fail('Your unfinished draft is retained. Select Replace current draft before loading another recipe.');
      this.invalidate();this.publish({draft:Object.freeze(draft),dirty:false,preparing:false,report:null,version:this.snapshot.version+1,message:'Recipe loaded as a draft. Preview its impact before Apply.'});return{status:'noop'};
    }catch(error){return this.fail(error instanceof Error?error.message:'This recipe could not be loaded.');}
  };
  synchronize=()=>{
    const source=this.read(),changed=source.token!==this.observedToken;this.observedToken=source.token;
    if((changed||!source.writable)&&(this.job||this.prepared||this.snapshot.report)){this.invalidate();this.publish({preparing:false,report:null,version:this.snapshot.version+1,message:'The project changed or is unavailable. Your commands are retained. Preview the current build again.'});}
  };
  preview=async(version:number):Promise<StudioEditorResult>=>{
    if(!this.snapshot.open||version!==this.snapshot.version)return rejected('This recipe draft is no longer active.');
    if(this.job)return rejected('A preview is already being prepared.');
    const source=this.read();if(!source.writable)return this.fail('Wait for project recovery or replacement before preparing a recipe.');
    this.invalidate();const generation=this.generation,job=new AbortController(),draft=this.snapshot.draft;this.job=job;
    this.publish({preparing:true,completed:0,total:0,report:null,message:'Preparing an isolated preview. The build stays unchanged.'});
    try{
      const prepared=await this.prepare({document:source.document,workspace:source.workspace,sourceToken:source.token,draft,signal:job.signal,onProgress:(completed,total)=>{if(this.generation===generation&&this.job===job&&!job.signal.aborted)this.publish({completed,total});}});
      if(this.generation!==generation||this.job!==job||job.signal.aborted||!this.snapshot.open)return rejected('This preview was cancelled or replaced.');
      const now=this.read();if(now.token!==source.token||!now.writable){this.invalidate();this.publish({preparing:false,report:null,message:'The project changed. Your draft is retained; preview it again.'});return rejected(this.snapshot.message);}
      this.job=null;this.prepared=prepared;this.publish({preparing:false,report:prepared.report,message:prepared.report.noop?'No final change. Applying retains history and Redo.':'Preview ready. Review the complete changes before Apply.'});return{status:'noop'};
    }catch(error){
      if(this.generation!==generation||this.job!==job)return rejected('This preview was cancelled or replaced.');
      this.job=null;this.prepared=null;this.publish({preparing:false,report:null,message:error instanceof Error?error.message:'The recipe preview failed. Nothing was applied.'});return rejected(this.snapshot.message);
    }
  };
  apply=(report:StudioRecipeReport):StudioEditorResult=>{
    if(!this.snapshot.open||!this.prepared||report!==this.snapshot.report||report!==this.prepared.report)return rejected('This recipe review is no longer active. Preview the draft again.');
    const source=this.read();if(!source.writable||source.token!==this.prepared.sourceToken){this.invalidate();this.publish({report:null,preparing:false,message:'The project changed or is unavailable. Preview again before Apply.'});return rejected(this.snapshot.message);}
    const prepared=this.prepared;this.invalidate();this.publish({report:null,preparing:false});
    let result:StudioEditorResult;try{result=this.commit(prepared);}catch(error){result=rejected(error instanceof Error?error.message:'The recipe could not be applied.');}
    this.publish({dirty:result.status==='rejected'?this.snapshot.dirty:false,message:result.message??(result.status==='applied'?'Recipe applied as one edit. Undo restores the complete previous build and selection.':result.status==='noop'?'No change. History and Redo were retained.':'Recipe rejected. The draft is retained.')});return result;
  };
}
