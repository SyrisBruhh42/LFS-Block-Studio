import type { WorldEditEngineState } from '../engine/types';
import type { StudioDocument } from './studioDocument';
import type { StudioEditorResult } from './studioEditorSession';
import { collectStudioKitResources, prepareStudioKitImport, readStudioKit, studioKitOriginalBytes, writeStudioKit, STUDIO_KIT_LIMITS, type StudioKit, type StudioKitImportProposal, type StudioKitImportReport, type StudioKitMetadata, type StudioKitProvenance } from './studioKit';
import { prepareStudioPrefabPlacement, type StudioPrefabProposal, type StudioPrefabReport } from './studioPrefabPlacement';
import { courtyardStarterKit } from '../resources/kits/courtyardStarter';

export interface StudioKitSource { document: StudioDocument; engine: WorldEditEngineState; token: string; writable: boolean }
export interface StudioKitSnapshot {
  open: boolean; version: number; focusSerial: number; phase: 'reading' | 'preserving' | 'exporting' | null;
  manifest: StudioKit['manifest'] | null; licenseText: string; notices: string; sourceNotices: StudioKitProvenance[]; importReport: StudioKitImportReport | null;
  placementReport: StudioPrefabReport | null; message: string;
}
export interface StudioKitExportDraft extends StudioKitMetadata { sourceToken: string; definitionIds: string[]; blueprintIds: string[]; licenseText: string; notices: string; rightsConfirmed: boolean }
export interface StudioKitDownload { readonly filename: string; readonly bytes: Uint8Array<ArrayBuffer> }
function freeze<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const reject = (message: string): StudioEditorResult => ({ status: 'rejected', message });

