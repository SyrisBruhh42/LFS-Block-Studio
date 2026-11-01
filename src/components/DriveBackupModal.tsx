import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  BrickForgeProjectBackup,
  DriveBackupFileSummary,
  LocalAutosaveSnapshot,
  createDriveBackupFile,
  deleteDriveBackupFile,
  downloadDriveBackupFile,
  listDriveBackups,
  updateDriveBackupFile,
} from '../lib/googleDrive';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudUpload,
  Download,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { DraggableWindow } from './DraggableWindow';

interface DriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  driveAccessToken: string | null;
  needsDriveAuth: boolean;
  onConnectGoogleDrive: () => Promise<string | null>;
  autosaveEnabled: boolean;
  onToggleAutosave: (enabled: boolean) => void;
  autosaveIntervalSec: number;
  onChangeAutosaveInterval: (sec: number) => void;
  autoDriveBackupEnabled: boolean;
  onToggleAutoDriveBackup: (enabled: boolean) => void;
  lastAutosaveTime: string | null;
  lastDriveSyncTime: string | null;
  localSnapshots: LocalAutosaveSnapshot[];
  onTriggerManualSaveNow: () => void;
  onBuildCurrentBackupPayload: () => BrickForgeProjectBackup;
  onRestoreFromBackup: (backup: BrickForgeProjectBackup, sourceLabel: string) => void;
  onDriveSynced: (timestampIso: string) => void;
}

