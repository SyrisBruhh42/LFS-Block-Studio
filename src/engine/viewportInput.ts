export type GestureOwner = 'edit' | 'camera' | 'stylus' | 'gizmo';
interface Gesture { owner: GestureOwner; startX: number; startY: number; maxTravel: number }

/** Tracks maximum travel, so a drag returning to its origin cannot become a click. */
export class ViewportGestureTracker {
  private pointers = new Map<number, Gesture>();
  get size() { return this.pointers.size; }
  ids() { return [...this.pointers.keys()]; }
  owner(id: number) { return this.pointers.get(id)?.owner; }
  begin(id: number, x: number, y: number, owner: GestureOwner): void {
    if (this.pointers.size) {
      for (const pointer of this.pointers.values()) pointer.owner = 'camera';
      owner = 'camera';
    }
    this.pointers.set(id, { owner, startX: x, startY: y, maxTravel: 0 });
  }
  claim(id: number, owner: GestureOwner): void {
    const pointer = this.pointers.get(id);
    if (pointer) pointer.owner = owner;
  }
  move(id: number, x: number, y: number): void {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    pointer.maxTravel = Math.max(pointer.maxTravel, Math.hypot(x - pointer.startX, y - pointer.startY));
    if (pointer.owner === 'edit' && pointer.maxTravel > 6) pointer.owner = 'camera';
  }
  finish(id: number, x: number, y: number): GestureOwner | undefined {
    this.move(id, x, y);
    const owner = this.owner(id);
    this.pointers.delete(id);
    return owner;
  }
  cancel(): void { this.pointers.clear(); }
}

type KeyboardLike = Pick<KeyboardEvent, 'target' | 'defaultPrevented' | 'isComposing' | 'keyCode'>;

/** Also used by the app dispatcher: UI controls own their keys, including descendants. */
export function isViewportUiTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.closest !== 'function') return false;
  if (element.isContentEditable) return true;
  return Boolean(element.closest('input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="menu"], [role="menuitem"], [role="tab"], [data-viewport-input="blocked"]'));
}

export function shouldIgnoreViewportKeyboard(event: KeyboardLike): boolean {
  return event.defaultPrevented || event.isComposing || event.keyCode === 229 || isViewportUiTarget(event.target);
}

/** Nonmodal inspectors do not globally disable camera keys. Root can block explicitly. */
export function hasOpenViewportModal(doc: Document): boolean {
  return [...doc.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"], dialog[open]')]
    .some(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);
}
