import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { X, Code2 } from 'lucide-react';
import { SolarpunkIcon } from '../resources/oasis/SolarpunkIcon';
import { WORLDEDIT_COMMANDS_HELP } from '../engine/worldEditEngine';
import type { CommandMacroLoop, CustomBlockDefinition, GridCoord, PlacedBlock } from '../engine/types';
import type { StudioRecipeModel, StudioRecipeSnapshot } from '../lib/studioRecipeModel';
import { RECIPE_SCRIPT_LIMIT, type StudioRecipeDraft, type StudioRecipeReport } from '../lib/studioRecipeReview';
import type { StudioWorkspacePreferences } from '../lib/useStudioWorkspacePreferences';
import '../resources/oasis/lds-tokens.css';
import './StudioWorkspaceMenu.css';
import './StudioRecipeWorkspace.css';

interface Props {
  model:StudioRecipeModel; snapshot:StudioRecipeSnapshot; writable:boolean; sourceToken:string;
  preferences:StudioWorkspacePreferences; definitions:Record<string,CustomBlockDefinition>;
  macros:CommandMacroLoop[]; activeBlockId:string; currentCursor:GridCoord;
}
const point=(p:GridCoord|null)=>p?`${p.x}, ${p.y}, ${p.z}`:'Not set';
const blockText=(b:PlacedBlock|null)=>b?`${b.blockDefId} · ${point(b.position)} · ${b.rotation}° · ${b.customScale?`instance scale ${b.customScale.x} × ${b.customScale.y} × ${b.customScale.z}`:'definition scale'} · color ${b.colorOverride??'definition'} · texture ${b.textureOverride??'definition'} · finish ${b.materialOverride??'definition'}`:'Empty';
const pageSize=25;
/** Native modal ownership and one shared preview/Apply path for menu and HUD recipes. */
export function StudioRecipeWorkspace({model,snapshot,writable,sourceToken,preferences,definitions,macros,activeBlockId,currentCursor}:Props){
  const dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null);
  const [preset,setPreset]=useState('0'),[replace,setReplace]=useState(false),[tab,setTab]=useState<'summary'|'cells'|'workspace'|'trace'>('summary');
  const [query,setQuery]=useState(''),[kind,setKind]=useState('all'),[page,setPage]=useState(0),[showWorkspace,setShowWorkspace]=useState(false);
  const [downloadMessage,setDownloadMessage]=useState<{report:StudioRecipeReport;message:string}|null>(null);
  useEffect(()=>{
    const element=dialog.current;if(snapshot.open&&element&&!element.open){element.showModal();const frame=requestAnimationFrame(()=>heading.current?.focus());return()=>cancelAnimationFrame(frame);}if(!snapshot.open&&element?.open)element.close();
  },[snapshot.open,snapshot.focusSerial]);
  useEffect(()=>{setPage(0);setQuery('');setKind('all');setTab('summary');setShowWorkspace(false);},[snapshot.report]);
  const close=()=>{model.close();dialog.current?.close();};
  const draft=snapshot.draft,report=snapshot.report,fresh=Boolean(report&&sourceToken===report.sourceToken);
  const update=(partial:Partial<StudioRecipeDraft>)=>model.update(partial,snapshot.version);
  const presets=useMemo(()=>macros.slice(0,128).map((macro,index)=>({macro,index})).filter(({macro})=>macro&&typeof macro.name==='string'),[macros]);
  const chosen=presets.find(p=>String(p.index)===preset)??presets[0];
  const cells=useMemo(()=>report&&tab==='cells'?report.cells.filter(cell=>(kind==='all'||cell.kind===kind)&&`${cell.key} ${cell.before?.blockDefId??''} ${cell.after?.blockDefId??''} ${definitions[cell.before?.blockDefId??'']?.name??''} ${definitions[cell.after?.blockDefId??'']?.name??''}`.toLowerCase().includes(query.trim().toLowerCase())):[],[report,tab,kind,query,definitions]);
  const lastPage=Math.max(0,Math.ceil(cells.length/pageSize)-1),currentPage=Math.min(page,lastPage);
  const styles={'--menu-text-scale':preferences.textPercent/100,'--menu-target':`${preferences.targetSize}px`,'--menu-width':`${preferences.panelWidth}px`}as CSSProperties;
  const download=()=>{
    if(!report||model.getSnapshot().report!==report||!model.getSnapshot().open)return;
    try{const blob=new Blob([JSON.stringify(report)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${report.name.replace(/[^a-z0-9_-]+/gi,'-').slice(0,64)||'recipe'}-review.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setDownloadMessage({report,message:'Review download requested. This report describes changes; it is not an editable project backup.'});}catch{setDownloadMessage({report,message:'The review download could not be started. The project is unchanged.'});}
  };
  return <dialog ref={dialog} aria-modal="true" aria-labelledby="studio-recipe-title" aria-describedby="studio-recipe-intro" className="studio-workspace-menu studio-recipe-workspace" data-studio-shell data-viewport-input="blocked" data-lds-theme={preferences.theme} data-comfort-motion={preferences.motion} style={styles}
    onFocusCapture={event=>{const target=event.target as HTMLElement;if(target.matches('button,input,select,textarea,summary,pre'))target.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});}}
    onCancel={event=>{event.preventDefault();close();}} onClose={()=>{if(model.getSnapshot().open)model.close();}}>
    <header className="studio-workspace-menu__header"><div className="studio-workspace-menu__brand"><SolarpunkIcon iconId="sp.nav.apps_canopy" size={28}/><div><p>BUILD WITH COMMANDS</p><h2 id="studio-recipe-title" ref={heading} tabIndex={-1}>Recipe workspace</h2></div></div><button type="button" aria-label="Close recipe workspace" onClick={close}><X size={20} aria-hidden="true"/></button></header>
    <p id="studio-recipe-intro" className="studio-menu-help">Commands prepare an isolated preview. Review the impact, then Apply once. Closing keeps your draft in this session and cancels its preview.</p>
    <div className="studio-workspace-menu__body studio-recipe-columns">
      <section aria-label="Recipe editor"><h3><Code2 size={18} aria-hidden="true"/>Compose a build</h3>
        <details><summary>Saved recipe shelf</summary><label className="studio-menu-field">Recipe preset<select aria-label="Recipe preset" value={chosen?String(chosen.index):''} onChange={event=>{setPreset(event.target.value);setReplace(false);}}>{presets.map(({macro,index})=><option key={index} value={index}>{macro.name}</option>)}</select></label>
          <label className="studio-recipe-check"><input type="checkbox" checked={replace} onChange={event=>setReplace(event.target.checked)}/>Replace current draft when loading</label><button type="button" disabled={!chosen} onClick={()=>{if(chosen){const result=model.loadMacro(chosen.macro,activeBlockId,currentCursor,replace,snapshot.version);if(result.status!=='rejected')setReplace(false);}}}>Load recipe draft</button><p className="studio-menu-help">Loading edits the draft only. The first 128 local saved recipes are shown. Existing HUD recipe buttons open this same review.</p></details>
        <form aria-label="Recipe composer" onSubmit={event=>{event.preventDefault();void model.preview(snapshot.version);}}>
          <label className="studio-menu-field">Recipe name<input aria-label="Recipe name" value={draft.name} required maxLength={80} onChange={event=>update({name:event.target.value})}/></label>
          <label className="studio-menu-field">Commands<textarea aria-label="Recipe commands" aria-describedby="studio-recipe-command-help" spellCheck={false} rows={9} maxLength={RECIPE_SCRIPT_LIMIT} value={draft.script} required onChange={event=>update({script:event.target.value})}/></label>
          <p id="studio-recipe-command-help" className="studio-menu-help">One WorldEdit command per line. Blank lines are ignored. {'{active}'} uses the exact chosen block; @id selects an exact project definition. Recipe commands keep their own parameters; brush scale and mirrors do not alter them.</p>
          <label className="studio-menu-field">Active recipe block<select aria-label="Active recipe block" value={draft.activeBlockId} onChange={event=>update({activeBlockId:event.target.value})}>{!definitions[draft.activeBlockId]&&<option value={draft.activeBlockId}>Choose an eligible block</option>}{Object.values(definitions).map(def=><option key={def.id} value={def.id}>{def.name}</option>)}</select></label>
          <button type="button" disabled={!definitions[activeBlockId]} onClick={()=>update({activeBlockId})}>Use current brush block</button>
          <div className="studio-recipe-parameters"><label className="studio-menu-field">Iterations<input aria-label="Recipe iterations" type="number" min="1" max="16" step="1" required value={draft.iterations} onChange={event=>update({iterations:event.target.value})}/></label><label className="studio-menu-field">Preview pause (ms)<input aria-label="Recipe preview pause" type="number" min="0" max="10000" step="1" required value={draft.intervalMs} onChange={event=>update({intervalMs:event.target.value})}/></label></div>
          <details><summary>Fallback cursor</summary><p className="studio-menu-help">Whole grid coordinates for commands that omit their point. Commands can also use the captured selection; explicit coordinates stay explicit.</p><div className="studio-recipe-parameters">{(['X','Y','Z']as const).map(axis=><label key={axis} className="studio-menu-field">Cursor {axis}<input aria-label={`Recipe cursor ${axis}`} type="number" min="-1000000" max="1000000" step="1" required value={draft[`cursor${axis}`]} onChange={event=>update({[`cursor${axis}`]:event.target.value})}/></label>)}</div><button type="button" onClick={()=>update({cursorX:String(currentCursor.x),cursorY:String(currentCursor.y),cursorZ:String(currentCursor.z)})}>Use current working point</button></details>
          <div className="studio-menu-inline"><button type="submit" disabled={!writable||snapshot.preparing||!definitions[draft.activeBlockId]}>Preview recipe</button><button type="button" disabled={!snapshot.preparing&&!report} onClick={model.cancel}>Cancel recipe preview</button></div>
        </form>
        {snapshot.preparing&&<div role="status"><p>Preparing {snapshot.completed} of {snapshot.total||'…'} commands. No live changes.</p><progress aria-label="Recipe preparation progress" value={snapshot.completed} max={snapshot.total||1}/></div>}
        <details><summary>Command reference and limits</summary><p className="studio-menu-help">1–32 commands, 1–16 iterations, at most 64 total steps; each command is limited to 4,096 characters. Undo and Redo apply to the complete accepted recipe. Preparation can cancel between commands; each engine operation has its own limits. Commands never run JavaScript or shell code.</p><ul className="studio-recipe-reference">{WORLDEDIT_COMMANDS_HELP.filter(item=>!['//undo','//redo','//wand'].includes(item.cmd)).map(item=><li key={item.cmd}><code>{item.cmd}</code><p>{item.desc}</p><small>{item.example}</small></li>)}</ul></details>
      </section>
      <section aria-label="Recipe impact" className="studio-recipe-impact"><h3>Review the impact</h3>{report?<>
        <p>{report.projectName} · {report.target}</p><p className="studio-menu-help">{report.name} · {report.commands} prepared steps. Apply rechecks the source, complete project and Undo allowance.</p>
        <nav aria-label="Recipe review pages" className="studio-recipe-tabs">{(['summary','cells','workspace','trace']as const).map(id=><button key={id} type="button" aria-pressed={tab===id} onClick={()=>setTab(id)}>{id==='summary'?'Summary':id==='cells'?'Changed cells':id==='workspace'?'Selection & clipboard':'Command trace'}</button>)}</nav>
        {tab==='summary'&&<div aria-label="Recipe change summary"><dl className="studio-recipe-counts"><div><dt>Added</dt><dd data-testid="recipe-added">{report.added}</dd></div><div><dt>Updated</dt><dd data-testid="recipe-updated">{report.updated}</dd></div><div><dt>Removed</dt><dd data-testid="recipe-removed">{report.removed}</dd></div></dl><p>{report.beforeCells.toLocaleString()} → {report.afterCells.toLocaleString()} placed cells. {report.unchanged.toLocaleString()} final cells are unchanged.</p>
          <ul><li>Selection: {report.selectionChanged?'changes':'unchanged'}</li><li>Clipboard: {report.clipboardChanged?'changes':'unchanged'} ({report.workspaceBefore.clipboardCells} → {report.workspaceAfter.clipboardCells} cells)</li><li>Block definitions: {report.definitionChanges.length} changes</li><li>Destination chunks revealed: {report.revealedChunks.length}</li></ul>
          {report.materials.length>0&&<><h4>Material count changes</h4><ul>{report.materials.map(row=><li key={row.id}>{row.name}: {row.before} → {row.after} ({row.delta>0?'+':''}{row.delta})</li>)}</ul></>}
          {report.noop&&<p className="studio-menu-feedback">No final change. Applying keeps the source, cell IDs, history and Redo.</p>}
          {report.revealedChunks.length>0&&<details><summary>Revealed chunk addresses</summary><p>{report.revealedChunks.join('; ')}</p></details>}
        </div>}
        {tab==='cells'&&<section aria-label="Recipe changed cells"><label className="studio-menu-field">Find changed cell<input aria-label="Find recipe cell" type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label><label className="studio-menu-field">Change type<select aria-label="Recipe cell change type" value={kind} onChange={event=>{setKind(event.target.value);setPage(0);}}>{['all','added','updated','removed'].map(value=><option key={value} value={value}>{value}</option>)}</select></label><p role="status">{cells.length} matching changes · page {currentPage+1} of {lastPage+1}</p>
          <ol className="studio-recipe-cells">{cells.slice(currentPage*pageSize,(currentPage+1)*pageSize).map(cell=><li key={cell.key}><strong>{cell.kind} · {cell.key}</strong><p>Before: {blockText(cell.before)}</p><p>After: {blockText(cell.after)}</p><details><summary>All cell properties</summary><pre tabIndex={0}>{JSON.stringify({before:cell.before,after:cell.after},null,2)}</pre></details></li>)}</ol><div className="studio-menu-inline"><button type="button" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous recipe cells</button><button type="button" disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>Next recipe cells</button></div>
        </section>}
        {tab==='workspace'&&<section aria-label="Recipe workspace changes"><h4>Selection</h4><p>Before: {point(report.workspaceBefore.pos1)} → {point(report.workspaceBefore.pos2)}</p><p>After: {point(report.workspaceAfter.pos1)} → {point(report.workspaceAfter.pos2)}</p><h4>Clipboard and definitions</h4><p>{report.workspaceBefore.clipboardCells} → {report.workspaceAfter.clipboardCells} clipboard cells; {report.workspaceBefore.clipboardDefinitions} → {report.workspaceAfter.clipboardDefinitions} clipboard definitions.</p><p>{report.definitionChanges.length} project definitions change. The full review download includes every before/after property.</p><details onToggle={event=>setShowWorkspace(event.currentTarget.open)}><summary>Workspace and definition data</summary>{showWorkspace&&<><pre tabIndex={0}>{JSON.stringify({before:report.workspaceBefore,after:report.workspaceAfter,clipboard:report.clipboardChange,definitions:report.definitionChanges,source:report.sourceEnvelope},null,2).slice(0,65536)}</pre><p className="studio-menu-help">This view shows up to 65,536 characters. Download the complete review for all data.</p></>}</details></section>}
        {tab==='trace'&&<section aria-label="Prepared command trace"><ol className="studio-recipe-reference">{report.steps.map((step,index)=><li key={index}><code>{index+1}. {step.command}</code><p>{step.message}</p></li>)}</ol><p className="studio-menu-help">Messages describe intermediate engine steps. The change summary compares complete final content. Preparation charged {report.workProxy.toLocaleString()} of the 100,000 current-plus-result block-count proxy allowance; this is not a timing or memory measurement.</p><p className="studio-menu-help">Captured cursor: {point(report.cursor)}. Active block: {report.activeBlockId}.</p></section>}
        <div className="studio-menu-inline studio-recipe-apply"><button type="button" disabled={!writable||!fresh||snapshot.preparing} onClick={()=>model.apply(report)}>Apply reviewed recipe</button><button type="button" onClick={download}>Download complete recipe review</button></div>
        {downloadMessage?.report===report&&<p role="status" className="studio-menu-help">{downloadMessage.message}</p>}
      </>:<p className="studio-menu-help">Preview a recipe to see added, updated and removed cells; material counts; selection, clipboard and definition changes; and the resolved command trace. No command is applied during preview.</p>}
      </section>
      {snapshot.message&&<p role="status" className="studio-menu-feedback studio-recipe-message">{snapshot.message}</p>}
    </div>
    <footer className="studio-workspace-menu__footer"><span>{snapshot.dirty?'Unfinished recipe draft · kept in this session':'Ready when you are.'}</span><button type="button" onClick={close}>Return to build</button></footer>
  </dialog>;
}
