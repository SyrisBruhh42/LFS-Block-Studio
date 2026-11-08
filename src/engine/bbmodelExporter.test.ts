import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BBModelHelper, BBModel } from './bbmodelExporter';

function expect(actual: any) {
  return {
    toBe(expected: any) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected: any) {
      assert.deepStrictEqual(actual, expected);
    },
    toHaveProperty(prop: string) {
      assert.ok(actual != null && prop in Object(actual), `Expected object to have property ${prop}`);
    },
    toThrow() {
      assert.throws(actual);
    },
  };
}

describe('BBModelHelper', () => {
  const sampleBBModel: BBModel = {
    meta: {
      format_version: '4.0',
      model_format: 'free',
      box_uv: false,
    },
    name: 'test_model',
    resolution: {
      width: 64,
      height: 64,
    },
    elements: [
      {
        uuid: 'element-uuid-1',
        name: 'cube',
        from: [0, 0, 0],
        to: [16, 16, 16],
        origin: [8, 8, 8],
        faces: {
          north: { uv: [0, 0, 16, 16], texture: 0 },
          south: { uv: [0, 0, 16, 16], texture: 0 },
          east: { uv: [0, 0, 16, 16], texture: 0 },
          west: { uv: [0, 0, 16, 16], texture: 0 },
          up: { uv: [0, 0, 16, 16], texture: 0 },
          down: { uv: [0, 0, 16, 16], texture: 0 },
        }
      }
    ],
    outliner: [
      {
        uuid: 'node-uuid-1',
        name: 'root',
        origin: [8, 8, 8],
        children: ['element-uuid-1']
      }
    ],
    textures: []
  };

  it('should parse a valid bbmodel JSON string', () => {
    const jsonString = JSON.stringify(sampleBBModel);
    const parsed = BBModelHelper.parse(jsonString);

    expect(parsed.name).toBe('test_model');
    expect(parsed.elements[0].origin).toEqual([8, 8, 8]);
    expect(parsed.outliner[0]).toHaveProperty('origin');
  });

  it('should throw an error for invalid format', () => {
    expect(() => BBModelHelper.parse('{"name": "invalid"}')).toThrow();
  });

  it('should serialize deterministically', () => {
    const obj1 = { ...sampleBBModel, z: 1, a: 2 };
    const obj2 = { ...sampleBBModel, a: 2, z: 1 }; // Same fields, different order

    const str1 = BBModelHelper.serialize(obj1 as BBModel);
    const str2 = BBModelHelper.serialize(obj2 as BBModel);

    expect(str1).toBe(str2);
  });

  it('should perform a successful roundtrip', () => {
    const serialized = BBModelHelper.serialize(sampleBBModel);
    const parsed = BBModelHelper.parse(serialized);
    const reSerialized = BBModelHelper.serialize(parsed);

    expect(reSerialized).toBe(serialized);

    // Explicit checks for preservation
    expect(parsed.elements[0].origin).toEqual([8, 8, 8]); // pivot point
    expect(parsed.elements[0].faces.north?.uv).toEqual([0, 0, 16, 16]); // UV faces

    const rootNode = parsed.outliner[0] as any;
    expect(rootNode.origin).toEqual([8, 8, 8]); // bone hierarchy pivot
    expect(rootNode.children[0]).toBe('element-uuid-1'); // bone hierarchy link
  });
});
