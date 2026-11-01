export type HotkeyActionId =
  | 'moveForward'
  | 'moveBackward'
  | 'strafeLeft'
  | 'strafeRight'
  | 'flyUp'
  | 'flyDown'
  | 'sprintFly'
  | 'toggleFlyMode'
  | 'toggleMouseLookMode'
  | 'holdMouseLookMode'
  | 'resetCamera'
  | 'toolPlace'
  | 'toolErase'
  | 'toolBrushPlace'
  | 'toolBrushErase'
  | 'toolPaint'
  | 'toolPick'
  | 'toolWand'
  | 'rotateBlock'
  | 'focusCommandLine'
  | 'holdSelectionGizmo'
  | 'selectionRaiseUp'
  | 'selectionLowerDown'
  | 'selectionShiftNorth'
  | 'selectionShiftSouth'
  | 'selectionShiftWest'
  | 'selectionShiftEast'
  | 'selectionExpandAll'
  | 'selectionContractAll'
  | 'quickSet'
  | 'quickWalls'
  | 'quickCopy'
  | 'quickPaste'
  | 'saveProjectNow'
  | 'openHotkeys'
  | 'toggleDock'
  | 'acceptCopilotGhost'
  | 'toggleSymmetryMirror';

export type HotkeyCategory = 'flight' | 'tools' | 'selection' | 'worldedit';

export interface HotkeyActionMeta {
  id: HotkeyActionId;
  label: string;
  description: string;
  category: HotkeyCategory;
  defaultKey: string;
}

export interface FlightSettings {
  flySpeed: number; // 0.5 to 3.0
  mouseLookSensitivity: number; // 0.2 to 3.0
  doubleSpaceToToggleFly: boolean;
  invertFlightLookY: boolean;
  crosshairCenterAim: boolean;
}

export interface HotkeyConfig {
  bindings: Record<HotkeyActionId, string>;
  flight: FlightSettings;
}

