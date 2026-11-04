import { CustomBlockDefinition } from '../types';

export const BOXBOYS_PROPS: CustomBlockDefinition[] = [
  {
    id: 'explosive_red_barrel',
    name: 'Explosive Red Barrel',
    shape: 'cylinder',
    width: 1.5,
    depth: 1.5,
    heightPlates: 6, // 2 standard bricks tall
    color: '#D32F2F', // Red
    texturePattern: 'metallic_brushed',
    materialFinish: 'metallic',
    hasStuds: false,
    isCustom: true,
  },
  {
    id: 'cryo_barrel',
    name: 'Cryo Barrel',
    shape: 'cylinder',
    width: 1.5,
    depth: 1.5,
    heightPlates: 6,
    color: '#0288D1', // Blue
    texturePattern: 'metallic_brushed',
    materialFinish: 'metallic',
    hasStuds: false,
    isCustom: true,
  },
  {
    id: 'debris_door',
    name: 'Debris Door',
    shape: 'brick',
    width: 3.0,
    depth: 0.5,
    heightPlates: 9, // 3 standard bricks tall
    color: '#5D4037', // Brown
    texturePattern: 'wood_plank',
    materialFinish: 'matte',
    hasStuds: false,
    isCustom: true,
  },
  {
    id: 'barricade_tier_1',
    name: 'Barricade Tier 1',
    shape: 'brick',
    width: 2.0,
    depth: 1.0,
    heightPlates: 3, // 1 brick tall
    color: '#8D6E63',
    texturePattern: 'wood_plank',
    materialFinish: 'matte',
    hasStuds: false,
    isCustom: true,
  },
  {
    id: 'barricade_tier_2',
    name: 'Barricade Tier 2',
    shape: 'brick',
    width: 2.0,
    depth: 1.0,
    heightPlates: 6, // 2 bricks tall
    color: '#6D4C41',
    texturePattern: 'wood_plank',
    materialFinish: 'matte',
    hasStuds: false,
    isCustom: true,
  },
  {
    id: 'barricade_tier_3',
    name: 'Barricade Tier 3',
    shape: 'brick',
    width: 2.0,
    depth: 1.0,
    heightPlates: 9, // 3 bricks tall
    color: '#4E342E',
    texturePattern: 'tech_panel', // Reinforced
    materialFinish: 'metallic',
    hasStuds: false,
    isCustom: true,
  },
  {
    id: 'barricade_tier_4',
    name: 'Barricade Tier 4',
    shape: 'brick',
    width: 2.0,
    depth: 1.0,
    heightPlates: 12, // 4 bricks tall
    color: '#3E2723',
    texturePattern: 'tech_panel', // Heavily reinforced
    materialFinish: 'metallic',
    hasStuds: false,
    isCustom: true,
  },
];
