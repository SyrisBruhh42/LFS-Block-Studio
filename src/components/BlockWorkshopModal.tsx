import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BlockMaterialFinish,
  BlockShape,
  BlockTexturePattern,
  CustomBlockDefinition,
  MicroVoxel,
  PixelsPerBlock,
  ProceduralArtStyle,
  ScrollResizeMode,
} from '../engine/types';
import { buildBlockMeshGroup } from '../engine/legoGeometry';
import { Check, Grid, Layers, Sparkles, X } from 'lucide-react';
import { DraggableWindow } from './DraggableWindow';

interface BlockWorkshopModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCustomBlock: (
    blockDef: CustomBlockDefinition,
    saveAsPublicBlueprint: boolean,
    description: string
  ) => Promise<boolean>;
  initialBlock?: CustomBlockDefinition | null;
}

const LEGO_COLOR_SWATCHES = [
  { name: 'Quarried Slate', hex: '#7E8B9B' },
  { name: 'Deepslate', hex: '#474A4F' },
  { name: 'Hewn Oak', hex: '#B87A3D' },
  { name: 'Spruce Timber', hex: '#735531' },
  { name: 'Kiln Brick Red', hex: '#B94A3E' },
  { name: 'Cut Sandstone', hex: '#D9A760' },
  { name: 'Meadow Turf', hex: '#3F8E4D' },
  { name: 'Emerald Leaf', hex: '#10B981' },
  { name: 'Cobalt Tile', hex: '#3B82F6' },
  { name: 'Sea Lantern', hex: '#06B6D4' },
  { name: 'Gilded Amber', hex: '#F59E0B' },
  { name: 'Crimson Clay', hex: '#E11D48' },
  { name: 'Brushed Steel', hex: '#CBD5E1' },
  { name: 'Polished Quartz', hex: '#F8FAFC' },
];

const SHAPE_OPTIONS: { id: BlockShape; label: string; desc: string }[] = [
  {
    id: 'brick',
    label: 'Architectural Cube',
    desc: 'Flush CTM spritemap stone, brick, or timber block',
  },
  {
    id: 'plate',
    label: 'Half Slab / Trim',
    desc: 'Low-profile architectural floor or cornice slab',
  },
  {
    id: 'tile',
    label: 'Smooth Floor Tile',
    desc: 'Flush coffered marble or slate finishing cap',
  },
  {
    id: 'slope',
    label: 'Stepped Stair / Roof',
    desc: 'Architectural stair tread or pitched roof wedge',
  },
  {
    id: 'arch',
    label: 'Keystone Masonry Arch',
    desc: 'Twin piers with stone lintel and central keystone',
  },
  {
    id: 'cylinder',
    label: 'Fluted Pillar Column',
    desc: 'Architectural column with plinth base and capital',
  },
  {
    id: 'micro_voxel',
    label: '8×8×8 Chiseled Block',
    desc: 'Sculpt custom sub-voxel architectural details',
  },
];

const TEXTURE_OPTIONS: { id: BlockTexturePattern; label: string }[] = [
  { id: 'cobblestone', label: 'Voronoi Stone (4×4)' },
  { id: 'brick_masonry', label: 'Kiln Brick (4×4)' },
  { id: 'oak_planks', label: 'Long Timber (4×4)' },
  { id: 'tech_panel', label: 'Steel Panel (4×4)' },
  { id: 'checker_tile', label: 'Marble Tile (4×4)' },
  { id: 'smooth_abs', label: 'Honed Stone (4×4)' },
];

const FINISH_OPTIONS: { id: BlockMaterialFinish; label: string }[] = [
  { id: 'matte', label: 'Matte Stone / Wood' },
  { id: 'metallic', label: 'Brushed Metal' },
  { id: 'glass', label: 'Tempered Glass' },
  { id: 'neon', label: 'Emissive Lantern' },
  { id: 'plastic', label: 'Polished Ceramic' },
];

