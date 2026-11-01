import {
  BlueprintPrefab,
  CustomBlockDefinition,
  PlacedBlock,
} from '../engine/types';
import { HotkeyConfig } from '../engine/hotkeys';

export interface BrickForgeProjectBackup {
  version: '1.0';
  savedAt: string;
  worldId: string;
  worldName: string;
  roomCode: string;
  isPublicWorld: boolean;
  blockCount: number;
  blocks: Record<string, PlacedBlock>;
  customBlocks: CustomBlockDefinition[];
  blueprints: BlueprintPrefab[];
  hotkeys?: HotkeyConfig;
}

export interface DriveBackupFileSummary {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
  description?: string;
}

export interface LocalAutosaveSnapshot {
  id: string;
  savedAt: string;
  worldName: string;
  blockCount: number;
  trigger: 'auto' | 'manual';
  backup: BrickForgeProjectBackup;
}

const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

export function buildProjectBackupPayload(params: {
  worldId: string;
  worldName: string;
  roomCode: string;
  isPublicWorld: boolean;
  blocks: Record<string, PlacedBlock>;
  customBlocks: Record<string, CustomBlockDefinition>;
  blueprints: BlueprintPrefab[];
  hotkeys: HotkeyConfig;
}): BrickForgeProjectBackup {
  const customList = Object.values(params.customBlocks).filter((d) => d.isCustom);
  const userBlueprints = params.blueprints.filter((b) => b.authorId !== 'system');
  return {
    version: '1.0',
    savedAt: new Date().toISOString(),
    worldId: params.worldId,
    worldName: params.worldName,
    roomCode: params.roomCode,
    isPublicWorld: params.isPublicWorld,
    blockCount: Object.keys(params.blocks).length,
    blocks: params.blocks,
    customBlocks: customList,
    blueprints: userBlueprints,
    hotkeys: params.hotkeys,
  };
}

export async function listDriveBackups(
  accessToken: string
): Promise<DriveBackupFileSummary[]> {
  const q = encodeURIComponent(
    "trashed = false and name contains '.brickforge.json'"
  );
  const fields = encodeURIComponent(
    'files(id,name,modifiedTime,size,description)'
  );
  const url = `${DRIVE_FILES_ENDPOINT}?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=25`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive list error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

export async function createDriveBackupFile(
  accessToken: string,
  backup: BrickForgeProjectBackup,
  customFileName?: string
): Promise<DriveBackupFileSummary> {
  const cleanTitle = (backup.worldName || 'Studio_Project')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 48);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName =
    customFileName || `${cleanTitle}_${stamp}.brickforge.json`;

  const metadata = {
    name: fileName.endsWith('.brickforge.json')
      ? fileName
      : `${fileName}.brickforge.json`,
    mimeType: 'application/json',
    description: `BrickForge Studio Backup · ${backup.worldName} (${backup.blockCount} blocks)`,
  };

  const boundary = '-------brickforge_drive_multipart_boundary';
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(backup, null, 2)}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    `${DRIVE_UPLOAD_ENDPOINT}&fields=id,name,modifiedTime,size,description`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive upload error (${res.status}): ${errText}`);
  }

  return await res.json();
}

export async function updateDriveBackupFile(
  accessToken: string,
  fileId: string,
  backup: BrickForgeProjectBackup,
  fileName: string
): Promise<DriveBackupFileSummary> {
  const metadata = {
    name: fileName.endsWith('.brickforge.json')
      ? fileName
      : `${fileName}.brickforge.json`,
    mimeType: 'application/json',
    description: `BrickForge Studio Backup · ${backup.worldName} (${backup.blockCount} blocks) · Updated ${new Date().toLocaleTimeString()}`,
  };

  const boundary = '-------brickforge_drive_update_boundary';
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(backup, null, 2)}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      fileId
    )}?uploadType=multipart&fields=id,name,modifiedTime,size,description`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive update error (${res.status}): ${errText}`);
  }

  return await res.json();
}

export async function deleteDriveBackupFile(
  accessToken: string,
  fileId: string
): Promise<void> {
  const res = await fetch(
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive delete error (${res.status}): ${errText}`);
  }
}

export interface ImportedWorldValidationResult {
  valid: boolean;
  errors: string[];
  sanitizedBlocks: Record<string, PlacedBlock>;
  sanitizedCustomBlocks: CustomBlockDefinition[];
}

const VALID_ROTATIONS = new Set([0, 90, 180, 270]);
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Pure schema & security validator for imported studio projects (.lfsproj.json)
 * and Google Drive backups (.brickforge.json).
 * Rejects prototype-pollution keys, arrays as block maps, null blocks, non-finite coordinates,
 * key/position coordinate mismatches, invalid rotations, and orphaned blockDefIds.
 */
