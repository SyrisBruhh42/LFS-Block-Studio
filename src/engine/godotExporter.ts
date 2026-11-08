import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  CustomBlockDefinition,
  DynamicLightingConfig,
  PlacedBlock,
} from './types';
import {
  buildBlockMeshGroup,
  disposeUnsharedGroupGeometries,
} from './legoGeometry';
import { exportCommentName } from './exportPreflight';
import { BBModel, BBElement, BBModelHelper } from './bbmodelExporter';

export function sortBlocksDeterministically(
  blocks: Record<string, PlacedBlock>
): PlacedBlock[] {
  return Object.values(blocks).sort((a, b) => {
    if (a.position.y !== b.position.y) return a.position.y - b.position.y;
    if (a.position.z !== b.position.z) return a.position.z - b.position.z;
    if (a.position.x !== b.position.x) return a.position.x - b.position.x;
    const idCmp = (a.id || '').localeCompare(b.id || '');
    if (idCmp !== 0) return idCmp;
    return a.blockDefId.localeCompare(b.blockDefId);
  });
}

export const sortVoxelKeysDeterministically = sortBlocksDeterministically;

/**
 * Generates a complete Godot 4.x (.tscn) scene with:
 * - ProceduralSkyMaterial + WorldEnvironment + DirectionalLight3D (Dynamic Lighting)
 * - Shared StandardMaterial3D + BoxMesh sub-resources per block type (draw-call friendly for Mobile/Android)
 * - StaticBody3D + BoxShape3D collision shapes so structures are immediately walkable in Godot
 *   (including 3-part compound walk-through colliders for 'arch' blocks — CA-11-C02)
 * - OmniLight3D nodes automatically attached to emissive / lantern blocks
 */
