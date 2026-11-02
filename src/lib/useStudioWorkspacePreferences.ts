import { useState } from 'react';

export type StudioTheme = 'evergreen-dark' | 'evergreen-light' | 'high-contrast' | 'calm';
export interface StudioWorkspacePreferences {
  schemaVersion: 1;
  theme: StudioTheme;
  textPercent: number;
  targetSize: 36 | 48 | 56;
  panelWidth: 640 | 880 | 1120;
  motion: 'system' | 'reduced';
}
export const WORKSPACE_PREFERENCES_KEY = 'lfs_studio_workspace_prefs_v1';
const defaults: StudioWorkspacePreferences = { schemaVersion: 1, theme: 'evergreen-dark', textPercent: 100, targetSize: 36, panelWidth: 880, motion: 'system' };
function parse(raw: string): StudioWorkspacePreferences | null {
  if (raw.length > 4096) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== Object.keys(defaults).sort().join(',')) return null;
    if (value.schemaVersion !== 1 || !['evergreen-dark', 'evergreen-light', 'high-contrast', 'calm'].includes(value.theme)
      || ![100, 125, 150, 175, 200].includes(value.textPercent) || ![36, 48, 56].includes(value.targetSize)
      || ![640, 880, 1120].includes(value.panelWidth) || !['system', 'reduced'].includes(value.motion)) return null;
    return value;
  } catch { return null; }
}
function read() {
  try {
    const raw = localStorage.getItem(WORKSPACE_PREFERENCES_KEY);
    if (raw === null) return { value: { ...defaults }, message: '' };
    const value = parse(raw);
    return { value: value ?? { ...defaults }, message: value ? '' : 'Saved menu settings use an unsupported format. The original is retained; changes will apply for this session.' };
  } catch { return { value: { ...defaults }, message: 'Browser menu settings are unavailable. Changes will apply for this session.' }; }
}

/** Only chrome preferences; never part of a project, build transaction or history. */
export function useStudioWorkspacePreferences() {
  const [state, setState] = useState(read);
  const change = (next: StudioWorkspacePreferences) => {
    const valid = parse(JSON.stringify(next));
    if (!valid) return;
    let message = 'Menu settings saved on this browser.';
    try {
      const original = localStorage.getItem(WORKSPACE_PREFERENCES_KEY);
      if (original !== null && !parse(original)) message = 'Applied for this session. Unsupported saved menu settings were retained.';
      else localStorage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify(valid));
    } catch { message = 'Applied for this session. Browser menu settings could not be saved.'; }
    setState({ value: valid, message });
  };
  return { preferences: state.value, preferenceMessage: state.message, changePreferences: change };
}
