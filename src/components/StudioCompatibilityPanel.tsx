import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { JAVA_SCHEMATIC_PROFILE, type CandidateJavaBlockState } from '../engine/javaProfile';
import type { StudioTarget } from '../lib/studioTargetPolicy';
import './StudioCompatibilityPanel.css';

export type StudioCompatibilitySolidState = Exclude<CandidateJavaBlockState, 'minecraft:air'>;
export interface StudioCompatibilitySource {
  token: string;
  projectName: string;
  target: StudioTarget | null;
  definitions: readonly { id: string; name: string; instances: number; summary: string }[];
}
export interface StudioCompatibilityDraft {
  sourceToken: string;
  locked: boolean;
  assignments: readonly { definitionId: string; blockState: StudioCompatibilitySolidState }[];
}
export interface StudioCompatibilityReview {
  id: string;
  sourceToken: string;
  target: StudioTarget;
  mappings: readonly { definitionId: string; name: string; blockState: CandidateJavaBlockState; instances: number; appearanceSummary: string }[];
  issues: readonly { code: string; path: string; message: string; affectedInstanceIds: readonly string[]; affectedInstances: number }[];
  issuesTruncated: boolean;
  canApply: boolean;
  summary: string;
}
export interface StudioCompatibilityApplyResult { status: 'applied' | 'rejected' | 'stale'; message: string }
export interface StudioCompatibilityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  source: StudioCompatibilitySource;
  disabled?: boolean;
  onReview: (draft: StudioCompatibilityDraft) => StudioCompatibilityReview | Promise<StudioCompatibilityReview>;
  onApply: (review: StudioCompatibilityReview, acknowledgement: { appearanceSubstitution: true; newHistoryEpoch: true }) => Promise<StudioCompatibilityApplyResult>;
}

const PAGE_SIZE = 20;
const SOLID_STATES = JAVA_SCHEMATIC_PROFILE.blockStates.filter((state): state is StudioCompatibilitySolidState => state !== 'minecraft:air');
type Feedback = { kind: 'status' | 'alert'; text: string } | null;
type ReviewReceipt = { report: StudioCompatibilityReview; draftKey: string };