export function generateGodotTscn(
  worldName: string,
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>,
  lightingConfig?: DynamicLightingConfig
): string {
  const placedList = sortBlocksDeterministically(blocks);
  const usedDefIds = Array.from(new Set(placedList.map((b) => b.blockDefId)));

  // Each block type gets 3 sub_resources: StandardMaterial3D, BoxMesh, BoxShape3D
  // Arch block types additionally get 2 compound sub_resources (PillarShape, LintelShape)
  const archDefCount = usedDefIds.filter(
    (id) => customBlocks[id]?.shape === 'arch'
  ).length;
  const totalSubResources = usedDefIds.length * 3 + archDefCount * 2 + 2;
  const lines: string[] = [];
  lines.push(
    `[gd_scene load_steps=${totalSubResources + 1} format=3 uid="uid://brickforge_export"]`
  );
  lines.push('');

  // Environment & Sky SubResources
  lines.push('[sub_resource type="ProceduralSkyMaterial" id="ProceduralSkyMaterial_env"]');
  lines.push('sky_top_color = Color(0.08, 0.12, 0.22, 1)');
  lines.push('sky_horizon_color = Color(0.28, 0.36, 0.48, 1)');
  lines.push('ground_bottom_color = Color(0.05, 0.07, 0.11, 1)');
  lines.push('');

  lines.push('[sub_resource type="Environment" id="Environment_main"]');
  lines.push('background_mode = 2');
  lines.push('ambient_light_source = 3');
  lines.push(
    `ambient_light_energy = ${(lightingConfig?.ambientIntensity ?? 0.7).toFixed(2)}`
  );
  lines.push('tonemap_mode = 2');
  lines.push('glow_enabled = true');
  lines.push(
    `fog_enabled = ${(lightingConfig?.fogDensity ?? 0.25) > 0.01 ? 'true' : 'false'}`
  );
  lines.push(
    `fog_density = ${((lightingConfig?.fogDensity ?? 0.25) * 0.02).toFixed(4)}`
  );
  lines.push('');

  // Define sub_resources for materials, meshes, and collision shapes per block type
  usedDefIds.forEach((defId, idx) => {
    const def = customBlocks[defId];
    const hex = (def?.color || '#7E8B9B').replace('#', '');
    const r = (parseInt(hex.slice(0, 2), 16) / 255).toFixed(3);
    const g = (parseInt(hex.slice(2, 4), 16) / 255).toFixed(3);
    const b = (parseInt(hex.slice(4, 6), 16) / 255).toFixed(3);
    const matIndex = idx * 3 + 1;
    const meshIndex = idx * 3 + 2;
    const shapeIndex = idx * 3 + 3;

    const isGlass = def?.materialFinish === 'glass';
    const isNeon = def?.materialFinish === 'neon';

    lines.push(
      `[sub_resource type="StandardMaterial3D" id="StandardMaterial3D_${matIndex}"]`
    );
    lines.push(
      `albedo_color = Color(${r}, ${g}, ${b}, ${isGlass ? '0.55' : '1.0'})`
    );
    if (isGlass) {
      lines.push('transparency = 1');
    }
    lines.push(
      `roughness = ${
        def?.materialFinish === 'matte'
          ? '0.85'
          : def?.materialFinish === 'metallic'
            ? '0.28'
            : '0.45'
      }`
    );
    lines.push(
      `metallic = ${def?.materialFinish === 'metallic' ? '0.82' : '0.04'}`
    );
    if (isNeon) {
      lines.push('emission_enabled = true');
      lines.push(`emission = Color(${r}, ${g}, ${b}, 1)`);
      lines.push('emission_energy_multiplier = 2.2');
    }
    lines.push('');

    const w = def?.width || 1;
    const hNum = (def?.heightPlates || 3) / 3;
    const h = hNum.toFixed(3);
    const d = def?.depth || 1;
    lines.push(`[sub_resource type="BoxMesh" id="BoxMesh_${meshIndex}"]`);
    lines.push(`material = SubResource("StandardMaterial3D_${matIndex}")`);
    lines.push(`size = Vector3(${w}, ${h}, ${d})`);
    lines.push('');

    lines.push(`[sub_resource type="BoxShape3D" id="BoxShape3D_${shapeIndex}"]`);
    lines.push(`size = Vector3(${w}, ${h}, ${d})`);
    lines.push('');

    if (def?.shape === 'arch') {
      const pillarW = Math.max(0.18, w * 0.24).toFixed(3);
      const lintelH = Math.max(0.18, hNum * 0.28).toFixed(3);
      lines.push(
        `[sub_resource type="BoxShape3D" id="BoxShape3D_${shapeIndex}_pillar"]`
      );
      lines.push(`size = Vector3(${pillarW}, ${h}, ${d})`);
      lines.push('');
      lines.push(
        `[sub_resource type="BoxShape3D" id="BoxShape3D_${shapeIndex}_lintel"]`
      );
      lines.push(`size = Vector3(${w}, ${lintelH}, ${d})`);
      lines.push('');
    }
  });

  const safeSceneName =
    worldName.replace(/[^a-zA-Z0-9_]/g, '_') || 'BrickForgeScene';
  lines.push(`[node name="${safeSceneName}" type="Node3D"]`);
  lines.push('');

  // Add WorldEnvironment & DirectionalLight3D nodes
  lines.push('[node name="WorldEnvironment" type="WorldEnvironment" parent="."]');
  lines.push('environment = SubResource("Environment_main")');
  lines.push('');

  lines.push('[node name="DirectionalSunLight" type="DirectionalLight3D" parent="."]');
  lines.push(
    'transform = Transform3D(0.7071, -0.5, 0.5, 0, 0.7071, 0.7071, -0.7071, -0.5, 0.5, 12, 18, 12)'
  );
  lines.push(
    `light_energy = ${(lightingConfig?.sunIntensity ?? 1.5).toFixed(2)}`
  );
  lines.push(
    `shadow_enabled = ${(lightingConfig?.shadowsEnabled ?? true) ? 'true' : 'false'}`
  );
  lines.push('');

  const defIndexMap = new Map<string, { meshId: number; shapeId: number }>();
  usedDefIds.forEach((id, idx) =>
    defIndexMap.set(id, { meshId: idx * 3 + 2, shapeId: idx * 3 + 3 })
  );

  placedList.forEach((blk, idx) => {
    const ids = defIndexMap.get(blk.blockDefId) || { meshId: 2, shapeId: 3 };
    const def = customBlocks[blk.blockDefId];
    const { x, y, z } = blk.position;
    const rad = ((blk.rotation || 0) * Math.PI) / 180;
    const cosY = Math.cos(rad).toFixed(4);
    const sinY = Math.sin(rad).toFixed(4);
    const negSinY = (-Math.sin(rad)).toFixed(4);

    const nodeName = `Block_${idx}_${x}_${y}_${z}`;
    lines.push(`[node name="${nodeName}" type="MeshInstance3D" parent="."]`);
    lines.push(
      `transform = Transform3D(${cosY}, 0, ${sinY}, 0, 1, 0, ${negSinY}, 0, ${cosY}, ${x}, ${y}, ${z})`
    );
    lines.push(`mesh = SubResource("BoxMesh_${ids.meshId}")`);
    lines.push('');

    // Static collision body for player physics in Godot 4
    lines.push(
      `[node name="StaticBody3D" type="StaticBody3D" parent="${nodeName}"]`
    );
    lines.push('');
    if (def?.shape === 'arch') {
      const w = def?.width || 1;
      const hNum = (def?.heightPlates || 3) / 3;
      const pillarOffset = (w * 0.38).toFixed(3);
      const lintelOffsetY = (hNum * 0.36).toFixed(3);

      lines.push(
        `[node name="LeftPillarCol" type="CollisionShape3D" parent="${nodeName}/StaticBody3D"]`
      );
      lines.push(
        `transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, -${pillarOffset}, 0, 0)`
      );
      lines.push(`shape = SubResource("BoxShape3D_${ids.shapeId}_pillar")`);
      lines.push('');

      lines.push(
        `[node name="RightPillarCol" type="CollisionShape3D" parent="${nodeName}/StaticBody3D"]`
      );
      lines.push(
        `transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${pillarOffset}, 0, 0)`
      );
      lines.push(`shape = SubResource("BoxShape3D_${ids.shapeId}_pillar")`);
      lines.push('');

      lines.push(
        `[node name="TopLintelCol" type="CollisionShape3D" parent="${nodeName}/StaticBody3D"]`
      );
      lines.push(
        `transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, ${lintelOffsetY}, 0)`
      );
      lines.push(`shape = SubResource("BoxShape3D_${ids.shapeId}_lintel")`);
      lines.push('');
    } else {
      lines.push(
        `[node name="CollisionShape3D" type="CollisionShape3D" parent="${nodeName}/StaticBody3D"]`
      );
      lines.push(`shape = SubResource("BoxShape3D_${ids.shapeId}")`);
      lines.push('');
    }

    // Attach OmniLight3D if block is an emissive lantern
    if (def?.materialFinish === 'neon') {
      const hex = (blk.colorOverride || def?.color || '#F59E0B').replace('#', '');
      const r = (parseInt(hex.slice(0, 2), 16) / 255).toFixed(3);
      const g = (parseInt(hex.slice(2, 4), 16) / 255).toFixed(3);
      const b = (parseInt(hex.slice(4, 6), 16) / 255).toFixed(3);
      lines.push(
        `[node name="LanternOmniLight" type="OmniLight3D" parent="${nodeName}"]`
      );
      lines.push('transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0.6, 0)');
      lines.push(`light_color = Color(${r}, ${g}, ${b}, 1)`);
      lines.push('light_energy = 1.6');
      lines.push('omni_range = 7.5');
      lines.push('');
    }
  });

  return lines.join('\n');
}

