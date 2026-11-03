import * as THREE from 'three';
import {
  BlockMaterialFinish,
  BlockScale3D,
  BlockTexturePattern,
  CustomBlockDefinition,
  PixelsPerBlock,
  ProceduralArtStyle,
} from './types';
import {
  getBlockMaterial,
  getSixFaceSpritemapMaterials,
} from './proceduralTextures';
import { AtlasCellCoord, ConnectedArtMode } from './chunkAndPatternEngine';

const STUD_RADIUS = 0.24;
const STUD_HEIGHT = 0.12;
export const sharedStudGeo = new THREE.CylinderGeometry(
  STUD_RADIUS,
  STUD_RADIUS,
  STUD_HEIGHT,
  12
);

export function buildBlockMeshGroup(params: {
  def: CustomBlockDefinition;
  colorOverride?: string;
  textureOverride?: BlockTexturePattern;
  materialOverride?: BlockMaterialFinish;
  customScale?: BlockScale3D;
  isSoftwareGl: boolean;
  maxAnisotropy?: number;
  ghostOpacity?: number;
  connectedMode?: ConnectedArtMode;
  connectedMask?: number;
  uvRotationQuarterTurns?: 0 | 1 | 2 | 3;
  roughnessDelta?: number;
  variantIndex?: 0 | 1 | 2 | 3;
  pixelsPerBlock?: PixelsPerBlock;
  artStyle?: ProceduralArtStyle;
  atlasTopCell?: AtlasCellCoord;
  atlasSideCell?: AtlasCellCoord;
  megaSpritemapMode?: boolean;
}): THREE.Group {
  const {
    def,
    colorOverride,
    textureOverride,
    materialOverride,
    customScale,
    isSoftwareGl,
    maxAnisotropy = 4,
    ghostOpacity,
    connectedMode = 'isolated',
    connectedMask = 0,
    uvRotationQuarterTurns = 0,
    roughnessDelta = 0,
    variantIndex = 0,
    pixelsPerBlock = 64,
    artStyle = 'pixel_art_hd',
    atlasTopCell = [0, 0],
    atlasSideCell = [0, 0],
    megaSpritemapMode = true,
  } = params;

  const group = new THREE.Group();
  const sx = customScale?.x ?? def.defaultScale?.x ?? 1;
  const sy = customScale?.y ?? def.defaultScale?.y ?? 1;
  const sz = customScale?.z ?? def.defaultScale?.z ?? 1;

  const w = Math.max(0.2, def.width * sx);
  const d = Math.max(0.2, def.depth * sz);
  const h = Math.max(0.15, (def.heightPlates / 3) * sy);

  const primaryColor = colorOverride || def.color;
  const pattern = textureOverride || def.texturePattern;
  const finish = materialOverride || def.materialFinish;

  const mainMat = getBlockMaterial({
    color: primaryColor,
    texturePattern: pattern,
    materialFinish: finish,
    isSoftwareGl,
    maxAnisotropy,
    ghostOpacity,
    connectedMode,
    uvRotationQuarterTurns,
    roughnessDelta,
    variantIndex,
    pixelsPerBlock,
    artStyle,
    blockId: def.id,
    atlasCell: megaSpritemapMode ? atlasTopCell : [0, 0],
    uvScaleRepeat: [w, d],
  });

  const trimColor = new THREE.Color(primaryColor).multiplyScalar(0.84).getStyle();
  const trimMat = getBlockMaterial({
    color: trimColor,
    texturePattern: pattern,
    materialFinish: finish === 'matte' ? 'plastic' : 'matte',
    isSoftwareGl,
    maxAnisotropy,
    ghostOpacity,
    connectedMode,
    uvRotationQuarterTurns,
    variantIndex,
    pixelsPerBlock,
    artStyle,
    blockId: def.id,
    atlasCell: megaSpritemapMode ? atlasSideCell : [0, 0],
    uvScaleRepeat: [w, h],
  });

  // Center offsets when width or depth != 1 so anchor cell sits cleanly on the grid
  const offsetX = (w - 1) * 0.5;
  const offsetZ = (d - 1) * 0.5;

  if (def.shape === 'micro_voxel' && def.voxels && def.voxels.length > 0) {
    const vSize = 1 / 8;
    const voxelGeo = new THREE.BoxGeometry(
      vSize * 0.99 * sx,
      vSize * 0.99 * sy,
      vSize * 0.99 * sz
    );

    for (const v of def.voxels) {
      const vMat = getBlockMaterial({
        color: colorOverride || v.color,
        texturePattern: pattern,
        materialFinish: finish,
        isSoftwareGl,
        maxAnisotropy,
        ghostOpacity,
        pixelsPerBlock,
        artStyle,
      });
      const mesh = new THREE.Mesh(voxelGeo, vMat);
      const vx = (-0.5 + vSize * 0.5 + v.x * vSize) * sx + offsetX;
      const vy = (vSize * 0.5 + v.y * vSize) * sy;
      const vz = (-0.5 + vSize * 0.5 + v.z * vSize) * sz + offsetZ;
      mesh.position.set(vx, vy, vz);
      mesh.castShadow = !isSoftwareGl && !ghostOpacity;
      mesh.receiveShadow = !isSoftwareGl && !ghostOpacity;
      group.add(mesh);
    }
    return group;
  }

  if (def.shape === 'cylinder') {
    const radius = Math.min(w, d) * 0.46;
    const hasAbove = Boolean(connectedMask & 4);
    const hasBelow = Boolean(connectedMask & 8);
    const bodyGeo = new THREE.CylinderGeometry(
      radius * 0.92,
      radius * 0.92,
      Math.max(0.1, h - (hasAbove || hasBelow ? 0.02 : 0.14)),
      20
    );
    const bodyMesh = new THREE.Mesh(bodyGeo, mainMat);
    bodyMesh.position.set(offsetX, h * 0.5, offsetZ);
    bodyMesh.castShadow = !isSoftwareGl && !ghostOpacity;
    bodyMesh.receiveShadow = !isSoftwareGl && !ghostOpacity;
    group.add(bodyMesh);

    const baseCapGeo = new THREE.BoxGeometry(w * 0.96, 0.07, d * 0.96);
    if (!hasBelow) {
      const baseCap = new THREE.Mesh(baseCapGeo, trimMat);
      baseCap.position.set(offsetX, 0.035, offsetZ);
      group.add(baseCap);
    }
    if (!hasAbove) {
      const topCap = new THREE.Mesh(baseCapGeo, trimMat);
      topCap.position.set(offsetX, h - 0.035, offsetZ);
      group.add(topCap);
    }

    return group;
  }

  if (def.shape === 'slope') {
    const lowerStep = new THREE.Mesh(
      new THREE.BoxGeometry(w, h * 0.5, d),
      mainMat
    );
    lowerStep.position.set(offsetX, h * 0.25, offsetZ);
    lowerStep.castShadow = !isSoftwareGl && !ghostOpacity;
    lowerStep.receiveShadow = !isSoftwareGl && !ghostOpacity;
    group.add(lowerStep);

    const upperStep = new THREE.Mesh(
      new THREE.BoxGeometry(w, h * 0.5, d * 0.5),
      mainMat
    );
    upperStep.position.set(offsetX, h * 0.75, offsetZ - d * 0.25);
    upperStep.castShadow = !isSoftwareGl && !ghostOpacity;
    upperStep.receiveShadow = !isSoftwareGl && !ghostOpacity;
    group.add(upperStep);

    return group;
  }

  if (def.shape === 'arch') {
    const topH = h * 0.34;
    const topBeam = new THREE.Mesh(
      new THREE.BoxGeometry(w, topH, d),
      mainMat
    );
    topBeam.position.set(offsetX, h - topH * 0.5, offsetZ);
    topBeam.castShadow = !isSoftwareGl && !ghostOpacity;
    topBeam.receiveShadow = !isSoftwareGl && !ghostOpacity;
    group.add(topBeam);

    const keystone = new THREE.Mesh(
      new THREE.BoxGeometry(w * 1.01, topH * 1.1, Math.min(0.32, d * 0.22)),
      trimMat
    );
    keystone.position.set(offsetX, h - topH * 0.48, offsetZ);
    group.add(keystone);

    const legH = h - topH;
    const legDepth = Math.max(0.26, d * 0.26);
    const leftLeg = new THREE.Mesh(
      new THREE.BoxGeometry(w, legH, legDepth),
      mainMat
    );
    leftLeg.position.set(
      offsetX,
      legH * 0.5,
      offsetZ - d * 0.5 + legDepth * 0.5
    );
    leftLeg.castShadow = !isSoftwareGl && !ghostOpacity;
    leftLeg.receiveShadow = !isSoftwareGl && !ghostOpacity;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(
      new THREE.BoxGeometry(w, legH, legDepth),
      mainMat
    );
    rightLeg.position.set(
      offsetX,
      legH * 0.5,
      offsetZ + d * 0.5 - legDepth * 0.5
    );
    rightLeg.castShadow = !isSoftwareGl && !ghostOpacity;
    rightLeg.receiveShadow = !isSoftwareGl && !ghostOpacity;
    group.add(rightLeg);

    return group;
  }

  // Standard Realistic Voxel Block ('brick', 'plate', 'tile'):
  // Zero inset (100% flush) when connected so the 4x4 Mega-Spritemap flows across block seams without any gap!
  const isConnected = connectedMode !== 'isolated' && connectedMask > 0;
  const inset = isConnected ? 0 : 0.008;
  const hullGeo = new THREE.BoxGeometry(w - inset, h - inset, d - inset);

  const hullMaterial =
    megaSpritemapMode || def.id === 'grass_brick'
      ? getSixFaceSpritemapMaterials({
          color: primaryColor,
          texturePattern: pattern,
          materialFinish: finish,
          blockId: def.id,
          isSoftwareGl,
          maxAnisotropy,
          ghostOpacity,
          connectedMode,
          connectedMask,
          roughnessDelta,
          variantIndex,
          pixelsPerBlock,
          artStyle,
          atlasTopCell: megaSpritemapMode ? atlasTopCell : [0, 0],
          atlasSideCell: megaSpritemapMode ? atlasSideCell : [0, 0],
          effectiveDims: { w, h, d },
        })
      : mainMat;

  const hullMesh = new THREE.Mesh(hullGeo, hullMaterial);
  hullMesh.position.set(offsetX, h * 0.5, offsetZ);
  hullMesh.castShadow = !isSoftwareGl && !ghostOpacity;
  hullMesh.receiveShadow = !isSoftwareGl && !ghostOpacity;
  group.add(hullMesh);

  if (def.hasStuds) {
    const studCols = Math.max(1, Math.round(w));
    const studRows = Math.max(1, Math.round(d));
    for (let ix = 0; ix < studCols; ix++) {
      for (let iz = 0; iz < studRows; iz++) {
        const stud = new THREE.Mesh(sharedStudGeo, mainMat);
        stud.position.set(ix, h + STUD_HEIGHT * 0.5, iz);
        group.add(stud);
      }
    }
  }

  return group;
}

export function isSharedStudGeometry(geo?: THREE.BufferGeometry | null): boolean {
  return Boolean(geo && geo === sharedStudGeo);
}

/**
 * Traverses a Group or Object3D before removal and disposes all unshared BufferGeometries
 * and uncached ephemeral materials (such as invisible raycast hitbox materials or wireframe lines)
 * while preserving cached procedural block materials and sharedStudGeo.
 */
export function disposeUnsharedGroupGeometries(
  root: THREE.Object3D,
  extraSharedGeos?: Set<THREE.BufferGeometry>
): void {
  root.traverse((obj) => {
    const meshOrLine = obj as THREE.Mesh | THREE.LineSegments;
    if (meshOrLine.geometry) {
      const geo = meshOrLine.geometry;
      if (
        geo !== sharedStudGeo &&
        (!extraSharedGeos || !extraSharedGeos.has(geo))
      ) {
        geo.dispose();
      }
    }
    if (obj.userData?.isDisposableMaterial && meshOrLine.material) {
      if (Array.isArray(meshOrLine.material)) {
        for (const m of meshOrLine.material) m.dispose();
      } else {
        meshOrLine.material.dispose();
      }
    }
  });
}
