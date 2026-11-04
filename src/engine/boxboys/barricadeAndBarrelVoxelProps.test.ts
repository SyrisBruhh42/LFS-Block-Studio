import test from 'node:test';
import assert from 'node:assert/strict';
import { BOXBOYS_PROPS } from './barricadeAndBarrelVoxelProps';
import { CustomBlockDefinition } from '../types';

test('BoxBoys Props Definitions', async (t) => {
  await t.test('should export exactly 7 props', () => {
    assert.strictEqual(BOXBOYS_PROPS.length, 7);
  });

  await t.test('all props should have required CustomBlockDefinition properties', () => {
    for (const prop of BOXBOYS_PROPS) {
      assert.ok(prop.id, `Prop ${prop.name} is missing an id`);
      assert.ok(prop.name, `Prop ${prop.id} is missing a name`);
      assert.ok(prop.shape, `Prop ${prop.id} is missing a shape`);
      assert.ok(prop.width > 0, `Prop ${prop.id} has invalid width`);
      assert.ok(prop.depth > 0, `Prop ${prop.id} has invalid depth`);
      assert.ok(prop.heightPlates > 0, `Prop ${prop.id} has invalid heightPlates`);
      assert.ok(prop.color, `Prop ${prop.id} is missing color`);
      assert.ok(prop.texturePattern, `Prop ${prop.id} is missing texturePattern`);
      assert.ok(prop.materialFinish, `Prop ${prop.id} is missing materialFinish`);
      assert.strictEqual(prop.hasStuds, false, `Prop ${prop.id} should not have studs`);
      assert.strictEqual(prop.isCustom, true, `Prop ${prop.id} should be marked as custom`);
    }
  });

  await t.test('explosive red barrel has correct properties', () => {
    const prop = BOXBOYS_PROPS.find(p => p.id === 'explosive_red_barrel') as CustomBlockDefinition;
    assert.ok(prop);
    assert.strictEqual(prop.shape, 'cylinder');
    assert.strictEqual(prop.color, '#D32F2F');
    assert.strictEqual(prop.texturePattern, 'metallic_brushed');
    assert.strictEqual(prop.materialFinish, 'metallic');
  });

  await t.test('cryo barrel has correct properties', () => {
    const prop = BOXBOYS_PROPS.find(p => p.id === 'cryo_barrel') as CustomBlockDefinition;
    assert.ok(prop);
    assert.strictEqual(prop.shape, 'cylinder');
    assert.strictEqual(prop.color, '#0288D1');
    assert.strictEqual(prop.texturePattern, 'metallic_brushed');
    assert.strictEqual(prop.materialFinish, 'metallic');
  });

  await t.test('debris door has correct properties', () => {
    const prop = BOXBOYS_PROPS.find(p => p.id === 'debris_door') as CustomBlockDefinition;
    assert.ok(prop);
    assert.strictEqual(prop.shape, 'brick');
    assert.strictEqual(prop.texturePattern, 'wood_plank');
    assert.strictEqual(prop.materialFinish, 'matte');
  });

  await t.test('barricades have progressing properties', () => {
    const b1 = BOXBOYS_PROPS.find(p => p.id === 'barricade_tier_1') as CustomBlockDefinition;
    const b2 = BOXBOYS_PROPS.find(p => p.id === 'barricade_tier_2') as CustomBlockDefinition;
    const b3 = BOXBOYS_PROPS.find(p => p.id === 'barricade_tier_3') as CustomBlockDefinition;
    const b4 = BOXBOYS_PROPS.find(p => p.id === 'barricade_tier_4') as CustomBlockDefinition;

    assert.ok(b1 && b2 && b3 && b4);

    assert.strictEqual(b1.heightPlates, 3);
    assert.strictEqual(b2.heightPlates, 6);
    assert.strictEqual(b3.heightPlates, 9);
    assert.strictEqual(b4.heightPlates, 12);

    assert.strictEqual(b1.texturePattern, 'wood_plank');
    assert.strictEqual(b2.texturePattern, 'wood_plank');
    assert.strictEqual(b3.texturePattern, 'tech_panel');
    assert.strictEqual(b4.texturePattern, 'tech_panel');

    assert.strictEqual(b1.materialFinish, 'matte');
    assert.strictEqual(b2.materialFinish, 'matte');
    assert.strictEqual(b3.materialFinish, 'metallic');
    assert.strictEqual(b4.materialFinish, 'metallic');
  });
});
