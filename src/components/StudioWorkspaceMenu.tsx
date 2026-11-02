import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Search, X, ArrowUpRight, ChevronLeft, ChevronRight, Box, SlidersHorizontal } from 'lucide-react';
import { SolarpunkIcon } from '../resources/oasis/SolarpunkIcon';
import type { StudioDocument } from '../lib/studioDocument';
import type { StudioEditorResult, StudioHistoryUsage } from '../lib/studioEditorSession';
import { STUDIO_DOCUMENT_LIMITS } from '../lib/studioDocument';
import type { useStudioWorkspacePreferences, StudioTheme } from '../lib/useStudioWorkspacePreferences';
import { effectiveCellScale } from '../lib/studioCellEdit';
import type { PlacedBlock } from '../engine/types';
import '../resources/oasis/lds-tokens.css';
import './StudioWorkspaceMenu.css';

export interface StudioWorkspaceAction {
  id: string;
  label: string;
  description: string;
  category: string;
  keywords?: string;
  disabledReason?: string;
  run: () => void;
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  document: StudioDocument;
  sourceToken: string;
  history: StudioHistoryUsage;
  disabled: boolean;
  actions: StudioWorkspaceAction[];
  onRename: (name: string, sourceToken: string) => StudioEditorResult;
  onSelectCell: (key: string, sourceToken: string) => StudioEditorResult;
  onUseBlock: (id: string) => StudioEditorResult;
  onInspectCell: (key: string, sourceToken: string) => StudioEditorResult;
  initialPage: StudioMenuPage;
  appearance: ReturnType<typeof useStudioWorkspacePreferences>;
}
export type StudioMenuPage = 'actions' | 'scene' | 'project' | 'comfort';
type Page = StudioMenuPage;
const pageLabels: Record<Page, string> = { actions: 'Find actions', scene: 'Scene & inspect', project: 'Project details', comfort: 'Menu comfort' };
const matches = (text: string, query: string) => query.trim().toLocaleLowerCase().split(/\s+/).every(part => text.toLocaleLowerCase().includes(part));
const pageSize = 25;
const position = (block: PlacedBlock) => `${block.position.x}, ${block.position.y}, ${block.position.z}`;