/** Draft/review/job ownership only. Injected session and persistence paths own every write. */
export class StudioKitModel {
  private snapshot: StudioKitSnapshot = Object.freeze({ open: false, version: 0, focusSerial: 0, phase: null, manifest: null, licenseText: '', notices: '', sourceNotices: [], importReport: null, placementReport: null, message: '' });
  private listeners = new Set<() => void>();
  private job: AbortController | null = null;
  private generation = 0;
  private kit: StudioKit | null = null;
  private filename = 'resource.studio-kit.zip';
  private importProposal: StudioKitImportProposal | null = null;
  private placementProposal: StudioPrefabProposal | null = null;
  private download: { value: StudioKitDownload; bytes: Uint8Array<ArrayBuffer>; generation: number; token: string } | null = null;
  private observedToken: string;
  private committing = false;
  constructor(private readonly read: () => StudioKitSource,
    private readonly preserve: (proposal: StudioKitImportProposal) => Promise<boolean>,
    private readonly commitImport: (proposal: StudioKitImportProposal) => StudioEditorResult,
    private readonly commitPlacement: (proposal: StudioPrefabProposal) => StudioEditorResult,
    private readonly decode: typeof readStudioKit = readStudioKit) { this.observedToken = read().token; }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<StudioKitSnapshot>) { this.snapshot = Object.freeze({ ...this.snapshot, ...patch }); for (const listener of this.listeners) listener(); }
  private invalidate() { this.generation++; this.job?.abort(); this.job = null; this.importProposal = null; this.placementProposal = null; this.download = null; }
  private failure(error: unknown) { const result = reject(error instanceof Error ? error.message : 'The resource operation failed. The current project was preserved.'); this.publish({ phase: null, message: result.message! }); return result; }
  private begin(phase: NonNullable<StudioKitSnapshot['phase']>) { this.invalidate(); const job = new AbortController(); this.job = job; this.publish({ phase, importReport: null, placementReport: null, version: this.snapshot.version + 1, message: '' }); return { job, generation: this.generation }; }
  private alive(generation: number, job: AbortController) { return this.snapshot.open && this.generation === generation && this.job === job && !job.signal.aborted; }
  show = () => { this.invalidate(); this.publish({ open: true, phase: null, importReport: null, placementReport: null, version: this.snapshot.version + 1, focusSerial: this.snapshot.focusSerial + 1, message: '' }); };
  close = () => { this.invalidate(); this.publish({ open: false, phase: null, importReport: null, placementReport: null, version: this.snapshot.version + 1 }); };
  edit = () => { this.invalidate(); this.publish({ phase: null, importReport: null, placementReport: null, version: this.snapshot.version + 1, message: '' }); };
  cancel = () => { this.edit(); this.publish({ message: 'Resource operation cancelled. The build is unchanged; an original already being preserved may remain in recovery.' }); };
  synchronize = () => {
    const token = this.read().token, changed = token !== this.observedToken; this.observedToken = token;
    if (changed && !this.committing && (this.job || this.importProposal || this.placementProposal || this.download)) {
      this.invalidate(); this.publish({ phase: null, importReport: null, placementReport: null, version: this.snapshot.version + 1, message: 'The project changed. Your resource choices are retained; review against the current project before Apply.' });
    }
  };
  load = async (filename: string, size: number, producer: () => Promise<Uint8Array>, version: number): Promise<StudioEditorResult> => {
    if (!this.snapshot.open || version !== this.snapshot.version || this.job) return reject('This resource input is no longer active.');
    if (!Number.isInteger(size) || size < 1 || size > STUDIO_KIT_LIMITS.sourceEnvelopeBytes || typeof filename !== 'string' || filename.length > 256 || !filename.trim() || /[\u0000-\u001f\u007f]/.test(filename)) { this.edit(); return this.failure(new Error('Choose a kit ZIP up to 4 MiB or recovered source envelope up to 6 MiB with a valid filename. This file was not read; the previous review was revoked.')); }
    const source = this.read(), { job, generation } = this.begin('reading');
    try {
      const data = await producer();
      if (!this.alive(generation, job)) return reject('This resource read was cancelled or replaced.');
      if (!(data instanceof Uint8Array) || data.length !== size) throw new Error('Resource bytes do not match the selected file size.');
      const kit = await this.decode(new Uint8Array(data), job.signal);
      if (!this.alive(generation, job)) return reject('This resource read was cancelled or replaced.');
      if (source.token !== this.read().token) throw new Error('The project changed while reading. Review the file again.');
      this.job = null; this.kit = kit; this.filename = filename.endsWith('.zip') ? filename : `${kit.manifest.id}.studio-kit.zip`;
      this.publish({ phase: null, manifest: kit.manifest, licenseText: kit.licenseText, notices: kit.notices, sourceNotices: kit.resources.provenance });
      return this.reviewImport(this.snapshot.version);
    } catch (error) { if (!this.alive(generation, job)) return reject('This resource read was cancelled or replaced.'); this.job = null; return this.failure(error); }
  };
  loadStarter = async (version: number): Promise<StudioEditorResult> => {
    if (!this.snapshot.open || version !== this.snapshot.version || this.job) return reject('This resource input is no longer active.');
    const { job, generation } = this.begin('reading'), token = this.read().token;
    try {
      const bytes = await courtyardStarterKit(), kit = await this.decode(bytes, job.signal);
      if (!this.alive(generation, job)) return reject('Starter preparation was cancelled or replaced.');
      if (token !== this.read().token) throw new Error('The project changed. Review the starter again.');
      this.job = null; this.kit = kit; this.filename = 'courtyard-starter-v1.studio-kit.zip';
      this.publish({ phase: null, manifest: kit.manifest, licenseText: kit.licenseText, notices: kit.notices, sourceNotices: kit.resources.provenance });
      return this.reviewImport(this.snapshot.version);
    } catch (error) { if (!this.alive(generation, job)) return reject('Starter preparation was cancelled or replaced.'); this.job = null; return this.failure(error); }
  };
  reviewImport = (version: number): StudioEditorResult => {
    if (!this.snapshot.open || version !== this.snapshot.version || this.job || !this.kit) return reject('Read a resource kit before reviewing its import.');
    this.invalidate(); const source = this.read();
    try {
      const proposal = prepareStudioKitImport(source.document, source.token, this.kit, this.filename);
      this.importProposal = proposal; this.publish({ importReport: freeze(proposal.report), placementReport: null, message: proposal.report.noop ? 'This kit is already present, including its notices. Applying keeps history and Redo.' : 'Review ready. Import adds local library resources and their notices; placed cells are unchanged.' }); return { status: 'noop' };
    } catch (error) { this.publish({ importReport: null, placementReport: null }); return this.failure(error); }
  };
  applyImport = async (report: StudioKitImportReport): Promise<StudioEditorResult> => {
    if (!this.snapshot.open || !this.importProposal || this.snapshot.importReport !== report || this.importProposal.report !== report || this.job) return reject('This kit review is no longer active. Review again.');
    const source = this.read();
    if (!source.writable || source.token !== report.sourceToken) { this.edit(); return this.failure(new Error('The project changed or is unavailable. Review again before importing.')); }
    const proposal = this.importProposal;
    if (report.noop) { this.edit(); this.publish({ message: 'No change. The library, history and Redo were retained.' }); return { status: 'noop' }; }
    const { job, generation } = this.begin('preserving');
    this.publish({ message: 'Preserving the exact original kit before adding library items.' });
    try {
      const preserved = await this.preserve(proposal);
      if (!this.alive(generation, job)) return reject('The import view was cancelled or replaced. No library edit was submitted.');
      const current = this.read();
      if (!preserved || !current.writable || current.token !== proposal.sourceToken) throw new Error('The original was not confirmed for this source, or the project became unavailable. No library edit was submitted. Check recovery/saving status before retrying.');
      this.job = null; this.committing = true;
      let result: StudioEditorResult;
      try { result = this.commitImport(proposal); } finally { this.committing = false; this.observedToken = this.read().token; }
      if (this.generation === generation && this.snapshot.open) this.publish({ phase: null, message: result.message ?? (result.status === 'applied' ? 'Kit imported as one library edit. Undo restores the previous library and notices. Open Library to place a blueprint.' : result.status === 'noop' ? 'No change. History and Redo were retained.' : 'Import rejected. The preserved original remains in recovery.') });
      return result;
    } catch (error) { if (this.generation !== generation || !this.snapshot.open) return reject('The import view was cancelled or replaced.'); this.job = null; this.committing = false; return this.failure(error); }
  };
  previewPlacement = (blueprintId: string, x: string, y: string, z: string, rotation: string, version: number): StudioEditorResult => {
    if (!this.snapshot.open || version !== this.snapshot.version || this.job) return reject('This placement draft is no longer active.');
    this.invalidate(); const source = this.read();
    try {
      if (!source.writable) throw new Error('Wait for project recovery or replacement before preparing placement.');
      const values = [x, y, z].map(v => { if (typeof v !== 'string' || !v.trim() || !Number.isFinite(Number(v)) || Math.abs(Number(v)) > 1000000) throw new Error('Placement coordinates must be finite and within ±1,000,000.'); return Number(v); });
      if (!['0', '90', '180', '270'].includes(rotation)) throw new Error('Choose a quarter-turn placement rotation.');
      const proposal = prepareStudioPrefabPlacement(source.document, source.engine, source.token, blueprintId, { x: values[0], y: values[1], z: values[2] }, Number(rotation) as 0 | 90 | 180 | 270);
      this.placementProposal = proposal; this.publish({ importReport: null, placementReport: freeze(proposal.report), message: proposal.report.noop ? 'No final placement change. History and Redo will be retained.' : 'Placement preview ready. Inspect added/replaced cells, then Apply once.' }); return { status: 'noop' };
    } catch (error) { this.publish({ importReport: null, placementReport: null }); return this.failure(error); }
  };
  applyPlacement = (report: StudioPrefabReport): StudioEditorResult => {
    if (!this.snapshot.open || !this.placementProposal || report !== this.snapshot.placementReport || report !== this.placementProposal.report) return reject('This placement review is no longer active.');
    const source = this.read(); if (!source.writable || source.token !== report.sourceToken) { this.edit(); return this.failure(new Error('The project changed or is unavailable. Review placement again.')); }
    const proposal = this.placementProposal; this.invalidate(); const generation = this.generation; this.publish({ placementReport: null, importReport: null }); this.committing = true;
    let result: StudioEditorResult;
    try { result = this.commitPlacement(proposal); } catch (error) { return this.failure(error); } finally { this.committing = false; this.observedToken = this.read().token; }
    if (this.generation === generation && this.snapshot.open) this.publish({ placementReport: null, importReport: null, phase: null, message: result.message ?? (result.status === 'applied' ? 'Blueprint placed as one edit. Undo restores cells and chunk visibility.' : result.status === 'noop' ? 'No change. History and Redo were retained.' : 'Placement was rejected.') }); return result;
  };
  prepareExport = async (draft: StudioKitExportDraft, version: number): Promise<StudioKitDownload | null> => {
    if (!this.snapshot.open || version !== this.snapshot.version || this.job) return null;
    const source = this.read(), { job, generation } = this.begin('exporting');
    try {
      if (draft.sourceToken !== source.token) throw new Error('The project changed. Refresh the resource choices before packaging. Your text draft is retained.');
      if (draft.rightsConfirmed !== true) throw new Error('Confirm your right to share these selected resources under the declared license. Existing source notices are retained.');
      const payload = collectStudioKitResources(source.document, draft.definitionIds, draft.blueprintIds);
      const filename = `${draft.name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 64) || 'studio'}.studio-kit.zip`;
      const bytes = await writeStudioKit({ id: draft.id, name: draft.name, description: draft.description, author: draft.author, license: draft.license, sourceUrl: draft.sourceUrl }, payload, draft.licenseText, draft.notices);
      if (!this.alive(generation, job)) return null;
      if (this.read().token !== source.token) throw new Error('The project changed. Review your selection and package the current resources again.');
      const value = Object.freeze({ filename, bytes: new Uint8Array(bytes) });
      this.job = null; this.download = { value, bytes, generation, token: source.token }; this.publish({ phase: null, message: 'Kit prepared with its complete definition closure and retained source notices. It contains resources, not the full project.' }); return value;
    } catch (error) { if (!this.alive(generation, job)) return null; this.job = null; this.failure(error); return null; }
  };
  consumeDownload = (value: StudioKitDownload): StudioKitDownload | null => {
    const pending = this.download;
    if (!pending || pending.value !== value || pending.generation !== this.generation || pending.token !== this.read().token || !this.snapshot.open) return null;
    this.download = null; return { filename: value.filename, bytes: new Uint8Array(pending.bytes) };
  };
  originalDownload = (version: number): StudioKitDownload | null => {
    if (!this.snapshot.open || version !== this.snapshot.version || !this.kit) return null;
    return { filename: this.filename, bytes: studioKitOriginalBytes(this.kit) };
  };
}
