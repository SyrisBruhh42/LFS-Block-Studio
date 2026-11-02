import { createStudioId } from '../lib/studioId';
import type { PlacedBlock } from './types';

/** Compare already schema-validated JSON data. Key order is not authored meaning. */
export function sameBlueprintData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const a = Object.keys(left).filter(key => (left as Record<string, unknown>)[key] !== undefined);
  const b = Object.keys(right).filter(key => (right as Record<string, unknown>)[key] !== undefined);
  return a.length === b.length && a.every(key => Object.hasOwn(right, key) && sameBlueprintData((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}

/** Block IDs are identities; identical content reuses the destination instance. */
export function samePlacementContent(left: PlacedBlock | undefined, right: PlacedBlock): boolean {
  if (!left) return false;
  const { id: _leftId, ...a } = left, { id: _rightId, ...b } = right;
  return sameBlueprintData(a, b);
}

/** Existing anchors keep identity; new placements never reuse coordinate-derived IDs. */
export function createPlacementIdentity(blocks: Record<string, PlacedBlock>): (key: string) => string {
  let used: Set<string> | null = null;
  const generated = new Map<string, string>();
  return key => {
    if (blocks[key]) return blocks[key].id;
    const known = generated.get(key); if (known) return known;
    used ??= new Set(Object.values(blocks).map(block => block.id));
    for (let attempt = 0; attempt < 8; attempt++) {
      const id = createStudioId('block');
      if (!used.has(id)) { used.add(id); generated.set(key, id); return id; }
    }
    throw new Error('A unique placement identity could not be allocated. No edit was committed.');
  };
}
