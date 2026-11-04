import { CustomBlockDefinition, PlacedBlock } from '../types.js';

export interface VoxelIconMesh {
  id: string;
  name: string;
  relicName: string;
  customBlockDefs: CustomBlockDefinition[];
  blocks: PlacedBlock[];
}

export function generateRelicVoxelIcons(): VoxelIconMesh[] {
  // Returns 25 voxel icons for Risk of Rain 2 passive skill relics
  const relics = [
    'Relic of Command',
    'Relic of Sacrifice',
    'Relic of Honor',
    'Relic of Enigma',
    'Relic of Spite',
    'Relic of Glass',
    'Relic of Kin',
    'Relic of Dissonance',
    'Relic of Evolution',
    'Relic of Metamorphosis',
    'Relic of Chaos',
    'Relic of Swarms',
    'Relic of Death',
    'Relic of Vengeance',
    'Relic of Soul',
    'Relic of Frailty',
    'Relic of Cognation',
    'Relic of Illusion',
    'Relic of Delusion',
    'Relic of Distortion',
    'Relic of Ethereal',
    'Relic of Rebirth',
    'Relic of Serenity',
    'Relic of Purity',
    'Relic of Void'
  ];

  return relics.map((relic, i) => {
    const id = `relic_${i + 1}`;

    // We create some stylized 2.5D voxel shapes to represent the icon
    const customBlockDefs: CustomBlockDefinition[] = [
      {
        id: `block_relic_${i + 1}`,
        name: `Block Relic ${i + 1}`,
        shape: 'cube',
        width: 1,
        depth: 1,
        heightPlates: 3,
        color: '#ffffff',
        texturePattern: 'smooth_abs',
        materialFinish: 'matte',
        hasStuds: false
      }
    ];

    const blocks: PlacedBlock[] = [
      {
        id: `placed_relic_${i + 1}`,
        blockDefId: `block_relic_${i + 1}`,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0
      }
    ];

    return {
      id,
      name: `Relic Icon ${i + 1}`,
      relicName: relic,
      customBlockDefs,
      blocks
    };
  });
}