export function generateGodotGdScript(
  worldName: string,
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>
): string {
  const placedList = sortBlocksDeterministically(blocks);
  worldName = exportCommentName(worldName);
  return `# Generated Godot 4.x draft; native behaviour and device performance are unqualified
# Attach this @tool script to a Node3D in Godot 4 to spawn "${worldName}" with StaticBody3D collisions and OmniLight3D lanterns
@tool
extends Node3D

const BLOCKS = ${JSON.stringify(
    placedList.map((b) => {
      const def = customBlocks[b.blockDefId];
      return {
        pos: [b.position.x, b.position.y, b.position.z],
        rot: b.rotation,
        type: b.blockDefId,
        shape: def?.shape || 'brick',
        finish: def?.materialFinish || 'matte',
        color: b.colorOverride || def?.color || '#7E8B9B',
        size: [
          def?.width || 1,
          (def?.heightPlates || 3) / 3,
          def?.depth || 1,
        ],
      };
    }),
    null,
    2
  )}

func _ready() -> void:
\tbuild_skyblock()

func build_skyblock() -> void:
\t# Cache shared materials by color+finish to minimize mobile GPU draw calls
\tvar mat_cache := {}
\tfor item in BLOCKS:
\t\tvar mesh_inst := MeshInstance3D.new()
\t\tvar box := BoxMesh.new()
\t\tvar target_size := Vector3(item.size[0], item.size[1], item.size[2])
\t\tbox.size = target_size
\t\tvar mat_key: String = item.color + "_" + item.finish
\t\tif not mat_cache.has(mat_key):
\t\t\tvar mat := StandardMaterial3D.new()
\t\t\tmat.albedo_color = Color(item.color)
\t\t\tmat.roughness = 0.85 if item.finish == "matte" else (0.28 if item.finish == "metallic" else 0.45)
\t\t\tmat.metallic = 0.82 if item.finish == "metallic" else 0.04
\t\t\tif item.finish == "neon":
\t\t\t\tmat.emission_enabled = true
\t\t\t\tmat.emission = Color(item.color)
\t\t\t\tmat.emission_energy_multiplier = 2.0
\t\t\tmat_cache[mat_key] = mat
\t\tbox.material = mat_cache[mat_key]
\t\tmesh_inst.mesh = box
\t\tmesh_inst.position = Vector3(item.pos[0], item.pos[1], item.pos[2])
\t\tmesh_inst.rotation_degrees.y = item.rot
\t\t
\t\t# Add StaticBody3D collision for walkable characters
\t\tvar body := StaticBody3D.new()
\t\tvar col := CollisionShape3D.new()
\t\tvar shape := BoxShape3D.new()
\t\tshape.size = target_size
\t\tcol.shape = shape
\t\tbody.add_child(col)
\t\tmesh_inst.add_child(body)
\t\t
\t\t# Attach dynamic OmniLight3D for emissive lantern blocks
\t\tif item.finish == "neon":
\t\t\tvar omni := OmniLight3D.new()
\t\t\tomni.light_color = Color(item.color)
\t\t\tomni.light_energy = 1.5
\t\t\tomni.omni_range = 7.5
\t\t\tomni.position = Vector3(0, 0.6, 0)
\t\t\tmesh_inst.add_child(omni)
\t\t
\t\tadd_child(mesh_inst)
`;
}

