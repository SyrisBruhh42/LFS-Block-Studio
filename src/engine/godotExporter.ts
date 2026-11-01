import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  CustomBlockDefinition,
  DynamicLightingConfig,
  PlacedBlock,
} from './types';
import { buildBlockMeshGroup } from './legoGeometry';

/**
 * Generates a complete Godot 4.x (.tscn) scene with:
 * - ProceduralSkyMaterial + WorldEnvironment + DirectionalLight3D (Dynamic Lighting)
 * - Shared StandardMaterial3D + BoxMesh sub-resources per block type (draw-call friendly for Mobile/Android)
 * - StaticBody3D + BoxShape3D collision shapes so structures are immediately walkable in Godot
 * - OmniLight3D nodes automatically attached to emissive / lantern blocks
 */
export function generateGodotTscn(
  worldName: string,
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>,
  lightingConfig?: DynamicLightingConfig
): string {
  const placedList = Object.values(blocks);
  const usedDefIds = Array.from(new Set(placedList.map((b) => b.blockDefId)));

  // Each block type gets 3 sub_resources: StandardMaterial3D, BoxMesh, BoxShape3D
  // Plus 2 scene environment sub_resources: ProceduralSkyMaterial, Environment
  const totalSubResources = usedDefIds.length * 3 + 2;
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
    const h = ((def?.heightPlates || 3) / 3).toFixed(3);
    const d = def?.depth || 1;
    lines.push(`[sub_resource type="BoxMesh" id="BoxMesh_${meshIndex}"]`);
    lines.push(`material = SubResource("StandardMaterial3D_${matIndex}")`);
    lines.push(`size = Vector3(${w}, ${h}, ${d})`);
    lines.push('');

    lines.push(`[sub_resource type="BoxShape3D" id="BoxShape3D_${shapeIndex}"]`);
    lines.push(`size = Vector3(${w}, ${h}, ${d})`);
    lines.push('');
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
    lines.push(
      `[node name="CollisionShape3D" type="CollisionShape3D" parent="${nodeName}/StaticBody3D"]`
    );
    lines.push(`shape = SubResource("BoxShape3D_${ids.shapeId}")`);
    lines.push('');

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
  const placedList = Object.values(blocks);
  return `# Generated by BrickForge Studio for Godot 4.x (Desktop & Android Mobile Renderer ready)
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
  for (const blk of Object.values(blocks)) {
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
    group.rotation.y = THREE.MathUtils.degToRad(blk.rotation);
    exportScene.add(group);
  }

  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
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

export function exportToGltfJson(
  worldName: string,
  blocks: Record<string, PlacedBlock>,
  customBlocks: Record<string, CustomBlockDefinition>
): string {
  const placedList = Object.values(blocks);
  const nodes = placedList.map((blk, idx) => {
    const def = customBlocks[blk.blockDefId];
    return {
      name: `Block_${idx}_${blk.blockDefId}`,
      translation: [blk.position.x, blk.position.y, blk.position.z],
      extras: {
        blockDefId: blk.blockDefId,
        color: blk.colorOverride || def?.color || '#7E8B9B',
        shape: def?.shape || 'brick',
        materialFinish: def?.materialFinish || 'matte',
        rotation: blk.rotation,
      },
    };
  });

  const gltfDoc = {
    asset: {
      version: '2.0',
      generator: 'BrickForge Studio Universal Exporter (Godot 4 & Blender Ready)',
    },
    scene: 0,
    scenes: [
      {
        name: worldName || 'BrickForgeScene',
        nodes: nodes.map((_, i) => i),
      },
    ],
    nodes,
  };

  return JSON.stringify(gltfDoc, null, 2);
}

export const exportToGodotTscn = generateGodotTscn;
export const exportToGodotScript = generateGodotGdScript;
export const triggerDownloadFile = triggerFileDownload;
