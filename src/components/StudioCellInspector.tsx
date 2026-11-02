import { useEffect, useRef, type CSSProperties } from 'react';
import { X, Box } from 'lucide-react';
import { SolarpunkIcon } from '../resources/oasis/SolarpunkIcon';
import type { StudioCellInspectorModel, StudioCellInspectorSnapshot } from '../lib/studioCellInspectorModel';
import { resolveStudioCell, effectiveCellScale, type StudioCellDraft } from '../lib/studioCellEdit';
import type { StudioDocument } from '../lib/studioDocument';
import type { StudioEditorResult } from '../lib/studioEditorSession';
import type { StudioWorkspacePreferences } from '../lib/useStudioWorkspacePreferences';
import './StudioCellInspector.css';

interface Props {
  model: StudioCellInspectorModel; snapshot: StudioCellInspectorSnapshot; document: StudioDocument; sourceToken: string;
  writable: boolean; preferences: StudioWorkspacePreferences; definitions: StudioDocument['customBlocks'];
  width: number; preferredWidth: number; onWidth: (width: number) => void; onBrowse: () => void; onAppearance: () => void;
  onSelectCell: (key: string, token: string) => StudioEditorResult; onUseBlock: (id: string) => StudioEditorResult;
}
/** One modeless properties dock. Drafts live in the view model; authored edits use the session. */
export function StudioCellInspector({ model, snapshot, document, sourceToken, writable, preferences, definitions, width, preferredWidth, onWidth, onBrowse, onAppearance, onSelectCell, onUseBlock }: Props) {
  const heading = useRef<HTMLHeadingElement>(null), opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!snapshot.open) return;
    opener.current = globalThis.document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => heading.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [snapshot.open, snapshot.focusSerial]);
  const close = () => {
    model.close();
    const target = opener.current;
    requestAnimationFrame(() => {
      if (target?.isConnected && !target.closest('dialog:not([open]),[hidden]')) target.focus();
      else globalThis.document.querySelector<HTMLButtonElement>('[aria-label="Open studio menu"]')?.focus();
    });
  };
  const cell = resolveStudioCell(document, snapshot.target), draft = snapshot.draft;
  const locked = Boolean(document.targetPolicy?.target.kind === 'minecraft-java' && document.targetPolicy.target.locked);
  const stale = snapshot.draftToken !== sourceToken;
  const editable = Boolean(writable && cell && draft);
  const canReview = editable && !stale;
  const change = (partial: Partial<StudioCellDraft>) => model.updateDraft(partial, snapshot.contextId);
  const selectedDefinition = draft ? document.customBlocks[draft.definitionId] : undefined;
  const defaultScale = selectedDefinition?.defaultScale ?? { x: 1, y: 1, z: 1 };
  const styles = { '--cell-text-scale': preferences.textPercent / 100, '--cell-target': `${preferences.targetSize}px`, '--cell-width': `${width}px` } as CSSProperties;
  const report = snapshot.review;
  return <aside aria-label="Cell properties" hidden={!snapshot.open} data-viewport-input="blocked" data-studio-shell data-lds-theme={preferences.theme} data-comfort-motion={preferences.motion} className="studio-cell-inspector" style={styles}
    onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <header><div><p className="studio-cell-eyebrow"><SolarpunkIcon iconId="sp.nav.apps_canopy" size={18} /> BUILD PROPERTIES</p><h2 ref={heading} tabIndex={-1}>Cell properties</h2></div><button type="button" aria-label="Close cell properties" onClick={close}><X size={18} aria-hidden="true" /></button></header>
    <nav aria-label="Cell properties navigation"><button type="button" onClick={onBrowse}>Browse cells</button><button type="button" onClick={onAppearance}>Appearance</button></nav>
    <div className="studio-cell-body">
      <label className="studio-cell-field">Panel width<select aria-label="Cell properties width" value={preferredWidth} onChange={event => onWidth(Number(event.target.value))}>{[...new Set([240,320,400,460,preferredWidth])].sort((a,b)=>a-b).map(n => <option key={n} value={n}>{n} px</option>)}</select></label>
      {cell && <p className="studio-cell-name"><Box size={20} aria-hidden="true" />{cell.definition.name}</p>}
      <p className="studio-cell-help">Edit a draft, review it, then Apply. The canvas stays available outside this panel. Closing keeps an unfinished draft for this session.</p>
      {locked && <p className="studio-cell-notice">Java lock: mapped blocks, whole cell positions, zero rotation and unit scale. Native export remains untested.</p>}
      {!cell && <p role="status">This cell is unavailable in the current project. Undo may restore it; discard an unfinished draft before choosing another cell.</p>}
      {stale && snapshot.dirty && <p role="alert" className="studio-cell-notice">The project changed. Your draft is retained. Reload the current cell before reviewing.</p>}
      {draft && <form aria-label="Cell properties editor" onSubmit={event => { event.preventDefault(); model.review(snapshot.draftVersion); }}>
        <fieldset disabled={!editable}><legend>Position</legend><div className="studio-cell-axes">{(['x','y','z'] as const).map(axis => <label key={axis} className="studio-cell-field">{axis.toUpperCase()}<input aria-label={`Cell position ${axis.toUpperCase()}`} type="number" step={locked ? 1 : 'any'} min={-1000000} max={1000000} required value={draft[axis]} onChange={event => change({ [axis]: event.target.value })} /></label>)}</div>
          <p className="studio-cell-help">An occupied anchor blocks the move. Large shapes may still overlap. Selection and region commands use the rounded grid anchor; the cell keeps its exact position.</p>
          <label className="studio-cell-field">Block type<select aria-label="Cell block type" value={draft.definitionId} onChange={event => change({ definitionId: event.target.value })}>
            {!definitions[draft.definitionId] && <option value={draft.definitionId}>{selectedDefinition?.name ?? draft.definitionId} (unavailable)</option>}
            {Object.values(definitions).map(def => <option key={def.id} value={def.id}>{def.name}</option>)}
          </select></label>
          <label className="studio-cell-field">Rotation<select aria-label="Cell rotation" value={draft.rotation} disabled={locked} onChange={event => change({ rotation: event.target.value })}>{[0,90,180,270].map(n => <option key={n} value={n}>{n}°</option>)}</select></label>
          <details><summary>Scale and appearance</summary>
            <label className="studio-cell-field">Scale source<select aria-label="Cell scale source" value={draft.scaleMode} disabled={locked} onChange={event => change(event.target.value === 'definition' ? { scaleMode: 'definition' } : { scaleMode: 'custom', scaleX: String(defaultScale.x), scaleY: String(defaultScale.y), scaleZ: String(defaultScale.z) })}><option value="definition">Definition default</option><option value="custom">Instance scale</option></select></label>
            <div className="studio-cell-axes">{(['x','y','z'] as const).map(axis => { const key = `scale${axis.toUpperCase()}` as 'scaleX'|'scaleY'|'scaleZ'; return <label key={axis} className="studio-cell-field">Scale {axis.toUpperCase()}<input aria-label={`Cell scale ${axis.toUpperCase()}`} type="number" min="0.01" max="64" step="any" required disabled={locked || draft.scaleMode === 'definition'} value={draft.scaleMode === 'definition' ? defaultScale[axis] : draft[key]} onChange={event => change({ [key]: event.target.value })} /></label>; })}</div>
            <p className="studio-cell-help">Definition scale follows the chosen block. Instance scale is an explicit override.</p>
            <label className="studio-cell-check"><input type="checkbox" checked={draft.resetAppearance} disabled={locked} onChange={event => change({ resetAppearance: event.target.checked })} />Use definition appearance, removing this cell’s color, texture and material overrides</label>
          </details>
        </fieldset>
        <div className="studio-cell-buttons"><button type="submit" disabled={!canReview}>Review cell changes</button><button type="button" onClick={() => model.reload(snapshot.contextId)}>Reload current cell / discard draft</button></div>
      </form>}
      {report && <section aria-label="Reviewed cell changes" className="studio-cell-review"><h3>{report.noop ? 'No properties change' : 'Review cell changes'}</h3>
        <dl>{(['definition','position','rotation','scale'] as const).map(key => <div key={key}><dt>{key === 'definition' ? 'Block type' : key[0].toUpperCase() + key.slice(1)}</dt><dd><span>Before: {report.before[key]}{key === 'rotation' ? '°' : ''}</span><span>After: {report.after[key]}{key === 'rotation' ? '°' : ''}</span></dd></div>)}</dl>
        {report.changes.length > 0 && <ul>{report.changes.map(text => <li key={text}>{text}</li>)}</ul>}
        {report.revealsChunk && <p>Reveal destination chunk {report.revealsChunk}.</p>}
        <p className="studio-cell-help">{report.noop ? 'Applying retains history and Redo.' : 'Apply records one Undo step, including any moved single-cell selection and revealed chunk.'}</p>
        <div className="studio-cell-buttons"><button type="button" disabled={!canReview} onClick={() => model.apply(report)}>Apply reviewed cell changes</button><button type="button" onClick={() => model.cancelReview(report)}>Cancel cell review</button></div>
      </section>}
      {cell && <><div className="studio-cell-buttons"><button type="button" disabled={!writable} onClick={() => onSelectCell(cell.key, sourceToken)}>Select inspected cell</button><button type="button" disabled={!writable} onClick={() => onUseBlock(cell.block.blockDefId)}>Use inspected block</button></div><details><summary>Current cell details</summary><dl><dt>Geometry</dt><dd>{cell.definition.shape} · {cell.definition.width} × {cell.definition.depth} · {cell.definition.heightPlates} plates</dd><dt>Effective scale</dt><dd>{Object.values(effectiveCellScale(cell.block, cell.definition)).join(' × ')}</dd><dt>Cell identity</dt><dd>{cell.block.id}</dd><dt>Definition identity</dt><dd>{cell.block.blockDefId}</dd><dt>Instance appearance</dt><dd>{[cell.block.colorOverride && 'Color',cell.block.textureOverride && 'Texture',cell.block.materialOverride && 'Material'].filter(Boolean).join(', ') || 'Definition appearance'}</dd></dl></details></>}
      {snapshot.message && <p role="status" className="studio-cell-notice">{snapshot.message}</p>}
    </div>
    <footer>{snapshot.dirty ? 'Unfinished draft · kept in this session' : 'Properties follow the current cell'}<button type="button" onClick={close}>Return to canvas</button></footer>
  </aside>;
}