export async function exportSceneToGltfJson(
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>
): Promise<string> {
  const exportScene = new THREE.Scene();
  const createdGroups: THREE.Group[] = [];

  const sortedBlocks = sortBlocksDeterministically(blocks);

  for (const blk of sortedBlocks) {
    const def = customBlocks[blk.blockDefId];
    if (!def) continue;
    const group = buildBlockMeshGroup({
      def,
      colorOverride: blk.colorOverride,
      textureOverride: blk.textureOverride,
      materialOverride: blk.materialOverride,
      isSoftwareGl: true,
    });
    group.position.set(blk.position.x, blk.position.y, blk.position.z);
    group.rotation.y = THREE.MathUtils.degToRad(blk.rotation || 0);
    const rawScale = blk.customScale as unknown;
    const sx =
      typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
        ? rawScale
        : typeof (rawScale as any)?.x === 'number'
          ? (rawScale as any).x
          : 1;
    const sy =
      typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
        ? rawScale
        : typeof (rawScale as any)?.y === 'number'
          ? (rawScale as any).y
          : 1;
    const sz =
      typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
        ? rawScale
        : typeof (rawScale as any)?.z === 'number'
          ? (rawScale as any).z
          : 1;
    group.scale.set(sx, sy, sz);
    exportScene.add(group);
    createdGroups.push(group);
  }

  const exporter = new GLTFExporter();
  try {
    return await new Promise((resolve, reject) => {
      exporter.parse(
        exportScene,
        (result) => {
          resolve(JSON.stringify(result, null, 2));
        },
        (err) => {
          reject(err);
        },
        { binary: false }
      );
    });
  } finally {
    // Dispose any unshared geometries & ephemeral materials created for exportScene (CA-11-C03)
    for (const grp of createdGroups) {
      disposeUnsharedGroupGeometries(grp);
    }
  }
}

