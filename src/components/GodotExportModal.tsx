import React, { useState } from 'react';
import { CustomBlockDefinition, PlacedBlock } from '../engine/types';
import {
  exportSceneToGltfJson,
  generateGodotGdScript,
  generateGodotTscn,
  triggerFileDownload,
} from '../engine/godotExporter';
import { Code, Download, FileCode, Package, X } from 'lucide-react';

interface GodotExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  worldName: string;
  blocks: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
}

export const GodotExportModal: React.FC<GodotExportModalProps> = ({
  isOpen,
  onClose,
  worldName,
  blocks,
  customBlocks,
}) => {
  const [previewFormat, setPreviewFormat] = useState<'tscn' | 'gdscript'>('tscn');
  const [isExportingGltf, setIsExportingGltf] = useState(false);

  if (!isOpen) return null;

  const safeSlug =
    worldName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'brickforge_skyblock';

  const tscnContent = generateGodotTscn(worldName, blocks, customBlocks);
  const gdScriptContent = generateGodotGdScript(worldName, blocks, customBlocks);

  const handleDownloadGltf = async () => {
    setIsExportingGltf(true);
    try {
      const gltfJson = await exportSceneToGltfJson(blocks, customBlocks);
      triggerFileDownload(`${safeSlug}.gltf`, gltfJson, 'model/gltf+json');
    } finally {
      setIsExportingGltf(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Godot 4 and GLTF Exporter"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 overflow-y-auto"
    >
      <div className="w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              Godot 4 & Standard 3D GLTF Export Pipeline
            </h2>
            <p className="text-xs text-slate-400">
              Export your Skyblock island and custom blocks directly into Godot 4 (.tscn / .gd) or standard 3D software (.gltf)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Godot Exporter"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() =>
                triggerFileDownload(`${safeSlug}.tscn`, tscnContent, 'text/plain')
              }
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500 text-left transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400">
                  Godot 4 Scene (.tscn)
                </span>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-amber-400" />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Ready-to-open PackedScene with StandardMaterial3D & MeshInstance3D nodes
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                triggerFileDownload(`${safeSlug}.gd`, gdScriptContent, 'text/plain')
              }
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-cyan-400 text-left transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400">
                  Godot 4 GDScript (.gd)
                </span>
                <FileCode className="w-4 h-4 text-slate-400 group-hover:text-cyan-400" />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                @tool Node3D script that procedurally spawns your grid blocks in Godot
              </p>
            </button>

            <button
              type="button"
              disabled={isExportingGltf}
              onClick={handleDownloadGltf}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-400 text-left transition-colors group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400">
                  {isExportingGltf ? 'Building GLTF...' : '3D Model (.gltf)'}
                </span>
                <Package className="w-4 h-4 text-slate-400 group-hover:text-emerald-400" />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Full Three.js Lego stud meshes exported via GLTFExporter
              </p>
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewFormat('tscn')}
                  className={`px-3 py-1 text-xs font-medium rounded-md ${
                    previewFormat === 'tscn'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Preview .tscn
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFormat('gdscript')}
                  className={`px-3 py-1 text-xs font-medium rounded-md ${
                    previewFormat === 'gdscript'
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  Preview .gd Script
                </button>
              </div>
              <span className="text-xs font-mono text-slate-400">
                {Object.keys(blocks).length} placed blocks exported
              </span>
            </div>

            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 max-h-64 overflow-y-auto">
              {previewFormat === 'tscn' ? tscnContent : gdScriptContent}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
