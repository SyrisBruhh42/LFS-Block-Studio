import { CustomBlockDefinition, PlacedBlock } from '../types.js';

export interface BoxBoysQuadNode {
  id: string;
  position: [number, number, number];
  dimensions: [number, number, number];
  color: string;
  material: string;
}

export interface BoxBoysCatalog {
  version: string;
  title: string;
  quads: BoxBoysQuadNode[];
}

export function convertVoxelRigToBoxBoys(
  title: string,
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>
): BoxBoysCatalog {
  const quads: BoxBoysQuadNode[] = [];

  for (const blockId of Object.keys(blocks)) {
    const block = blocks[blockId];
    const def = customBlocks[block.blockDefId];
    if (!def) continue;

    const sx = block.customScale?.x ?? def.defaultScale?.x ?? 1;
    const sy = block.customScale?.y ?? def.defaultScale?.y ?? 1;
    const sz = block.customScale?.z ?? def.defaultScale?.z ?? 1;

    const w = def.width * sx;
    const d = def.depth * sz;
    const h = (def.heightPlates / 3) * sy;

    const color = block.colorOverride || def.color;
    const material = block.materialOverride || def.materialFinish;

    quads.push({
      id: blockId,
      position: [block.position.x, block.position.y, block.position.z],
      dimensions: [w, h, d],
      color,
      material,
    });
  }

  return {
    version: '1.0',
    title,
    quads,
  };
}
