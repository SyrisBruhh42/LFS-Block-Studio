import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  CloudWorldSummary,
  signInWithGoogle,
  signOutUser,
} from '../lib/firebase';
import { CollaboratorPresence } from '../engine/types';
import { Cloud, Globe, LogIn, LogOut, Radio, Share2, Users, X } from 'lucide-react';
import { DraggableWindow } from './DraggableWindow';

interface CloudMultiplayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  worldId: string;
  worldName: string;
  roomCode: string;
  isPublicWorld: boolean;
  isLiveConnected: boolean;
  collaborators: CollaboratorPresence[];
  cloudWorlds: CloudWorldSummary[];
  onUpdateWorldMeta: (name: string, roomCode: string, isPublic: boolean) => void;
  onSaveCurrentWorldToCloud: () => Promise<void>;
  onJoinCloudWorld: (world: CloudWorldSummary) => void;
  onRefreshCloudWorlds: () => Promise<void>;
}

export const CloudMultiplayerModal: React.FC<CloudMultiplayerModalProps> = ({
  isOpen,
  onClose,
  user,
  worldId,
  worldName,
  roomCode,
  isPublicWorld,
  isLiveConnected,
  collaborators,
  cloudWorlds,
  onUpdateWorldMeta,
  onSaveCurrentWorldToCloud,
  onJoinCloudWorld,
  onRefreshCloudWorlds,
}) => {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      await signInWithGoogle();
      await onRefreshCloudWorlds();
      setStatusMessage('Signed in with Google. Cloud sync enabled.');
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : 'Google Sign-In was cancelled or blocked.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveCloud = async () => {
    setIsBusy(true);
    setStatusMessage(null);
    try {
      await onSaveCurrentWorldToCloud();
      setStatusMessage('Skyblock world synced to Google Firebase Cloud!');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Failed to save world.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <DraggableWindow
      windowId="cloud_multiplayer_window"
      isOpen={isOpen}
      onClose={onClose}
      title="Firebase Cloud Worlds & Live Co-Building"
      subtitle="Persist your Skyblock worlds to Firestore and co-build in real time on shared islands"
      icon={<Cloud className="w-4 h-4 text-cyan-400" />}
      defaultWidth={780}
      defaultHeight={620}
      minWidth={380}
      minHeight={320}
      zIndex={55}
    >
      <div className="w-full h-full flex flex-col bg-slate-900 overflow-hidden">
        <div className="p-6 space-y-6 flex-1 min-h-0 overflow-y-auto">
          {/* Account Section */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div className="text-xs font-medium text-slate-400">
                Google Firebase Authentication
              </div>
              {user ? (
                <div className="text-sm font-semibold text-slate-100 mt-0.5">
                  {user.displayName || user.email} ·{' '}
                  <span className="text-emerald-400 font-mono text-xs">Connected</span>
                </div>
              ) : (
                <div className="text-sm font-medium text-slate-300 mt-0.5">
                  Guest Local Session · Sign in to save cloud worlds & co-build live
                </div>
              )}
            </div>

            {user ? (
              <button
                type="button"
                onClick={() => signOutUser()}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isBusy}
                onClick={handleGoogleSignIn}
                className="px-4 py-2.5 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign in with Google</span>
              </button>
            )}
          </div>

          {statusMessage && (
            <div className="px-4 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-amber-300">
              {statusMessage}
            </div>
          )}

          {/* Current World Cloud Settings */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Active Skyblock Session Configuration
              </h3>
              <span className="text-xs font-mono text-slate-400">
                ID: {worldId} · {isLiveConnected ? 'Live Sync Active' : 'Local Mode'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="cloud-world-name"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Skyblock World Name
                </label>
                <input
                  id="cloud-world-name"
                  type="text"
                  value={worldName}
                  onChange={(e) =>
                    onUpdateWorldMeta(e.target.value, roomCode, isPublicWorld)
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="cloud-room-code"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Multiplayer Room Code
                </label>
                <input
                  id="cloud-room-code"
                  type="text"
                  value={roomCode}
                  onChange={(e) =>
                    onUpdateWorldMeta(worldName, e.target.value, isPublicWorld)
                  }
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPublicWorld}
                  onChange={(e) =>
                    onUpdateWorldMeta(worldName, roomCode, e.target.checked)
                  }
                />
                <span>Allow multiplayer co-building via Room Code</span>
              </label>

              <button
                type="button"
                disabled={!user || isBusy}
                onClick={handleSaveCloud}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 flex items-center gap-1.5"
              >
                <Cloud className="w-4 h-4" />
                <span>Save & Sync World to Cloud</span>
              </button>
            </div>

            {collaborators.length > 0 && (
              <div className="pt-2 border-t border-slate-900 text-xs text-slate-300">
                Active Co-Builders ({collaborators.length}):{' '}
                {collaborators
                  .map(
                    (c) =>
                      `${c.userName} (${c.cursorX},${c.cursorY},${c.cursorZ})`
                  )
                  .join(' · ')}
              </div>
            )}
          </div>

          {/* Cloud Worlds Browser */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Cloud Skyblock Worlds & Shared Rooms ({cloudWorlds.length})
              </h3>
              <button
                type="button"
                onClick={onRefreshCloudWorlds}
                className="text-xs text-cyan-400 hover:text-cyan-300"
              >
                Refresh List
              </button>
            </div>

            {cloudWorlds.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400">
                No cloud worlds found yet. Sign in and click "Save & Sync World to Cloud" to publish your first Skyblock island.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cloudWorlds.map((w) => (
                  <div
                    key={w.id}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-100">{w.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Room {w.roomCode} · {w.blockCount} blocks · by {w.ownerName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onJoinCloudWorld(w);
                        onClose();
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 transition-colors whitespace-nowrap shrink-0"
                    >
                      Join / Load
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DraggableWindow>
  );
};