export const HOTKEY_ACTIONS_META: HotkeyActionMeta[] = [
  // Flight & Camera (Minecraft Creative WASD & Free-Look)
  {
    id: 'toggleMouseLookMode',
    label: 'Toggle Mouse Free-Look / Studio Pan',
    description:
      'Switch mouse between 3D Character Look-Around (Fly Build) and Large-Scale Pan/Zoom',
    category: 'flight',
    defaultKey: 'KeyC',
  },
  {
    id: 'holdMouseLookMode',
    label: 'Hold for Mouse Free-Look (Momentary)',
    description:
      'Hold key to temporarily switch mouse between Free-Look Fly and Studio Pan/Zoom',
    category: 'flight',
    defaultKey: 'AltLeft',
  },
  {
    id: 'moveForward',
    label: 'Fly Forward',
    description: 'Move camera forward along look direction',
    category: 'flight',
    defaultKey: 'KeyW',
  },
  {
    id: 'moveBackward',
    label: 'Fly Backward',
    description: 'Move camera backward along look direction',
    category: 'flight',
    defaultKey: 'KeyS',
  },
  {
    id: 'strafeLeft',
    label: 'Strafe Left',
    description: 'Slide camera left perpendicular to look direction',
    category: 'flight',
    defaultKey: 'KeyA',
  },
  {
    id: 'strafeRight',
    label: 'Strafe Right',
    description: 'Slide camera right perpendicular to look direction',
    category: 'flight',
    defaultKey: 'KeyD',
  },
  {
    id: 'flyUp',
    label: 'Ascend (+Y)',
    description: 'Fly straight up (double-tap Space to toggle Fly Mode)',
    category: 'flight',
    defaultKey: 'Space',
  },
  {
    id: 'flyDown',
    label: 'Descend (-Y)',
    description: 'Fly straight down (Minecraft Shift crouch-fly)',
    category: 'flight',
    defaultKey: 'ShiftLeft',
  },
  {
    id: 'sprintFly',
    label: 'Sprint Flight Boost',
    description: 'Hold to fly at 2.2x speed',
    category: 'flight',
    defaultKey: 'ControlLeft',
  },
  {
    id: 'toggleFlyMode',
    label: 'Toggle WASD Flight Keys',
    description: 'Enable or disable W/A/S/D/Space/Shift keyboard flight',
    category: 'flight',
    defaultKey: 'KeyF',
  },
  {
    id: 'resetCamera',
    label: 'Reset Isometric View',
    description: 'Snap camera back to starter Skyblock isometric angle',
    category: 'flight',
    defaultKey: 'KeyZ',
  },

  // Building & Tools
  {
    id: 'toolPlace',
    label: 'Place Block Tool',
    description: 'Equip interlocking stud block placement tool',
    category: 'tools',
    defaultKey: 'KeyB',
  },
  {
    id: 'toolErase',
    label: 'Erase Block Tool',
    description: 'Equip block eraser tool',
    category: 'tools',
    defaultKey: 'KeyX',
  },
  {
    id: 'toolPaint',
    label: 'Paint Block Tool',
    description: 'Equip material & color painter tool',
    category: 'tools',
    defaultKey: 'KeyG',
  },
  {
    id: 'toolPick',
    label: 'Eyedropper Pick Tool',
    description: 'Sample block type under cursor',
    category: 'tools',
    defaultKey: 'KeyI',
  },
  {
    id: 'toolWand',
    label: 'WorldEdit Selection Wand',
    description: 'Equip Pos1/Pos2 region selection wand',
    category: 'tools',
    defaultKey: 'KeyE',
  },
  {
    id: 'rotateBlock',
    label: 'Rotate Block / Stamp 90°',
    description: 'Rotate active block or blueprint clockwise by 90°',
    category: 'tools',
    defaultKey: 'KeyR',
  },
  {
    id: 'toolBrushPlace',
    label: '3D Volume Place Brush',
    description:
      'Equip scrollable 3D Sphere/Cube/Cylinder volume brush for large-scale block placement',
    category: 'tools',
    defaultKey: 'KeyY',
  },
  {
    id: 'toolBrushErase',
    label: '3D Volume Erase / Excavate Brush',
    description:
      'Equip scrollable 3D Sphere/Cube/Cylinder volume brush to remove all blocks within area',
    category: 'tools',
    defaultKey: 'KeyO',
  },

  // Selection Gizmos, Shift, Raise & Expand (All Mappable)
  {
    id: 'holdSelectionGizmo',
    label: 'Hold to Drag Selection Nodes & Scroll-Resize',
    description:
      'Hold key to unlock & drag 3D selection face nodes (+X/-X/+Y/-Y/+Z/-Z) or scroll wheel to resize selection',
    category: 'selection',
    defaultKey: 'KeyN',
  },
  {
    id: 'selectionRaiseUp',
    label: 'Raise Selection Up (+Y)',
    description:
      'Shift Pos1–Pos2 selection box up by 1 block (Hold Shift to expand top face +Y)',
    category: 'selection',
    defaultKey: 'PageUp',
  },
  {
    id: 'selectionLowerDown',
    label: 'Lower Selection Down (-Y)',
    description:
      'Shift Pos1–Pos2 selection box down by 1 block (Hold Shift to expand bottom face -Y)',
    category: 'selection',
    defaultKey: 'PageDown',
  },
  {
    id: 'selectionShiftNorth',
    label: 'Shift / Expand Selection North (-Z)',
    description:
      'Shift selection North (-Z), or hold Shift + key to expand North face outward',
    category: 'selection',
    defaultKey: 'ArrowUp',
  },
  {
    id: 'selectionShiftSouth',
    label: 'Shift / Expand Selection South (+Z)',
    description:
      'Shift selection South (+Z), or hold Shift + key to expand South face outward',
    category: 'selection',
    defaultKey: 'ArrowDown',
  },
  {
    id: 'selectionShiftWest',
    label: 'Shift / Expand Selection West (-X)',
    description:
      'Shift selection West (-X), or hold Shift + key to expand West face outward',
    category: 'selection',
    defaultKey: 'ArrowLeft',
  },
  {
    id: 'selectionShiftEast',
    label: 'Shift / Expand Selection East (+X)',
    description:
      'Shift selection East (+X), or hold Shift + key to expand East face outward',
    category: 'selection',
    defaultKey: 'ArrowRight',
  },
  {
    id: 'selectionExpandAll',
    label: 'Expand Selection Outward (All Sides)',
    description:
      'Expand Pos1–Pos2 selection outward by 1 block on X/Z (Hold Shift to include Y)',
    category: 'selection',
    defaultKey: 'BracketRight',
  },
  {
    id: 'selectionContractAll',
    label: 'Contract Selection Inward (All Sides)',
    description:
      'Contract Pos1–Pos2 selection inward by 1 block on X/Z (Hold Shift to include Y)',
    category: 'selection',
    defaultKey: 'BracketLeft',
  },

  // WorldEdit & Studio Shortcuts
  {
    id: 'focusCommandLine',
    label: 'Focus Command Line Input (/)',
    description:
      'Immediately jump cursor focus to the WorldEdit CLI bar and begin typing a //command',
    category: 'worldedit',
    defaultKey: 'Slash',
  },
  {
    id: 'quickSet',
    label: 'Quick //set Selection',
    description: 'Fill Pos1–Pos2 region with active block',
    category: 'worldedit',
    defaultKey: 'KeyJ',
  },
  {
    id: 'quickWalls',
    label: 'Quick //walls Selection',
    description: 'Build perimeter walls around Pos1–Pos2 with active block',
    category: 'worldedit',
    defaultKey: 'KeyK',
  },
  {
    id: 'quickCopy',
    label: 'Quick //copy Region',
    description: 'Copy Pos1–Pos2 blocks into WorldEdit clipboard',
    category: 'worldedit',
    defaultKey: 'KeyU',
  },
  {
    id: 'quickPaste',
    label: 'Quick //paste Clipboard',
    description: 'Paste copied region at Pos1',
    category: 'worldedit',
    defaultKey: 'KeyP',
  },
  {
    id: 'saveProjectNow',
    label: 'Quick Save & Backup Now',
    description: 'Trigger immediate local autosave and cloud/Drive backup',
    category: 'worldedit',
    defaultKey: 'KeyL',
  },
  {
    id: 'openHotkeys',
    label: 'Open Keybinds & Controls',
    description: 'Open the shortcut & hotkey mapping configuration modal',
    category: 'worldedit',
    defaultKey: 'KeyM',
  },
  {
    id: 'toggleDock',
    label: 'Toggle Studio Controls Dock',
    description: 'Collapse or expand the bottom WorldEdit dock',
    category: 'worldedit',
    defaultKey: 'KeyH',
  },
  {
    id: 'acceptCopilotGhost',
    label: 'Accept Spatial Copilot Ghost (Tab)',
    description:
      'Instantly place the predicted 3D ghost auto-complete run or recommended selection preview',
    category: 'tools',
    defaultKey: 'Tab',
  },
  {
    id: 'toggleSymmetryMirror',
    label: 'Cycle Live Symmetry Mirror (V)',
    description:
      'Cycle real-time symmetry building plane (Off -> X-Mirror -> Z-Mirror -> 4-Way Quad)',
    category: 'tools',
    defaultKey: 'KeyV',
  },
];