/** Native modal focus ownership; all project operations return to the existing session. */
export function StudioWorkspaceMenu({ isOpen, onClose, document, sourceToken, history, disabled, actions, onRename, onSelectCell, onUseBlock, onInspectCell, initialPage, appearance }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), search = useRef<HTMLInputElement>(null), firstAction = useRef<HTMLButtonElement>(null);
  const title = useId(), help = useId();
  const [page, setPage] = useState<Page>('actions');
  const [query, setQuery] = useState(''), [sceneQuery, setSceneQuery] = useState(''), [scenePage, setScenePage] = useState(0);
  const [inspectedKey, setInspectedKey] = useState<string | null>(null), [feedback, setFeedback] = useState('');
  const [name, setName] = useState(document.world.worldName), [nameToken, setNameToken] = useState(sourceToken), [nameDirty, setNameDirty] = useState(false);
  const { preferences, preferenceMessage, changePreferences } = appearance;
  useEffect(() => {
    const element = dialog.current;
    if (isOpen && element && !element.open) {
      setPage(initialPage); setQuery(''); setFeedback('');
      element.showModal(); search.current?.focus();
    } else if (!isOpen && element?.open) element.close();
  }, [isOpen, initialPage]);
  useEffect(() => {
    if (!nameDirty) { setName(document.world.worldName); setNameToken(sourceToken); }
  }, [document.world.worldName, sourceToken, nameDirty]);
  useEffect(() => { setInspectedKey(null); setScenePage(0); setNameDirty(false); setFeedback(''); }, [document.documentId]);
  const close = () => { dialog.current?.close(); onClose(); };
  const launch = (action: StudioWorkspaceAction) => {
    if (disabled || action.disabledReason) return;
    close(); requestAnimationFrame(action.run);
  };
  const visibleActions = useMemo(() => actions.filter(action => matches(`${action.label} ${action.description} ${action.category} ${action.keywords ?? ''}`, query)), [actions, query]);
  const cells = useMemo(() => isOpen && page === 'scene' ? Object.entries(document.blocks).filter(([key, block]) => matches(`${key} ${position(block)} ${block.id} ${block.blockDefId} ${document.customBlocks[block.blockDefId]?.name ?? ''}`, sceneQuery)) : [], [isOpen, page, document.blocks, document.customBlocks, sceneQuery]);
  const lastPage = Math.max(0, Math.ceil(cells.length / pageSize) - 1), currentPage = Math.min(scenePage, lastPage);
  const inspected = inspectedKey === null ? undefined : document.blocks[inspectedKey];
  const definition = inspected ? document.customBlocks[inspected.blockDefId] : undefined;
  const target = document.schemaVersion === 2 ? document.targetPolicy?.target : undefined;
  const rename = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || name.length > 512) { setFeedback('Enter a project name between 1 and 512 characters.'); return; }
    const result = onRename(name.trim(), nameToken);
    setFeedback(result.message ?? (result.status === 'applied' ? 'Project renamed. Undo restores its previous name.' : 'The project name is unchanged.'));
    if (result.status !== 'rejected') setNameDirty(false);
  };
  const styles = { '--menu-text-scale': preferences.textPercent / 100, '--menu-target': `${preferences.targetSize}px`, '--menu-target-choice': `${preferences.targetSize}px`, '--menu-width': `${preferences.panelWidth}px` } as CSSProperties;
  return <dialog ref={dialog} aria-modal="true" aria-labelledby={title} aria-describedby={help} className="studio-workspace-menu" data-studio-shell data-lds-theme={preferences.theme} data-comfort-motion={preferences.motion} style={styles}
    onCancel={event => { event.preventDefault(); close(); }} onClose={onClose}>
    <header className="studio-workspace-menu__header">
      <div className="studio-workspace-menu__brand"><SolarpunkIcon iconId="sp.nav.apps_canopy" size={28} /><div><p>LFS BLOCK STUDIO</p><h2 id={title}>Your workspace</h2></div></div>
      <button type="button" className="studio-menu-icon" aria-label="Close studio menu" onClick={close}><X size={20} aria-hidden="true" /></button>
    </header>
    <p id={help} className="studio-menu-help">{document.world.worldName} <span aria-hidden="true">·</span> {Object.keys(document.blocks).length.toLocaleString()} cells <span aria-hidden="true">·</span> {target?.kind === 'minecraft-java' ? `Java candidate ${target.locked ? 'locked' : 'unlocked'} · native untested` : 'Freeform'}</p>
    <nav className="studio-workspace-menu__nav" aria-label="Studio menu pages">
      {(Object.entries(pageLabels) as [Page, string][]).map(([id, label]) => <button key={id} type="button" aria-pressed={page === id} onClick={() => { setPage(id); setFeedback(''); }}>{label}</button>)}
    </nav>
    <div className="studio-workspace-menu__body">
      {page === 'actions' && <section aria-label="Find studio actions">
        <label className="studio-menu-search"><Search size={20} aria-hidden="true" /><span className="sr-only">Find studio actions</span><input ref={search} type="search" aria-label="Find studio actions" placeholder="Search tools, camera, resources, saving…" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); firstAction.current?.focus(); } }} /></label>
        <p role="status" className="studio-menu-help">{visibleActions.length} actions. Tab to a result, then activate it. Actions with parameters open their controls.</p>
        <ul className="studio-menu-actions" aria-label="Studio action results">{visibleActions.map((action, index) => <li key={action.id}><button ref={index === 0 ? firstAction : undefined} type="button" disabled={disabled || Boolean(action.disabledReason)} onClick={() => launch(action)} aria-describedby={`${title}-${action.id}`}><span className="studio-menu-actions__category">{action.category}</span><strong>{action.label}</strong><ArrowUpRight size={17} aria-hidden="true" /></button><p id={`${title}-${action.id}`}>{action.disabledReason ?? action.description}</p></li>)}</ul>
        {visibleActions.length === 0 && <div className="studio-menu-empty"><p>No matching action. Try “pan”, “backup”, “block” or “selection”.</p><button type="button" onClick={() => { setQuery(''); search.current?.focus(); }}>Clear action search</button></div>}
      </section>}
      {page === 'scene' && <section aria-label="Scene browser">
        <h3>Find a cell. Inspect before editing.</h3>
        <label className="studio-menu-search"><Search size={18} aria-hidden="true" /><span className="sr-only">Search scene cells</span><input type="search" aria-label="Search scene cells" placeholder="Block name, ID or coordinates…" value={sceneQuery} onChange={event => { setSceneQuery(event.target.value); setScenePage(0); }} /></label>
        <p role="status" className="studio-menu-help">{cells.length.toLocaleString()} matching cells · page {currentPage + 1} of {lastPage + 1}. Inspecting a row does not edit or select the build.</p>
        <div className="studio-menu-scene"><div><ul aria-label="Scene cells" className="studio-menu-cells">{cells.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(([key, block]) => <li key={key}><button type="button" aria-pressed={inspectedKey === key} aria-label={`Inspect ${document.customBlocks[block.blockDefId]?.name ?? block.blockDefId} at ${position(block)}`} onClick={() => { setInspectedKey(key); setFeedback(''); }}><Box size={16} aria-hidden="true" /><span><strong>{document.customBlocks[block.blockDefId]?.name ?? block.blockDefId}</strong><small>{position(block)}</small></span></button></li>)}</ul>
          {cells.length === 0 && <p className="studio-menu-empty">No cells match this search.</p>}
          <div className="studio-menu-pagination"><button type="button" disabled={currentPage === 0} onClick={() => setScenePage(currentPage - 1)}><ChevronLeft size={16} aria-hidden="true" />Previous cells</button><button type="button" disabled={currentPage === lastPage} onClick={() => setScenePage(currentPage + 1)}>Next cells<ChevronRight size={16} aria-hidden="true" /></button></div>
        </div><section className="studio-menu-inspector" aria-label="Cell inspector"><h3>Cell inspector</h3>{inspected && definition ? <>
          <strong>{definition.name}</strong><dl><dt>Position (X, Y, Z)</dt><dd>{position(inspected)}</dd><dt>Block definition</dt><dd>{inspected.blockDefId}</dd><dt>Rotation</dt><dd>{inspected.rotation}°</dd><dt>Geometry</dt><dd>{definition.shape} · {definition.width} × {definition.depth} · {definition.heightPlates} plates</dd><dt>Effective scale</dt><dd>{Object.values(effectiveCellScale(inspected, definition)).join(' × ')} · {inspected.customScale ? 'instance' : 'definition'}</dd></dl>
          <button type="button" disabled={disabled} onClick={() => { const result = onInspectCell(inspectedKey!, sourceToken); if (result.status !== 'rejected') close(); else setFeedback(result.message ?? 'Cell properties could not be opened.'); }}>Edit cell properties</button>
          <button type="button" disabled={disabled} onClick={() => { const result = onSelectCell(inspectedKey!, sourceToken); setFeedback(result.message ?? (result.status === 'applied' ? 'Cell selected. Frame selection from the camera controls; Undo restores the previous selection.' : 'This cell is already selected.')); }}>Select this cell</button>
          <button type="button" disabled={disabled} onClick={() => { const result = onUseBlock(inspected.blockDefId); setFeedback(result.message ?? 'Active block updated.'); }}>Use this block</button>
        </> : <p>Choose a scene row to see its definition, location and geometry.</p>}</section></div>
      </section>}
      {page === 'project' && <section aria-label="Local project details"><h3>Make it yours</h3><p className="studio-menu-help">A local name for this editable project. Saving, backup and recovery are available under Find actions.</p><form onSubmit={rename}>
        <label className="studio-menu-field">Project name<input aria-label="Local project name" value={name} maxLength={512} required disabled={disabled} onChange={event => { if (!nameDirty) setNameToken(sourceToken); setNameDirty(true); setName(event.target.value); }} /></label>
        {nameDirty && nameToken !== sourceToken && <p role="alert">The source changed while you were naming it. Keep your draft or reload the current name before applying.</p>}
        <div className="studio-menu-inline"><button type="submit" disabled={disabled || nameDirty && nameToken !== sourceToken}>Apply project name</button><button type="button" onClick={() => { setName(document.world.worldName); setNameToken(sourceToken); setNameDirty(false); }}>Reload current name</button></div>
      </form><dl><dt>Target</dt><dd>{target?.kind === 'minecraft-java' ? `Minecraft Java candidate · ${target.locked ? 'locked' : 'unlocked'}` : 'Freeform'}</dd><dt>Project identity</dt><dd>{document.documentId}</dd><dt>Saved revision</dt><dd>{document.revision}</dd></dl><p className="studio-menu-help">Game compatibility and its Undo boundary require a separate review. Changing a menu theme does not convert a build.</p>
        <details aria-label="Project and Undo capacity"><summary>Project and Undo capacity</summary><dl>
          <dt>Available history</dt><dd data-testid="studio-history-steps">{history.undoEntries} Undo steps · {history.redoEntries} Redo steps</dd>
          <dt>Retained changes</dt><dd data-testid="studio-history-bytes">{history.retainedBytes.toLocaleString()} bytes of {(history.maxBytes / 1048576).toLocaleString()} MiB</dd>
          <dt>History allowance</dt><dd>Up to {history.maxEntries} recent changes, including both Undo and Redo.</dd>
          <dt>Project file allowance</dt><dd>Up to {STUDIO_DOCUMENT_LIMITS.maxBytes / 1048576} MiB of JSON; each export format has its own limits.</dd>
        </dl><p className="studio-menu-help">History retains changed data. Older steps retire when its allowance is reached. Undo stays in this session; reopening starts fresh. Save and download a project backup to keep the build independently. A replacement too large for Undo stops without changing the project and can be opened as a separate project copy.</p></details>
      </section>}
      {page === 'comfort' && <section aria-label="Menu comfort settings"><h3><SlidersHorizontal size={19} aria-hidden="true" /> A workspace that fits you</h3><p className="studio-menu-help">Theme, text, control size and motion apply to this menu, Cell properties and the Recipe workspace. Menu width also sizes the recipe workspace; the properties panel width is independent. Other studio panels retain their own settings while they are migrated. Camera speed, render resolution and build materials are separate.</p><div className="studio-menu-settings">
        <label className="studio-menu-field">Menu theme<select aria-label="Menu theme" value={preferences.theme} onChange={event => changePreferences({ ...preferences, theme: event.target.value as StudioTheme })}><option value="evergreen-dark">Evergreen dark</option><option value="evergreen-light">Evergreen light</option><option value="high-contrast">High contrast</option><option value="calm">Calm</option></select></label>
        <label className="studio-menu-field">Menu text size<select aria-label="Menu text size" value={preferences.textPercent} onChange={event => changePreferences({ ...preferences, textPercent: Number(event.target.value) })}>{[100, 125, 150, 175, 200].map(value => <option key={value} value={value}>{value}%</option>)}</select></label>
        <label className="studio-menu-field">Menu control size<select aria-label="Menu control size" value={preferences.targetSize} onChange={event => changePreferences({ ...preferences, targetSize: Number(event.target.value) as 36 | 48 | 56 })}><option value="36">Standard · 36 px</option><option value="48">Large · 48 px</option><option value="56">Extra large · 56 px</option></select></label>
        <label className="studio-menu-field">Menu width<select aria-label="Menu width" value={preferences.panelWidth} onChange={event => changePreferences({ ...preferences, panelWidth: Number(event.target.value) as 640 | 880 | 1120 })}><option value="640">Focused · 640 px</option><option value="880">Balanced · 880 px</option><option value="1120">Wide · 1120 px</option></select></label>
        <label className="studio-menu-field">Menu motion<select aria-label="Menu motion" value={preferences.motion} onChange={event => changePreferences({ ...preferences, motion: event.target.value as 'system' | 'reduced' })}><option value="system">Follow system</option><option value="reduced">Reduced</option></select></label>
      </div><p role="status" className="studio-menu-help">{preferenceMessage || 'Settings stay on this browser and are independent of project history.'}</p></section>}
      {feedback && <p className="studio-menu-feedback" role="status">{feedback}</p>}
    </div>
    <footer className="studio-workspace-menu__footer"><SolarpunkIcon iconId="sp.nav.companion_willow" size={18} /><span>Build at your own pace.</span><button type="button" onClick={close}>Return to build</button></footer>
  </dialog>;
}
