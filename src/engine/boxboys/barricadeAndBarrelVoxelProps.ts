import { CustomBlockDefinition, MicroVoxel } from '../types';

function createBarrelVoxels(mainColor: string): MicroVoxel[] {
  const voxels: MicroVoxel[] = [];
  // Cylinder shape inside 8x8x8
  for (let y = 0; y < 8; y++) {
    for (let x = 1; x < 7; x++) {
      for (let z = 1; z < 7; z++) {
        // Simple cylinder approximation
        if ((x === 1 || x === 6) && (z === 1 || z === 6)) continue;

        let color = mainColor;
        // Metal bands on top and bottom
        if (y === 1 || y === 6) {
          color = '#888888'; // Grey metal band
        }
        voxels.push({ x, y, z, color });
      }
    }
  }
  return voxels;
}

export const explosiveRedBarrel: CustomBlockDefinition = {
  id: 'boxboys_barrel_explosive_red',
  name: 'Explosive Red Barrel',
  shape: 'cube',
  width: 1,
  depth: 1,
  heightPlates: 3,
  color: '#FF0000',
  texturePattern: 'smooth_abs',
  materialFinish: 'matte',
  hasStuds: false,
  isCustom: true,
  voxels: createBarrelVoxels('#FF0000')
};

export const cryoBarrel: CustomBlockDefinition = {
  id: 'boxboys_barrel_cryo',
  name: 'Cryo Barrel',
  shape: 'cube',
  width: 1,
  depth: 1,
  heightPlates: 3,
  color: '#00FFFF',
  texturePattern: 'smooth_abs',
  materialFinish: 'matte',
  hasStuds: false,
  isCustom: true,
  voxels: createBarrelVoxels('#00FFFF')
};

export const debrisDoor: CustomBlockDefinition = {
  id: 'boxboys_debris_door',
  name: 'Debris Door',
  shape: 'cube',
  width: 1,
  depth: 1,
  heightPlates: 3,
  color: '#5C4033',
  texturePattern: 'smooth_abs',
  materialFinish: 'matte',
  hasStuds: false,
  isCustom: true,
  voxels: (() => {
    const voxels: MicroVoxel[] = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        for (let z = 3; z < 5; z++) {
          voxels.push({ x, y, z, color: '#5C4033' });
        }
      }
    }
    return voxels;
  })()
};

function createBarricadeVoxels(tier: number): MicroVoxel[] {
  const voxels: MicroVoxel[] = [];
  const planks = tier;

  for (let i = 0; i < planks; i++) {
    const yLevel = 1 + (i * 2);
    for (let x = 0; x < 8; x++) {
      voxels.push({ x, y: yLevel, z: 3, color: '#8B4513' });
      voxels.push({ x, y: yLevel, z: 4, color: '#8B4513' });
    }
  }
  return voxels;
}

export const tier1Barricade: CustomBlockDefinition = {
  id: 'boxboys_barricade_t1',
  name: 'Tier 1 Barricade',
  shape: 'cube',
  width: 1,
  depth: 1,
  heightPlates: 3,
  color: '#8B4513',
  texturePattern: 'smooth_abs',
  materialFinish: 'matte',
  hasStuds: false,
  isCustom: true,
  voxels: createBarricadeVoxels(1)
};

export const tier2Barricade: CustomBlockDefinition = {
  id: 'boxboys_barricade_t2',
  name: 'Tier 2 Barricade',
  shape: 'cube',
  width: 1,
  depth: 1,
  heightPlates: 3,
  color: '#8B4513',
  texturePattern: 'smooth_abs',
  materialFinish: 'matte',
  hasStuds: false,
  isCustom: true,
  voxels: createBarricadeVoxels(2)
};

export const tier3Barricade: CustomBlockDefinition = {
  id: 'boxboys_barricade_t3',
  name: 'Tier 3 Barricade',
  shape: 'cube',
  width: 1,
  depth: 1,
  heightPlates: 3,
  color: '#8B4513',
  texturePattern: 'smooth_abs',
  materialFinish: 'matte',
  hasStuds: false,
  isCustom: true,
  voxels: createBarricadeVoxels(3)
};

export const tier4Barricade: CustomBlockDefinition = {
  id: 'boxboys_barricade_t4',
  name: 'Tier 4 Barricade',
  shape: 'cube',
  width: 1,
  depth: 1,
  heightPlates: 3,
  color: '#8B4513',
  texturePattern: 'smooth_abs',
  materialFinish: 'matte',
  hasStuds: false,
  isCustom: true,
  voxels: createBarricadeVoxels(4)
};

export const allBoxBoysProps: CustomBlockDefinition[] = [
  explosiveRedBarrel,
  cryoBarrel,
  debrisDoor,
  tier1Barricade,
  tier2Barricade,
  tier3Barricade,
  tier4Barricade
];
