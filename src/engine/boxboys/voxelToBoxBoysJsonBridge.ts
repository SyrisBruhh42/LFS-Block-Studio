import { PlacedBlock, CustomBlockDefinition } from '../types.js';

export interface BoxBoysVoxelQuad {
  id: string;
  x: number;
  y: number;
  z: number;
  hexColor: string;
  textureId?: string;
  isCustom: boolean;
}

export interface BoxBoysCatalogJson {
  metadata: {
    formatVersion: string;
    targetTrack: string;
    quadCount: number;
  };
  quads: BoxBoysVoxelQuad[];
}

export function exportVoxelToBoxBoysJson(
  blocks: PlacedBlock[],
  customBlocks: CustomBlockDefinition[]
): BoxBoysCatalogJson {
  const customBlockMap = new Map<string, CustomBlockDefinition>();
  for (const def of customBlocks) {
    customBlockMap.set(def.id, def);
  }

  const quads: BoxBoysVoxelQuad[] = [];

  for (const block of blocks) {
    const isCustom = customBlockMap.has(block.blockDefId);
    const customDef = customBlockMap.get(block.blockDefId);

    // Default color logic
    let hexColor = block.colorOverride || '#ffffff';
    if (!block.colorOverride && isCustom && customDef) {
       hexColor = customDef.color || '#ffffff';
    }

    quads.push({
      id: block.id,
      x: block.position.x,
      y: block.position.y,
      z: block.position.z,
      hexColor: hexColor,
      textureId: block.blockDefId, // Just a simple mapping for now
      isCustom
    });
  }

  return {
    metadata: {
      formatVersion: "1.0.0",
      targetTrack: "Unified BoxBoys Track 9",
      quadCount: quads.length,
    },
    quads
  };
}
