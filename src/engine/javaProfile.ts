/** Candidate only. Source inspection and local tests do not qualify native import. */
export const JAVA_SCHEMATIC_PROFILE = Object.freeze({
  id: 'minecraft-java-1.21.1-worldedit-7.3.8-fabric-0.15.11-sponge3-candidate1',
  edition: 'java',
  gameVersion: '1.21.1',
  dataVersion: 3955,
  schematicVersion: 3,
  worldEditVersion: '7.3.8',
  worldEditSourceCommit: '7d32b456e7c3237a70e19cca129e51b790c33b73',
  worldEditArtifactVersionId: 'WTAFvuRx',
  fabricLoaderVersion: '0.15.11',
  nativeQualification: 'not-run',
  specification: 'https://github.com/SpongePowered/Schematic-Specification/blob/8e6be2d980d3bd794bc29df5fdca5921129fac5d/versions/schematic-3.md',
  dataVersionEvidence: 'https://github.com/PrismarineJS/minecraft-data/blob/bd8b5c6048e5af9694374b83f25f5b4aade619cc/data/pc/common/protocolVersions.json',
  // Fixed order gives stable palette IDs independently of source entry order.
  blockStates: Object.freeze([
    'minecraft:air', 'minecraft:stone', 'minecraft:cobblestone', 'minecraft:oak_planks',
  ] as const),
  limits: Object.freeze({ maxDimension: 65_535, maxVolume: 100_000, maxNbtBytes: 128 * 1024, maxGzipBytes: 256 * 1024 }),
} as const);

export type CandidateJavaBlockState = typeof JAVA_SCHEMATIC_PROFILE.blockStates[number];
