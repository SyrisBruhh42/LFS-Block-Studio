import { useEffect, useRef, useState } from 'react';
import { Download, FolderClock, Save, X } from 'lucide-react';
import type { useStudioPersistence } from '../lib/useStudioPersistence';
import { importStudioCandidate } from '../lib/legacyStudioImport';
import { STUDIO_DOCUMENT_LIMITS } from '../lib/studioDocument';

export function StudioRecoveryPanel({ persistence: p }: { persistence: ReturnType<typeof useStudioPersistence> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const showRecovery = p.recoveryOpen || p.choices.length > 0 || (!p.ready && p.phase === 'failed');
  useEffect(() => {
    const element = dialog.current;
    if (showRecovery && !element?.open) element?.showModal();
    if (!showRecovery && element?.open) element.close();
  }, [showRecovery]);
  const importFile = async (file: File) => {
    setFileError(null);
    if (file.size > STUDIO_DOCUMENT_LIMITS.maxBytes) { setFileError('This file exceeds the current project-size limit. The original was not changed.'); return; }
    try {
      const raw = await file.text();
      const candidate = importStudioCandidate(raw, p.importDefaults());
      if (candidate.ok === false) { setFileError(candidate.error.message); return; }
      await p.restoreCopy(candidate.value, [{ sourceId: `file:${file.name}`, raw }]);
    } catch (reason) { setFileError(reason instanceof Error ? reason.message : 'The file could not be read.'); }
  };
  const label = p.phase === 'loading' ? 'Opening saved project…'
    : p.phase === 'saving' ? 'Saving locally…'
    : p.phase === 'failed' ? 'Save needs attention'
    : p.phase === 'dirty' ? 'Unsaved changes'
    : `Saved locally${p.savedAt ? ` · ${new Date(p.savedAt).toLocaleTimeString()}` : ''}`;
  return <>
    <section className="studio-save-bar flex flex-wrap items-center gap-2 border-b border-slate-700 bg-slate-900 px-3 py-1.5 text-xs" aria-label="Project saving and recovery">
      <strong className="max-w-[18rem] truncate" title={p.ready ? p.currentDocument().world.worldName : undefined}>{p.ready ? p.currentDocument().world.worldName : 'Opening project'}</strong>
      <span role="status" aria-live="polite" className={p.phase === 'failed' ? 'text-amber-300' : 'text-slate-200'}>{label}</span>
      <div className="ml-auto flex flex-wrap gap-1">
        <button className="studio-control" type="button" disabled={!p.ready || p.busy || p.phase === 'saving'} onClick={() => void p.save()}><Save size={15} aria-hidden="true" /> Save</button>
        <button className="studio-control" type="button" disabled={!p.ready || p.busy} onClick={p.downloadCurrent}><Download size={15} aria-hidden="true" /> Project backup</button>
        <button className="studio-control" type="button" disabled={p.busy || p.phase === 'loading'} onClick={() => void p.openRecovery()}><FolderClock size={15} aria-hidden="true" /> Recovery</button>
        <button className="studio-control" type="button" disabled={p.busy} onClick={() => fileInput.current?.click()}>Open project copy</button>
      </div>
      {p.ready && p.error && <div role="alert" className="w-full flex flex-wrap items-center gap-2 text-amber-200">
        <span>{p.error}</span>
        <button className="studio-control" type="button" onClick={p.retry}>Retry save</button>
        <button className="studio-control" type="button" onClick={p.downloadCurrent}>Download unsaved work</button>
        <button className="studio-control" type="button" disabled={p.busy} onClick={() => void p.forkCurrent()}>Keep my work as a separate project</button>
      </div>}
      {fileError && <p className="w-full text-amber-200" role="alert">{fileError}</p>}
      <input ref={fileInput} type="file" accept=".json,.lfsproj.json,application/json" className="hidden" aria-label="Open a project file as a copy" onChange={event => {
        const file = event.target.files?.[0]; if (file) void importFile(file); event.target.value = '';
      }} />
    </section>
    <dialog ref={dialog} aria-modal="true" aria-labelledby="studio-recovery-title" className="studio-recovery-dialog" onCancel={event => {
      if (!p.ready) event.preventDefault(); else p.dismissRecovery();
    }}>
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs uppercase tracking-widest text-emerald-300">LFS Block Studio</p><h2 id="studio-recovery-title" className="mt-2 text-xl font-semibold">Recover your work</h2></div>
        {p.ready && <button type="button" className="studio-control" aria-label="Close recovery" onClick={p.dismissRecovery}><X size={18} /></button>}
      </div>
      <p className="my-4 text-sm text-slate-300">Choose a saved copy to open as a separate project. Original files and earlier revisions remain available. A local save is not a backup on another device.</p>
      {p.error && <p role="alert" className="my-3 rounded-lg border border-amber-500/40 p-3 text-sm text-amber-200">{p.error}</p>}
      <section aria-label="Stored recovery records" className="my-4 rounded-lg border border-slate-600 p-3">
        <h3 className="font-semibold">Browse preserved records</h3>
        <p className="my-2 text-sm text-slate-300">Read and download without opening, changing or deleting the saved project. Unsupported and damaged records remain available within recovery limits. Pages are ordered by stored key, not date. Browse the category again to include newer records added before the current page.</p>
        <div className="flex flex-wrap gap-2">
          <button className="studio-control" type="button" onClick={() => void p.selectRecovery({ kind: 'active' })}>Inspect active record</button>
          <button className="studio-control" type="button" onClick={() => void p.browseRecovery('revision')}>Browse revisions</button>
          <button className="studio-control" type="button" onClick={() => void p.browseRecovery('candidate')}>Browse saved candidates</button>
        </div>
        {p.recoveryBusy && <p className="mt-2 text-sm" role="status">Reading preserved records…</p>}
        {p.recoveryError && <p className="mt-2 text-sm text-amber-200" role="alert">{p.recoveryError}</p>}
        {p.recoveryPage && <>
          <p className="my-2 text-sm">{p.recoveryKind === 'revision' ? 'Revisions' : 'Candidates'} · page {p.recoveryPageNumber}</p>
          {p.recoveryPage.items.length === 0 && <p className="text-sm">This page contains no stored records.</p>}
          <ul className="grid max-h-[25vh] gap-2 overflow-auto" aria-label="Recovery record page">
            {p.recoveryPage.items.map((item, index) => <li key={index} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-700 p-2">
              <span className="break-all text-xs">{item.label}</span>
              <button className="studio-control" type="button" onClick={() => void p.selectRecovery(item.ref)}>Inspect record</button>
            </li>)}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="studio-control" type="button" disabled={p.recoveryBusy || p.recoveryPageNumber <= 1} onClick={() => void p.previousRecoveryPage()}>Previous page</button>
            <button className="studio-control" type="button" disabled={p.recoveryBusy || p.recoveryPage.nextCursor === null} onClick={() => void p.nextRecoveryPage()}>Next page</button>
          </div>
        </>}
        {p.recoverySelected && <section aria-label="Selected recovery record" className="mt-3 border-t border-slate-600 pt-3">
          <h4 className="font-semibold">{p.recoverySelected.document?.world.worldName ?? 'Original record rescue'}</h4>
          {p.recoverySelected.document && <p aria-label="Inspected revision" className="my-2 text-sm">Revision {p.recoverySelected.document.revision} · {new Date(p.recoverySelected.document.savedAt).toLocaleString()}</p>}
          <p className="my-2 text-sm text-slate-300">Document and source downloads preserve the stored text. The envelope is a JSON representation of the browser record, including its metadata. Downloading does not validate or activate it.</p>
          {p.recoverySelected.issues.map((issue, index) => <p key={index} className="my-1 text-sm text-amber-200">{issue}</p>)}
          <div className="flex flex-wrap gap-2">
            <button className="studio-control" type="button" disabled={p.recoverySelected.json === null || p.recoverySelected.unsafeTextParts.includes('document')} onClick={() => p.downloadRecovery('document')}>Download original document text</button>
            {p.recoverySelected.encodedDocumentBytes && <button className="studio-control" type="button" onClick={() => p.downloadRecovery('encoded-document')}>Download stored document bytes</button>}
            <button className="studio-control" type="button" disabled={p.recoverySelected.envelopeJson === null} onClick={() => p.downloadRecovery('envelope')}>Download record envelope</button>
            {p.recoverySelected.activePointerJson !== undefined && <button className="studio-control" type="button" onClick={() => p.downloadRecovery('pointer')}>Download active pointer</button>}
            {p.recoverySelected.document && p.ready && <button className="studio-control" type="button" disabled={p.busy} onClick={() => void p.restoreSelectedRecovery()}>Open inspected project as a copy</button>}
            {p.recoverySelected.checkpoint && <button className="studio-control" type="button" onClick={() => void p.selectRecovery(p.recoverySelected!.checkpoint!)}>Inspect referenced policy checkpoint</button>}
          </div>
          {p.recoverySelected.sources.length > 0 && <ul className="mt-2 grid gap-2" aria-label="Preserved original sources">
            {p.recoverySelected.sources.map((source, index) => <li key={index} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="break-all">{source.sourceId}</span>
              <button className="studio-control" type="button" disabled={p.recoverySelected!.unsafeTextParts.includes(`source:${index}`)} onClick={() => p.downloadRecovery('source', index)}>Download original source {index + 1}</button>
              {(p.recoverySelected!.unsafeTextParts.includes(`source:${index}`) || p.recoverySelected!.envelopeJson === null) && <button className="studio-control" type="button" onClick={() => p.downloadRecovery('source-envelope', index)}>Download source {index + 1} as JSON envelope</button>}
            </li>)}
          </ul>}
        </section>}
      </section>
      <ul className="grid gap-2 max-h-[45vh] overflow-auto">
        {p.choices.map(choice => <li key={choice.id} className="rounded-lg border border-slate-600 p-3">
          <strong>{choice.document.world.worldName}</strong>
          <p className="my-1 text-sm text-slate-300">{choice.label} · {Object.keys(choice.document.blocks).length.toLocaleString()} blocks</p>
          <button className="studio-control" type="button" disabled={p.busy} onClick={() => void p.choose(choice.id)}>Open this copy</button>
        </li>)}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        {!p.ready && <>
          <button className="studio-control" type="button" disabled={p.busy} onClick={p.retry}>Retry opening storage</button>
          <button className="studio-control" type="button" onClick={p.downloadOriginals}>Download original records</button>
          <button className="studio-control" type="button" disabled={p.busy} onClick={() => void p.startSeparate()}>Start a separate project</button>
        </>}
        {p.ready && <button className="studio-control" type="button" onClick={p.dismissRecovery}>Keep working</button>}
      </div>
      {p.busy && <p role="status" className="mt-3 text-sm">Verifying the saved copy…</p>}
    </dialog>
  </>;
}