export function validateImportedWorldPayload(
  raw: unknown,
  knownRegistryIds?: Set<string>
): ImportedWorldValidationResult {
  const errors: string[] = [];
  const sanitizedBlocks: Record<string, PlacedBlock> = {};
  const sanitizedCustomBlocks: CustomBlockDefinition[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      errors: ['Root payload must be a non-null JSON object (not an array).'],
      sanitizedBlocks,
      sanitizedCustomBlocks,
    };
  }

  const obj = raw as Record<string, unknown>;

  // Detect explicit __proto__ / constructor own properties
  for (const k of Object.getOwnPropertyNames(obj)) {
    if (FORBIDDEN_PROTO_KEYS.has(k)) {
      errors.push(`Forbidden prototype-pollution key "${k}" at root object.`);
    }
  }

  const rawBlocks = obj.blocks;
  if (!rawBlocks || typeof rawBlocks !== 'object' || Array.isArray(rawBlocks)) {
    return {
      valid: false,
      errors: [
        ...errors,
        'Payload "blocks" property must be a non-null coordinate-keyed object.',
      ],
      sanitizedBlocks,
      sanitizedCustomBlocks,
    };
  }

  // Validate customBlocks array if present
  const allowedDefIds = new Set<string>(
    knownRegistryIds ? Array.from(knownRegistryIds) : []
  );

  if (obj.customBlocks !== undefined) {
    const customList = Array.isArray(obj.customBlocks)
      ? obj.customBlocks
      : obj.customBlocks && typeof obj.customBlocks === 'object'
        ? Object.values(obj.customBlocks as Record<string, unknown>)
        : null;
    if (!customList) {
      errors.push('Property "customBlocks" must be an array or object map when provided.');
    } else {
      for (let i = 0; i < customList.length; i++) {
        const cb = customList[i] as Record<string, unknown> | null;
        if (!cb || typeof cb !== 'object' || Array.isArray(cb)) {
          errors.push(`customBlocks[${i}] is not a valid object.`);
          continue;
        }
        if (typeof cb.id !== 'string' || !cb.id.trim() || FORBIDDEN_PROTO_KEYS.has(cb.id)) {
          errors.push(`customBlocks[${i}] has an invalid or forbidden id.`);
          continue;
        }
        allowedDefIds.add(cb.id);
        sanitizedCustomBlocks.push(cb as unknown as CustomBlockDefinition);
      }
    }
  }

  const blockMap = rawBlocks as Record<string, unknown>;
  for (const propName of Object.getOwnPropertyNames(blockMap)) {
    if (FORBIDDEN_PROTO_KEYS.has(propName)) {
      errors.push(`Forbidden prototype-pollution key "${propName}" in blocks map.`);
      continue;
    }

    const entry = blockMap[propName];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`Block at key "${propName}" is null or not an object.`);
      continue;
    }

    const blk = entry as Record<string, unknown>;
    for (const bk of Object.getOwnPropertyNames(blk)) {
      if (FORBIDDEN_PROTO_KEYS.has(bk)) {
        errors.push(`Forbidden prototype-pollution key "${bk}" inside block "${propName}".`);
      }
    }

    const pos = blk.position as Record<string, unknown> | undefined;
    if (
      !pos ||
      typeof pos !== 'object' ||
      typeof pos.x !== 'number' ||
      typeof pos.y !== 'number' ||
      typeof pos.z !== 'number' ||
      !Number.isFinite(pos.x) ||
      !Number.isFinite(pos.y) ||
      !Number.isFinite(pos.z) ||
      Math.abs(pos.x) > 2048 ||
      Math.abs(pos.y) > 2048 ||
      Math.abs(pos.z) > 2048
    ) {
      errors.push(
        `Block at key "${propName}" has missing, non-finite, or out-of-bounds position coordinates.`
      );
      continue;
    }

    const rx = Math.round(pos.x);
    const ry = Math.round(pos.y);
    const rz = Math.round(pos.z);
    const expectedKey = `${rx},${ry},${rz}`;
    if (propName !== expectedKey) {
      errors.push(
        `Coordinate key mismatch: map key "${propName}" does not match block.position "${expectedKey}".`
      );
      continue;
    }

    const rot = blk.rotation;
    if (typeof rot !== 'number' || !VALID_ROTATIONS.has(rot)) {
      errors.push(
        `Block at "${propName}" has invalid rotation "${String(rot)}" (must be 0, 90, 180, or 270).`
      );
      continue;
    }

    const defId = blk.blockDefId;
    if (typeof defId !== 'string' || !defId.trim() || FORBIDDEN_PROTO_KEYS.has(defId)) {
      errors.push(`Block at "${propName}" has missing or invalid blockDefId.`);
      continue;
    }

    if (allowedDefIds.size > 0 && !allowedDefIds.has(defId)) {
      errors.push(
        `Block at "${propName}" references orphaned/unknown blockDefId "${defId}".`
      );
      continue;
    }

    sanitizedBlocks[expectedKey] = {
      ...(blk as unknown as PlacedBlock),
      id: typeof blk.id === 'string' && blk.id ? blk.id : `blk_${rx}_${ry}_${rz}`,
      blockDefId: defId,
      position: { x: rx, y: ry, z: rz },
      rotation: rot as 0 | 90 | 180 | 270,
    };
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitizedBlocks,
    sanitizedCustomBlocks,
  };
}

export async function downloadDriveBackupFile(
  accessToken: string,
  fileId: string
): Promise<BrickForgeProjectBackup> {
  const res = await fetch(
    `${DRIVE_FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Drive download error (${res.status}): ${errText}`);
  }

  const parsed = await res.json();
  const validation = validateImportedWorldPayload(parsed);
  if (!validation.valid) {
    throw new Error(
      `Selected Google Drive file failed schema validation: ${validation.errors[0]}`
    );
  }
  return {
    ...(parsed as BrickForgeProjectBackup),
    blocks: validation.sanitizedBlocks,
    customBlocks: validation.sanitizedCustomBlocks,
  };
}
