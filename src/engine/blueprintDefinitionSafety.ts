import { validateStudioDocument, STUDIO_DOCUMENT_LIMITS } from '../lib/studioDocument';
import { DEFAULT_CHUNK_CONFIG, DEFAULT_SMART_PATTERN_CONFIG } from './chunkAndPatternEngine';
import type { BlueprintPrefab, CustomBlockDefinition, PlacedBlock } from './types';
import { sameBlueprintData } from './placementContent';
export { sameBlueprintData, samePlacementContent } from './placementContent';

/**
 * Reuse the document's definition/block schema through a bounded Freeform envelope.
 * It intentionally does not assert the active target policy: the final session commit
 * validates that policy against the complete resulting document.
 */
export function blueprintPayloadError(blueprint: unknown, registry: Record<string, CustomBlockDefinition>): string | null {
  // Count checks precede traversal/serialization of potentially dense payloads.
  if (blueprint && typeof blueprint === 'object') for (const [key, limit] of [['blocks', STUDIO_DOCUMENT_LIMITS.maxBlueprintBlocks], ['customBlockDefs', STUDIO_DOCUMENT_LIMITS.maxDefinitions]] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(blueprint, key);
    if (descriptor && 'value' in descriptor && Array.isArray(descriptor.value) && descriptor.value.length > limit) return `Blueprint ${key} exceeds the ${limit}-entry budget.`;
  }
  if (registry && typeof registry === 'object' && Reflect.ownKeys(registry).length > STUDIO_DOCUMENT_LIMITS.maxDefinitions) return 'Shared definition registry exceeds its work budget.';
  const result = validateStudioDocument({
    format: 'lfs-studio-project', schemaVersion: 1, documentId: 'blueprint-validation', revision: 0,
    historyEpoch: 'blueprint-validation', savedAt: '2026-11-01T00:00:00.000Z',
    world: { worldId: 'blueprint-validation', worldName: 'Blueprint validation', roomCode: '', isPublicWorld: false },
    blocks: {}, customBlocks: registry, blueprints: [blueprint],
    chunkConfig: DEFAULT_CHUNK_CONFIG, patternConfig: DEFAULT_SMART_PATTERN_CONFIG,
  });
  if (!result.ok) return `Invalid blueprint: ${result.error.issues[0]?.path ?? '$'}: ${result.error.message}`;
  const incoming = result.value.blueprints[0].customBlockDefs;
  const known = result.value.customBlocks;
  let count = Object.keys(known).length;
  for (const definition of incoming) {
    if (Object.hasOwn(known, definition.id)) {
      if (!sameBlueprintData(known[definition.id], definition)) return `Block definition "${definition.id}" conflicts with this project's existing definition. Import with a distinct definition ID before placing it.`;
    } else if (++count > STUDIO_DOCUMENT_LIMITS.maxDefinitions) return `Combined block definitions exceed the ${STUDIO_DOCUMENT_LIMITS.maxDefinitions}-definition budget.`;
  }
  return null;
}

export function placementPayloadError(blocks: PlacedBlock[], definitions: CustomBlockDefinition[], registry: Record<string, CustomBlockDefinition>): string | null {
  const blueprint: BlueprintPrefab = {
    id: 'placement-validation', name: 'Placement validation', description: '', authorId: 'local', authorName: 'Local',
    blueprintType: 'structure_blueprint', isPublic: false, size: { lx: 1, ly: 1, lz: 1 },
    blocks, customBlockDefs: definitions, createdAt: '2026-11-01T00:00:00.000Z',
  };
  return blueprintPayloadError(blueprint, registry);
}