export const DriveBackupModal: React.FC<DriveBackupModalProps> = ({
  isOpen,
  onClose,
  user,
  driveAccessToken,
  needsDriveAuth,
  onConnectGoogleDrive,
  autosaveEnabled,
  onToggleAutosave,
  autosaveIntervalSec,
  onChangeAutosaveInterval,
  autoDriveBackupEnabled,
  onToggleAutoDriveBackup,
  lastAutosaveTime,
  lastDriveSyncTime,
  localSnapshots,
  onTriggerManualSaveNow,
  onBuildCurrentBackupPayload,
  onRestoreFromBackup,
  onDriveSynced,
}) => {
  const [driveFiles, setDriveFiles] = useState<DriveBackupFileSummary[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [customBackupName, setCustomBackupName] = useState('');
  const [statusBanner, setStatusBanner] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Mandatory Explicit User Confirmation State for Destructive/Mutating Drive Operations
  const [pendingConfirm, setPendingConfirm] = useState<{
    action: 'overwrite' | 'delete';
    file: DriveBackupFileSummary;
  } | null>(null);

  if (!isOpen) return null;

  const ensureToken = async (): Promise<string | null> => {
    if (driveAccessToken && !needsDriveAuth) return driveAccessToken;
    return await onConnectGoogleDrive();
  };

  const handleSignInAndLoadDrive = async () => {
    setStatusBanner(null);
    setIsLoadingFiles(true);
    try {
      const token = await onConnectGoogleDrive();
      if (!token) {
        setStatusBanner({
          text: 'Google Drive sign-in was cancelled or no token was returned.',
          type: 'error',
        });
        return;
      }
      const files = await listDriveBackups(token);
      setDriveFiles(files);
      setStatusBanner({
        text: `Connected to Google Drive (${files.length} backup file(s) found).`,
        type: 'success',
      });
    } catch (err) {
      setStatusBanner({
        text:
          err instanceof Error
            ? err.message
            : 'Failed to connect to Google Drive.',
        type: 'error',
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleRefreshDriveList = async () => {
    setStatusBanner(null);
    setIsLoadingFiles(true);
    try {
      const token = await ensureToken();
      if (!token) return;
      const files = await listDriveBackups(token);
      setDriveFiles(files);
    } catch (err) {
      setStatusBanner({
        text:
          err instanceof Error
            ? err.message
            : 'Failed to list Google Drive backups.',
        type: 'error',
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleCreateNewBackupInDrive = async () => {
    setStatusBanner(null);
    setIsMutating(true);
    try {
      const token = await ensureToken();
      if (!token) return;
      const payload = onBuildCurrentBackupPayload();
      const created = await createDriveBackupFile(
        token,
        payload,
        customBackupName.trim() || undefined
      );
      setCustomBackupName('');
      const nowIso = new Date().toISOString();
      onDriveSynced(nowIso);
      setDriveFiles((prev) => [created, ...prev]);
      setStatusBanner({
        text: `Backed up "${created.name}" (${payload.blockCount} blocks) to Google Drive!`,
        type: 'success',
      });
    } catch (err) {
      setStatusBanner({
        text:
          err instanceof Error
            ? err.message
            : 'Failed to upload backup to Google Drive.',
        type: 'error',
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleConfirmMutateDrive = async () => {
    if (!pendingConfirm) return;
    const { action, file } = pendingConfirm;
    setPendingConfirm(null);
    setStatusBanner(null);
    setIsMutating(true);

    try {
      const token = await ensureToken();
      if (!token) return;

      if (action === 'overwrite') {
        const payload = onBuildCurrentBackupPayload();
        const updated = await updateDriveBackupFile(
          token,
          file.id,
          payload,
          file.name
        );
        const nowIso = new Date().toISOString();
        onDriveSynced(nowIso);
        setDriveFiles((prev) =>
          prev.map((f) => (f.id === file.id ? updated : f))
        );
        setStatusBanner({
          text: `Updated "${updated.name}" in Google Drive (${payload.blockCount} blocks).`,
          type: 'success',
        });
      } else if (action === 'delete') {
        await deleteDriveBackupFile(token, file.id);
        setDriveFiles((prev) => prev.filter((f) => f.id !== file.id));
        setStatusBanner({
          text: `Deleted "${file.name}" from Google Drive.`,
          type: 'info',
        });
      }
    } catch (err) {
      setStatusBanner({
        text:
          err instanceof Error
            ? err.message
            : `Failed to ${action} file on Google Drive.`,
        type: 'error',
      });
    } finally {
      setIsMutating(false);
    }
  };

  const handleRestoreFromDriveFile = async (file: DriveBackupFileSummary) => {
    setStatusBanner(null);
    setIsMutating(true);
    try {
      const token = await ensureToken();
      if (!token) return;
      const backup = await downloadDriveBackupFile(token, file.id);
      onRestoreFromBackup(backup, `Google Drive (${file.name})`);
      setStatusBanner({
        text: `Restored project "${backup.worldName}" (${backup.blockCount} blocks) from Google Drive!`,
        type: 'success',
      });
    } catch (err) {
      setStatusBanner({
        text:
          err instanceof Error
            ? err.message
            : 'Failed to download backup from Google Drive.',
        type: 'error',
      });
    } finally {
      setIsMutating(false);
    }
  };

  const isConnectedToDrive = Boolean(user && driveAccessToken && !needsDriveAuth);

  return (
    <DraggableWindow
      windowId="drive_backup_window"
      isOpen={isOpen}
      onClose={onClose}
      title="Autosave & Google Drive Project Backup"
      subtitle="Automatically save local recovery snapshots and sync full project backups (.brickforge.json) to Google Drive"
      icon={<HardDrive className="w-4 h-4 text-emerald-400" />}
      defaultWidth={880}
      defaultHeight={660}
      minWidth={400}
      minHeight={340}
      zIndex={55}
    >
      <div className="w-full h-full flex flex-col bg-slate-900 overflow-hidden">
        <div className="p-6 space-y-6 flex-1 min-h-0 overflow-y-auto">
          {statusBanner && (
            <div
              className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                statusBanner.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : statusBanner.type === 'error'
                    ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                    : 'bg-slate-950 border-slate-700 text-amber-300'
              }`}
            >
              <span>{statusBanner.text}</span>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Mandatory Destructive/Mutating Operation Confirmation Dialog */}
          {pendingConfirm && (
            <div
              role="alertdialog"
              aria-labelledby="drive-confirm-title"
              className="p-4 rounded-xl bg-amber-950/40 border-2 border-amber-500/70 space-y-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3
                    id="drive-confirm-title"
                    className="text-sm font-bold text-slate-100"
                  >
                    {pendingConfirm.action === 'overwrite'
                      ? `Update and overwrite "${pendingConfirm.file.name}" in Google Drive?`
                      : `Delete "${pendingConfirm.file.name}" from Google Drive?`}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    {pendingConfirm.action === 'overwrite'
                      ? 'This will replace the existing backup file contents in your Google Drive with your current Skyblock world, custom blocks, blueprints, and hotkeys.'
                      : 'This will permanently remove this backup file from your Google Drive. This action cannot be undone.'}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingConfirm(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMutateDrive}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold ${
                    pendingConfirm.action === 'delete'
                      ? 'bg-rose-500 hover:bg-rose-400 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  }`}
                >
                  {pendingConfirm.action === 'overwrite'
                    ? 'Confirm Overwrite'
                    : 'Confirm Delete'}
                </button>
              </div>
            </div>
          )}

          {/* Section 1: Autosave Configuration & Local Snapshots */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Automatic Project Autosave Engine
                  </h3>
                  <p className="text-xs text-slate-400">
                    Automatically saves blocks, custom blocks, blueprints, and hotkeys on edits and scheduled intervals
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onTriggerManualSaveNow();
                    setStatusBanner({
                      text: 'Project saved to local recovery storage!',
                      type: 'success',
                    });
                  }}
                  className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Snapshot Now</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-900">
              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autosaveEnabled}
                  onChange={(e) => onToggleAutosave(e.target.checked)}
                />
                <span className="font-medium">Enable Automatic Saving</span>
              </label>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="autosave-interval-select"
                  className="text-xs text-slate-400 whitespace-nowrap"
                >
                  Interval:
                </label>
                <select
                  id="autosave-interval-select"
                  value={autosaveIntervalSec}
                  onChange={(e) =>
                    onChangeAutosaveInterval(Number(e.target.value))
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 font-mono"
                >
                  <option value={15}>Every 15 seconds</option>
                  <option value={30}>Every 30 seconds</option>
                  <option value={60}>Every 1 minute</option>
                  <option value={120}>Every 2 minutes</option>
                  <option value={300}>Every 5 minutes</option>
                </select>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDriveBackupEnabled}
                  onChange={(e) => onToggleAutoDriveBackup(e.target.checked)}
                />
                <span className="font-medium">
                  Auto-Backup to Google Drive on Interval
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400 pt-1">
              <span>
                Last Local Autosave:{' '}
                <strong className="text-emerald-400">
                  {lastAutosaveTime
                    ? new Date(lastAutosaveTime).toLocaleTimeString()
                    : 'Pending first save'}
                </strong>
              </span>
              <span>
                Last Google Drive Sync:{' '}
                <strong className="text-cyan-400">
                  {lastDriveSyncTime
                    ? new Date(lastDriveSyncTime).toLocaleTimeString()
                    : 'Not synced yet'}
                </strong>
              </span>
            </div>

            {/* Local Autosave Recovery Snapshots */}
            {localSnapshots.length > 0 && (
              <div className="pt-3 border-t border-slate-900 space-y-2">
                <div className="text-xs font-semibold text-slate-300">
                  Recent Local Autosave Recovery Points ({localSnapshots.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {localSnapshots.slice(0, 4).map((snap) => (
                    <div
                      key={snap.id}
                      className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-200 truncate">
                          {snap.worldName} ({snap.blockCount} blocks)
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {new Date(snap.savedAt).toLocaleTimeString()} ·{' '}
                          {snap.trigger === 'manual' ? 'Manual' : 'Autosave'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onRestoreFromBackup(
                            snap.backup,
                            `Local Snapshot (${new Date(snap.savedAt).toLocaleTimeString()})`
                          );
                          setStatusBanner({
                            text: `Restored snapshot from ${new Date(snap.savedAt).toLocaleTimeString()}!`,
                            type: 'success',
                          });
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-xs font-medium flex items-center gap-1 shrink-0 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Restore</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Google Drive Cloud Backup & Sync */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <span>Google Drive Backup & Sync</span>
                  {isConnectedToDrive && (
                    <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Connected
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Store portable .brickforge.json project files directly in your personal Google Drive
                </p>
              </div>

              {/* Official Google Sign-In Button style when not authenticated or token missing */}
              {!isConnectedToDrive ? (
                <button
                  type="button"
                  onClick={handleSignInAndLoadDrive}
                  disabled={isLoadingFiles}
                  className="gsi-material-button px-4 py-2.5 rounded-lg bg-white hover:bg-slate-100 text-slate-900 font-medium text-xs flex items-center gap-2.5 shadow transition-colors"
                >
                  <div className="w-4 h-4 shrink-0">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents font-semibold">
                    Sign in with Google
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleRefreshDriveList}
                  disabled={isLoadingFiles}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-cyan-300 flex items-center gap-1.5"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh Drive Backups</span>
                </button>
              )}
            </div>

            {/* Create New Backup Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-900">
              <input
                type="text"
                value={customBackupName}
                onChange={(e) => setCustomBackupName(e.target.value)}
                placeholder="Optional backup file name (e.g. Castle_Skyblock_v2.brickforge.json)..."
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500"
              />
              <button
                type="button"
                disabled={isMutating}
                onClick={handleCreateNewBackupInDrive}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <CloudUpload className="w-4 h-4" />
                <span>Backup Project to Google Drive</span>
              </button>
            </div>

            {/* Drive Files List */}
            <div className="space-y-2 pt-2">
              {driveFiles.length === 0 ? (
                <div className="p-5 text-center rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-400">
                  {isConnectedToDrive
                    ? 'No .brickforge.json backups found in your Google Drive yet. Click "Backup Project to Google Drive" above to create one.'
                    : 'Sign in with Google above to view, create, or restore project backups from your Google Drive.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {driveFiles.map((file) => (
                    <div
                      key={file.id}
                      className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {file.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          Modified:{' '}
                          {new Date(file.modifiedTime).toLocaleString()}
                          {file.size
                            ? ` · ${(Number(file.size) / 1024).toFixed(1)} KB`
                            : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() => handleRestoreFromDriveFile(file)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Restore</span>
                        </button>

                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() =>
                            setPendingConfirm({ action: 'overwrite', file })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-xs font-medium transition-colors"
                        >
                          Overwrite
                        </button>

                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() =>
                            setPendingConfirm({ action: 'delete', file })
                          }
                          aria-label={`Delete ${file.name}`}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500 text-slate-300 hover:text-white transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DraggableWindow>
  );
};
