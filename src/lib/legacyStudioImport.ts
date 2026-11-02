import type { StudioDocument, DocumentResult } from './studioDocument';
import { createStudioId, STUDIO_DOCUMENT_LIMITS, validateStudioDocument } from './studioDocument';
import type { CustomBlockDefinition } from '../engine/types';

/** Conversion is a candidate only. The caller must preserve original bytes before activation. */
export function importStudioCandidate(raw: string, defaults: StudioDocument): DocumentResult<StudioDocument> {
  if (typeof raw !== 'string' || raw.length > STUDIO_DOCUMENT_LIMITS.maxBytes || new TextEncoder().encode(raw).byteLength > STUDIO_DOCUMENT_LIMITS.maxBytes) {
    return { ok: false, error: { code: 'size-limit', message: 'Project file exceeds the supported size. The original has not been changed.', issues: [] } };
  }
  let data: any;
  try { data = JSON.parse(raw); } catch {
    return { ok: false, error: { code: 'invalid-document', message: 'The project is not complete JSON. Keep the original file for recovery.', issues: [] } };
  }
  if (data?.format === 'lfs-studio-project') return validateStudioDocument(data);
  const invalid = (message: string): DocumentResult<StudioDocument> => ({ ok: false, error: { code: 'invalid-document', message, issues: [] } });
  if (!data || typeof data !== 'object' || Array.isArray(data)) return invalid('Expected a project object.');
  // The complete document is authoritative inside a compatible backup envelope.
  // An invalid inner document must never silently fall back to the lossy legacy fields.
  if (Object.hasOwn(data, 'completeDocument')) return validateStudioDocument(data.completeDocument);
  if ('format' in data || 'schemaVersion' in data || ('version' in data && data.version !== '1.0')) {
    return { ok: false, error: { code: 'unsupported-schema', message: 'This project version is not supported. It has not been converted or overwritten.', issues: [] } };
  }
  if (!data.blocks || typeof data.blocks !== 'object' || Array.isArray(data.blocks)) return invalid('Project blocks must be a coordinate map.');
  if (data.customBlocks !== undefined && !Array.isArray(data.customBlocks)) return invalid('Legacy project definitions must be a list.');
  if (data.blueprints !== undefined && !Array.isArray(data.blueprints)) return invalid('Legacy project blueprints must be a list.');
  const checkedDefaults = validateStudioDocument(defaults);
  if (!checkedDefaults.ok) return checkedDefaults;
  const baseline = checkedDefaults.value;
  const definitions: Record<string, CustomBlockDefinition> = { ...baseline.customBlocks };
  const definitionIds = new Set<string>();
  for (const def of data.customBlocks || []) {
    if (!def || typeof def.id !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(def.id)) return invalid('Invalid block definition identifier.');
    if (definitionIds.has(def.id)) return invalid(`Duplicate block definition identifier: ${def.id}. Keep the original for explicit recovery.`);
    definitionIds.add(def.id);
    definitions[def.id] = def;
  }
  const present = (key: string, fallback: unknown) => Object.hasOwn(data, key) ? data[key] : fallback;
  return validateStudioDocument({
    format: 'lfs-studio-project', schemaVersion: 1,
    documentId: createStudioId(),
    revision: 0,
    historyEpoch: createStudioId('history'),
    savedAt: present('savedAt', present('updatedAt', baseline.savedAt)),
    world: {
      worldId: present('worldId', createStudioId('world')),
      worldName: present('worldName', present('name', 'Imported project')),
      roomCode: present('roomCode', ''),
      // This is retained metadata, never authorization to initiate sharing.
      isPublicWorld: present('isPublicWorld', false),
      ...(data.description === undefined ? {} : { description: data.description }),
    },
    blocks: data.blocks,
    customBlocks: definitions,
    blueprints: present('blueprints', baseline.blueprints),
    chunkConfig: present('chunkConfig', baseline.chunkConfig),
    patternConfig: present('patternConfig', baseline.patternConfig),
    lightingConfig: present('lightingConfig', baseline.lightingConfig),
    // Do not inherit an unrelated target/profile from the current project's defaults.
    ...(Object.hasOwn(data, 'extensions') ? { extensions: data.extensions } : {}),
  });
}

/** Compare authored content, excluding save identity and timestamps. Never use timestamps to resolve conflicts. */
export function studioContentKey(document: StudioDocument): string {
  const { format, schemaVersion, documentId, revision, historyEpoch, savedAt, ...content } = document;
  return JSON.stringify(content);
}

export function downloadStudioJson(value: unknown, filename: string): void {
  // Compact project JSON stays inside the same byte allowance used for loading.
  // Pretty-printing can make an otherwise admitted near-limit backup unopenable.
  // Preserved source strings remain byte-for-byte text, including whitespace.
  const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