/** Review-only UI. The caller owns authoritative validation, checkpointing and commit. */
export function StudioCompatibilityPanel({ isOpen, onClose, source, disabled = false, onReview, onApply }: StudioCompatibilityPanelProps) {
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const reviewOperation = useRef<object | null>(null);
  const applyOperation = useRef<object | null>(null);
  const [assignments, setAssignments] = useState<ReadonlyMap<string, StudioCompatibilitySolidState>>(new Map());
  const [locked, setLocked] = useState(source.target?.kind === 'minecraft-java' ? !source.target.locked : true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [reviewPage, setReviewPage] = useState(0);
  const [review, setReview] = useState<ReviewReceipt | null>(null);
  const [appearanceAcknowledged, setAppearanceAcknowledged] = useState(false);
  const [historyAcknowledged, setHistoryAcknowledged] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const existingJava = source.target?.kind === 'minecraft-java' ? source.target : null;
  const proposedAssignments = useMemo(() => existingJava
    ? existingJava.bindings.filter(binding => binding.blockState !== 'minecraft:air').map(binding => ({ definitionId: binding.definitionId, blockState: binding.blockState as StudioCompatibilitySolidState }))
    : source.definitions.flatMap(definition => { const blockState = assignments.get(definition.id); return blockState ? [{ definitionId: definition.id, blockState }] : []; }), [existingJava, source.definitions, assignments]);
  const draft: StudioCompatibilityDraft = { sourceToken: source.token, locked, assignments: proposedAssignments };
  const draftKey = JSON.stringify(draft);
  const latest = useRef({ draftKey, token: source.token, isOpen, disabled });
  useLayoutEffect(() => { latest.current = { draftKey, token: source.token, isOpen, disabled }; });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      reviewOperation.current = null;
      dialog.current?.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    };
  }, []);
  useLayoutEffect(() => {
    generation.current++;
    reviewOperation.current = null;
    setReviewing(false);
    setReview(null);
    setAppearanceAcknowledged(false);
    setHistoryAcknowledged(false);
    setFeedback(null);
    if (isOpen) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.current?.open) dialog.current?.showModal();
      heading.current?.focus();
    } else {
      dialog.current?.close();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    }
  }, [isOpen]);
  useLayoutEffect(() => {
    setLocked(source.target?.kind === 'minecraft-java' ? !source.target.locked : true);
  }, [source.target?.kind, existingJava?.locked]);
  useLayoutEffect(() => { setAppearanceAcknowledged(false); setHistoryAcknowledged(false); }, [source.token]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return source.definitions.filter(definition => !query || `${definition.name} ${definition.id} ${definition.summary}`.toLocaleLowerCase().includes(query));
  }, [source.definitions, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const reviewCurrent = !!review && review.draftKey === draftKey && review.report.sourceToken === source.token;
  const issueGroups = useMemo(() => {
    const groups = new Map<string, StudioCompatibilityReview['issues'][number][]>();
    for (const issue of review?.report.issues ?? []) groups.set(issue.code, [...(groups.get(issue.code) ?? []), issue]);
    return [...groups.entries()];
  }, [review]);
  const busy = disabled || applying;
  const lockChanged = !existingJava || locked !== existingJava.locked;
  const canApply = !busy && !reviewing && reviewCurrent && review.report.canApply && !review.report.issuesTruncated && appearanceAcknowledged && historyAcknowledged;
  const invalidate = () => {
    reviewOperation.current = null;
    setReviewing(false);
    setReview(null);
    setAppearanceAcknowledged(false);
    setHistoryAcknowledged(false);
    setFeedback({ kind: 'status', text: 'Choices changed. Request a new review before applying.' });
  };
  const requestReview = async () => {
    if (latest.current.disabled || applyOperation.current || reviewOperation.current || !latest.current.isOpen || !lockChanged) return;
    const operation = {};
    reviewOperation.current = operation;
    const submittedGeneration = generation.current;
    const submittedKey = draftKey;
    setReview(null); setFeedback(null); setReviewing(true);
    setAppearanceAcknowledged(false); setHistoryAcknowledged(false);
    try {
      const report = await onReview(draft);
      if (!mounted.current || reviewOperation.current !== operation || submittedGeneration !== generation.current || !latest.current.isOpen) return;
      if (submittedKey !== latest.current.draftKey || report.sourceToken !== latest.current.token) {
        setFeedback({ kind: 'alert', text: 'This review is stale because the project or choices changed. Request a fresh review.' });
        return;
      }
      setReview({ report, draftKey: submittedKey }); setReviewPage(0);
    } catch (reason) {
      if (mounted.current && reviewOperation.current === operation && submittedGeneration === generation.current && latest.current.isOpen) {
        setFeedback({ kind: 'alert', text: reason instanceof Error ? reason.message : 'The review could not be completed. Your project was not changed.' });
      }
    } finally {
      if (reviewOperation.current === operation) { reviewOperation.current = null; if (mounted.current) setReviewing(false); }
    }
  };
  const applyReview = async () => {
    if (!canApply || !review || applyOperation.current || latest.current.disabled || latest.current.draftKey !== review.draftKey || latest.current.token !== review.report.sourceToken) return;
    const operation = {};
    applyOperation.current = operation;
    const submittedGeneration = generation.current;
    setApplying(true); setFeedback(null);
    try {
      const result = await onApply(review.report, { appearanceSubstitution: true, newHistoryEpoch: true });
      if (!mounted.current || submittedGeneration !== generation.current || !latest.current.isOpen) return;
      setReview(null); setAppearanceAcknowledged(false); setHistoryAcknowledged(false);
      setFeedback({ kind: result.status === 'applied' ? 'status' : 'alert', text: result.message || (result.status === 'applied' ? 'The reviewed compatibility change was applied.' : 'The change was not applied. Request a fresh review.') });
    } catch (reason) {
      if (mounted.current && submittedGeneration === generation.current && latest.current.isOpen) {
        setReview(null); setAppearanceAcknowledged(false); setHistoryAcknowledged(false);
        setFeedback({ kind: 'alert', text: reason instanceof Error ? reason.message : 'The change could not be applied. Check project status, then request a fresh review.' });
      }
    } finally {
      if (applyOperation.current === operation) { applyOperation.current = null; if (mounted.current) setApplying(false); }
    }
  };

  return <dialog ref={dialog} className="studio-compatibility" aria-modal="true" aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-qualification`} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(element => element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first || !last) { event.preventDefault(); heading.current?.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <header className="studio-compatibility-header">
      <div><p className="studio-compatibility-eyebrow">{source.projectName}</p><h2 id={`${uid}-title`} tabIndex={-1} ref={heading}>Game compatibility</h2></div>
      <button type="button" onClick={onClose}>Dismiss</button>
    </header>
    <section aria-label="Current compatibility target" className="studio-compatibility-card">
      <p><strong>Current target:</strong> {existingJava ? 'Minecraft Java' : 'Freeform'} · <strong>Game lock:</strong> {existingJava?.locked ? 'On' : 'Off'}</p>
      {existingJava && <p className="studio-compatibility-identity">Stored profile: {existingJava.profileId}</p>}
      <p id={`${uid}-qualification`} className="studio-compatibility-warning"><strong>Native export not qualified.</strong> This candidate lock checks a small admitted subset. It does not promise an issue-free Minecraft or WorldEdit import.</p>
      <p>Candidate: Minecraft Java {JAVA_SCHEMATIC_PROFILE.gameVersion} · WorldEdit {JAVA_SCHEMATIC_PROFILE.worldEditVersion} · Sponge schematic v{JAVA_SCHEMATIC_PROFILE.schematicVersion} · data version {JAVA_SCHEMATIC_PROFILE.dataVersion}.</p>
    </section>
    <section aria-labelledby={`${uid}-choices`}>
      <h3 id={`${uid}-choices`}>Choose the proposed lock and mappings</h3>
      <label className="studio-compatibility-check"><input type="checkbox" checked={locked} disabled={busy} onChange={event => { setLocked(event.target.checked); invalidate(); }} /> Game compatibility lock after Apply</label>
      {existingJava ? <p>Mappings are fixed within this project, including while unlocked. Only unlocking or relocking is available here. Relocking validates the current build again.</p> : <p>Choose every mapping explicitly. Used definitions need a valid mapping; unused definitions may be mapped for future placement. Unmapped definitions cannot be placed while locked. Air represents empty space and is not a solid-block choice.</p>}
      <label className="studio-compatibility-search">Find a definition<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label>
      <p>{filtered.length.toLocaleString()} of {source.definitions.length.toLocaleString()} definitions · {proposedAssignments.length.toLocaleString()} explicit mappings</p>
      <ul className="studio-compatibility-definitions">
        {rows.map(definition => {
          const binding = existingJava?.bindings.find(item => item.definitionId === definition.id);
          return <li key={definition.id}>
            <div><strong>{definition.name}</strong><code>{definition.id}</code><p>{definition.instances.toLocaleString()} placed instances · {definition.summary}</p></div>
            {existingJava ? <p><strong>Stored mapping:</strong> <code>{binding?.blockState ?? 'Unmapped'}</code></p> : <label>Native state for {definition.name}<select aria-label={`Native state for ${definition.name} (${definition.id})`} value={assignments.get(definition.id) ?? ''} disabled={busy} onChange={event => {
              const value = event.target.value as StudioCompatibilitySolidState | '';
              setAssignments(previous => { const next = new Map(previous); if (value) next.set(definition.id, value); else next.delete(definition.id); return next; });
              invalidate();
            }}><option value="">Not mapped — choose explicitly</option>{SOLID_STATES.map(state => <option key={state} value={state}>{state}</option>)}</select></label>}
          </li>;
        })}
      </ul>
      {filtered.length === 0 && <p>No definitions match this search.</p>}
      <nav className="studio-compatibility-actions" aria-label="Definition pages">
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous definitions</button>
        <span>Page {currentPage + 1} of {pageCount}</span>
        <button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next definitions</button>
      </nav>
      <div className="studio-compatibility-actions"><button type="button" disabled={busy || reviewing || !lockChanged} onClick={() => void requestReview()}>{reviewing ? 'Reviewing…' : 'Review proposed change'}</button>
        <button type="button" disabled aria-describedby={`${uid}-copy-reason`}>Remap or convert as a copy</button></div>
      <p id={`${uid}-copy-reason`}>Changing existing Java mappings or target kind requires a separate project copy. That conversion workflow is not available in this panel.</p>
      {!lockChanged && <p>The requested lock state is already active.</p>}
    </section>
    {review && <section aria-labelledby={`${uid}-review`} className="studio-compatibility-card">
      <h3 id={`${uid}-review`}>Review before Apply</h3>
      {!reviewCurrent && <p role="alert" className="studio-compatibility-warning">This review is stale. The project or choices changed; request a fresh review.</p>}
      <p>{review.report.summary}</p>
      <p>Proposed target: {review.report.target.kind === 'minecraft-java' ? `Minecraft Java · lock ${review.report.target.locked ? 'On' : 'Off'}` : 'Freeform'}</p>
      <p><strong>{review.report.mappings.length.toLocaleString()} reviewed mappings</strong>. These exact native states will represent the definitions; colors, textures and finish are not a fidelity guarantee.</p>
      <ul className="studio-compatibility-definitions">{review.report.mappings.slice(reviewPage * PAGE_SIZE, (reviewPage + 1) * PAGE_SIZE).map(mapping => <li key={mapping.definitionId}><strong>{mapping.name}</strong><code>{mapping.definitionId} → {mapping.blockState}</code><p>{mapping.instances.toLocaleString()} affected placed instances · {mapping.appearanceSummary}</p></li>)}</ul>
      {review.report.mappings.length > PAGE_SIZE && <nav className="studio-compatibility-actions" aria-label="Reviewed mapping pages"><button type="button" disabled={reviewPage === 0} onClick={() => setReviewPage(reviewPage - 1)}>Previous reviewed mappings</button><span>Page {reviewPage + 1} of {Math.ceil(review.report.mappings.length / PAGE_SIZE)}</span><button type="button" disabled={(reviewPage + 1) * PAGE_SIZE >= review.report.mappings.length} onClick={() => setReviewPage(reviewPage + 1)}>Next reviewed mappings</button></nav>}
      {issueGroups.map(([code, issues]) => <section key={code} className="studio-compatibility-issues" aria-label={`${code} issues`}><h4>{code} ({issues.length})</h4><ul>{issues.map((issue, index) => <li key={`${issue.path}-${index}`}><p>{issue.message}</p><code>{issue.path}</code><p>{issue.affectedInstances.toLocaleString()} affected instances</p>{issue.affectedInstanceIds.length > 0 && <details><summary>Show {issue.affectedInstanceIds.length < issue.affectedInstances ? 'sampled' : 'affected'} instance IDs ({issue.affectedInstanceIds.length})</summary><p className="studio-compatibility-identity">{issue.affectedInstanceIds.join(', ')}</p></details>}</li>)}</ul></section>)}
      {review.report.issuesTruncated && <p role="alert" className="studio-compatibility-warning">The issue list is truncated. This is not a complete review; Apply is unavailable.</p>}
      {!review.report.canApply && <p className="studio-compatibility-warning">This proposal cannot be applied. Resolve the reported issues and review again.</p>}
      <p>A successful Apply checkpoints the current project and starts a new Undo history. Ordinary Undo will not cross this policy change. Earlier work must be recovered as a copy.</p>
      <label className="studio-compatibility-check"><input type="checkbox" checked={appearanceAcknowledged} disabled={busy || !reviewCurrent} onChange={event => setAppearanceAcknowledged(event.target.checked)} /> I reviewed the exact mappings and accept the native appearance substitutions.</label>
      <label className="studio-compatibility-check"><input type="checkbox" checked={historyAcknowledged} disabled={busy || !reviewCurrent} onChange={event => setHistoryAcknowledged(event.target.checked)} /> I understand the checkpoint and new Undo-history consequence.</label>
      <div className="studio-compatibility-actions"><button type="button" disabled={!canApply} onClick={() => void applyReview()}>{applying ? 'Applying…' : 'Apply reviewed change'}</button><button type="button" disabled={applying} onClick={() => { invalidate(); setFeedback({ kind: 'status', text: 'Review discarded. Your choices remain; the project was not changed by discarding the review.' }); }}>Discard review</button></div>
    </section>}
    {feedback && <p role={feedback.kind} className={feedback.kind === 'alert' ? 'studio-compatibility-warning' : ''}>{feedback.text}</p>}
    {reviewing && <p role="status">Preparing the review. Dismissing this panel discards the pending review result.</p>}
    {applying && <p role="status">Applying the submitted review. Dismissing this panel does not cancel the operation. Reopening waits for it to finish.</p>}
    {disabled && <p role="status">Compatibility changes are currently unavailable. You can inspect this panel; Apply is disabled.</p>}
    <footer><p>Reviewing and choosing mappings do not change the project. Dismiss closes this panel; it does not cancel an Apply already submitted.</p></footer>
  </dialog>;
}