export function triggerFileDownload(
  filename: string,
  content: string,
  mimeType = 'text/plain'
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function encodeUint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
      'base64'
    );
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

function hexToRgbaFactor(hex: string, alpha = 1.0): [number, number, number, number] {
  const clean = (hex || '#7E8B9B').replace('#', '').padEnd(6, '0');
  const num = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(num)) return [0.49, 0.55, 0.61, alpha];
  return [
    Number((((num >> 16) & 255) / 255).toFixed(4)),
    Number((((num >> 8) & 255) / 255).toFixed(4)),
    Number(((num & 255) / 255).toFixed(4)),
    alpha,
  ];
}

export interface GltfExportOptions {
  includeRig?: boolean;
  includeAnimation?: boolean;
}

/**
 * Synchronously generates a spec-compliant glTF 2.0 JSON document containing real
 * 3D mesh primitives, PBR materials, vertex/normal/index accessors, bufferViews,
 * embedded binary buffer, and node transforms (including rotation quaternions and customScale).
 */
export function exportToGltfJson(
  worldName: string,
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>,
  options?: GltfExportOptions
): string {
  const placedList = sortBlocksDeterministically(blocks);

  // Build unit cube geometry (24 vertices with normals + 36 uint16 indices)
  const positions = new Float32Array([
    // +Z front
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // -Z back
    0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5,
    // +Y top
    -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
    // -Y bottom
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    // +X right
    0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5,
    // -X left
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
  ]);

  const normals = new Float32Array([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ]);

  const totalBytes =
    positions.byteLength + normals.byteLength + indices.byteLength;
  const combinedBuffer = new Uint8Array(totalBytes);
  combinedBuffer.set(
    new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength),
    0
  );
  combinedBuffer.set(
    new Uint8Array(normals.buffer, normals.byteOffset, normals.byteLength),
    positions.byteLength
  );
  combinedBuffer.set(
    new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength),
    positions.byteLength + normals.byteLength
  );

  const base64Uri = `data:application/octet-stream;base64,${encodeUint8ArrayToBase64(
    combinedBuffer
  )}`;

  // Deduplicate materials & meshes by (blockDefId + colorOverride + materialOverride)
  const materialMap = new Map<string, number>();
  const materials: Array<Record<string, unknown>> = [];
  const meshes: Array<Record<string, unknown>> = [];

  const getOrCreateMeshIndex = (blk: PlacedBlock): number => {
    const def = customBlocks[blk.blockDefId];
    const color = blk.colorOverride || def?.color || '#7E8B9B';
    const finish = blk.materialOverride || def?.materialFinish || 'matte';
    const key = `${blk.blockDefId}::${color}::${finish}`;
    const existing = materialMap.get(key);
    if (existing !== undefined) return existing;

    const idx = materials.length;
    materialMap.set(key, idx);

    const isGlass = finish === 'glass' || finish === 'translucent';
    const rgba = hexToRgbaFactor(color, isGlass ? 0.6 : 1.0);
    materials.push({
      name: `Mat_${blk.blockDefId}_${idx}`,
      pbrMetallicRoughness: {
        baseColorFactor: rgba,
        metallicFactor: finish === 'metallic' ? 0.82 : 0.05,
        roughnessFactor:
          finish === 'matte' ? 0.85 : finish === 'metallic' ? 0.28 : 0.45,
      },
      ...(isGlass ? { alphaMode: 'BLEND' } : {}),
    });

    meshes.push({
      name: `Mesh_${blk.blockDefId}_${idx}`,
      primitives: [
        {
          attributes: {
            POSITION: 0,
            NORMAL: 1,
          },
          indices: 2,
          material: idx,
          mode: 4, // TRIANGLES
        },
      ],
    });

    return idx;
  };

  // Ensure at least 1 default material & mesh exist even for empty scenes
  if (placedList.length === 0) {
    materials.push({
      name: 'DefaultStudioMaterial',
      pbrMetallicRoughness: {
        baseColorFactor: [0.49, 0.55, 0.61, 1.0],
        metallicFactor: 0.05,
        roughnessFactor: 0.85,
      },
    });
    meshes.push({
      name: 'DefaultUnitCubeMesh',
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1 },
          indices: 2,
          material: 0,
          mode: 4,
        },
      ],
    });
  }

  const nodes = placedList.map((blk, idx) => {
    const def = customBlocks[blk.blockDefId];
    const meshIndex = getOrCreateMeshIndex(blk);
    const rotRad = (((blk.rotation || 0) * Math.PI) / 180) * 0.5;
    const quatY = Number(Math.sin(rotRad).toFixed(5));
    const quatW = Number(Math.cos(rotRad).toFixed(5));

    const rawScale = blk.customScale as unknown;
    const ux =
      typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
        ? rawScale
        : typeof (rawScale as any)?.x === 'number'
          ? (rawScale as any).x
          : 1;
    const uy =
      typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
        ? rawScale
        : typeof (rawScale as any)?.y === 'number'
          ? (rawScale as any).y
          : 1;
    const uz =
      typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
        ? rawScale
        : typeof (rawScale as any)?.z === 'number'
          ? (rawScale as any).z
          : 1;
    const sx = Number(((def?.width || 1) * ux).toFixed(4));
    const sy = Number((((def?.heightPlates || 3) / 3) * uy).toFixed(4));
    const sz = Number(((def?.depth || 1) * uz).toFixed(4));

    return {
      name: `Block_${idx}_${blk.blockDefId}`,
      mesh: meshIndex,
      translation: [blk.position.x, blk.position.y, blk.position.z],
      rotation: [0, quatY, 0, quatW],
      scale: [sx, sy, sz],
      extras: {
        blockDefId: blk.blockDefId,
        color: blk.colorOverride || def?.color || '#7E8B9B',
        shape: def?.shape || 'brick',
        materialFinish: def?.materialFinish || 'matte',
        rotation: blk.rotation,
        customScale: blk.customScale || 1,
      },
    };
  });

  const gltfDoc: Record<string, unknown> = {
    asset: {
      version: '2.0',
      generator: 'LFS Block Studio Universal glTF 2.0 Exporter (Godot 4 & Blender Ready)',
      copyright:
        'Not an official Minecraft, LEGO, or Godot product. Not approved by or associated with Mojang, Microsoft, or The LEGO Group.',
    },
    scene: 0,
    scenes: [
      {
        name: worldName || 'LFSBlockStudioScene',
        nodes: nodes.map((_, i) => i),
      },
    ],
    nodes,
    meshes,
    materials,
    ...(options?.includeRig
      ? {
          skins: [
            {
              name: 'Armature_Skin',
              joints: nodes.map((_, i) => i),
            },
          ],
        }
      : {}),
    ...(options?.includeAnimation
      ? {
          animations: [
            {
              name: 'Studio_Idle',
              channels: [],
              samplers: [],
            },
          ],
        }
      : {}),
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 24,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 24,
        type: 'VEC3',
        min: [-1, -1, -1],
        max: [1, 1, 1],
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: 'SCALAR',
        min: [0],
        max: [23],
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positions.byteLength,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: normals.byteLength,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: positions.byteLength + normals.byteLength,
        byteLength: indices.byteLength,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      },
    ],
    buffers: [
      {
        byteLength: totalBytes,
        uri: base64Uri,
      },
    ],
  };

  return JSON.stringify(gltfDoc, null, 2);
}

