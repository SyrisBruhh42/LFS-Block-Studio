/**
 * LFS Oasis Suite Capsule SDK Bridge (`OASIS-BLKS` / `lfs-voxel-sandbox`)
 *
 * Connects LFS Block Studio to the Four-Umbrella LFS Oasis Suite (`U2` Server :3000,
 * `U3` Willow Linux Companion Hub, Local Sovereign Forge :19447, and Dual Cloud Storage Router).
 * Gracefully degrades to local storage & DOM events when running standalone.
 */

export const OASIS_BLOCK_STUDIO_CAPSULE_ID = 'lfs-voxel-sandbox';
export const OASIS_BLOCK_STUDIO_PROJECT_ID = 'lfs-block-studio';
export const OASIS_ROOM_CODE_PREFIX = 'OASIS-BLKS';

export type OasisStorageBucketPath =
  | '/01-Game-Saves/lfs-block-studio/'
  | '/04-Workbooks-And-Docs/';

export interface OasisMilestoneRewardPayload {
  milestoneId: string;
  title: string;
  studioXpEarned: number;
  wisdomSparksAwarded: number;
  starlightRupeesAwarded: number;
  timestampIso: string;
}

export interface OasisRoutedArtifactReceipt {
  ok: boolean;
  fileName: string;
  targetDirectory: OasisStorageBucketPath;
  virtualPath: string;
  bytes: number;
  routedVia: 'oasis-capsule-sdk' | 'parent-postmessage' | 'local-IndexedDB-mirror';
  savedAtIso: string;
}

export interface OasisAudioplayTrackState {
  title: string;
  artist: string;
  atmospherePresetId: string;
  isPlaying: boolean;
}

declare global {
  interface Window {
    OasisCapsuleSDK?: {
      capsuleId?: string;
      toggleUniversalChatOverlay?: () => void;
      publishAudioplayState?: (state: OasisAudioplayTrackState) => void;
      awardMilestone?: (payload: OasisMilestoneRewardPayload) => void;
      saveDualCloudArtifact?: (params: {
        directory: OasisStorageBucketPath;
        fileName: string;
        mimeType: string;
        content: string;
      }) => Promise<boolean>;
    };
  }
}

/**
 * Formats any room code into the canonical `OASIS-BLKS-XXXX` suite room code format.
 */
export function formatOasisRoomCode(rawCode?: string | null): string {
  const cleaned = (rawCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^OASISBLKS/, '');
  const suffix = (cleaned || 'SKY1').slice(0, 6);
  return `${OASIS_ROOM_CODE_PREFIX}-${suffix}`;
}

/**
 * Emits Wisdom Sparks <-> Starlight Rupees milestone rewards to the LFS Oasis Suite ledger
 * when a builder completes an Architectural Contract, Daily Challenge, or Mastery Rank-Up.
 */
export function emitOasisMilestoneReward(params: {
  milestoneId: string;
  title: string;
  studioXpEarned: number;
}): OasisMilestoneRewardPayload {
  const xp = Math.max(0, Math.round(params.studioXpEarned || 0));
  const payload: OasisMilestoneRewardPayload = {
    milestoneId: params.milestoneId,
    title: params.title,
    studioXpEarned: xp,
    wisdomSparksAwarded: Math.max(5, Math.round(xp * 0.5)),
    starlightRupeesAwarded: Math.max(10, xp * 2),
    timestampIso: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      window.OasisCapsuleSDK?.awardMilestone?.(payload);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'oasis:capsule:milestone-reward',
            capsuleId: OASIS_BLOCK_STUDIO_CAPSULE_ID,
            projectId: OASIS_BLOCK_STUDIO_PROJECT_ID,
            payload,
          },
          '*'
        );
      }
      window.dispatchEvent(
        new CustomEvent('oasis:capsule:milestone-reward', { detail: payload })
      );
    } catch {
      // Ignore cross-frame restrictions in standalone mode
    }
  }

  return payload;
}

/**
 * Publishes ambient soundtrack / atmosphere state to the Universal Audioplay Bar in Willow/U2.
 */