export const BlockWorkshopModal: React.FC<BlockWorkshopModalProps> = ({
  isOpen,
  onClose,
  onSaveCustomBlock,
  initialBlock,
}) => {
  const [name, setName] = useState(
    initialBlock?.name || 'Custom Connected Ashlar'
  );
  const [description, setDescription] = useState(
    'Custom architectural block with 4×4 Mega-Spritemap CTM support.'
  );
  const [shape, setShape] = useState<BlockShape>(
    initialBlock?.shape || 'brick'
  );
  const [width, setWidth] = useState<number>(initialBlock?.width || 1);
  const [depth, setDepth] = useState<number>(initialBlock?.depth || 1);
  const [heightPlates, setHeightPlates] = useState<number>(
    initialBlock?.heightPlates || 3
  );
  const [resizeMode, setResizeMode] = useState<ScrollResizeMode>('snap');
  const [previewCluster2x2, setPreviewCluster2x2] = useState<boolean>(true);
  const [previewPixels, setPreviewPixels] = useState<PixelsPerBlock>(64);
  const [previewArtStyle, setPreviewArtStyle] =
    useState<ProceduralArtStyle>('pixel_art_hd');

  const [color, setColor] = useState<string>(initialBlock?.color || '#7E8B9B');
  const [texturePattern, setTexturePattern] = useState<BlockTexturePattern>(
    initialBlock?.texturePattern || 'cobblestone'
  );
  const [materialFinish, setMaterialFinish] = useState<BlockMaterialFinish>(
    initialBlock?.materialFinish || 'matte'
  );
  const [hasStuds, setHasStuds] = useState<boolean>(
    initialBlock?.hasStuds ?? false
  );
  const [publishPublic, setPublishPublic] = useState<boolean>(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<{ name: string; fingerprint: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savePending = useRef<{ generation: number; fingerprint: string } | null>(null);
  const saveGeneration = useRef(0);
  const isMounted = useRef(false);
  useLayoutEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; saveGeneration.current++; };
  }, []);
  useLayoutEffect(() => {
    saveGeneration.current++;
    setValidationError(null);
    setSaveNotice(null);
    return () => { saveGeneration.current++; };
  }, [isOpen]);
  const closeWorkshop = () => {
    // Closing does not cancel the submitted operation or permit a duplicate save.
    saveGeneration.current++;
    setValidationError(null);
    setSaveNotice(null);
    onClose();
  };

  // Micro-voxel 8x8x8 state
  const [voxels, setVoxels] = useState<MicroVoxel[]>(() => {
    if (initialBlock?.voxels && initialBlock.voxels.length > 0) {
      return initialBlock.voxels;
    }
    const initial: MicroVoxel[] = [];
    for (let x = 2; x <= 5; x++) {
      for (let z = 2; z <= 5; z++) {
        for (let y = 0; y <= 3; y++) {
          initial.push({ x, y, z, color: '#F59E0B' });
        }
      }
    }
    return initial;
  });
  const [activeLayerY, setActiveLayerY] = useState<number>(2);
  const [voxelBrushColor, setVoxelBrushColor] = useState<string>('#F59E0B');
  const [voxelTool, setVoxelTool] = useState<'draw' | 'erase'>('draw');
  const [mirrorX, setMirrorX] = useState<boolean>(true);
  const [mirrorZ, setMirrorZ] = useState<boolean>(true);

  // Compare complete authoring values, not a counter maintained by input handlers.
  // Retain inactive geometry/voxel fields too: switching modes must not hide edits.
  // Preview quality, turntable, brush/tool and layer choices are not authored data.
  const draftFingerprint = JSON.stringify({
    name, description, shape, width, depth, heightPlates, color, texturePattern,
    materialFinish, hasStuds, publishPublic,
    voxels: [...voxels].sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z),
  });
  const currentDraftFingerprint = useRef(draftFingerprint);
  useLayoutEffect(() => { currentDraftFingerprint.current = draftFingerprint; }, [draftFingerprint]);

  const previewMountRef = useRef<HTMLDivElement | null>(null);
  const previewSceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    holder: THREE.Group;
    requestPreviewRender: () => void;
    isSoftwareGl: boolean;
  } | null>(null);

  // Initialize 3D Turntable Preview
  useEffect(() => {
    if (!isOpen) return;
    const mount = previewMountRef.current;
    if (!mount) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    renderer.setSize(mount.clientWidth || 320, mount.clientHeight || 260);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      42,
      (mount.clientWidth || 320) / (mount.clientHeight || 260),
      0.1,
      50
    );
    camera.position.set(4.2, 3.5, 4.6);
    camera.lookAt(0, 0.5, 0);

    scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.9));
    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.4);
    dirLight.position.set(5, 8, 6);
    scene.add(dirLight);

    const grid = new THREE.GridHelper(8, 8, 0x38bdf8, 0x334155);
    grid.position.y = -0.01;
    scene.add(grid);

    const holder = new THREE.Group();
    scene.add(holder);

    const requestPreviewRender = () => {
      renderer.render(scene, camera);
    };

    previewSceneRef.current = {
      scene,
      camera,
      renderer,
      holder,
      requestPreviewRender,
      isSoftwareGl,
    };

    requestPreviewRender();

    const resizeObserver = new ResizeObserver(() => {
      if (!mount) return;
      const w = Math.max(200, mount.clientWidth || 320);
      const h = Math.max(180, mount.clientHeight || 260);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestPreviewRender();
    });
    resizeObserver.observe(mount);

    return () => {
      resizeObserver.disconnect();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      previewSceneRef.current = null;
    };
  }, [isOpen]);

  // Update 3D preview mesh whenever block parameters or 2x2 Spritemap Cluster mode changes
  useEffect(() => {
    const ctx = previewSceneRef.current;
    if (!ctx) return;

    while (ctx.holder.children.length > 0) {
      ctx.holder.remove(ctx.holder.children[0]);
    }

    const previewDef: CustomBlockDefinition = {
      id: 'preview_block',
      name: name || 'Custom Block',
      shape,
      width: shape === 'micro_voxel' ? 1 : width,
      depth: shape === 'micro_voxel' ? 1 : depth,
      heightPlates:
        shape === 'plate' ? 1 : shape === 'micro_voxel' ? 3 : heightPlates,
      color,
      texturePattern,
      materialFinish,
      hasStuds: shape === 'tile' ? false : hasStuds,
      voxels: shape === 'micro_voxel' ? voxels : undefined,
      isCustom: true,
    };

    if (previewCluster2x2 && shape !== 'micro_voxel') {
      // Render a 2x2 connected cluster so the user sees the 4x4 Mega-Spritemap bridging across seams!
      const stepX = previewDef.width;
      const stepZ = previewDef.depth;
      for (let gx = 0; gx < 2; gx++) {
        for (let gz = 0; gz < 2; gz++) {
          const piece = buildBlockMeshGroup({
            def: previewDef,
            isSoftwareGl: ctx.isSoftwareGl,
            connectedMode: 'seamless_interior',
            connectedMask: 63,
            pixelsPerBlock: previewPixels,
            artStyle: previewArtStyle,
            atlasTopCell: [(gx % 4) as 0 | 1 | 2 | 3, (gz % 4) as 0 | 1 | 2 | 3],
            atlasSideCell: [
              ((gx + gz) % 4) as 0 | 1 | 2 | 3,
              0,
            ],
            megaSpritemapMode: true,
          });
          piece.position.set(
            (gx - 0.5) * stepX - (stepX - 1) * 0.5,
            0,
            (gz - 0.5) * stepZ - (stepZ - 1) * 0.5
          );
          ctx.holder.add(piece);
        }
      }
    } else {
      const group = buildBlockMeshGroup({
        def: previewDef,
        isSoftwareGl: ctx.isSoftwareGl,
        connectedMode: 'isolated',
        pixelsPerBlock: previewPixels,
        artStyle: previewArtStyle,
        megaSpritemapMode: true,
      });
      const cx = -((previewDef.width - 1) * 0.5);
      const cz = -((previewDef.depth - 1) * 0.5);
      group.position.set(cx, 0, cz);
      ctx.holder.add(group);
    }

    ctx.holder.rotation.y = 0.48;
    ctx.requestPreviewRender();
  }, [
    isOpen,
    name,
    shape,
    width,
    depth,
    heightPlates,
    color,
    texturePattern,
    materialFinish,
    hasStuds,
    voxels,
    previewCluster2x2,
    previewPixels,
    previewArtStyle,
  ]);

  if (!isOpen) return null;

  const handlePreviewWheel = (e: React.WheelEvent) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.deltaY < 0 ? 1 : -1;
    const step = resizeMode === 'snap' ? 1 : 0.25;
    setWidth((prev) =>
      Math.max(0.25, Math.min(6, Math.round((prev + dir * step) * 4) / 4))
    );
    setDepth((prev) =>
      Math.max(0.25, Math.min(6, Math.round((prev + dir * step) * 4) / 4))
    );
  };

  const toggleMicroVoxelAt = (x: number, y: number, z: number) => {
    const points: [number, number, number][] = [[x, y, z]];
    if (mirrorX) points.push([7 - x, y, z]);
    if (mirrorZ) points.push([x, y, 7 - z]);
    if (mirrorX && mirrorZ) points.push([7 - x, y, 7 - z]);

    setVoxels((prev) => {
      const map = new Map<string, MicroVoxel>();
      for (const v of prev) {
        map.set(`${v.x},${v.y},${v.z}`, v);
      }
      for (const [px, py, pz] of points) {
        const k = `${px},${py},${pz}`;
        if (voxelTool === 'erase') {
          map.delete(k);
        } else {
          map.set(k, { x: px, y: py, z: pz, color: voxelBrushColor });
        }
      }
      return Array.from(map.values());
    });
  };

  const fillCurrentLayer = () => {
    setVoxels((prev) => {
      const filtered = prev.filter((v) => v.y !== activeLayerY);
      for (let x = 0; x < 8; x++) {
        for (let z = 0; z < 8; z++) {
          filtered.push({ x, y: activeLayerY, z, color: voxelBrushColor });
        }
      }
      return filtered;
    });
  };

  const clearCurrentLayer = () => {
    setVoxels((prev) => prev.filter((v) => v.y !== activeLayerY));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savePending.current) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError('Please enter a name for your custom block.');
      return;
    }
    if (shape === 'micro_voxel' && voxels.length === 0) {
      setValidationError('Add at least one micro-voxel before saving.');
      return;
    }
    setValidationError(null);
    setSaveNotice(null);

    const slug = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 32);

    const newDef: CustomBlockDefinition = {
      id: `custom_${slug || 'brick'}_${Date.now().toString(36).slice(-4)}`,
      name: trimmed,
      shape,
      width: shape === 'micro_voxel' ? 1 : width,
      depth: shape === 'micro_voxel' ? 1 : depth,
      heightPlates:
        shape === 'plate' ? 1 : shape === 'micro_voxel' ? 3 : heightPlates,
      color,
      texturePattern,
      materialFinish,
      hasStuds: shape === 'tile' ? false : hasStuds,
      voxels: shape === 'micro_voxel' ? voxels.map(voxel => ({ ...voxel })) : undefined,
      isCustom: true,
    };

    const submission = { generation: saveGeneration.current, fingerprint: draftFingerprint };
    savePending.current = submission;
    setIsSaving(true);
    try {
      const saved = await onSaveCustomBlock(newDef, publishPublic, description);
      if (!isMounted.current || submission.generation !== saveGeneration.current) return;
      if (saved === true) {
        if (submission.fingerprint === currentDraftFingerprint.current) closeWorkshop();
        else setSaveNotice({ name: trimmed, fingerprint: submission.fingerprint });
      }
      else setValidationError('The block was not saved. Your design is still here. Check the project notice, then retry.');
    } catch (error) {
      if (isMounted.current && submission.generation === saveGeneration.current) setValidationError(error instanceof Error ? error.message : 'The block was not saved. Your design is still here; please retry.');
    } finally {
      if (savePending.current === submission) {
        savePending.current = null;
        if (isMounted.current) setIsSaving(false);
      }
    }
  };

  const rotateTurntable = (deltaRad: number) => {
    const ctx = previewSceneRef.current;
    if (!ctx) return;
    ctx.holder.rotation.y += deltaRad;
    ctx.requestPreviewRender();
  };

  return (
    <DraggableWindow
      windowId="block_workshop_window"
      isOpen={isOpen}
      onClose={closeWorkshop}
      title="Custom Block & Connected Mega-Spritemap Workshop"
      subtitle="Preview 2×2 connected spritemap seams, Shift+Scroll resize, or sculpt 8×8×8 micro-voxels"
      icon={<Sparkles className="w-4 h-4 text-amber-400" />}
      defaultWidth={1020}
      defaultHeight={700}
      minWidth={420}
      minHeight={360}
      zIndex={55}
    >
      <div className="w-full h-full bg-slate-900 overflow-y-auto">
        <form
          onSubmit={handleSave}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6"
        >
          {/* Left Column: 3D Live Preview & Block Identity (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div
              onWheel={handlePreviewWheel}
              title="Hold Shift + Scroll Mouse Wheel to resize block footprint live"
              className="relative rounded-xl bg-slate-950 border border-slate-800 overflow-hidden h-64"
            >
              <div ref={previewMountRef} className="w-full h-full" />

              {/* Top-left Spritemap Preview Mode Toggle */}
              <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => setPreviewCluster2x2((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border ${
                    previewCluster2x2
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-900/90 border-slate-700 text-slate-300'
                  }`}
                >
                  <Grid className="w-3 h-3" />
                  <span>
                    {previewCluster2x2
                      ? '2×2 Connected Spritemap View'
                      : 'Single Isolated Block View'}
                  </span>
                </button>

                <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-0.5">
                  {([16, 32, 64] as const).map((px) => (
                    <button
                      key={px}
                      type="button"
                      onClick={() => setPreviewPixels(px)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                        previewPixels === px
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {px}×
                    </button>
                  ))}
                </div>
              </div>

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <span className="text-xs font-mono text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded">
                  {shape === 'micro_voxel'
                    ? `8×8×8 Voxel (${voxels.length} voxels)`
                    : `${width}×${depth} W×D · ${(heightPlates / 3).toFixed(2)}H`}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => rotateTurntable(-0.4)}
                    className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md"
                  >
                    Rotate L
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateTurntable(0.4)}
                    className="px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md"
                  >
                    Rotate R
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Architectural Block Templates */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                Quick Connected Spritemap Templates
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setName('Castle Ashlar Wall 2×2');
                    setShape('brick');
                    setWidth(2);
                    setDepth(1);
                    setHeightPlates(6);
                    setTexturePattern('cobblestone');
                    setMaterialFinish('matte');
                    setColor('#7E8B9B');
                  }}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-left"
                >
                  <span className="font-semibold text-slate-200 block">
                    Castle Ashlar 2×2
                  </span>
                  <span className="text-slate-400">Voronoi Stone Wall</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setName('Hewn Timber Beam 3×1');
                    setShape('plate');
                    setWidth(3);
                    setDepth(1);
                    setHeightPlates(2);
                    setTexturePattern('oak_planks');
                    setMaterialFinish('matte');
                    setColor('#B87A3D');
                  }}
                  className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-left"
                >
                  <span className="font-semibold text-amber-300 block">
                    Hewn Timber Beam
                  </span>
                  <span className="text-slate-400">Continuous 3×1 Rafter</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="custom-block-name"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Custom Block Blueprint Name
                </label>
                <input
                  id="custom-block-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="e.g., Gilded Castle Slope 2x2"
                  className="w-full px-3.5 py-2 text-sm rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label
                  htmlFor="custom-block-desc"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Blueprint Notes
                </label>
                <input
                  id="custom-block-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe where this block is used..."
                  className="w-full px-3.5 py-2 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-amber-500"
                />
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={publishPublic}
                  onChange={(e) => setPublishPublic(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span>Also save to Blueprint Library & Community Gallery</span>
              </label>

              {validationError && (
                <p role="alert" className="text-xs font-medium text-rose-400">
                  {validationError}
                </p>
              )}
              {saveNotice && (
                <p role="status" className="text-xs font-medium text-emerald-300">
                  Saved the submitted version of “{saveNotice.name}”.{' '}
                  {saveNotice.fingerprint === draftFingerprint
                    ? 'Your current draft matches that saved version.'
                    : 'Newer edits are still unsaved; your current draft remains open.'}
                </p>
              )}
              {isSaving && (
                <p role="status" className="text-xs text-slate-300">
                  Saving the submitted version. You can keep editing; another save is available when this one finishes.
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Shape, Dimensions (Snap vs Free), Texture, Color, or Micro-Voxel Grid (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-4 max-h-[68vh] overflow-y-auto pr-1">
            {/* Shape Selector */}
            <div>
              <span className="block text-xs font-medium text-slate-300 mb-2">
                01. Base Geometry & Mode
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SHAPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setShape(opt.id);
                      if (opt.id === 'plate') setHeightPlates(1);
                      else if (heightPlates === 1) setHeightPlates(3);
                    }}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${
                      shape === opt.id
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold whitespace-nowrap truncate">
                      {opt.label}
                    </div>
                    <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                      {opt.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {shape !== 'micro_voxel' ? (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      Block Dimensions (or Hold Shift+Scroll on 3D Preview)
                    </span>
                  </span>
                  <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setResizeMode('snap');
                        setWidth((w) => Math.max(1, Math.round(w)));
                        setDepth((d) => Math.max(1, Math.round(d)));
                        setHeightPlates((h) => Math.max(1, Math.round(h)));
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        resizeMode === 'snap'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400'
                      }`}
                    >
                      Snap Grid
                    </button>
                    <button
                      type="button"
                      onClick={() => setResizeMode('free')}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        resizeMode === 'free'
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-400'
                      }`}
                    >
                      Free Fine (0.25)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="block-width-range"
                      className="flex justify-between text-xs text-slate-300 mb-1"
                    >
                      <span>Width (X)</span>
                      <span className="font-mono font-semibold text-amber-400">
                        {width} {width === 1 ? 'unit' : 'units'}
                      </span>
                    </label>
                    <input
                      id="block-width-range"
                      type="range"
                      min={resizeMode === 'free' ? 0.25 : 1}
                      max={6}
                      step={resizeMode === 'free' ? 0.25 : 1}
                      value={width}
                      onChange={(e) => setWidth(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="block-depth-range"
                      className="flex justify-between text-xs text-slate-300 mb-1"
                    >
                      <span>Depth (Z)</span>
                      <span className="font-mono font-semibold text-amber-400">
                        {depth} {depth === 1 ? 'unit' : 'units'}
                      </span>
                    </label>
                    <input
                      id="block-depth-range"
                      type="range"
                      min={resizeMode === 'free' ? 0.25 : 1}
                      max={6}
                      step={resizeMode === 'free' ? 0.25 : 1}
                      value={depth}
                      onChange={(e) => setDepth(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="block-height-range"
                      className="flex justify-between text-xs text-slate-300 mb-1"
                    >
                      <span>Height (Y)</span>
                      <span className="font-mono font-semibold text-amber-400">
                        {(heightPlates / 3).toFixed(2)} Brick
                      </span>
                    </label>
                    <input
                      id="block-height-range"
                      type="range"
                      min={resizeMode === 'free' ? 0.5 : 1}
                      max={12}
                      step={resizeMode === 'free' ? 0.25 : 1}
                      value={heightPlates}
                      onChange={(e) => setHeightPlates(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* 8x8x8 Micro-Voxel Sculpting Matrix */
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-200">
                      8×8×8 Sub-Grid Layer Y:
                    </span>
                    <div className="flex items-center gap-1">
                      {[0, 1, 2, 3, 4, 5, 6, 7].map((ly) => (
                        <button
                          key={ly}
                          type="button"
                          onClick={() => setActiveLayerY(ly)}
                          className={`w-7 h-7 rounded text-xs font-mono font-semibold ${
                            activeLayerY === ly
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {ly}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setVoxelTool('draw')}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${
                        voxelTool === 'draw'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      Draw
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoxelTool('erase')}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${
                        voxelTool === 'erase'
                          ? 'bg-rose-500 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      Erase
                    </button>
                    <button
                      type="button"
                      onClick={fillCurrentLayer}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      Fill Layer
                    </button>
                    <button
                      type="button"
                      onClick={clearCurrentLayer}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      Clear Layer
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="grid grid-cols-8 gap-1 p-2 bg-slate-900 rounded-lg border border-slate-800">
                    {Array.from({ length: 64 }).map((_, idx) => {
                      const vx = idx % 8;
                      const vz = Math.floor(idx / 8);
                      const existing = voxels.find(
                        (v) => v.x === vx && v.y === activeLayerY && v.z === vz
                      );
                      return (
                        <button
                          key={`${vx}-${vz}`}
                          type="button"
                          aria-label={`Voxel ${vx},${activeLayerY},${vz}`}
                          onClick={() => toggleMicroVoxelAt(vx, activeLayerY, vz)}
                          style={{
                            backgroundColor: existing
                              ? existing.color
                              : '#0f172a',
                          }}
                          className={`w-6 h-6 rounded-sm border transition-transform active:scale-90 ${
                            existing
                              ? 'border-white/40'
                              : 'border-slate-800 hover:border-slate-600'
                          }`}
                        />
                      );
                    })}
                  </div>

                  <div className="flex-1 space-y-2.5 text-xs">
                    <div className="font-medium text-slate-300">
                      Symmetry & Brush Color
                    </div>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mirrorX}
                        onChange={(e) => setMirrorX(e.target.checked)}
                      />
                      <span>Mirror X-Axis</span>
                    </label>
                    <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mirrorZ}
                        onChange={(e) => setMirrorZ(e.target.checked)}
                      />
                      <span>Mirror Z-Axis</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {LEGO_COLOR_SWATCHES.slice(0, 8).map((sw) => (
                        <button
                          key={sw.hex}
                          type="button"
                          onClick={() => setVoxelBrushColor(sw.hex)}
                          style={{ backgroundColor: sw.hex }}
                          aria-label={`Brush ${sw.name}`}
                          className={`w-6 h-6 rounded-md border ${
                            voxelBrushColor === sw.hex
                              ? 'border-white scale-110'
                              : 'border-transparent'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Surface Texture & PBR Material Finish */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-xs font-medium text-slate-300 mb-2">
                  02. Connected 4×4 Mega-Spritemap Pattern
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {TEXTURE_OPTIONS.map((tex) => (
                    <button
                      key={tex.id}
                      type="button"
                      onClick={() => setTexturePattern(tex.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium text-left border transition-colors whitespace-nowrap truncate ${
                        texturePattern === tex.id
                          ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {tex.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-300 mb-2">
                  03. Material Finish (PBR)
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {FINISH_OPTIONS.map((fin) => (
                    <button
                      key={fin.id}
                      type="button"
                      onClick={() => setMaterialFinish(fin.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium text-left border transition-colors whitespace-nowrap truncate ${
                        materialFinish === fin.id
                          ? 'bg-amber-500/15 border-amber-400 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {fin.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Color Swatches & Custom Color */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-300">
                  04. Block Color Palette
                </span>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Custom Hex:</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => {
                      setColor(e.target.value);
                      setVoxelBrushColor(e.target.value);
                    }}
                    className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                  />
                  <span className="font-mono">{color.toUpperCase()}</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {LEGO_COLOR_SWATCHES.map((sw) => (
                  <button
                    key={sw.hex}
                    type="button"
                    onClick={() => {
                      setColor(sw.hex);
                      setVoxelBrushColor(sw.hex);
                    }}
                    title={sw.name}
                    aria-label={`Color ${sw.name}`}
                    style={{ backgroundColor: sw.hex }}
                    className={`w-8 h-8 rounded-lg border transition-transform ${
                      color.toLowerCase() === sw.hex.toLowerCase()
                        ? 'border-white scale-110 ring-2 ring-amber-400'
                        : 'border-slate-700 hover:scale-105'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={closeWorkshop}
                className="px-4 py-2.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                aria-busy={isSaving}
                className="px-5 py-2.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Saving block…' : 'Save Custom Block Blueprint'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </DraggableWindow>
  );
};
