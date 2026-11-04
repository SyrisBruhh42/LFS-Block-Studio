import { BoneHierarchy } from '../skeletalAnimationEngine';

export type ZombieArchetype =
  | 'Shambler'
  | 'Sprinter'
  | 'Crawler'
  | 'Stalker'
  | 'Weaver'
  | 'Red Devil Boss';

export interface VoxelRig {
  archetype: ZombieArchetype;
  bones: BoneHierarchy[];
  scale: number;
  health: number;
  baseSpeed: number;
}

const bipedalBones: BoneHierarchy[] = [
  { name: 'root', children: ['spine'] },
  { name: 'spine', parent: 'root', children: ['head', 'arm_l', 'arm_r', 'leg_l', 'leg_r'] },
  { name: 'head', parent: 'spine', children: [] },
  { name: 'arm_l', parent: 'spine', children: [] },
  { name: 'arm_r', parent: 'spine', children: [] },
  { name: 'leg_l', parent: 'spine', children: [] },
  { name: 'leg_r', parent: 'spine', children: [] },
];

const crawlerBones: BoneHierarchy[] = [
  { name: 'root', children: ['spine'] },
  { name: 'spine', parent: 'root', children: ['head', 'arm_l', 'arm_r'] },
  { name: 'head', parent: 'spine', children: [] },
  { name: 'arm_l', parent: 'spine', children: [] },
  { name: 'arm_r', parent: 'spine', children: [] },
];

const weaverBones: BoneHierarchy[] = [
  { name: 'root', children: ['spine'] },
  { name: 'spine', parent: 'root', children: ['head', 'arm_l_1', 'arm_r_1', 'arm_l_2', 'arm_r_2', 'leg_l', 'leg_r'] },
  { name: 'head', parent: 'spine', children: [] },
  { name: 'arm_l_1', parent: 'spine', children: [] },
  { name: 'arm_r_1', parent: 'spine', children: [] },
  { name: 'arm_l_2', parent: 'spine', children: [] },
  { name: 'arm_r_2', parent: 'spine', children: [] },
  { name: 'leg_l', parent: 'spine', children: [] },
  { name: 'leg_r', parent: 'spine', children: [] },
];

const shamblerRig: VoxelRig = {
  archetype: 'Shambler',
  bones: bipedalBones,
  scale: 1.0,
  health: 100,
  baseSpeed: 1.5,
};

const sprinterRig: VoxelRig = {
  archetype: 'Sprinter',
  bones: bipedalBones,
  scale: 0.9,
  health: 75,
  baseSpeed: 4.5,
};

const crawlerRig: VoxelRig = {
  archetype: 'Crawler',
  bones: crawlerBones,
  scale: 0.7,
  health: 50,
  baseSpeed: 2.0,
};

const stalkerRig: VoxelRig = {
  archetype: 'Stalker',
  bones: bipedalBones,
  scale: 1.1,
  health: 120,
  baseSpeed: 2.5,
};

const weaverRig: VoxelRig = {
  archetype: 'Weaver',
  bones: weaverBones,
  scale: 1.2,
  health: 150,
  baseSpeed: 3.0,
};

const redDevilBossRig: VoxelRig = {
  archetype: 'Red Devil Boss',
  bones: bipedalBones,
  scale: 2.5,
  health: 1000,
  baseSpeed: 2.2,
};

export const ZOMBIE_ARCHETYPES: Record<ZombieArchetype, VoxelRig> = {
  'Shambler': shamblerRig,
  'Sprinter': sprinterRig,
  'Crawler': crawlerRig,
  'Stalker': stalkerRig,
  'Weaver': weaverRig,
  'Red Devil Boss': redDevilBossRig,
};

export const getAllRigs = (): VoxelRig[] => Object.values(ZOMBIE_ARCHETYPES);
