import test from 'node:test';
import assert from 'node:assert/strict';
import { BiomePaletteGenerator, BiomeType } from './biomeTileVoxelPalette.js';

test('BiomePaletteGenerator', async (t) => {
    await t.test('generates valid 12x12 room dimensions', () => {
        const generator = new BiomePaletteGenerator(42);
        const room = generator.generateRoom('plains');

        assert.equal(room.tiles.length, 12, 'Room should have 12 rows');
        for (let i = 0; i < 12; i++) {
            assert.equal(room.tiles[i].length, 12, `Row ${i} should have 12 columns`);
        }
    });

    await t.test('places walls on the outer boundary and ground/obstacles inside', () => {
        const generator = new BiomePaletteGenerator(123);
        const room = generator.generateRoom('desert');

        for (let y = 0; y < 12; y++) {
            for (let x = 0; x < 12; x++) {
                const tile = room.tiles[y][x];
                if (x === 0 || x === 11 || y === 0 || y === 11) {
                    assert.equal(tile.type, 'wall', `Border tile (${x},${y}) should be a wall`);
                    assert.equal(tile.z, 2, 'Wall height should be 2');
                } else {
                    assert.ok(tile.type === 'ground' || tile.type === 'obstacle', 'Inner tile should be ground or obstacle');
                }
            }
        }
    });

    await t.test('deterministic generation with same seed', () => {
        const generator1 = new BiomePaletteGenerator(999);
        const room1 = generator1.generateRoom('snow');

        const generator2 = new BiomePaletteGenerator(999);
        const room2 = generator2.generateRoom('snow');

        assert.deepEqual(room1, room2, 'Rooms generated with the same seed should be identical');
    });

    await t.test('different seeds produce different inner layouts', () => {
        const generator1 = new BiomePaletteGenerator(1);
        const room1 = generator1.generateRoom('volcano');

        const generator2 = new BiomePaletteGenerator(2);
        const room2 = generator2.generateRoom('volcano');

        // Since borders are always walls, we only check inner tiles for differences
        let hasDifference = false;
        for (let y = 1; y < 11; y++) {
            for (let x = 1; x < 11; x++) {
                if (room1.tiles[y][x].type !== room2.tiles[y][x].type || 
                    room1.tiles[y][x].pbr.roughness !== room2.tiles[y][x].pbr.roughness) {
                    hasDifference = true;
                    break;
                }
            }
            if (hasDifference) break;
        }

        assert.ok(hasDifference, 'Rooms generated with different seeds should not be identical');
    });

    await t.test('supports all 6 biomes with correct hex colors for ground', () => {
        const biomes: BiomeType[] = ['plains', 'forest', 'desert', 'snow', 'volcano', 'cave'];
        const generator = new BiomePaletteGenerator(42);

        for (const biome of biomes) {
            const palette = generator.getPalette(biome);
            assert.ok(palette.ground.hexColor > 0, `${biome} ground hex color should be set`);
            assert.ok(palette.wall.hexColor > 0, `${biome} wall hex color should be set`);
            assert.ok(palette.obstacle.hexColor > 0, `${biome} obstacle hex color should be set`);
        }
    });
    
    await t.test('PBR values are bounded correctly with noise added', () => {
        const generator = new BiomePaletteGenerator(42);
        const room = generator.generateRoom('plains');
        
        for (let y = 0; y < 12; y++) {
            for (let x = 0; x < 12; x++) {
                const { roughness, metalness } = room.tiles[y][x].pbr;
                assert.ok(roughness >= 0 && roughness <= 1, 'Roughness should be [0, 1]');
                assert.ok(metalness >= 0 && metalness <= 1, 'Metalness should be [0, 1]');
            }
        }
    });
});
