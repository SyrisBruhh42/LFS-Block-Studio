// Original block-native data. Its MIT notice covers this kit, not the application's other resources.
import type { BlueprintPrefab, CustomBlockDefinition } from '../../engine/types';
import { writeStudioKit, type StudioKitResources } from '../../lib/studioKit';

export const COURTYARD_KIT_LICENSE = `MIT License

Copyright (c) 2026 LFS Block Studio contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
export const COURTYARD_KIT_NOTICES = `Courtyard starter, version 1
Original block palette and structures created for LFS Block Studio.
Six block-native materials and three independent blueprints. No external meshes,
images, fonts, scripts, textures or network resources are included. Textures use
the application's existing procedural material names. Project units: X/Z studs,
Y brick-height coordinates; definition height is expressed in plates (3 per unit).
All source cells are unrotated unit cubes. This is a Freeform creative kit;
it has no Minecraft mapping or native schematic qualification.
The MIT license applies to this kit's original data. It does not relicense the
application, Oasis styling/icons, game assets or unrelated project resources.
`;
const palette = [
  ['cream', 'Courtyard cream', '#F2E6C9', 'smooth_abs', 'matte'],
  ['moss', 'Courtyard moss', '#6D8859', 'smooth_abs', 'matte'],
  ['clay', 'Courtyard terracotta', '#C77557', 'smooth_abs', 'matte'],
  ['charcoal', 'Courtyard charcoal', '#394743', 'smooth_abs', 'matte'],
  ['wood', 'Courtyard warm wood', '#AF8A5E', 'wood_grain', 'satin'],
  ['gold', 'Courtyard brass', '#D3B662', 'metallic_brushed', 'metallic'],
] as const;
const definitions: CustomBlockDefinition[] = palette.map(([id, name, color, texturePattern, materialFinish]) => ({ id: `courtyard_v1_${id}`, name, shape: 'cube', width: 1, depth: 1, heightPlates: 3, color, texturePattern, materialFinish, hasStuds: false, isCustom: true }));
function blueprint(id: string, name: string, description: string, cells: [number, number, number, string][]): BlueprintPrefab {
  const used = new Set(cells.map(c => `courtyard_v1_${c[3]}`));
  return { id: `courtyard_v1_${id}`, name, description, authorId: 'lfs-block-studio', authorName: 'LFS Block Studio contributors', blueprintType: 'structure_blueprint', isPublic: false, createdAt: '2026-11-01T00:00:00.000Z', size: { lx: Math.max(...cells.map(c => c[0])) + 1, ly: Math.max(...cells.map(c => c[1])) + 1, lz: Math.max(...cells.map(c => c[2])) + 1 }, blocks: cells.map(([x, y, z, color], i) => ({ id: `${id}_cell_${i}`, blockDefId: `courtyard_v1_${color}`, position: { x, y, z }, rotation: 0 })), customBlockDefs: definitions.filter(d => used.has(d.id)) };
}
const planter: [number, number, number, string][] = [];
for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
  planter.push([x, 0, z, 'clay']);
  if (x === 0 || x === 4 || z === 0 || z === 4) planter.push([x, 1, z, 'cream']);
  else planter.push([x, 1, z, 'moss']);
}
planter.push([2, 2, 2, 'wood'], [2, 3, 2, 'moss'], [1, 3, 2, 'moss'], [3, 3, 2, 'moss'], [2, 3, 1, 'moss'], [2, 3, 3, 'moss'], [2, 4, 2, 'moss']);
const bench: [number, number, number, string][] = [];
for (let x = 0; x < 7; x++) { bench.push([x, 1, 0, 'wood'], [x, 1, 1, 'wood'], [x, 2, 1, 'wood']); if (x === 1 || x === 5) bench.push([x, 0, 0, 'charcoal'], [x, 0, 1, 'charcoal']); }
const arch: [number, number, number, string][] = [];
for (const x of [0, 6]) for (let y = 0; y < 6; y++) arch.push([x, y, 0, y === 0 ? 'charcoal' : 'cream']);
for (let x = 0; x < 7; x++) arch.push([x, 6, 0, x === 3 ? 'gold' : 'cream']);
arch.push([1, 5, 0, 'moss'], [5, 5, 0, 'moss']);
export function courtyardStarterResources(): StudioKitResources {
  return structuredClone({ format: 'lfs-studio-kit-resources', version: 1, definitions, blueprints: [blueprint('garden', 'Pocket garden', 'A terracotta planter with a small block canopy. Combine copies to make a courtyard.', planter), blueprint('bench', 'Reading bench', 'Warm wood seating with charcoal legs; an independent reusable structure.', bench), blueprint('gate', 'Garden gateway', 'A clean cream gateway with moss corners and a brass keystone.', arch)], provenance: [] });
}
export function courtyardStarterKit(): Promise<Uint8Array<ArrayBuffer>> {
  return writeStudioKit({ id: 'courtyard-starter-v1', name: 'Courtyard starter', description: 'A calm six-material palette, pocket garden, reading bench and garden gateway. Combine and customize them in Freeform.', author: 'LFS Block Studio contributors', license: 'MIT', sourceUrl: '' }, courtyardStarterResources(), COURTYARD_KIT_LICENSE, COURTYARD_KIT_NOTICES);
}
