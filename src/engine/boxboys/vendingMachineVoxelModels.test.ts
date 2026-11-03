import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVendingMachineModel } from './vendingMachineVoxelModels.js';

test('generateVendingMachineModel returns correct dimensions', () => {
    const model = generateVendingMachineModel('DrZed');
    assert.deepEqual(model.dimensions, { width: 3, height: 5, depth: 2 });
    // width * height * depth = 3 * 5 * 2 = 30
    assert.equal(model.voxels.length, 30);
});

test('generateVendingMachineModel assigns correct colors for DrZed', () => {
    const model = generateVendingMachineModel('DrZed');
    const borderVoxel = model.voxels.find(v => v.x === 0 && v.y === 0 && v.z === 0);
    const innerVoxel = model.voxels.find(v => v.x === 1 && v.y === 1 && v.z === 0);

    assert.equal(borderVoxel?.color, '#E74C3C'); // primary
    assert.equal(innerVoxel?.color, '#FFFFFF'); // secondary
});

test('generateVendingMachineModel assigns correct colors for Torgue', () => {
    const model = generateVendingMachineModel('Torgue');
    const borderVoxel = model.voxels.find(v => v.x === 0 && v.y === 0 && v.z === 0);
    const innerVoxel = model.voxels.find(v => v.x === 1 && v.y === 1 && v.z === 0);

    assert.equal(borderVoxel?.color, '#F1C40F');
    assert.equal(innerVoxel?.color, '#2C3E50');
});

test('generateVendingMachineModel assigns correct colors for Marcus', () => {
    const model = generateVendingMachineModel('Marcus');
    const borderVoxel = model.voxels.find(v => v.x === 0 && v.y === 0 && v.z === 0);
    const innerVoxel = model.voxels.find(v => v.x === 1 && v.y === 1 && v.z === 0);

    assert.equal(borderVoxel?.color, '#2ECC71');
    assert.equal(innerVoxel?.color, '#E67E22');
});

test('generateVendingMachineModel assigns correct colors for PackAPunch', () => {
    const model = generateVendingMachineModel('PackAPunch');
    const borderVoxel = model.voxels.find(v => v.x === 0 && v.y === 0 && v.z === 0);
    const innerVoxel = model.voxels.find(v => v.x === 1 && v.y === 1 && v.z === 0);

    assert.equal(borderVoxel?.color, '#8E44AD');
    assert.equal(innerVoxel?.color, '#F39C12');
});
