/** View/draft lifecycle only. The injected session remains the sole build/history authority. */
import type { StudioDocument } from './studioDocument';
import type { StudioEditorResult, StudioWorkspace } from './studioEditorSession';
import { checkCellDraft, draftStudioCell, prepareStudioCellEdit, resolveStudioCell,
  type PreparedStudioCellEdit, type StudioCellDraft, type StudioCellEditReport, type StudioCellTarget } from './studioCellEdit';

export interface StudioCellInspectorSource { document: StudioDocument; workspace: StudioWorkspace; token: string; writable: boolean }
export interface StudioCellInspectorSnapshot {
  readonly open: boolean; readonly target: StudioCellTarget | null; readonly draft: Readonly<StudioCellDraft> | null;
  readonly draftToken: string; readonly dirty: boolean; readonly review: StudioCellEditReport | null;
  readonly message: string; readonly contextId: number; readonly draftVersion: number; readonly focusSerial: number;
}
const rejected = (message: string): StudioEditorResult => ({ status: 'rejected', message });
export class StudioCellInspectorModel {
  private snapshot: StudioCellInspectorSnapshot = Object.freeze({ open: false, target: null, draft: null, draftToken: '', dirty: false, review: null, message: '', contextId: 0, draftVersion: 0, focusSerial: 0 });
  private prepared: PreparedStudioCellEdit | null = null;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly read: () => StudioCellInspectorSource, private readonly commit: (edit: PreparedStudioCellEdit) => StudioEditorResult) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<StudioCellInspectorSnapshot>) {
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch });
    for (const listener of this.listeners) listener();
  }
  private fail(message: string) { this.publish({ message }); return rejected(message); }
  private fresh(source: StudioCellInspectorSource) { return source.token === this.snapshot.draftToken && Boolean(resolveStudioCell(source.document, this.snapshot.target)); }
  private load(source: StudioCellInspectorSource, message = '') {
    const cell = resolveStudioCell(source.document, this.snapshot.target);
    this.prepared = null;
    this.publish({ draft: cell ? Object.freeze(draftStudioCell(cell)) : null, dirty: false, draftToken: source.token, review: null, message,
      contextId: this.snapshot.contextId + 1, draftVersion: this.snapshot.draftVersion + 1 });
  }
  inspect = (key: string, token: string): StudioEditorResult => {
    const source = this.read();
    if (source.token !== token) return this.fail('The project changed. Inspect a current scene row again.');
    const block = source.document.blocks[key];
    if (!block) return this.fail('This cell is no longer present.');
    const same = this.snapshot.target?.documentId === source.document.documentId && this.snapshot.target.blockId === block.id;
    if (this.snapshot.dirty && !same) return this.fail('A cell has an unfinished draft. Resume cell properties, then apply or discard that draft before choosing another cell.');
    this.prepared = null;
    this.publish({ open: true, target: Object.freeze({ documentId: source.document.documentId, blockId: block.id, keyHint: key }), review: null,
      focusSerial: this.snapshot.focusSerial + 1, contextId: this.snapshot.contextId + 1 });
    if (!this.snapshot.dirty) this.load(source);
    return { status: 'noop', message: 'Cell properties opened. The build is unchanged.' };
  };
  close = () => {
    this.prepared = null;
    this.publish({ open: false, review: null, contextId: this.snapshot.contextId + 1, draftVersion: this.snapshot.draftVersion + 1 });
  };
  reopen = (): StudioEditorResult => {
    if (!this.snapshot.target) return rejected('Choose a cell in the scene browser first.');
    this.prepared = null;
    this.publish({ open: true, review: null, focusSerial: this.snapshot.focusSerial + 1, contextId: this.snapshot.contextId + 1 });
    this.synchronize();
    return { status: 'noop', message: 'Cell properties resumed. The build is unchanged.' };
  };
  updateDraft = (partial: Partial<StudioCellDraft>, contextId: number): StudioEditorResult => {
    if (!this.snapshot.open || this.snapshot.contextId !== contextId || !this.snapshot.draft) return rejected('This properties form is no longer active.');
    try {
      // Reject unknown/accessor fields before spreading UI input into the draft.
      if (!partial || typeof partial !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(partial))) throw new Error('Use plain property values.');
      const next = { ...this.snapshot.draft };
      for (const key of Reflect.ownKeys(partial)) {
        if (typeof key !== 'string' || !Object.hasOwn(next, key)) throw new Error('Unknown cell property.');
        const descriptor = Object.getOwnPropertyDescriptor(partial, key)!;
        if (!descriptor.enumerable || !('value' in descriptor)) throw new Error('Use plain property values.');
        (next as any)[key] = descriptor.value;
      }
      const draft = Object.freeze(checkCellDraft(next));
      this.prepared = null;
      this.publish({ draft, dirty: true, review: null, message: '', draftVersion: this.snapshot.draftVersion + 1 });
      return { status: 'noop' };
    } catch (error) { return this.fail(error instanceof Error ? error.message : 'Unsupported property value.'); }
  };
  reload = (contextId: number): StudioEditorResult => {
    if (!this.snapshot.open || contextId !== this.snapshot.contextId) return rejected('This properties form is no longer active.');
    const source = this.read();
    this.load(source, resolveStudioCell(source.document, this.snapshot.target) ? 'Current cell reloaded; the draft was discarded.' : 'Draft discarded. Choose a current cell in the scene browser.');
    return { status: 'noop' };
  };
  synchronize = () => {
    if (!this.snapshot.target) return;
    const source = this.read();
    if (source.token === this.snapshot.draftToken) return;
    this.prepared = null;
    if (this.snapshot.dirty) this.publish({ review: null, message: 'The project changed. Your draft is retained. Reload the current cell before reviewing another edit.' });
    else this.load(source, resolveStudioCell(source.document, this.snapshot.target) ? '' : 'This cell is unavailable in the current project. Undo or choose a current cell.');
  };
  review = (version: number): StudioEditorResult => {
    if (!this.snapshot.open || version !== this.snapshot.draftVersion || !this.snapshot.draft || !this.snapshot.target) return rejected('This properties draft is no longer active.');
    const source = this.read();
    if (!source.writable) return this.fail('Editing is unavailable while project recovery or replacement is in progress.');
    if (!this.fresh(source)) return this.fail('The project changed. Your draft is retained. Reload the current cell before reviewing another edit.');
    try {
      this.prepared = prepareStudioCellEdit(source.document, this.snapshot.target, this.snapshot.draft, source.token, source.workspace);
      this.publish({ review: this.prepared.report, message: '' });
      return { status: 'noop' };
    } catch (error) {
      this.prepared = null;
      this.publish({ review: null, message: error instanceof Error ? error.message : 'These properties could not be reviewed.' });
      return rejected(this.snapshot.message);
    }
  };
  cancelReview = (report: StudioCellEditReport) => {
    if (this.snapshot.review !== report) return;
    this.prepared = null; this.publish({ review: null });
  };
  apply = (report: StudioCellEditReport): StudioEditorResult => {
    // An old button callback cannot apply a newer review, including close/reopen ABA.
    if (!this.snapshot.open || !this.prepared || report !== this.snapshot.review || report !== this.prepared.report) return rejected('This review is no longer active. Review the draft again.');
    const source = this.read();
    if (!source.writable || !this.fresh(source)) { this.prepared = null; this.publish({ review: null }); return this.fail('The project changed or is unavailable. Your draft is retained; reload before reviewing.'); }
    const prepared = this.prepared; this.prepared = null; this.publish({ review: null });
    let result: StudioEditorResult;
    try { result = this.commit(prepared); }
    catch (error) { result = rejected(error instanceof Error ? error.message : 'The properties edit could not be applied.'); }
    if (result.status !== 'rejected') this.load(this.read(), result.status === 'applied' ? 'Cell properties applied. Undo restores the complete edit.' : 'Properties are unchanged. Redo and history are retained.');
    else this.publish({ message: result.message ?? 'The properties edit could not be applied. Your draft is retained.' });
    return result;
  };
}