/**
 * Exports a deterministic Blockbench (.bbmodel v4.10) JSON document with cube elements,
 * 6-face UV skins, outliner bone hierarchy rig, texture palette, and idle animation track.
 */
export function exportToBlockbenchModelJson(
  worldName: string,
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>
): string {
  const placedList = sortBlocksDeterministically(blocks);
  const textureIndexByKey = new Map<string, number>();
  const textures: Array<Record<string, unknown>> = [];

  const getTextureIndex = (blk: PlacedBlock): number => {
    const def = customBlocks[blk.blockDefId];
    const color = blk.colorOverride || def?.color || '#7E8B9B';
    const pattern = blk.textureOverride || def?.texturePattern || 'solid';
    const key = `${blk.blockDefId}::${color}::${pattern}`;
    const existing = textureIndexByKey.get(key);
    if (existing !== undefined) return existing;
    const idx = textures.length;
    textureIndexByKey.set(key, idx);
    textures.push({
      id: String(idx),
      uuid: `tex_${idx}_${blk.blockDefId}`,
      name: `${def?.name || blk.blockDefId}_${color}`,
      color,
      pattern,
      width: 64,
      height: 64,
    });
    return idx;
  };

  const elements: BBElement[] = placedList.map((blk, idx) => {
    const def = customBlocks[blk.blockDefId];
    const texIdx = getTextureIndex(blk);
    const rawScale = blk.customScale as unknown;
    const ux =
      typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
        ? rawScale
        : typeof (rawScale as any)?.x === 'number'
          ? (rawScale as any).x
          : 1;
    const uy =
      typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
        ? rawScale
        : typeof (rawScale as any)?.y === 'number'
          ? (rawScale as any).y
          : 1;
    const uz =
      typeof rawScale === 'number' && Number.isFinite(rawScale) && rawScale > 0
        ? rawScale
        : typeof (rawScale as any)?.z === 'number'
          ? (rawScale as any).z
          : 1;

    const w = (def?.width || 1) * ux * 16;
    const h = ((def?.heightPlates || 3) / 3) * uy * 16;
    const d = (def?.depth || 1) * uz * 16;
    const fx = blk.position.x * 16;
    const fy = blk.position.y * 16;
    const fz = blk.position.z * 16;

    return {
      uuid: `cube_${idx}_${blk.id || blk.blockDefId}`,
      name: `Block_${idx}_${blk.blockDefId}`,
      type: 'cube',
      from: [Number(fx.toFixed(4)), Number(fy.toFixed(4)), Number(fz.toFixed(4))],
      to: [
        Number((fx + w).toFixed(4)),
        Number((fy + h).toFixed(4)),
        Number((fz + d).toFixed(4)),
      ],
      origin: [
        Number((fx + w * 0.5).toFixed(4)),
        Number((fy + h * 0.5).toFixed(4)),
        Number((fz + d * 0.5).toFixed(4)),
      ],
      rotation: [0, blk.rotation || 0, 0],
      faces: {
        north: { uv: [0, 0, 16, 16], texture: texIdx },
        south: { uv: [0, 0, 16, 16], texture: texIdx },
        east: { uv: [0, 0, 16, 16], texture: texIdx },
        west: { uv: [0, 0, 16, 16], texture: texIdx },
        up: { uv: [0, 0, 16, 16], texture: texIdx },
        down: { uv: [0, 0, 16, 16], texture: texIdx },
      },
    };
  });

  const model: BBModel = {
    meta: {
      format_version: '4.10',
      model_format: 'free',
      box_uv: false,
    },
    name: worldName || 'LFSBlockStudioModel',
    resolution: {
      width: 64,
      height: 64,
    },
    elements,
    outliner: [
      {
        uuid: 'bone_root_001',
        name: 'root',
        origin: [0, 0, 0],
        rotation: [0, 0, 0],
        children: elements.map((el) => el.uuid),
      },
    ],
    textures,
    animations: [
      {
        uuid: 'anim_idle_001',
        name: 'idle',
        loop: 'loop',
        length: 1.0,
        snapping: 24,
        animators: {
          bone_root_001: {
            name: 'root',
            type: 'bone',
            keyframes: [
              {
                channel: 'position',
                time: 0,
                interpolation: 'linear',
                data_points: [{ x: 0, y: 0, z: 0 }],
              },
              {
                channel: 'position',
                time: 1.0,
                interpolation: 'linear',
                data_points: [{ x: 0, y: 0, z: 0 }],
              },
            ],
          },
        },
      },
    ],
  };

  return BBModelHelper.serialize(model);
}