export const DEFAULT_HOTKEYS = HOTKEY_ACTIONS_META;

export const DEFAULT_HOTKEY_BINDINGS: Record<HotkeyActionId, string> =
  HOTKEY_ACTIONS_META.reduce(
    (acc, item) => {
      acc[item.id] = item.defaultKey;
      return acc;
    },
    {} as Record<HotkeyActionId, string>
  );

export const DEFAULT_FLIGHT_SETTINGS: FlightSettings = {
  flySpeed: 1.0,
  mouseLookSensitivity: 1.0,
  doubleSpaceToToggleFly: true,
  invertFlightLookY: false,
  crosshairCenterAim: true,
};

export const LOCAL_HOTKEYS_STORAGE_KEY = 'brickforge_hotkeys_v1';

export function createDefaultHotkeyConfig(): HotkeyConfig {
  return {
    bindings: { ...DEFAULT_HOTKEY_BINDINGS },
    flight: { ...DEFAULT_FLIGHT_SETTINGS },
  };
}

export function loadHotkeyConfig(): HotkeyConfig {
  const fallback = createDefaultHotkeyConfig();
  try {
    const raw = localStorage.getItem(LOCAL_HOTKEYS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      bindings: {
        ...DEFAULT_HOTKEY_BINDINGS,
        ...(parsed.bindings || {}),
      },
      flight: {
        ...DEFAULT_FLIGHT_SETTINGS,
        ...(parsed.flight || {}),
      },
    };
  } catch {
    return fallback;
  }
}

export function saveHotkeyConfig(config: HotkeyConfig): void {
  try {
    localStorage.setItem(LOCAL_HOTKEYS_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage errors
  }
}

export function formatKeyCode(code: string): string {
  if (!code) return 'Unbound';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'Space':
      return 'Space';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'Shift';
    case 'ControlLeft':
    case 'ControlRight':
      return 'Ctrl';
    case 'AltLeft':
    case 'AltRight':
      return 'Alt';
    case 'Backquote':
      return '` ~';
    case 'CapsLock':
      return 'CapsLock';
    case 'Tab':
      return 'Tab';
    case 'ArrowUp':
      return '↑ Up';
    case 'ArrowDown':
      return '↓ Down';
    case 'ArrowLeft':
      return '← Left';
    case 'ArrowRight':
      return '→ Right';
    case 'Slash':
      return '/ (Slash)';
    case 'PageUp':
      return 'PgUp';
    case 'PageDown':
      return 'PgDn';
    case 'BracketLeft':
      return '[ (Bracket)';
    case 'BracketRight':
      return '] (Bracket)';
    default:
      return code;
  }
}

export function matchesKeyBinding(e: KeyboardEvent, boundCode: string): boolean {
  if (!boundCode) return false;
  if (e.code === boundCode) return true;
  if (boundCode === 'Slash' && (e.code === 'Slash' || e.key === '/')) {
    return true;
  }
  if (boundCode === 'BracketLeft' && (e.code === 'BracketLeft' || e.key === '[')) {
    return true;
  }
  if (boundCode === 'BracketRight' && (e.code === 'BracketRight' || e.key === ']')) {
    return true;
  }
  // Support ShiftLeft/ShiftRight interchangeably if ShiftLeft is bound
  if (
    boundCode === 'ShiftLeft' &&
    (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.key === 'Shift')
  ) {
    return true;
  }
  if (
    boundCode === 'ControlLeft' &&
    (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.key === 'Control')
  ) {
    return true;
  }
  if (
    (boundCode === 'AltLeft' || boundCode === 'AltRight') &&
    (e.code === 'AltLeft' || e.code === 'AltRight' || e.key === 'Alt')
  ) {
    return true;
  }
  if (boundCode === 'Space' && (e.code === 'Space' || e.key === ' ')) {
    return true;
  }
  if (
    boundCode.startsWith('Key') &&
    e.key.toUpperCase() === boundCode.slice(3).toUpperCase()
  ) {
    return true;
  }
  return false;
}

