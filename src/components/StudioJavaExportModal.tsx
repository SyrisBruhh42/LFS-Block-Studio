import { useEffect, useRef, useState } from 'react';
import { DraggableWindow } from './DraggableWindow';
import type { StudioDocument } from '../lib/studioDocument';
import { prepareStudioJavaExport, encodeStudioJavaExport, type StudioJavaExportArtifact, type StudioJavaExportIssue, type StudioJavaExportPlan, type StudioJavaExportRequest } from '../lib/studioJavaExport';
import type { GridCoord } from '../engine/types';
import './StudioJavaExportModal.css';

export interface StudioJavaExportModalProps {
  isOpen: boolean; onClose: () => void; document: StudioDocument; sourceToken: string;
  selection: { pos1: GridCoord; pos2: GridCoord } | null;
  /** Synchronous read of the actual session, including while React has not rendered an edit. */
  isCurrentSource: (token: string) => boolean;
  onOpenCompatibility?: () => void; onShowDrafts?: () => void;
  onEncode?: typeof encodeStudioJavaExport;
}
type Feedback = { error: boolean; message: string } | null;
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  try { link.href = url; link.download = filename; globalThis.document.body.appendChild(link); link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export function StudioJavaExportModal({ isOpen, onClose, document, sourceToken, selection, isCurrentSource, onOpenCompatibility, onShowDrafts, onEncode = encodeStudioJavaExport }: StudioJavaExportModalProps) {
  const [name, setName] = useState(document.world.worldName);
  const [scope, setScope] = useState<StudioJavaExportRequest['scope']>('world');
  const [anchor, setAnchor] = useState({ x: '', y: '', z: '' });
  const [review, setReview] = useState<{ plan: StudioJavaExportPlan; draftKey: string } | null>(null);
  const [issues, setIssues] = useState<readonly StudioJavaExportIssue[]>([]);
  const [issuesTruncated, setIssuesTruncated] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [artifact, setArtifact] = useState<StudioJavaExportArtifact | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [materialPage, setMaterialPage] = useState(0);
  const mounted = useRef(true), generation = useRef(0);
  const pending = useRef<{ controller: AbortController; generation: number } | null>(null);
  const previousSource = useRef(sourceToken);
  const draftKey = JSON.stringify({ name, scope, anchor, selection: scope === 'selection' ? selection : null });
  const live = useRef({ isOpen, sourceToken, draftKey, isCurrentSource });
  live.current = { isOpen, sourceToken, draftKey, isCurrentSource };
  const stopWork = () => { generation.current++; pending.current?.controller.abort(); pending.current = null; setBusy(false); };
  const invalidate = () => { stopWork(); setReview(null); setArtifact(null); setIssues([]); setIssuesTruncated(false); setAcknowledged(false); setFeedback(null); };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; pending.current?.controller.abort(); pending.current = null; };
  }, []);
  useEffect(() => {
    generation.current++; pending.current?.controller.abort(); pending.current = null; setBusy(false);
    setReview(null); setArtifact(null); setIssues([]); setIssuesTruncated(false); setAcknowledged(false); setFeedback(null);
    if (isOpen) { setName(document.world.worldName); setScope('world'); setAnchor({ x: '', y: '', z: '' }); }
  }, [isOpen, document.documentId]);
  useEffect(() => {
    if (previousSource.current !== sourceToken && isOpen) {
      generation.current++; pending.current?.controller.abort(); pending.current = null; setBusy(false);
      setReview(null); setArtifact(null); setIssues([]); setIssuesTruncated(false); setAcknowledged(false);
      setFeedback({ error: false, message: 'The project or selection changed. Your export settings remain; review the current source again.' });
    }
    previousSource.current = sourceToken;
  }, [sourceToken, isOpen]);
  const current = (receipt: NonNullable<typeof review>) => mounted.current && live.current.isOpen && receipt.draftKey === live.current.draftKey && receipt.plan.sourceToken === live.current.sourceToken && live.current.isCurrentSource(receipt.plan.sourceToken);
  const reviewed = !!review && current(review);

  const reviewExport = () => {
    invalidate();
    try {
      if (!isCurrentSource(sourceToken)) throw new Error('The source changed or is unavailable. Finish project recovery and review again.');
      if (Object.values(anchor).some(value => !value.trim())) throw new Error('Choose a paste anchor explicitly or enter all three anchor coordinates.');
      const prepared = prepareStudioJavaExport({ document, sourceToken, name, scope, selection, anchor: { x: Number(anchor.x), y: Number(anchor.y), z: Number(anchor.z) } });
      if (!prepared.ok) { setIssues(prepared.issues); setIssuesTruncated(prepared.issuesTruncated); return; }
      setReview({ plan: prepared.plan, draftKey }); setMaterialPage(0);
    } catch (error) { setFeedback({ error: true, message: error instanceof Error ? error.message : 'The export could not be reviewed.' }); }
  };
  const prepareDownload = async () => {
    if (!review || !acknowledged || pending.current) return;
    if (!current(review)) { invalidate(); setFeedback({ error: true, message: 'That review no longer identifies the active source. Review again.' }); return; }
    const submitted = review, operation = { controller: new AbortController(), generation: generation.current };
    pending.current = operation; setBusy(true); setArtifact(null); setFeedback(null);
    const alive = () => pending.current === operation && generation.current === operation.generation && !operation.controller.signal.aborted && current(submitted);
    try {
      const result = await onEncode(submitted.plan, operation.controller.signal);
      if (!alive()) return;
      if (result.receipt.planId !== submitted.plan.id) throw new Error('The prepared file does not match this reviewed export.');
      setArtifact(result);
      download(result.blob, result.filename);
      setFeedback({ error: false, message: 'Schematic prepared and download requested. Keep its report with the file; saving it on your device is handled by your browser.' });
    } catch (error) {
      if (alive()) setFeedback({ error: true, message: error instanceof Error ? error.message : 'The file could not be prepared or downloaded.' });
    } finally {
      if (pending.current === operation) { pending.current = null; if (mounted.current) setBusy(false); }
    }
  };
  const downloadPrepared = (part: 'schem' | 'report') => {
    if (!artifact || !review || artifact.receipt.planId !== review.plan.id || !current(review)) { invalidate(); setFeedback({ error: true, message: 'The source changed. Review again before downloading.' }); return; }
    try {
      download(part === 'schem' ? artifact.blob : new Blob([JSON.stringify(artifact.receipt, null, 2) + '\n'], { type: 'application/json' }), part === 'schem' ? artifact.filename : artifact.filename + '.report.json');
      setFeedback({ error: false, message: `${part === 'schem' ? 'Schematic' : 'Report'} download requested.` });
    } catch (error) { setFeedback({ error: true, message: error instanceof Error ? error.message : 'Download could not be started.' }); }
  };
  if (!isOpen) return null;
  const plan = review?.plan;
  return <DraggableWindow windowId="java_schematic_export" title="Java schematic export" subtitle={document.world.worldName} onClose={() => { stopWork(); onClose(); }} defaultWidth={900} defaultHeight={730} minWidth={320} minHeight={360} zIndex={55}>
    <div className="studio-java-export" data-viewport-input="blocked">
      <section aria-label="Java export qualification" className="studio-java-export__notice">
        <h3>Minecraft Java candidate · native import not qualified</h3>
        <p>This writes gzip-compressed binary Sponge v3 <code>.schem</code> using the project’s reviewed mappings. Minecraft Java 1.21.1 / WorldEdit 7.3.8 native paste, save/reload and export-back have not passed yet.</p>
        <p>Project backup preserves the complete editable project. Schematic export carries the admitted cells, not lighting, resources, opaque extensions or unsupported entities/biomes.</p>
        <div className="studio-java-export__actions">
          {onOpenCompatibility && <button type="button" onClick={() => { stopWork(); onOpenCompatibility(); }}>Review game compatibility</button>}
          {onShowDrafts && <button type="button" onClick={() => { stopWork(); onShowDrafts(); }}>Other draft formats (unlocked)</button>}
        </div>
      </section>
      <fieldset><legend>Export source and placement</legend>
        <label>Schematic name<input value={name} maxLength={256} onChange={event => { invalidate(); setName(event.target.value); }} /></label>
        <label>Export scope<select aria-label="Export scope" value={scope} onChange={event => { invalidate(); setScope(event.target.value as typeof scope); }}><option value="world">Complete build</option><option value="selection" disabled={!selection}>Selection region{!selection ? ' — set Pos1 and Pos2 first' : ''}</option></select></label>
        <p>Scope includes hidden/inactive content inside its bounds. Empty cells inside the rectangular bounds become air and may clear cells when pasted.</p>
        <div className="studio-java-export__actions"><button type="button" onClick={() => { invalidate(); setAnchor({ x: '0', y: '0', z: '0' }); }}>Use world origin as paste anchor</button>{selection && <button type="button" onClick={() => { invalidate(); setAnchor({ x: String(selection.pos1.x), y: String(selection.pos1.y), z: String(selection.pos1.z) }); }}>Use selection start as paste anchor</button>}</div>
        <div className="studio-java-export__coordinates">{(['x', 'y', 'z'] as const).map(axis => <label key={axis}>Paste anchor {axis.toUpperCase()}<input type="number" step="1" min="-1000000" max="1000000" value={anchor[axis]} onChange={event => { invalidate(); setAnchor(previous => ({ ...previous, [axis]: event.target.value })); }} /></label>)}</div>
        <button type="button" onClick={reviewExport}>Review schematic export</button>
      </fieldset>
      {issues.length > 0 && <section aria-label="Export issues" className="studio-java-export__notice"><h3>Export cannot proceed</h3><ul>{issues.map((issue, index) => <li key={index}><strong>{issue.code}</strong>: {issue.message} <code>{issue.path}</code></li>)}</ul>{issuesTruncated && <p>The issue list is truncated. No partial file is available.</p>}</section>}
      {plan && <section aria-label="Reviewed schematic export" className="studio-java-export__review">
        <h3>Review before download</h3>
        {!reviewed && <p role="alert">This review is stale. Review the current source again.</p>}
        <p><strong>{plan.schematic.nonAirCells.toLocaleString()} solid cells</strong> · {plan.schematic.implicitAirCells.toLocaleString()} air cells · {plan.excludedByScope.toLocaleString()} blocks outside the explicit scope.</p>
        <p>Bounds: ({plan.input.bounds.min.x}, {plan.input.bounds.min.y}, {plan.input.bounds.min.z}) to ({plan.input.bounds.max.x}, {plan.input.bounds.max.y}, {plan.input.bounds.max.z}). Dimensions: {plan.schematic.dimensions.width} × {plan.schematic.dimensions.height} × {plan.schematic.dimensions.length}.</p>
        <p>Paste anchor: ({plan.input.anchor.x}, {plan.input.anchor.y}, {plan.input.anchor.z}). Stored offset: ({plan.schematic.offset.x}, {plan.schematic.offset.y}, {plan.schematic.offset.z}).</p>
        <p>Source: live edit {plan.source.liveEditRevision} · captured saved revision {plan.source.capturedDurableRevision} · lock {plan.targetLocked ? 'On' : 'Off'}.</p>
        <details><summary>Source and profile identity</summary><code>{plan.source.documentId} · {plan.source.historyEpoch} · {plan.source.sessionId}</code><p>{plan.schematic.profile.id} · DataVersion {plan.schematic.profile.dataVersion}</p></details>
        <p>Colors, textures and finish are reviewed substitutions; the schematic contains the exact native states below.</p>
        <ul className="studio-java-export__materials">{plan.materials.slice(materialPage * 20, (materialPage + 1) * 20).map(row => <li key={row.definitionId}><strong>{row.name}</strong><code>{row.definitionId} → {row.blockState}</code><span>{row.instances.toLocaleString()} cells</span></li>)}</ul>
        {plan.materials.length > 20 && <nav aria-label="Export mapping pages" className="studio-java-export__actions"><button type="button" disabled={materialPage === 0} onClick={() => setMaterialPage(materialPage - 1)}>Previous mappings</button><span>Page {materialPage + 1} of {Math.ceil(plan.materials.length / 20)}</span><button type="button" disabled={(materialPage + 1) * 20 >= plan.materials.length} onClick={() => setMaterialPage(materialPage + 1)}>Next mappings</button></nav>}
        <label className="studio-java-export__check"><input type="checkbox" checked={acknowledged} disabled={!reviewed || busy} onChange={event => setAcknowledged(event.target.checked)} /> I reviewed the scope, paste anchor, mapped states and air cells.</label>
        <div className="studio-java-export__actions"><button type="button" disabled={!reviewed || !acknowledged || busy} onClick={() => void prepareDownload()}>{busy ? 'Preparing schematic…' : 'Download experimental .schem'}</button>{busy && <button type="button" onClick={() => { stopWork(); setFeedback({ error: false, message: 'Export cancelled. No pending file will be downloaded.' }); }}>Cancel export</button>}</div>
      </section>}
      {artifact && reviewed && <section aria-label="Prepared schematic files"><p>{artifact.receipt.gzipBytes.toLocaleString()} bytes · SHA256 <code>{artifact.receipt.binarySha256}</code></p><div className="studio-java-export__actions"><button type="button" onClick={() => downloadPrepared('schem')}>Download .schem again</button><button type="button" onClick={() => downloadPrepared('report')}>Download export report</button></div></section>}
      {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
      {busy && <p role="status">Preparing the reviewed snapshot. Changing its settings, source or closing this window cancels the pending download.</p>}
    </div>
  </DraggableWindow>;
}
