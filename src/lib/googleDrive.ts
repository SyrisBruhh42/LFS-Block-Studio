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
  const cleanTitle = (backup.worldName || 'Skyblock_Project')
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
  if (!parsed || typeof parsed.blocks !== 'object') {
    throw new Error('Selected Google Drive file is not a valid BrickForge backup.');
  }
  return parsed as BrickForgeProjectBackup;
}