export interface SpriteAtlasFrameRegion {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteAnimationClipSpec {
  name: string;
  fps?: number;
  loop?: boolean;
  frames: SpriteAtlasFrameRegion[];
}

/**
 * Generates a Godot 4.x SpriteFrames (.tres) resource for 8-direction salvaged character
 * or prop sprite sheets so AnimatedSprite2D / AnimatedSprite3D nodes can consume packed atlases directly.
 */
export function generateGodotSpriteFramesTres(
  atlasResPath: string,
  animations: SpriteAnimationClipSpec[]
): string {
  const allFrames: Array<{ id: string; region: SpriteAtlasFrameRegion }> = [];
  const animEntries: string[] = [];
  let subIdx = 1;

  for (const clip of animations) {
    const clipFrameRefs: string[] = [];
    for (const frame of clip.frames) {
      const id = `AtlasTexture_${subIdx++}`;
      allFrames.push({ id, region: frame });
      clipFrameRefs.push(
        `{\n"duration": 1.0,\n"texture": SubResource("${id}")\n}`
      );
    }
    const fps = (clip.fps ?? 10.0).toFixed(1);
    const loop = (clip.loop ?? true) ? 'true' : 'false';
    animEntries.push(
      `{\n"frames": [${clipFrameRefs.join(', ')}],\n"loop": ${loop},\n"name": &"${clip.name}",\n"speed": ${fps}\n}`
    );
  }

  const lines: string[] = [];
  lines.push(
    `[gd_resource type="SpriteFrames" load_steps=${allFrames.length + 2} format=3]`
  );
  lines.push('');
  lines.push(
    `[ext_resource type="Texture2D" path="${atlasResPath}" id="1_atlas"]`
  );
  lines.push('');

  for (const item of allFrames) {
    lines.push(`[sub_resource type="AtlasTexture" id="${item.id}"]`);
    lines.push('atlas = ExtResource("1_atlas")');
    lines.push(
      `region = Rect2(${item.region.x}, ${item.region.y}, ${item.region.w}, ${item.region.h})`
    );
    lines.push('');
  }

  lines.push('[resource]');
  lines.push(`animations = [${animEntries.join(', ')}]`);
  lines.push('');
  return lines.join('\n');
}

export const exportToGodotTscn = generateGodotTscn;
export const exportToGodotScript = generateGodotGdScript;
export const triggerDownloadFile = triggerFileDownload;
export const exportToBbmodel = exportToBlockbenchModelJson;
export { convertRgbaToHollowShellBlocks } from './imageToVoxelHollowShell';