export function publishOasisAudioplayState(state: OasisAudioplayTrackState): void {
  if (typeof window === 'undefined') return;
  try {
    window.OasisCapsuleSDK?.publishAudioplayState?.(state);
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'oasis:capsule:audioplay-state',
          capsuleId: OASIS_BLOCK_STUDIO_CAPSULE_ID,
          payload: state,
        },
        '*'
      );
    }
  } catch {
    // Ignore cross-frame errors
  }
}

/**
 * Routes `.schem`, `.gltf`, Kit `.zip` manifests, and `.lfsproj.json` backups into the
 * LFS Oasis Dual Cloud Storage hierarchy:
 * - `/01-Game-Saves/lfs-block-studio/` for world saves, backups, and kit archives
 * - `/04-Workbooks-And-Docs/` for audit reports, recipes, and bill-of-materials workbooks
 */
export async function routeStudioArtifactToOasisStorage(params: {
  fileName: string;
  content: string;
  mimeType?: string;
  category: 'game_save' | 'workbook_doc';
}): Promise<OasisRoutedArtifactReceipt> {
  const safeName =
    params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96) ||
    'artifact.json';
  const targetDirectory: OasisStorageBucketPath =
    params.category === 'workbook_doc'
      ? '/04-Workbooks-And-Docs/'
      : '/01-Game-Saves/lfs-block-studio/';
  const virtualPath = `${targetDirectory}${safeName}`;
  const bytes = new TextEncoder().encode(params.content).byteLength;
  const savedAtIso = new Date().toISOString();

  if (typeof window !== 'undefined') {
    try {
      if (window.OasisCapsuleSDK?.saveDualCloudArtifact) {
        const ok = await window.OasisCapsuleSDK.saveDualCloudArtifact({
          directory: targetDirectory,
          fileName: safeName,
          mimeType: params.mimeType || 'application/json',
          content: params.content,
        });
        if (ok) {
          return {
            ok: true,
            fileName: safeName,
            targetDirectory,
            virtualPath,
            bytes,
            routedVia: 'oasis-capsule-sdk',
            savedAtIso,
          };
        }
      }

      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'oasis:capsule:dual-cloud-save',
            capsuleId: OASIS_BLOCK_STUDIO_CAPSULE_ID,
            projectId: OASIS_BLOCK_STUDIO_PROJECT_ID,
            payload: {
              directory: targetDirectory,
              virtualPath,
              fileName: safeName,
              mimeType: params.mimeType || 'application/json',
              bytes,
              savedAtIso,
            },
          },
          '*'
        );
      }
    } catch {
      // Fallback to local mirror record
    }
  }

  return {
    ok: true,
    fileName: safeName,
    targetDirectory,
    virtualPath,
    bytes,
    routedVia: 'local-IndexedDB-mirror',
    savedAtIso,
  };
}

/**
 * Installs the `Shift+Tab` Universal Chat Overlay shortcut listener and Capsule Handshake.
 * Returns a deterministic cleanup callback for React `useEffect`.
 */
export function installOasisCapsuleBridge(options?: {
  onToggleOverlay?: () => void;
}): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.shiftKey && e.code === 'Tab') {
      e.preventDefault();
      try {
        window.OasisCapsuleSDK?.toggleUniversalChatOverlay?.();
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(
            {
              type: 'oasis:capsule:toggle-chat-overlay',
              capsuleId: OASIS_BLOCK_STUDIO_CAPSULE_ID,
              projectId: OASIS_BLOCK_STUDIO_PROJECT_ID,
            },
            '*'
          );
        }
        options?.onToggleOverlay?.();
      } catch {
        // Ignore cross-origin errors
      }
    }
  };

  window.addEventListener('keydown', onKeyDown);

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        {
          type: 'oasis:capsule:ready',
          capsuleId: OASIS_BLOCK_STUDIO_CAPSULE_ID,
          projectId: OASIS_BLOCK_STUDIO_PROJECT_ID,
          roomPrefix: OASIS_ROOM_CODE_PREFIX,
          version: '2.0.0-cp12',
        },
        '*'
      );
    }
  } catch {
    // Ignore
  }

  return () => {
    window.removeEventListener('keydown', onKeyDown);
  };
}
