import { createInitialEngineState, STARTER_STRUCTURE_BLUEPRINTS } from '../engine/worldEditEngine';
import { DEFAULT_CHUNK_CONFIG, DEFAULT_SMART_PATTERN_CONFIG } from '../engine/chunkAndPatternEngine';
import type { StudioDocument } from './studioDocument';

export function makeStudioDocument(documentId = 'project-fixture'): StudioDocument {
  const state = createInitialEngineState();
  return structuredClone({
    format: 'lfs-studio-project', schemaVersion: 1, documentId, revision: 0,
    historyEpoch: 'epoch-fixture', savedAt: '2026-11-01T12:00:00.000Z',
    world: { worldId: 'skyblock_island_1', worldName: 'Fixture', roomCode: '', isPublicWorld: false, description: 'Complete authored fixture' },
    blocks: state.blocks, customBlocks: state.customBlocks, blueprints: STARTER_STRUCTURE_BLUEPRINTS,
    chunkConfig: DEFAULT_CHUNK_CONFIG, patternConfig: DEFAULT_SMART_PATTERN_CONFIG,
    lightingConfig: { timeOfDay: 13.5, sunAzimuth: 135, sunIntensity: 1.5, ambientIntensity: 0.7, shadowsEnabled: true, pointLightsEnabled: true, fogDensity: 0.25 },
  });
}
