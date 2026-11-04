import { ProceduralBiomeId } from '../studioEngagementEngine.js';
import { BlockMaterialFinish, BlockTexturePattern } from '../types.js';

export interface VoxelPaletteLayer {
  baseColorHex: string;
  accentColorHex?: string;
  materialFinish: BlockMaterialFinish;
  texturePattern: BlockTexturePattern;
  pbrRoughness: number;
  pbrMetalness: number;
  normalScale: number;
}

export interface VoxelPalette {
  biomeId: ProceduralBiomeId;
  floor: VoxelPaletteLayer;
  walls: VoxelPaletteLayer;
  accents: VoxelPaletteLayer;
  ambientLightHex: string;
  directionalLightHex: string;
}

export function generateBiomePalette(biomeId: ProceduralBiomeId): VoxelPalette {
  switch (biomeId) {
    case 'floating_skyblock':
      return {
        biomeId,
        floor: {
          baseColorHex: '#4d8c2b',
          accentColorHex: '#3a6620',
          materialFinish: 'matte',
          texturePattern: 'grass_top',
          pbrRoughness: 0.9,
          pbrMetalness: 0.0,
          normalScale: 1.5,
        },
        walls: {
          baseColorHex: '#755a40',
          accentColorHex: '#5e4833',
          materialFinish: 'matte',
          texturePattern: 'cobble',
          pbrRoughness: 0.95,
          pbrMetalness: 0.0,
          normalScale: 1.2,
        },
        accents: {
          baseColorHex: '#8f7762',
          materialFinish: 'satin',
          texturePattern: 'wood_plank',
          pbrRoughness: 0.8,
          pbrMetalness: 0.0,
          normalScale: 1.0,
        },
        ambientLightHex: '#d8f0fa',
        directionalLightHex: '#fffadd',
      };
    case 'terraced_zen_garden':
      return {
        biomeId,
        floor: {
          baseColorHex: '#e3d6b8',
          accentColorHex: '#ccbc97',
          materialFinish: 'satin',
          texturePattern: 'smooth_abs',
          pbrRoughness: 0.7,
          pbrMetalness: 0.0,
          normalScale: 0.8,
        },
        walls: {
          baseColorHex: '#b2bcad',
          accentColorHex: '#8b9685',
          materialFinish: 'matte',
          texturePattern: 'wood_grain',
          pbrRoughness: 0.85,
          pbrMetalness: 0.0,
          normalScale: 1.0,
        },
        accents: {
          baseColorHex: '#697a5b',
          materialFinish: 'satin',
          texturePattern: 'cobble',
          pbrRoughness: 0.6,
          pbrMetalness: 0.0,
          normalScale: 1.2,
        },
        ambientLightHex: '#e1eade',
        directionalLightHex: '#fff7e0',
      };
    case 'desert_mesa_citadel':
      return {
        biomeId,
        floor: {
          baseColorHex: '#d9945b',
          accentColorHex: '#ba733a',
          materialFinish: 'matte',
          texturePattern: 'smooth_abs',
          pbrRoughness: 0.9,
          pbrMetalness: 0.0,
          normalScale: 0.5,
        },
        walls: {
          baseColorHex: '#c76b38',
          accentColorHex: '#994a1d',
          materialFinish: 'matte',
          texturePattern: 'brick_masonry',
          pbrRoughness: 0.85,
          pbrMetalness: 0.0,
          normalScale: 1.3,
        },
        accents: {
          baseColorHex: '#e6c875',
          materialFinish: 'metallic',
          texturePattern: 'metallic_brushed',
          pbrRoughness: 0.4,
          pbrMetalness: 0.8,
          normalScale: 0.5,
        },
        ambientLightHex: '#fae3cc',
        directionalLightHex: '#ffe8a1',
      };
    case 'volcanic_caldera':
      return {
        biomeId,
        floor: {
          baseColorHex: '#262626',
          accentColorHex: '#121212',
          materialFinish: 'matte',
          texturePattern: 'cobblestone',
          pbrRoughness: 0.9,
          pbrMetalness: 0.1,
          normalScale: 1.8,
        },
        walls: {
          baseColorHex: '#3b3b3b',
          accentColorHex: '#1f1f1f',
          materialFinish: 'pearl',
          texturePattern: 'brick',
          pbrRoughness: 0.4,
          pbrMetalness: 0.2,
          normalScale: 1.0,
        },
        accents: {
          baseColorHex: '#ff4d00',
          materialFinish: 'neon',
          texturePattern: 'smooth_abs',
          pbrRoughness: 0.1,
          pbrMetalness: 0.0,
          normalScale: 0.2,
        },
        ambientLightHex: '#382522',
        directionalLightHex: '#ff8c69',
      };
    case 'alpine_snow_peak':
      return {
        biomeId,
        floor: {
          baseColorHex: '#f0f8ff',
          accentColorHex: '#dcebf5',
          materialFinish: 'satin',
          texturePattern: 'smooth_abs',
          pbrRoughness: 0.6,
          pbrMetalness: 0.0,
          normalScale: 0.4,
        },
        walls: {
          baseColorHex: '#9fb5c7',
          accentColorHex: '#738ea6',
          materialFinish: 'matte',
          texturePattern: 'cobble',
          pbrRoughness: 0.8,
          pbrMetalness: 0.0,
          normalScale: 1.1,
        },
        accents: {
          baseColorHex: '#4a6b8c',
          materialFinish: 'glass',
          texturePattern: 'glass_grid',
          pbrRoughness: 0.1,
          pbrMetalness: 0.1,
          normalScale: 0.3,
        },
        ambientLightHex: '#cdebf7',
        directionalLightHex: '#e8f3fa',
      };
    case 'cyber_grid_plate':
      return {
        biomeId,
        floor: {
          baseColorHex: '#0a0a0f',
          accentColorHex: '#050508',
          materialFinish: 'metallic',
          texturePattern: 'tech_panel',
          pbrRoughness: 0.3,
          pbrMetalness: 0.9,
          normalScale: 1.0,
        },
        walls: {
          baseColorHex: '#141424',
          accentColorHex: '#0b0b14',
          materialFinish: 'metallic',
          texturePattern: 'metallic_brushed',
          pbrRoughness: 0.2,
          pbrMetalness: 0.8,
          normalScale: 0.8,
        },
        accents: {
          baseColorHex: '#00ffff',
          materialFinish: 'neon',
          texturePattern: 'glass_grid',
          pbrRoughness: 0.1,
          pbrMetalness: 0.0,
          normalScale: 0.1,
        },
        ambientLightHex: '#002233',
        directionalLightHex: '#ff00ff',
      };
    default:
      throw new Error(`Unsupported biomeId: ${biomeId}`);
  }
}
